"""Regression tests for the "did a learned model beat its baselines?" check.

The guard exists so a model that loses to the naive answer is reported as a
negative result rather than quietly shipped. It was itself wrong once: it
compared baselines on single-split validation PR-AUC against a model selected by
grouped cross-validation. Those are different quantities - grouped CV holds
whole locations out and scores lower - so the mismatch made baselines look
stronger than they were.

On the real drought target that produced a false alarm: logistic_regression
leads on the single split (0.6073 vs 0.5951) but trails on grouped CV (0.5521 vs
0.5609). The selected model does clear its baselines; the guard said it did not.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

_spec = importlib.util.spec_from_file_location(
    "train_script", Path(__file__).resolve().parent.parent / "scripts" / "train.py"
)
train_script = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(train_script)

baselines_beating = train_script.baselines_beating


def _row(name, tier, cv=None, val=None):
    row = {"name": name, "notes": {"tier": tier}, "pr_auc": val}
    if cv is not None:
        row["cv_pr_auc"] = cv
    return row


def test_drought_case_is_not_reported_as_a_negative_result():
    """The exact numbers that triggered the false alarm."""
    best = _row("random_forest", "candidate", cv=0.5609, val=0.5951)
    results = [
        _row("persistence", "baseline", cv=0.4102, val=0.4557),
        _row("base_rate", "baseline", cv=0.1921, val=0.2351),
        _row("logistic_regression", "baseline", cv=0.5521, val=0.6073),
        best,
    ]

    beaten_by, missing = baselines_beating(best, results)

    assert beaten_by == [], (
        "random_forest leads every baseline on grouped CV, the basis selection "
        "used; it must not be reported as beaten"
    )
    assert missing == []


def test_a_genuinely_beaten_model_is_still_caught():
    """The guard must not be defanged by the fix."""
    best = _row("random_forest", "candidate", cv=0.40, val=0.95)
    results = [
        _row("persistence", "baseline", cv=0.55, val=0.10),
        _row("base_rate", "baseline", cv=0.19, val=0.05),
        best,
    ]

    beaten_by, missing = baselines_beating(best, results)

    assert [r["name"] for r in beaten_by] == ["persistence"]
    assert missing == []


def test_single_split_leader_does_not_trigger_the_guard():
    """A baseline ahead on validation but behind on CV is not a negative result."""
    best = _row("random_forest", "candidate", cv=0.60, val=0.50)
    results = [_row("logistic_regression", "baseline", cv=0.55, val=0.99), best]

    beaten_by, _ = baselines_beating(best, results)

    assert beaten_by == []


def test_baseline_without_a_cv_score_is_reported_as_unchecked():
    """Silence must not be mistaken for a pass."""
    best = _row("random_forest", "candidate", cv=0.60, val=0.50)
    results = [
        _row("persistence", "baseline", val=0.90),   # no cv_pr_auc
        _row("base_rate", "baseline", cv=0.19, val=0.20),
        best,
    ]

    beaten_by, missing = baselines_beating(best, results)

    assert beaten_by == []
    assert missing == ["persistence"]


@pytest.mark.parametrize("bad", [float("nan"), None])
def test_unscored_selected_model_marks_every_baseline_unchecked(bad):
    """With no CV score for the winner there is nothing to compare against."""
    best = {"name": "random_forest", "notes": {"tier": "candidate"}, "pr_auc": 0.9}
    if bad is not None:
        best["cv_pr_auc"] = bad
    results = [
        _row("persistence", "baseline", cv=0.41, val=0.45),
        _row("base_rate", "baseline", cv=0.19, val=0.24),
        best,
    ]

    beaten_by, missing = baselines_beating(best, results)

    assert beaten_by == []
    assert missing == ["persistence", "base_rate"]


def test_persistence_counts_as_a_baseline_even_without_a_tier():
    """It is added to the results list separately and may carry no tier."""
    best = _row("random_forest", "candidate", cv=0.30, val=0.50)
    results = [
        {"name": "persistence", "notes": {}, "pr_auc": 0.10, "cv_pr_auc": 0.45},
        best,
    ]

    beaten_by, missing = baselines_beating(best, results)

    assert [r["name"] for r in beaten_by] == ["persistence"]
    assert missing == []
