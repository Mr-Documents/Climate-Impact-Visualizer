"""Tests for evaluation metrics and candidate models."""

from __future__ import annotations

import numpy as np
import pytest

from climate_ml.evaluation.metrics import (
    calibration_curve,
    choose_threshold,
    error_cost_summary,
    evaluate,
)
from climate_ml.models.candidates import BaseRateClassifier, build_candidates


@pytest.fixture
def imbalanced():
    """A 5%-positive problem with a genuinely informative score."""
    rng = np.random.default_rng(0)
    n = 4000
    y = (rng.random(n) < 0.05).astype(int)
    scores = np.clip(rng.normal(0.2, 0.15, n) + 0.45 * y, 0, 1)
    return y, scores


# --- metric correctness -----------------------------------------------------

def test_pr_auc_floor_equals_the_positive_rate():
    """A random score cannot beat the base rate on average precision."""
    rng = np.random.default_rng(1)
    y = (rng.random(20000) < 0.05).astype(int)
    report = evaluate("random", "test", y, rng.random(20000), 0.5)
    assert report.pr_auc == pytest.approx(y.mean(), abs=0.02)


def test_informative_scores_beat_the_floor(imbalanced):
    y, scores = imbalanced
    report = evaluate("informative", "test", y, scores, 0.5)
    assert report.pr_auc > y.mean() * 3


def test_perfect_scores_reach_the_ceiling(imbalanced):
    y, _ = imbalanced
    report = evaluate("perfect", "test", y, y.astype(float), 0.5)
    assert report.pr_auc == pytest.approx(1.0)
    assert report.recall == pytest.approx(1.0)
    assert report.false_negative == 0


def test_confusion_matrix_totals_match_the_sample(imbalanced):
    y, scores = imbalanced
    report = evaluate("m", "test", y, scores, 0.5)
    total = (
        report.true_negative + report.false_positive
        + report.false_negative + report.true_positive
    )
    assert total == len(y)
    assert report.true_positive + report.false_negative == report.positives


def test_skill_score_is_zero_for_a_base_rate_model():
    rng = np.random.default_rng(2)
    y = (rng.random(20000) < 0.05).astype(int)
    report = evaluate("base", "test", y, np.full(len(y), 0.05), 0.5)
    assert abs(report.pr_auc_skill_vs_base_rate) < 0.03


def test_single_class_split_yields_nan_not_a_crash():
    """A split with no positives must degrade gracefully, not raise."""
    y = np.zeros(100, dtype=int)
    report = evaluate("m", "test", y, np.random.default_rng(3).random(100), 0.5)
    assert np.isnan(report.roc_auc)
    assert report.positives == 0


# --- threshold selection ----------------------------------------------------

def test_threshold_selection_respects_a_recall_floor(imbalanced):
    y, scores = imbalanced
    threshold = choose_threshold(y, scores, min_recall=0.80)
    achieved = evaluate("m", "validation", y, scores, threshold).recall
    assert achieved >= 0.80


def test_higher_recall_floor_gives_a_lower_threshold(imbalanced):
    y, scores = imbalanced
    lenient = choose_threshold(y, scores, min_recall=0.50)
    strict = choose_threshold(y, scores, min_recall=0.95)
    assert strict <= lenient


def test_f1_objective_beats_the_default_threshold(imbalanced):
    y, scores = imbalanced
    tuned = choose_threshold(y, scores, objective="f1")
    assert (
        evaluate("m", "v", y, scores, tuned).f1
        >= evaluate("m", "v", y, scores, 0.5).f1
    )


def test_unknown_objective_is_rejected(imbalanced):
    y, scores = imbalanced
    with pytest.raises(ValueError, match="unknown objective"):
        choose_threshold(y, scores, objective="nonsense")


# --- calibration and error costs --------------------------------------------

def test_calibration_curve_tracks_a_well_calibrated_model():
    rng = np.random.default_rng(4)
    probabilities = rng.random(20000)
    y = (rng.random(20000) < probabilities).astype(int)
    curve = calibration_curve(y, probabilities, bins=10)
    for row in curve:
        if row["count"] > 200:
            assert abs(row["mean_predicted"] - row["observed_frequency"]) < 0.06


def test_calibration_curve_skips_empty_bins():
    scores = np.full(100, 0.05)
    assert len(calibration_curve(np.zeros(100, dtype=int), scores, bins=10)) == 1


def test_error_cost_summary_reports_operational_quantities(imbalanced):
    y, scores = imbalanced
    summary = error_cost_summary(evaluate("m", "test", y, scores, 0.4))
    assert summary["missed_events"] >= 0
    assert 0.0 <= summary["missed_event_rate"] <= 1.0


# --- candidates -------------------------------------------------------------

def test_base_rate_classifier_learns_the_training_rate():
    x = np.zeros((1000, 3))
    y = np.zeros(1000, dtype=int)
    y[:70] = 1
    model = BaseRateClassifier().fit(x, y)
    assert model.predict_proba(x)[:, 1][0] == pytest.approx(0.07)


def test_every_candidate_fits_and_produces_valid_probabilities():
    rng = np.random.default_rng(5)
    x = rng.normal(size=(800, 6))
    y = (x[:, 0] + rng.normal(0, 0.5, 800) > 1.0).astype(int)

    for candidate in build_candidates():
        candidate.estimator.fit(x, y)
        probabilities = candidate.estimator.predict_proba(x)
        assert probabilities.shape == (800, 2)
        assert np.all((probabilities >= 0) & (probabilities <= 1))
        assert np.allclose(probabilities.sum(axis=1), 1.0)


def test_candidates_are_ordered_baselines_first():
    tiers = [c.tier for c in build_candidates()]
    assert tiers[0] == "baseline"
    assert tiers.index("candidate") > 0


def test_every_candidate_documents_why_it_is_included():
    for candidate in build_candidates():
        assert candidate.rationale, f"{candidate.name} has no stated rationale"
