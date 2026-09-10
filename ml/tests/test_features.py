"""Tests for feature engineering.

The most important test here is the leakage probe: corrupting the tail of the
record must leave every earlier feature bit-identical. Everything else in the
pipeline rests on that property holding.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from climate_ml.features.build import (
    API_DECAY,
    WET_DAY_MM,
    _antecedent_precipitation_index,
    _consecutive_run,
    build_features,
    feature_columns,
    fit_climatology,
)


@pytest.fixture(scope="module")
def built(synthetic_climate, train_mask):
    climatology = fit_climatology(synthetic_climate, train_mask)
    return build_features(synthetic_climate, climatology), climatology


# --- the leakage guarantee --------------------------------------------------

def test_future_data_cannot_change_past_features(synthetic_climate, built):
    """Corrupt the last 500 days; every feature before them must be unchanged.

    This is the empirical proof that no feature looks forward. A single
    accidental shift(-1) or center=True anywhere in the module breaks it.
    """
    features, climatology = built
    columns = feature_columns(features)

    corrupted = synthetic_climate.copy()
    corrupted.iloc[-500:, corrupted.columns.get_loc("precipitation_sum")] = 9999.0
    recomputed = build_features(corrupted, climatology)

    cutoff = len(synthetic_climate) - 600
    assert np.allclose(
        features[columns].to_numpy()[:cutoff],
        recomputed[columns].to_numpy()[:cutoff],
        equal_nan=True,
    )


def test_climatology_fit_mask_excludes_later_years(synthetic_climate, train_mask):
    """Changing only excluded years must not move the fitted climatology."""
    baseline = fit_climatology(synthetic_climate, train_mask)

    corrupted = synthetic_climate.copy()
    late = np.asarray(corrupted["date"].dt.year) >= 2021
    corrupted.loc[late, "temperature_2m_mean"] += 40.0
    perturbed = fit_climatology(corrupted, train_mask)

    assert np.allclose(baseline.means["temp"], perturbed.means["temp"], equal_nan=True)


# --- anomalies --------------------------------------------------------------

@pytest.mark.parametrize("column", ["precip_30d_anomaly", "temp_anomaly", "soil_anomaly"])
def test_anomalies_are_standardised_on_training_period(built, train_mask, column):
    features, _ = built
    values = features[column].to_numpy()[train_mask]
    values = values[np.isfinite(values)]
    assert abs(values.mean()) < 0.2
    assert 0.8 < values.std() < 1.2


def test_anomaly_is_undefined_when_climatology_has_no_variance():
    """A constant series has no meaningful anomaly - NaN, not division by zero."""
    dates = pd.date_range("1995-01-01", "2024-12-31", freq="D")
    frame = pd.DataFrame(
        {
            "location_id": "FLAT", "date": dates, "latitude": 0.0, "elevation_m": 0.0,
            "precipitation_sum": np.zeros(len(dates)),
            "et0_fao_evapotranspiration": np.ones(len(dates)),
            "soil_moisture_0_to_7cm_mean": np.full(len(dates), 0.2),
            "temperature_2m_mean": np.full(len(dates), 20.0),
        }
    )
    mask = np.ones(len(dates), dtype=bool)
    features = build_features(frame, fit_climatology(frame, mask))
    assert features["temp_anomaly"].isna().all()


# --- rolling windows --------------------------------------------------------

def test_rolling_sums_are_backward_looking(built):
    """precip_3d at row i must equal the sum of rows i-2..i."""
    features, _ = built
    daily = features["precip_1d"].to_numpy()
    three_day = features["precip_3d"].to_numpy()
    for i in (100, 500, 2000):
        assert three_day[i] == pytest.approx(daily[i - 2 : i + 1].sum())


def test_longer_windows_accumulate_more(built):
    features, _ = built
    tail = slice(200, None)
    assert (features["precip_180d"][tail] >= features["precip_30d"][tail]).all()
    assert (features["precip_30d"][tail] >= features["precip_3d"][tail]).all()


def test_feature_set_is_complete_and_identifier_free(built):
    features, _ = built
    columns = feature_columns(features)
    assert "location_id" not in columns and "date" not in columns
    for expected in (
        "precip_1d", "precip_180d", "water_balance_90d", "soil", "soil_anomaly",
        "antecedent_precip_index", "consecutive_dry_days", "doy_sin", "elevation_m",
    ):
        assert expected in columns
    assert len(columns) == len(set(columns)), "duplicate feature names"


def test_no_feature_is_entirely_missing(built):
    features, _ = built
    for column in feature_columns(features):
        assert features[column].notna().any(), f"{column} is entirely NaN"


# --- spell structure and antecedent index -----------------------------------

def test_consecutive_run_counts_correctly():
    run = _consecutive_run(np.array([True, True, False, True, True, True]))
    assert run.tolist() == [1.0, 2.0, 0.0, 1.0, 2.0, 3.0]


def test_consecutive_run_handles_all_false():
    assert _consecutive_run(np.zeros(5, dtype=bool)).tolist() == [0.0] * 5


def test_dry_and_wet_spells_are_mutually_exclusive(built):
    features, _ = built
    dry = features["consecutive_dry_days"].to_numpy()
    wet = features["consecutive_wet_days"].to_numpy()
    assert not ((dry > 0) & (wet > 0)).any()


def test_dry_spell_matches_the_wet_day_definition(built):
    features, _ = built
    is_dry = features["precip_1d"].to_numpy() < WET_DAY_MM
    has_dry_run = features["consecutive_dry_days"].to_numpy() > 0
    assert (is_dry == has_dry_run).all()


def test_antecedent_index_weights_recent_rain_more():
    recent = np.zeros(40); recent[-1] = 10.0
    old = np.zeros(40); old[-20] = 10.0
    assert _antecedent_precipitation_index(recent)[-1] > _antecedent_precipitation_index(old)[-1]


def test_antecedent_index_decays_at_the_declared_rate():
    rain = np.zeros(10); rain[0] = 100.0
    index = _antecedent_precipitation_index(rain)
    assert index[1] == pytest.approx(100.0 * API_DECAY)
    assert index[2] == pytest.approx(100.0 * API_DECAY**2)


def test_antecedent_index_is_zero_without_rain():
    assert _antecedent_precipitation_index(np.zeros(50))[-1] == pytest.approx(0.0)


# --- context ----------------------------------------------------------------

def test_day_of_year_encoding_is_cyclic(built):
    """31 December must sit next to 1 January, not 364 days away."""
    features, _ = built
    dates = features["date"]
    dec31 = features[(dates.dt.month == 12) & (dates.dt.day == 31)].iloc[0]
    jan01 = features[(dates.dt.month == 1) & (dates.dt.day == 1)].iloc[1]
    jul01 = features[(dates.dt.month == 7) & (dates.dt.day == 1)].iloc[0]

    def distance(a, b):
        return np.hypot(a["doy_sin"] - b["doy_sin"], a["doy_cos"] - b["doy_cos"])

    assert distance(dec31, jan01) < distance(jan01, jul01)


def test_cyclic_encoding_stays_on_the_unit_circle(built):
    features, _ = built
    radius = np.hypot(features["doy_sin"], features["doy_cos"])
    assert np.allclose(radius, 1.0)
