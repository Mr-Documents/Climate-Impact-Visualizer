"""Tests for dataset assembly: splits, feature/label separation, leakage."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from climate_ml import config
from climate_ml.data.assemble import (
    SPLIT_TEST,
    SPLIT_TRAIN,
    SPLIT_VALIDATION,
    assemble,
    assemble_location,
    assign_split,
    model_features,
    training_frame,
)


@pytest.fixture(scope="module")
def table(synthetic_climate):
    return assemble_location(synthetic_climate)


# --- splits -----------------------------------------------------------------

def test_splits_are_chronological_and_disjoint(table):
    """Every training year must precede every validation year, and so on."""
    years = {s: table.loc[table["split"] == s, "year"] for s in
             (SPLIT_TRAIN, SPLIT_VALIDATION, SPLIT_TEST)}
    assert years[SPLIT_TRAIN].max() < years[SPLIT_VALIDATION].min()
    assert years[SPLIT_VALIDATION].max() < years[SPLIT_TEST].min()


def test_split_boundaries_match_configuration(table):
    assert table.loc[table["split"] == SPLIT_TRAIN, "year"].max() == config.TRAIN_END_YEAR
    assert (
        table.loc[table["split"] == SPLIT_VALIDATION, "year"].max()
        == config.VALIDATION_END_YEAR
    )


def test_every_row_is_assigned_exactly_one_split(table):
    assert table["split"].isin([SPLIT_TRAIN, SPLIT_VALIDATION, SPLIT_TEST]).all()


def test_assign_split_is_a_pure_function_of_year():
    years = np.array([1995, 2016, 2017, 2020, 2021, 2024])
    assert assign_split(years).tolist() == [
        SPLIT_TRAIN, SPLIT_TRAIN, SPLIT_VALIDATION,
        SPLIT_VALIDATION, SPLIT_TEST, SPLIT_TEST,
    ]


# --- feature / label separation ---------------------------------------------

def test_model_features_exclude_every_label_and_diagnostic(table):
    features = model_features(table)
    for forbidden in (
        "y_flood", "y_drought", "spei_now", "spei_persistence_baseline",
        "r95p_mm", "split", "year", "location_id", "date",
    ):
        assert forbidden not in features, f"{forbidden} must never be a model input"


def test_spei_now_is_available_for_the_baseline_but_not_as_a_feature(table):
    """The persistence baseline needs it; the model must not see it."""
    assert "spei_now" in table.columns
    assert "spei_now" not in model_features(table)


def test_both_targets_are_present(table):
    assert "y_flood" in table.columns
    assert "y_drought" in table.columns


def test_targets_are_binary_or_missing(table):
    for target in ("y_flood", "y_drought"):
        values = table[target].dropna().unique()
        assert set(values) <= {0.0, 1.0}, f"{target} has non-binary values {values}"


# --- leakage ----------------------------------------------------------------

def test_changing_the_test_period_does_not_change_training_features(synthetic_climate):
    """The whole pipeline, end to end, must not leak backwards."""
    baseline = assemble_location(synthetic_climate)

    corrupted = synthetic_climate.copy()
    late = np.asarray(corrupted["date"].dt.year) >= 2021
    corrupted.loc[late, "precipitation_sum"] *= 50.0
    perturbed = assemble_location(corrupted)

    features = model_features(baseline)
    train = baseline["split"] == SPLIT_TRAIN
    assert np.allclose(
        baseline.loc[train, features].to_numpy(),
        perturbed.loc[train, features].to_numpy(),
        equal_nan=True,
    )


def test_flood_threshold_is_fitted_on_training_data_only(synthetic_climate):
    baseline = assemble_location(synthetic_climate)
    corrupted = synthetic_climate.copy()
    late = np.asarray(corrupted["date"].dt.year) >= 2021
    corrupted.loc[late, "precipitation_sum"] *= 50.0
    perturbed = assemble_location(corrupted)
    assert baseline["r95p_mm"].iloc[0] == pytest.approx(perturbed["r95p_mm"].iloc[0])


# --- training frame ---------------------------------------------------------

def test_training_frame_drops_rows_with_missing_labels(table):
    frame = training_frame(table, "y_flood")
    assert frame["y_flood"].notna().all()


def test_training_frame_drops_rows_with_incomplete_features(table):
    frame = training_frame(table, "y_flood")
    assert frame[model_features(table)].notna().all().all()


def test_training_frame_removes_the_undefined_warmup_period(table):
    """The first ~180 days have undefined long windows and must not be imputed."""
    frame = training_frame(table, "y_flood")
    assert frame["date"].min() > table["date"].min()


def test_training_frame_keeps_both_classes(table):
    for target in ("y_flood", "y_drought"):
        assert training_frame(table, target)[target].nunique() == 2


# --- multi-location assembly -------------------------------------------------

def test_assemble_handles_multiple_locations(synthetic_climate):
    second = synthetic_climate.copy()
    second["location_id"] = "SYNTH2"
    second["latitude"] = -20.0
    combined = pd.concat([synthetic_climate, second], ignore_index=True)

    table = assemble(combined)
    assert set(table["location_id"].unique()) == {"SYNTH", "SYNTH2"}
    assert len(table) == 2 * len(synthetic_climate)


def test_assemble_skips_a_broken_location_without_failing(synthetic_climate):
    """One bad location must not abort a 60-location run."""
    broken = synthetic_climate[synthetic_climate["date"].dt.year >= 2023].copy()
    broken["location_id"] = "BROKEN"  # no training rows at all
    combined = pd.concat([synthetic_climate, broken], ignore_index=True)

    table = assemble(combined)
    assert "SYNTH" in set(table["location_id"].unique())
    assert "BROKEN" not in set(table["location_id"].unique())


def test_assemble_raises_when_nothing_is_usable(synthetic_climate):
    only_broken = synthetic_climate[synthetic_climate["date"].dt.year >= 2023].copy()
    only_broken["location_id"] = "BROKEN"
    with pytest.raises(RuntimeError, match="No location"):
        assemble(only_broken)
