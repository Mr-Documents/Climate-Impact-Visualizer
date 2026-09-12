"""Post-training analysis: feature importance and probability calibration.

Both answer questions the headline metrics cannot.

FEATURE IMPORTANCE
Permutation importance, measured on HELD-OUT data. A feature's importance is the
drop in PR-AUC when its column is shuffled, breaking its relationship with the
target while leaving the marginal distribution intact.

Impurity-based importance (``feature_importances_``) is deliberately not used:
it is computed on training data and is biased toward high-cardinality continuous
features, which describes almost every feature here. Permutation importance on
the test set measures what the model actually relies on to generalise.

CALIBRATION
The dashboard shows users "28% probability". Calibration asks whether days the
model calls 28% actually see the event about 28% of the time. A model can rank
well (good PR-AUC) while being systematically over- or under-confident, and for
a decision-support tool the number on screen has to mean what it says.

Expected Calibration Error is the sample-weighted mean gap between predicted
probability and observed frequency across bins.
"""

from __future__ import annotations

import itertools
import logging
from dataclasses import dataclass, field

import numpy as np
from sklearn.inspection import permutation_importance

logger = logging.getLogger(__name__)

# Permutation importance is noisy with a single shuffle. Repeats let us report a
# standard deviation and judge whether a small importance is real.
N_REPEATS = 5


@dataclass
class FeatureImportance:
    """One feature's measured contribution."""

    name: str
    mean_drop: float
    std_drop: float
    rank: int

    @property
    def is_significant(self) -> bool:
        """Importance exceeding twice its own noise.

        A feature whose mean drop is smaller than its variability across
        shuffles has not demonstrably contributed anything.
        """
        return self.mean_drop > 2 * self.std_drop and self.mean_drop > 0


@dataclass
class CalibrationReport:
    """How closely predicted probabilities match observed frequencies."""

    expected_calibration_error: float
    max_calibration_error: float
    bins: list[dict] = field(default_factory=list)
    verdict: str = ""


def measure_feature_importance(
    model,
    x: np.ndarray,
    y: np.ndarray,
    feature_names: list[str],
    n_repeats: int = N_REPEATS,
    random_state: int = 42,
    max_rows: int = 30000,
) -> list[FeatureImportance]:
    """Permutation importance against PR-AUC on held-out data.

    Args:
        max_rows: Subsample cap. Permutation importance costs
            ``n_features * n_repeats`` full predictions; on 84k rows and 29
            features that is 145 passes. Subsampling keeps it tractable, and
            the ranking is stable well below the full set. Stratified so the
            rare positive class is preserved.
    """
    if len(y) > max_rows:
        rng = np.random.default_rng(random_state)
        positive = np.flatnonzero(y == 1)
        negative = np.flatnonzero(y == 0)
        # Preserve the class balance rather than sampling uniformly - with a
        # 3.8% positive rate, uniform sampling would leave too few events for
        # average precision to be stable.
        n_pos = min(len(positive), max(1, int(max_rows * len(positive) / len(y))))
        n_neg = min(len(negative), max_rows - n_pos)
        index = np.concatenate([
            rng.choice(positive, n_pos, replace=False),
            rng.choice(negative, n_neg, replace=False),
        ])
        rng.shuffle(index)
        x, y = x[index], y[index]
        logger.info("subsampled to %d rows (%d positive) for permutation importance",
                    len(y), int(y.sum()))

    result = permutation_importance(
        model, x, y,
        scoring="average_precision",
        n_repeats=n_repeats,
        random_state=random_state,
        n_jobs=-1,
    )

    order = np.argsort(result.importances_mean)[::-1]
    return [
        FeatureImportance(
            name=feature_names[i],
            mean_drop=float(result.importances_mean[i]),
            std_drop=float(result.importances_std[i]),
            rank=rank,
        )
        for rank, i in enumerate(order, start=1)
    ]


def assess_calibration(y_true: np.ndarray, scores: np.ndarray, bins: int = 10) -> CalibrationReport:
    """Compare predicted probability against observed frequency.

    Bins are equal-width in probability. Empty bins are skipped rather than
    counted as perfectly calibrated, which would flatter a model that never
    predicts in that range.
    """
    y_true = np.asarray(y_true).astype(int)
    scores = np.clip(np.asarray(scores, dtype=float), 0.0, 1.0)

    edges = np.linspace(0.0, 1.0, bins + 1)
    rows: list[dict] = []
    weighted_gap = 0.0
    max_gap = 0.0

    for lower, upper in itertools.pairwise(edges):
        in_bin = (scores >= lower) & (scores < upper if upper < 1.0 else scores <= upper)
        count = int(in_bin.sum())
        if count == 0:
            continue

        predicted = float(scores[in_bin].mean())
        observed = float(y_true[in_bin].mean())
        gap = abs(predicted - observed)

        weighted_gap += gap * count
        max_gap = max(max_gap, gap)
        rows.append({
            "bin_lower": round(float(lower), 2),
            "bin_upper": round(float(upper), 2),
            "count": count,
            "mean_predicted": round(predicted, 4),
            "observed_frequency": round(observed, 4),
            "gap": round(gap, 4),
            "direction": "over-confident" if predicted > observed else "under-confident",
        })

    ece = weighted_gap / len(y_true) if len(y_true) else float("nan")

    # Thresholds follow common practice in the calibration literature: below
    # 0.05 is generally treated as well calibrated for decision support.
    if ece < 0.05:
        verdict = "well calibrated - probabilities can be shown to users as stated"
    elif ece < 0.10:
        verdict = "moderately calibrated - usable, but state the uncertainty"
    else:
        verdict = "poorly calibrated - recalibrate before presenting as probabilities"

    return CalibrationReport(
        expected_calibration_error=round(ece, 4),
        max_calibration_error=round(max_gap, 4),
        bins=rows,
        verdict=verdict,
    )


def prune_candidates(importances: list[FeatureImportance]) -> list[str]:
    """Features whose measured contribution is indistinguishable from noise.

    Returned for consideration, not dropped automatically: a feature can be
    individually redundant because a correlated feature carries the same signal,
    and removing several such features at once can cost more than removing any
    one of them. Pruning is verified by retraining, not assumed.
    """
    return [f.name for f in importances if not f.is_significant]


def importance_summary(importances: list[FeatureImportance], top: int = 10) -> str:
    """Human-readable ranking for logs and reports."""
    lines = [f"{'rank':>4}  {'feature':28} {'PR-AUC drop':>12} {'std':>8}  significant"]
    for f in importances[:top]:
        lines.append(
            f"{f.rank:>4}  {f.name:28} {f.mean_drop:>12.5f} {f.std_drop:>8.5f}  "
            f"{'yes' if f.is_significant else 'no'}"
        )
    return "\n".join(lines)
