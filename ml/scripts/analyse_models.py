"""Post-training analysis: feature importance, calibration, and pruning check.

Run:  python scripts/analyse_models.py

Answers three questions the headline metrics do not:

1. Which features does the model actually rely on? (permutation importance on
   held-out data)
2. Do the probabilities shown to users mean what they say? (calibration)
3. Can the feature set be pruned without cost? (measured by retraining, not
   assumed from the importance ranking)

Writes reports/analysis_report.json.
"""

from __future__ import annotations

import json
import logging
import sys
from pathlib import Path

import joblib
import pandas as pd

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
from climate_ml.data.openmeteo import load_all
from climate_ml.evaluation.analysis import (
    assess_calibration,
    importance_summary,
    measure_feature_importance,
    prune_candidates,
)
from climate_ml.evaluation.metrics import choose_threshold, evaluate
from climate_ml.models.candidates import build_candidates

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s",
                    datefmt="%H:%M:%S")
logger = logging.getLogger("analyse")

TARGETS = {"flood": "y_flood", "drought": "y_drought"}
MIN_RECALL = {"flood": 0.50, "drought": 0.70}


def verify_pruning(target: str, column: str, table: pd.DataFrame,
                   keep: list[str], dropped: list[str]) -> dict:
    """Retrain on the reduced feature set and measure what pruning actually costs.

    An importance ranking suggests what might be removable; only retraining
    shows whether it is. Correlated features can each look individually
    dispensable while collectively carrying real signal.
    """
    if not dropped:
        return {"attempted": False, "reason": "no features were candidates for pruning"}

    frame = training_frame(table, column)
    parts = {s: frame[frame["split"] == s] for s in (SPLIT_TRAIN, SPLIT_VALIDATION)}
    y_train = parts[SPLIT_TRAIN][column].to_numpy().astype(int)
    y_val = parts[SPLIT_VALIDATION][column].to_numpy().astype(int)

    estimator = next(c for c in build_candidates() if c.name == "random_forest").estimator
    estimator.fit(parts[SPLIT_TRAIN][keep].to_numpy(), y_train)
    scores = estimator.predict_proba(parts[SPLIT_VALIDATION][keep].to_numpy())[:, 1]
    threshold = choose_threshold(y_val, scores, min_recall=MIN_RECALL[target])
    report = evaluate("pruned", SPLIT_VALIDATION, y_val, scores, threshold)

    return {
        "attempted": True,
        "features_kept": len(keep),
        "features_dropped": len(dropped),
        "dropped": dropped,
        "pruned_val_pr_auc": round(report.pr_auc, 4),
    }


def main() -> int:
    raw = load_all()
    table = assemble(raw)
    features = model_features(table)
    logger.info("analysing %d features across %d locations",
                len(features), table["location_id"].nunique())

    summary: dict = {
        "generated_at": pd.Timestamp.now("UTC").isoformat(),
        "n_features": len(features),
        "targets": {},
    }

    for target, column in TARGETS.items():
        logger.info("=" * 68)
        logger.info("TARGET: %s", target)

        bundle = joblib.load(config.MODELS_DIR / f"{target}_model.joblib")
        model, threshold = bundle["model"], bundle["threshold"]
        if list(bundle["features"]) != list(features):
            raise RuntimeError(
                f"{target}: saved model expects different features than the pipeline "
                "produces. Retrain before analysing."
            )

        frame = training_frame(table, column)
        test = frame[frame["split"] == SPLIT_TEST]
        x_test = test[features].to_numpy()
        y_test = test[column].to_numpy().astype(int)
        scores = model.predict_proba(x_test)[:, 1]

        # --- calibration ---------------------------------------------------
        calibration = assess_calibration(y_test, scores)
        logger.info("calibration: ECE=%.4f  max gap=%.4f",
                    calibration.expected_calibration_error, calibration.max_calibration_error)
        logger.info("  %s", calibration.verdict)

        # --- feature importance --------------------------------------------
        logger.info("measuring permutation importance (held-out test set)...")
        importances = measure_feature_importance(model, x_test, y_test, features)
        logger.info("\n%s", importance_summary(importances, top=12))

        candidates = prune_candidates(importances)
        logger.info("%d of %d features show no significant contribution",
                    len(candidates), len(features))

        # --- does pruning actually cost anything? ---------------------------
        keep = [f for f in features if f not in candidates]
        pruning = verify_pruning(target, column, table, keep, candidates)
        if pruning["attempted"]:
            report_path = config.REPORTS_DIR / "training_report.json"
            training_report = json.loads(report_path.read_text(encoding="utf-8"))
            baseline_val = next(
                r["pr_auc"]
                for r in training_report["targets"][target]["temporal"]["validation_comparison"]
                if r["name"] == "random_forest"
            )
            delta = pruning["pruned_val_pr_auc"] - baseline_val
            pruning["full_val_pr_auc"] = round(baseline_val, 4)
            pruning["delta"] = round(delta, 4)
            pruning["verdict"] = (
                "pruning is safe - no measurable cost"
                if delta >= -0.005
                else "pruning costs accuracy - keep the full feature set"
            )
            logger.info("pruned to %d features: val PR-AUC %.4f vs %.4f full (%+.4f) - %s",
                        pruning["features_kept"], pruning["pruned_val_pr_auc"],
                        baseline_val, delta, pruning["verdict"])

        summary["targets"][target] = {
            "threshold": threshold,
            "calibration": {
                "expected_calibration_error": calibration.expected_calibration_error,
                "max_calibration_error": calibration.max_calibration_error,
                "verdict": calibration.verdict,
                "bins": calibration.bins,
            },
            "feature_importance": [
                {
                    "rank": f.rank, "feature": f.name,
                    "pr_auc_drop": round(f.mean_drop, 5),
                    "std": round(f.std_drop, 5),
                    "significant": f.is_significant,
                }
                for f in importances
            ],
            "pruning": pruning,
        }

    path = config.REPORTS_DIR / "analysis_report.json"
    path.write_text(json.dumps(summary, indent=2, default=str), encoding="utf-8")
    logger.info("Wrote %s", path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
