"""Train, evaluate and persist the flood and drought models.

Run:  python scripts/train.py [--target flood|drought|both] [--skip-spatial]

Pipeline, in order:

1. Load every cached location and assemble features, labels and splits.
2. For each target, score baselines and candidates on the TEMPORAL split -
   fit on train, tune the decision threshold on validation, and touch the test
   set exactly once at the end.
3. Run a SPATIAL holdout - grouped cross-validation with whole locations held
   out - which is the test that substantiates any claim of generalising to
   places the model has never seen.
4. Select the model with the best validation PR-AUC, refit it on train plus
   validation, and report its test performance.
5. Persist the model, its threshold, its feature list and its metrics.

Nothing here fabricates a number. If a model performs poorly the report says so.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.frozen import FrozenEstimator
from sklearn.model_selection import GroupKFold

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from climate_ml import config
from climate_ml.data.assemble import (
    SPLIT_TEST,
    SPLIT_TRAIN,
    SPLIT_VALIDATION,
    assemble,
    model_features,
    training_frame,
)
from climate_ml.data.koppen import classify_frame
from climate_ml.data.openmeteo import load_all
from climate_ml.evaluation.analysis import assess_calibration
from climate_ml.evaluation.metrics import (
    calibration_curve,
    choose_threshold,
    error_cost_summary,
    evaluate,
)
from climate_ml.models.candidates import build_candidates

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s",
                    datefmt="%H:%M:%S")
logger = logging.getLogger("train")

TARGETS = {"flood": "y_flood", "drought": "y_drought"}

# A missed hazard costs more than a false alarm, so thresholds are tuned toward
# recall rather than left at the default 0.5. The value is a stated policy, not
# an optimum - it is reported alongside the metrics so it can be argued with.
MIN_RECALL = {"flood": 0.50, "drought": 0.70}


def _persistence_scores(target_name: str, frame: pd.DataFrame) -> np.ndarray | None:
    """The "assume recent conditions continue" baseline, per target.

    Not a model. It puts the naive answer on the same PR-AUC scale as everything
    else, because that - not a random-guess floor - is the bar a learned model
    has to clear.

    Each target needs its OWN baseline. An earlier version reused the drought
    SPEI signal for flood, which scored ROC-AUC 0.32 (worse than random) because
    a drought index carries no information about flooding.
    """
    if target_name == "drought":
        if "spei_lag1m" not in frame.columns:
            return None
        spei = frame["spei_lag1m"].to_numpy(dtype=float)
        if not np.isfinite(spei).any():
            return None
        # More negative SPEI means drier, so invert: higher score = more risk.
        return np.clip(
            (config.DROUGHT_THRESHOLD - np.nan_to_num(spei, nan=0.0)) / 2.0 + 0.5, 0, 1
        )

    if target_name == "flood":
        if "flood_recent_activity" not in frame.columns:
            return None
        recent = frame["flood_recent_activity"].to_numpy(dtype=float)
        if not np.isfinite(recent).any():
            return None
        # Did flood-generating conditions occur in the preceding window?
        return np.nan_to_num(recent, nan=0.0)

    return None


def _fit(estimator, x: np.ndarray, y: np.ndarray, sample_weight: np.ndarray | None):
    """Fit, passing sample_weight only when there is one and the estimator takes it.

    A scikit-learn Pipeline rejects ``sample_weight`` outright - even as None -
    and raises ValueError rather than TypeError, so the argument is omitted
    entirely when unweighted, and unsupported estimators fall back gracefully.
    """
    if sample_weight is None:
        estimator.fit(x, y)
        return
    try:
        estimator.fit(x, y, sample_weight=sample_weight)
    except (TypeError, ValueError) as exc:
        if "sample_weight" not in str(exc):
            raise
        logger.debug("%s ignores sample_weight; fitting unweighted",
                     type(estimator).__name__)
        estimator.fit(x, y)


def _select_calibration(model, x_val: np.ndarray, y_val: np.ndarray, target_name: str):
    """Choose between sigmoid and isotonic calibration on held-out data.

    The classifiers use class weighting to handle imbalance, which improves
    ranking but systematically inflates predicted probabilities. Measured on the
    uncalibrated models, every single probability bin was over-confident - flood
    predicted 75% where the true rate was 15% - giving an expected calibration
    error of 0.233 (flood) and 0.150 (drought). Numbers shown to a user as
    percentages have to mean what they say, so this is corrected here.

    Sigmoid (Platt) is monotonic and therefore preserves ranking and PR-AUC
    exactly; isotonic is more flexible but can reorder and cost discrimination.

    METHOD SELECTION MUST BE OUT OF SAMPLE. Measuring a calibrator on the rows
    it was fitted to is meaningless - isotonic reproduces them exactly and
    scores ECE 0.0000 while generalising far worse. Validation is therefore
    split: the calibrator is fitted on one half and scored on the other, and
    only the winning method is refitted on the whole validation set.
    """
    from sklearn.metrics import average_precision_score
    from sklearn.model_selection import train_test_split

    fit_x, score_x, fit_y, score_y = train_test_split(
        x_val, y_val, test_size=0.5, random_state=config.RANDOM_STATE, stratify=y_val
    )
    baseline_pr_auc = average_precision_score(score_y, model.predict_proba(score_x)[:, 1])
    results = {}

    for method in ("sigmoid", "isotonic"):
        trial = CalibratedClassifierCV(FrozenEstimator(model), method=method)
        trial.fit(fit_x, fit_y)
        held_out = trial.predict_proba(score_x)[:, 1]
        report = assess_calibration(score_y, held_out)
        pr_auc = average_precision_score(score_y, held_out)
        results[method] = {
            "ece": report.expected_calibration_error,
            "max_gap": report.max_calibration_error,
            "pr_auc_cost": float(baseline_pr_auc - pr_auc),
        }
        logger.info("  calibration %-9s ECE=%.4f  max_gap=%.4f  PR-AUC cost=%+.4f  (held out)",
                    method, report.expected_calibration_error,
                    report.max_calibration_error, baseline_pr_auc - pr_auc)

    # Reject any method that buys calibration by sacrificing ranking.
    acceptable = {m: r for m, r in results.items() if r["pr_auc_cost"] <= 0.005}
    if not acceptable:
        acceptable = results
        logger.warning("%s: every calibration method costs PR-AUC; taking the cheapest",
                       target_name)
    chosen = min(acceptable, key=lambda m: (acceptable[m]["ece"], acceptable[m]["max_gap"]))

    logger.info("%s: calibrating with %s (held-out ECE %.4f)",
                target_name, chosen, results[chosen]["ece"])

    info = {
        "method": chosen,
        "selected_on": "held-out half of validation",
        "held_out_ece": results[chosen]["ece"],
        "held_out_max_gap": results[chosen]["max_gap"],
        "pr_auc_cost": round(results[chosen]["pr_auc_cost"], 5),
        "alternatives": {
            m: {"ece": r["ece"], "max_gap": r["max_gap"], "pr_auc_cost": round(r["pr_auc_cost"], 5)}
            for m, r in results.items()
        },
    }
    return chosen, info


def evaluate_temporal(target_name: str, column: str, table: pd.DataFrame) -> dict:
    """Fit on train, tune on validation, report test once."""
    frame = training_frame(table, column)
    features = model_features(table)

    parts = {s: frame[frame["split"] == s] for s in (SPLIT_TRAIN, SPLIT_VALIDATION, SPLIT_TEST)}
    for split_name, part in parts.items():
        if part.empty:
            raise RuntimeError(f"{target_name}: split '{split_name}' is empty")
        if part[column].nunique() < 2:
            logger.warning("%s: split '%s' contains a single class", target_name, split_name)

    # Restrict the training rows to this target's window. Validation and test
    # are never trimmed - only what the model learns from changes.
    window = config.TRAINING_WINDOW[target_name]
    if window["first_year"] > 1995:
        before = len(parts[SPLIT_TRAIN])
        parts[SPLIT_TRAIN] = parts[SPLIT_TRAIN][
            parts[SPLIT_TRAIN]["year"] >= window["first_year"]
        ]
        logger.info("%s: training window %d-%d (%d of %d rows)", target_name,
                    window["first_year"], config.TRAIN_END_YEAR,
                    len(parts[SPLIT_TRAIN]), before)

    x = {s: p[features].to_numpy() for s, p in parts.items()}
    y = {s: p[column].to_numpy().astype(int) for s, p in parts.items()}

    # Recency weighting inside the window, if this target uses it.
    half_life = window["half_life_years"]
    train_weight = None
    if half_life:
        age = config.TRAIN_END_YEAR - parts[SPLIT_TRAIN]["year"].to_numpy()
        train_weight = 0.5 ** (age / half_life)
        logger.info("%s: recency weighting, half-life %.0f years", target_name, half_life)

    logger.info(
        "%s | train=%d (%.2f%% pos)  val=%d (%.2f%% pos)  test=%d (%.2f%% pos)",
        target_name,
        len(y[SPLIT_TRAIN]), 100 * y[SPLIT_TRAIN].mean(),
        len(y[SPLIT_VALIDATION]), 100 * y[SPLIT_VALIDATION].mean(),
        len(y[SPLIT_TEST]), 100 * y[SPLIT_TEST].mean(),
    )

    results: list[dict] = []
    fitted: dict[str, object] = {}
    min_recall = MIN_RECALL[target_name]

    # Persistence is scored directly - there is nothing to fit.
    persistence = _persistence_scores(target_name, parts[SPLIT_VALIDATION])
    if persistence is not None:
        threshold = choose_threshold(y[SPLIT_VALIDATION], persistence, min_recall=min_recall)
        report = evaluate("persistence", SPLIT_VALIDATION, y[SPLIT_VALIDATION],
                          persistence, threshold)
        report.notes["tier"] = "baseline"
        report.notes["rationale"] = "Assume current conditions continue."
        results.append(report.as_dict())
        logger.info("  %-22s val PR-AUC=%.4f  ROC-AUC=%.4f  recall=%.3f",
                    "persistence", report.pr_auc, report.roc_auc, report.recall)

    for candidate in build_candidates():
        started = time.time()
        _fit(candidate.estimator, x[SPLIT_TRAIN], y[SPLIT_TRAIN], train_weight)
        scores = candidate.estimator.predict_proba(x[SPLIT_VALIDATION])[:, 1]
        threshold = choose_threshold(y[SPLIT_VALIDATION], scores, min_recall=min_recall)

        report = evaluate(candidate.name, SPLIT_VALIDATION, y[SPLIT_VALIDATION],
                          scores, threshold)
        report.notes.update(
            tier=candidate.tier,
            rationale=candidate.rationale,
            fit_seconds=round(time.time() - started, 2),
        )
        results.append(report.as_dict())
        fitted[candidate.name] = candidate.estimator
        logger.info("  %-22s val PR-AUC=%.4f  ROC-AUC=%.4f  recall=%.3f",
                    candidate.name, report.pr_auc, report.roc_auc, report.recall)

    # Select on validation only. The test set is untouched until this point.
    trainable = [r for r in results if r["name"] in fitted]
    best = max(trainable, key=lambda r: (r["pr_auc"] if np.isfinite(r["pr_auc"]) else -1))
    logger.info("%s: selected %s (val PR-AUC %.4f)", target_name, best["name"], best["pr_auc"])

    # A learned model that cannot beat a naive baseline has not earned its place.
    # Say so loudly rather than quietly shipping it - this is the check that was
    # missing when the drought model lost to persistence and was selected anyway.
    baselines = [r for r in results if r["notes"].get("tier") == "baseline"
                 or r["name"] == "persistence"]
    beaten_by = [r for r in baselines
                 if np.isfinite(r["pr_auc"]) and r["pr_auc"] > best["pr_auc"]]
    if beaten_by:
        strongest = max(beaten_by, key=lambda r: r["pr_auc"])
        logger.warning(
            "%s: NO LEARNED MODEL BEAT THE BASELINES. '%s' scores %.4f on validation "
            "versus %.4f for the best candidate '%s'. The model is still saved for "
            "inspection, but this must be reported as a negative result.",
            target_name, strongest["name"], strongest["pr_auc"],
            best["pr_auc"], best["name"],
        )

    # Choosing the calibration method needs a model that has not seen the
    # validation rows, so fit one on TRAIN only purely for that decision.
    probe = next(c for c in build_candidates() if c.name == best["name"]).estimator
    _fit(probe, x[SPLIT_TRAIN], y[SPLIT_TRAIN], train_weight)
    method, calibration_info = _select_calibration(
        probe, x[SPLIT_VALIDATION], y[SPLIT_VALIDATION], target_name
    )

    # The production model then uses ALL pre-test data with cross-validated
    # calibration: CalibratedClassifierCV refits the estimator across folds and
    # calibrates on the out-of-fold predictions, so every row contributes to
    # training while no row calibrates itself. ensemble=False keeps one model
    # plus one calibrator rather than five copies, which matters for the 512 MB
    # deployment tier.
    #
    # Fitting on train only and calibrating on validation was measured as the
    # simpler alternative and rejected: it cost 8% test PR-AUC (flood
    # 0.2441 -> 0.2236) purely from discarding four years of training data.
    combined_x = np.vstack([x[SPLIT_TRAIN], x[SPLIT_VALIDATION]])
    combined_y = np.concatenate([y[SPLIT_TRAIN], y[SPLIT_VALIDATION]])
    base = next(c for c in build_candidates() if c.name == best["name"]).estimator
    calibrated = CalibratedClassifierCV(base, method=method, cv=3, ensemble=False)
    combined_weight = (
        np.concatenate([train_weight, np.ones(len(y[SPLIT_VALIDATION]))])
        if train_weight is not None else None
    )
    _fit(calibrated, combined_x, combined_y, combined_weight)
    calibration_info["final_fit"] = "cross-validated on train+validation (cv=3, ensemble=False)"

    # The threshold must be retuned: calibration rescales probabilities, so a
    # threshold chosen on raw scores no longer means the same thing.
    validation_scores = calibrated.predict_proba(x[SPLIT_VALIDATION])[:, 1]
    threshold = choose_threshold(y[SPLIT_VALIDATION], validation_scores, min_recall=min_recall)

    test_scores = calibrated.predict_proba(x[SPLIT_TEST])[:, 1]
    test_report = evaluate(best["name"], SPLIT_TEST, y[SPLIT_TEST],
                           test_scores, threshold)
    test_report.notes["threshold_source"] = "tuned on calibrated validation scores"
    test_report.notes["min_recall_policy"] = min_recall
    test_report.notes["calibration"] = calibration_info
    logger.info("%s: TEST PR-AUC=%.4f  recall=%.3f  precision=%.3f",
                target_name, test_report.pr_auc, test_report.recall, test_report.precision)

    return {
        "validation_comparison": results,
        "selected_model": best["name"],
        "selection_basis": "highest validation PR-AUC",
        "test": test_report.as_dict(),
        "test_error_costs": error_cost_summary(test_report),
        "test_calibration": calibration_curve(y[SPLIT_TEST], test_scores),
        "beaten_by_baseline": [r["name"] for r in beaten_by],
        "fitted_model": calibrated,
        "features": features,
        "threshold": threshold,
        "calibration": calibration_info,
        "training_window": window,
    }


def evaluate_spatial(target_name: str, column: str, table: pd.DataFrame, folds: int) -> dict:
    """Grouped cross-validation with whole locations held out.

    This is the test that matters for a global claim: can the model work in a
    place it has never seen? Temporal performance says nothing about that.
    """
    frame = training_frame(table, column)
    features = model_features(table)
    groups = frame["location_id"].to_numpy()
    unique_locations = np.unique(groups)

    if unique_locations.size < folds:
        logger.warning(
            "%s: only %d locations available, spatial CV needs at least %d - skipping",
            target_name, unique_locations.size, folds,
        )
        return {"skipped": True, "reason": f"only {unique_locations.size} locations cached"}

    x = frame[features].to_numpy()
    y = frame[column].to_numpy().astype(int)

    fold_reports = []
    splitter = GroupKFold(n_splits=folds)
    for index, (train_idx, test_idx) in enumerate(splitter.split(x, y, groups), start=1):
        if y[train_idx].sum() == 0 or y[test_idx].sum() == 0:
            logger.warning("  fold %d has no positives on one side - skipped", index)
            continue
        estimator = next(c for c in build_candidates() if c.name == "gradient_boosting").estimator
        estimator.fit(x[train_idx], y[train_idx])
        scores = estimator.predict_proba(x[test_idx])[:, 1]
        report = evaluate(f"fold_{index}", "spatial_holdout", y[test_idx], scores, 0.5)
        report.notes["held_out_locations"] = sorted(set(groups[test_idx].tolist()))
        fold_reports.append(report.as_dict())
        logger.info("  spatial fold %d: PR-AUC=%.4f on %d held-out locations",
                    index, report.pr_auc, len(set(groups[test_idx])))

    values = [r["pr_auc"] for r in fold_reports if np.isfinite(r["pr_auc"])]
    return {
        "skipped": False,
        "folds": fold_reports,
        "mean_pr_auc": float(np.mean(values)) if values else float("nan"),
        "std_pr_auc": float(np.std(values)) if values else float("nan"),
        "interpretation": (
            "Mean PR-AUC across folds where entire locations were withheld from "
            "training. Compare against each fold's own positive rate, which is "
            "the floor for that fold."
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", choices=["flood", "drought", "both"], default="both")
    parser.add_argument("--skip-spatial", action="store_true")
    parser.add_argument("--folds", type=int, default=config.SPATIAL_FOLDS)
    args = parser.parse_args()

    raw = load_all()
    locations = raw["location_id"].nunique()
    logger.info("Loaded %d rows from %d locations", len(raw), locations)

    climate = classify_frame(raw)
    logger.info("Koppen coverage: %s", climate["koppen"].value_counts().to_dict())

    table = assemble(raw)
    selected = TARGETS if args.target == "both" else {args.target: TARGETS[args.target]}

    summary = {
        "generated_at": pd.Timestamp.now("UTC").isoformat(),
        "n_locations": int(locations),
        "n_rows": len(raw),
        "date_range": [str(raw["date"].min().date()), str(raw["date"].max().date())],
        "koppen_distribution": climate["koppen"].value_counts().to_dict(),
        "splits": {
            "train": f"1995-{config.TRAIN_END_YEAR}",
            "validation": f"{config.TRAIN_END_YEAR + 1}-{config.VALIDATION_END_YEAR}",
            "test": f"{config.VALIDATION_END_YEAR + 1}-2024",
        },
        "targets": {},
    }

    for name, column in selected.items():
        logger.info("=" * 70)
        logger.info("TARGET: %s", name)
        temporal = evaluate_temporal(name, column, table)

        spatial = (
            {"skipped": True, "reason": "--skip-spatial"}
            if args.skip_spatial
            else evaluate_spatial(name, column, table, args.folds)
        )

        model_path = config.MODELS_DIR / f"{name}_model.joblib"
        joblib.dump(
            {
                "model": temporal["fitted_model"],
                "features": temporal["features"],
                "threshold": temporal["threshold"],
                "target": column,
                "trained_at": pd.Timestamp.now("UTC").isoformat(),
                "n_locations": int(locations),
                "selected_model": temporal["selected_model"],
            },
            model_path,
        )
        logger.info("Saved %s", model_path)

        summary["targets"][name] = {
            "temporal": {k: v for k, v in temporal.items() if k != "fitted_model"},
            "spatial_holdout": spatial,
            "model_path": str(model_path.relative_to(config.PROJECT_ROOT)),
        }

    report_path = config.REPORTS_DIR / "training_report.json"
    report_path.write_text(json.dumps(summary, indent=2, default=str), encoding="utf-8")
    logger.info("Wrote %s", report_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
