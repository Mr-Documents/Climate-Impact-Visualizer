"""Evaluation for imbalanced binary climate-risk targets.

Accuracy is not reported as a headline figure and never alone. With a 2.6%
positive rate, predicting "no flood" every day scores 97.4% accuracy while being
useless, so the headline metric is PR-AUC (average precision), which summarises
performance across all thresholds without being flattered by the negative class.

Every model is scored against two baselines rather than against zero:

* the climatological base rate - always predict the training positive rate;
* persistence - assume today's state continues. For drought this is strong,
  because SPEI-3 overlaps already-observed months, so beating it is the only
  evidence that the model learned anything beyond "conditions are sticky".

Skill scores express improvement over a baseline on its own terms:
``skill = (model - baseline) / (perfect - baseline)``, so 0 means "no better
than the baseline" and 1 means perfect.
"""

from __future__ import annotations

import itertools
from dataclasses import asdict, dataclass, field

import numpy as np
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)


@dataclass
class BinaryReport:
    """Metrics for one model on one split."""

    name: str
    split: str
    n: int
    positives: int
    positive_rate: float
    pr_auc: float
    roc_auc: float
    brier: float
    threshold: float
    precision: float
    recall: float
    f1: float
    true_negative: int
    false_positive: int
    false_negative: int
    true_positive: int
    pr_auc_skill_vs_base_rate: float
    notes: dict = field(default_factory=dict)

    def as_dict(self) -> dict:
        return asdict(self)


def _safe(metric, *args, default: float = float("nan"), **kwargs) -> float:
    """Metrics are undefined when a split holds only one class; report NaN."""
    try:
        return float(metric(*args, **kwargs))
    except ValueError:
        return default


def choose_threshold(
    y_true: np.ndarray,
    scores: np.ndarray,
    objective: str = "f1",
    min_recall: float | None = None,
) -> float:
    """Pick a decision threshold on VALIDATION data only.

    Leaving the threshold at 0.5 is a silent modelling choice, and a poor one on
    imbalanced data. It is tuned here and then applied unchanged to the test set.

    Args:
        objective: ``"f1"`` balances the two error types.
        min_recall: When set, the highest-precision threshold achieving at least
            this recall is chosen instead. Use when a missed event costs far
            more than a false alarm - the usual case for hazard warning.
    """
    candidates = np.unique(np.round(scores, 4))
    if candidates.size > 500:
        candidates = np.quantile(scores, np.linspace(0.01, 0.99, 500))

    best_threshold, best_value = 0.5, -np.inf
    for threshold in candidates:
        predicted = (scores >= threshold).astype(int)
        if predicted.sum() == 0:
            continue
        recall = recall_score(y_true, predicted, zero_division=0)
        if min_recall is not None:
            if recall < min_recall:
                continue
            value = precision_score(y_true, predicted, zero_division=0)
        elif objective == "f1":
            value = f1_score(y_true, predicted, zero_division=0)
        else:
            raise ValueError(f"unknown objective {objective!r}")
        if value > best_value:
            best_threshold, best_value = float(threshold), value
    return best_threshold


def evaluate(
    name: str,
    split: str,
    y_true: np.ndarray,
    scores: np.ndarray,
    threshold: float,
    notes: dict | None = None,
) -> BinaryReport:
    """Score one model's probabilities against the truth on one split."""
    y_true = np.asarray(y_true).astype(int)
    scores = np.asarray(scores, dtype=float)
    predicted = (scores >= threshold).astype(int)

    positives = int(y_true.sum())
    base_rate = positives / len(y_true) if len(y_true) else float("nan")

    pr_auc = _safe(average_precision_score, y_true, scores)
    # A random classifier's average precision equals the positive rate, so that
    # is the floor the skill score is measured from.
    skill = (
        (pr_auc - base_rate) / (1.0 - base_rate)
        if np.isfinite(pr_auc) and np.isfinite(base_rate) and base_rate < 1
        else float("nan")
    )

    matrix = confusion_matrix(y_true, predicted, labels=[0, 1])
    tn, fp, fn, tp = matrix.ravel()

    return BinaryReport(
        name=name,
        split=split,
        n=len(y_true),
        positives=positives,
        positive_rate=base_rate,
        pr_auc=pr_auc,
        roc_auc=_safe(roc_auc_score, y_true, scores),
        brier=_safe(brier_score_loss, y_true, np.clip(scores, 0, 1)),
        threshold=float(threshold),
        precision=_safe(precision_score, y_true, predicted, zero_division=0),
        recall=_safe(recall_score, y_true, predicted, zero_division=0),
        f1=_safe(f1_score, y_true, predicted, zero_division=0),
        true_negative=int(tn), false_positive=int(fp),
        false_negative=int(fn), true_positive=int(tp),
        pr_auc_skill_vs_base_rate=skill,
        notes=notes or {},
    )


def calibration_curve(y_true: np.ndarray, scores: np.ndarray, bins: int = 10) -> list[dict]:
    """Observed frequency against predicted probability, for a reliability plot.

    A well-calibrated model that says "30% chance" should be right about 30% of
    the time. This matters for a decision-support tool: a number shown to a user
    as a probability should behave like one.
    """
    y_true = np.asarray(y_true).astype(int)
    scores = np.asarray(scores, dtype=float)
    edges = np.linspace(0.0, 1.0, bins + 1)
    rows = []
    for lower, upper in itertools.pairwise(edges):
        in_bin = (scores >= lower) & (scores < upper if upper < 1.0 else scores <= upper)
        if not in_bin.any():
            continue
        rows.append(
            {
                "bin_lower": float(lower),
                "bin_upper": float(upper),
                "count": int(in_bin.sum()),
                "mean_predicted": float(scores[in_bin].mean()),
                "observed_frequency": float(y_true[in_bin].mean()),
            }
        )
    return rows


def error_cost_summary(report: BinaryReport) -> dict:
    """Frame the two error types in operational terms.

    For hazard warning the two are not symmetric: a false negative is an
    unwarned event, a false positive an unnecessary alert. The ratio is reported
    so the threshold choice can be argued rather than assumed.
    """
    missed = report.false_negative
    false_alarms = report.false_positive
    return {
        "missed_events": missed,
        "false_alarms": false_alarms,
        "missed_event_rate": missed / report.positives if report.positives else float("nan"),
        "false_alarms_per_true_event": (
            false_alarms / report.true_positive if report.true_positive else float("inf")
        ),
    }
