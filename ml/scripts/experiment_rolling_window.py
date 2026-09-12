"""Does a recent training window beat a long one under a shifting base rate?

MOTIVATION
Drought frequency rose sharply against the 1995-2016 baseline:

    1995-2016 (train)       13.78%   0.87x the stationary expectation
    2017-2020 (validation)  23.28%   1.47x
    2021-2024 (test)        21.20%   1.34x

A model trained on a 13.78% prior cannot produce calibrated probabilities for a
21.20% period, which is what the test calibration showed (ECE 0.111,
systematically under-predicting). Flood drifts too, though far less
(2.61% -> 3.58% -> 3.81%), so it is swept as well rather than assumed immune.

EXPERIMENTAL CONTROL
The SPEI distribution and the R95p thresholds stay fitted on 1995-2016 in every
variant, so the LABELS are identical throughout. Only the rows the model learns
from change. Without that control a shorter window would also redefine the
target and no difference would be interpretable.

KNOWN DEFECT IN THIS SCRIPT - READ BEFORE TRUSTING ITS VALIDATION NUMBERS
-------------------------------------------------------------------------
The validation metrics reported here are CONTAMINATED and must not be used for
selection. Each variant is fitted with CalibratedClassifierCV over
train+validation (mirroring production), then scored on validation - rows the
model has already trained on. That inflates validation PR-AUC to ~0.85 where
the honest figure is ~0.60.

The TEST metrics are clean, because the test split never enters training. But
choosing a variant by them is test-set selection, which is what an earlier
version of this script did and which this version was supposed to fix. It did
not fix it; it moved the contamination rather than removing it.

The sound way to run this comparison is the production pipeline itself
(scripts/train.py), which fits on train, selects on validation, and touches
test once. That was done, and it contradicted this script: the windowed drought
variant selects a different algorithm and scores test PR-AUC 0.5843, not the
0.6413 reported below.

This file is retained as the record of an experiment whose result did not
survive honest evaluation. Its conclusions should be read only alongside
reports/training_report.json. To repair it, hold out a third split for variant
selection, or fit each variant on train alone before scoring validation.
"""

from __future__ import annotations

import json
import logging
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV

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
from climate_ml.evaluation.analysis import assess_calibration
from climate_ml.evaluation.metrics import choose_threshold, evaluate
from climate_ml.models.candidates import build_candidates

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s",
                    datefmt="%H:%M:%S")
logger = logging.getLogger("rolling")

TARGETS = {"drought": ("y_drought", 0.70), "flood": ("y_flood", 0.50)}

# (name, first training year, recency half-life in years or None)
#
# A first pass showed validation ECE falling monotonically as the window
# shortens, so this grid is finer at the short end and adds hybrids that apply
# recency weighting *inside* a short window.
VARIANTS = [
    ("full", 1995, None),
    ("recent15", 2002, None),
    ("recent10", 2007, None),
    ("recent7", 2010, None),
    ("recent5", 2012, None),
    ("recent3", 2014, None),
    ("weighted", 1995, 8.0),
    ("recent10_w", 2007, 4.0),
    ("recent5_w", 2012, 3.0),
]

# A variant may not buy calibration by destroying ranking.
MAX_VAL_PR_AUC_LOSS = 0.01


def run_variant(
    name: str,
    column: str,
    min_recall: float,
    train_rows: pd.DataFrame,
    validation_rows: pd.DataFrame,
    test_rows: pd.DataFrame,
    features: list[str],
    sample_weight: np.ndarray | None = None,
) -> dict:
    """Fit, calibrate and score one variant."""
    x_train = train_rows[features].to_numpy()
    y_train = train_rows[column].to_numpy().astype(int)
    x_val = validation_rows[features].to_numpy()
    y_val = validation_rows[column].to_numpy().astype(int)
    x_test = test_rows[features].to_numpy()
    y_test = test_rows[column].to_numpy().astype(int)

    base = next(c for c in build_candidates() if c.name == "random_forest").estimator

    # Same calibration strategy as production: cross-validated over all pre-test
    # data so every row trains and no row calibrates itself.
    combined_x = np.vstack([x_train, x_val])
    combined_y = np.concatenate([y_train, y_val])
    combined_weight = (
        np.concatenate([sample_weight, np.ones(len(y_val))])
        if sample_weight is not None else None
    )

    model = CalibratedClassifierCV(base, method="sigmoid", cv=3, ensemble=False)
    if combined_weight is not None:
        model.fit(combined_x, combined_y, sample_weight=combined_weight)
    else:
        model.fit(combined_x, combined_y)

    val_scores = model.predict_proba(x_val)[:, 1]
    threshold = choose_threshold(y_val, val_scores, min_recall=min_recall)

    # CONTAMINATED: the model trained on these rows. See the module docstring.
    val_report = evaluate(name, SPLIT_VALIDATION, y_val, val_scores, threshold)
    val_calibration = assess_calibration(y_val, val_scores)

    test_scores = model.predict_proba(x_test)[:, 1]
    test_report = evaluate(name, SPLIT_TEST, y_test, test_scores, threshold)
    test_calibration = assess_calibration(y_test, test_scores)

    logger.info(
        "  %-11s train=%7d (%.2f%%) | VAL PR-AUC %.4f ECE %.4f | test PR-AUC %.4f ECE %.4f",
        name, len(y_train), 100 * y_train.mean(),
        val_report.pr_auc, val_calibration.expected_calibration_error,
        test_report.pr_auc, test_calibration.expected_calibration_error,
    )

    return {
        "variant": name,
        "train_rows": len(y_train),
        "train_positive_rate": round(float(y_train.mean()), 4),
        "val_pr_auc_CONTAMINATED": round(val_report.pr_auc, 4),
        "val_ece_CONTAMINATED": val_calibration.expected_calibration_error,
        "test_pr_auc": round(test_report.pr_auc, 4),
        "test_roc_auc": round(test_report.roc_auc, 4),
        "test_ece": test_calibration.expected_calibration_error,
        "test_recall": round(test_report.recall, 4),
        "test_precision": round(test_report.precision, 4),
        "calibration_verdict": test_calibration.verdict,
    }


def run_target(target: str, column: str, min_recall: float, table: pd.DataFrame) -> dict:
    """Sweep training windows for one target and choose on validation."""
    features = model_features(table)
    frame = training_frame(table, column)

    all_train = frame[frame["split"] == SPLIT_TRAIN]
    validation = frame[frame["split"] == SPLIT_VALIDATION]
    test = frame[frame["split"] == SPLIT_TEST]

    logger.info("=" * 92)
    logger.info("TARGET %s | test %d rows, %.2f%% positive",
                target, len(test), 100 * test[column].mean())

    results = []
    for name, first_year, half_life in VARIANTS:
        subset = all_train[all_train["year"] >= first_year]
        weights = None
        if half_life is not None:
            age = config.TRAIN_END_YEAR - subset["year"].to_numpy()
            weights = 0.5 ** (age / half_life)
        results.append(
            run_variant(name, column, min_recall, subset, validation, test, features, weights)
        )

    baseline = next(r for r in results if r["variant"] == "full")
    for r in results:
        r["pr_auc_delta"] = round(r["test_pr_auc"] - baseline["test_pr_auc"], 4)
        r["ece_delta"] = round(r["test_ece"] - baseline["test_ece"], 4)

    acceptable = [
        r for r in results
        if r["val_pr_auc_CONTAMINATED"] >= baseline["val_pr_auc_CONTAMINATED"] - MAX_VAL_PR_AUC_LOSS
    ]
    if not acceptable:
        acceptable = results
        logger.warning("%s: every variant lost ranking; choosing on calibration alone", target)
    chosen = min(acceptable, key=lambda r: r["val_ece_CONTAMINATED"])

    logger.info("  -> chosen on validation: %s (val ECE %.4f, val PR-AUC %.4f)",
                chosen["variant"], chosen["val_ece_CONTAMINATED"], chosen["val_pr_auc_CONTAMINATED"])
    logger.info("     its test performance: PR-AUC %.4f  ECE %.4f  (%s)",
                chosen["test_pr_auc"], chosen["test_ece"], chosen["calibration_verdict"][:30])

    return {
        "variants": results,
        "chosen": chosen["variant"],
        "chosen_first_year": next(v[1] for v in VARIANTS if v[0] == chosen["variant"]),
        "chosen_half_life": next(v[2] for v in VARIANTS if v[0] == chosen["variant"]),
        "chosen_val_ece_CONTAMINATED": chosen["val_ece_CONTAMINATED"],
        "chosen_test_pr_auc": chosen["test_pr_auc"],
        "chosen_test_ece": chosen["test_ece"],
        "baseline_test_pr_auc": baseline["test_pr_auc"],
        "baseline_test_ece": baseline["test_ece"],
    }


def main() -> int:
    table = assemble(load_all())
    logger.info("labels identical across variants (SPEI and R95p fitted on 1995-%d throughout)",
                config.TRAIN_END_YEAR)

    per_target = {
        target: run_target(target, column, min_recall, table)
        for target, (column, min_recall) in TARGETS.items()
    }

    summary = {
        "generated_at": pd.Timestamp.now("UTC").isoformat(),
        "control": "SPEI and R95p fitted on 1995-2016 in every variant; labels identical",
        "selection_basis": "UNSOUND - validation metrics are contaminated; see module docstring",
        "targets": per_target,
    }

    path = config.REPORTS_DIR / "rolling_window_experiment.json"
    path.write_text(json.dumps(summary, indent=2, default=str), encoding="utf-8")

    logger.info("=" * 92)
    for target, r in per_target.items():
        logger.info("%s: adopt '%s' | test PR-AUC %.4f (was %.4f)  ECE %.4f (was %.4f)",
                    target, r["chosen"], r["chosen_test_pr_auc"], r["baseline_test_pr_auc"],
                    r["chosen_test_ece"], r["baseline_test_ece"])
    logger.info("Wrote %s", path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
