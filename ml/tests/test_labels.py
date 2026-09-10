"""Tests for SPEI drought labels and the flood-conditions label.

The properties asserted here are the ones the scientific claim rests on:
correct standardisation, detection of a drought known to exist by construction,
strictly forward-looking labels, and - most importantly - that no label can be
reconstructed from the features the model will receive.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from climate_ml.labels.drought import (
    MIN_YEARS_FOR_FIT,
    compute_spei,
    fit_log_logistic,
    label_drought,
    water_balance_monthly,
)
from climate_ml.labels.flood import (
    WET_DAY_MM,
    fit_thresholds,
    flood_generating_days,
    label_flood,
    wet_day_percentile,
)

# --- SPEI -------------------------------------------------------------------

@pytest.fixture(scope="module")
def spei_frame(synthetic_climate):
    monthly = water_balance_monthly(synthetic_climate)
    fit_mask = (monthly["year_month"].dt.year <= 2016).to_numpy()
    return compute_spei(monthly, scale_months=3, fit_mask=fit_mask), fit_mask


def test_spei_is_standardised_on_the_fitting_period(spei_frame):
    """By definition SPEI is a z-score: mean ~0, standard deviation ~1."""
    spei, fit_mask = spei_frame
    values = spei.loc[fit_mask, "spei"].dropna()
    assert abs(values.mean()) < 0.15
    assert 0.85 < values.std() < 1.15


def test_spei_detects_the_injected_drought(spei_frame):
    """2015 was constructed with 15% of normal rainfall; it must register."""
    spei, _ = spei_frame
    drought_year = spei[spei["year_month"].dt.year == 2015]["spei"].dropna()
    assert drought_year.max() < -1.0, "injected drought year should be uniformly dry"


def test_spei_is_near_normal_outside_the_drought(spei_frame):
    spei, _ = spei_frame
    normal_years = spei[spei["year_month"].dt.year.isin([2018, 2019])]["spei"].dropna()
    assert abs(normal_years.mean()) < 1.0


def test_spei_fit_mask_actually_restricts_fitting(synthetic_climate):
    """Changing only the excluded period must not change the fitted index there.

    This is the leakage guarantee: if the test years influenced their own
    standardisation, corrupting them would shift the training-period values.
    """
    monthly = water_balance_monthly(synthetic_climate)
    fit_mask = (monthly["year_month"].dt.year <= 2016).to_numpy()
    baseline = compute_spei(monthly, 3, fit_mask=fit_mask)

    corrupted = monthly.copy()
    late = corrupted["year_month"].dt.year >= 2021
    corrupted.loc[late, "water_balance_mm"] -= 500.0
    perturbed = compute_spei(corrupted, 3, fit_mask=fit_mask)

    a = baseline.loc[fit_mask, "spei"].to_numpy()
    b = perturbed.loc[fit_mask, "spei"].to_numpy()
    assert np.allclose(a, b, equal_nan=True), "training-period SPEI changed when test data changed"


def test_water_balance_drops_partial_months(synthetic_climate):
    monthly = water_balance_monthly(synthetic_climate)
    assert (monthly["days"] >= 28).all()


def test_water_balance_is_precip_minus_et0(synthetic_climate):
    monthly = water_balance_monthly(synthetic_climate)
    expected = monthly["precip_mm"] - monthly["et0_mm"]
    assert np.allclose(monthly["water_balance_mm"], expected)


def test_log_logistic_flags_degenerate_samples():
    assert fit_log_logistic(np.full(50, 3.0)).fallback


def test_log_logistic_flags_short_samples():
    assert fit_log_logistic(np.arange(MIN_YEARS_FOR_FIT - 1, dtype=float)).fallback


def test_spei_undefined_when_too_few_years():
    """A short record must yield no SPEI rather than an unstable one."""
    dates = pd.date_range("2015-01-01", "2019-12-31", freq="D")
    frame = pd.DataFrame(
        {
            "date": dates,
            "precipitation_sum": np.full(len(dates), 3.0),
            "et0_fao_evapotranspiration": np.full(len(dates), 2.0),
        }
    )
    monthly = water_balance_monthly(frame)
    result = compute_spei(monthly, 3, fit_mask=np.ones(len(monthly), dtype=bool))
    assert result["spei"].isna().all()


def test_drought_label_uses_published_thresholds():
    spei = pd.Series([0.5, -0.9, -1.0, -1.6, -2.5])
    labels = label_drought(spei, -1.0)
    assert labels.tolist() == [0.0, 0.0, 1.0, 1.0, 1.0]


def test_drought_label_preserves_missing_values():
    labels = label_drought(pd.Series([np.nan, -2.0]), -1.0)
    assert bool(labels.isna().iloc[0]) and labels.iloc[1] == 1.0


# --- Flood ------------------------------------------------------------------

@pytest.fixture(scope="module")
def flood_setup(synthetic_climate):
    fit_mask = np.asarray(synthetic_climate["date"].dt.year) <= 2016
    thresholds = fit_thresholds(synthetic_climate, fit_mask)
    return synthetic_climate, thresholds, fit_mask


def test_r95p_excludes_dry_days(synthetic_climate):
    """ETCCDI defines the percentile over wet days only."""
    precipitation = synthetic_climate["precipitation_sum"].to_numpy()
    mask = np.ones(len(precipitation), dtype=bool)
    threshold, wet_days = wet_day_percentile(precipitation, mask, 95.0)
    assert wet_days == int((precipitation >= WET_DAY_MM).sum())
    assert threshold > WET_DAY_MM


def test_r95p_is_undefined_for_an_arid_location():
    """Too few wet days must give NaN, not a fabricated threshold."""
    precipitation = np.zeros(4000)
    precipitation[:5] = 2.0
    threshold, _ = wet_day_percentile(precipitation, np.ones(4000, dtype=bool), 95.0)
    assert np.isnan(threshold)


def test_flood_label_is_strictly_forward_looking(flood_setup):
    """The final `horizon` rows have no complete future window, so must be NaN."""
    frame, thresholds, _ = flood_setup
    labels = label_flood(frame, thresholds, horizon_days=3)
    assert np.isnan(labels[-3:]).all()
    assert not np.isnan(labels[:-3]).all()


def test_flood_label_is_binary(flood_setup):
    frame, thresholds, _ = flood_setup
    labels = label_flood(frame, thresholds, horizon_days=3)
    assert set(np.unique(labels[~np.isnan(labels)])) <= {0.0, 1.0}


def test_flood_label_is_not_reconstructable_from_same_day_rain(flood_setup):
    """The core anti-circularity guarantee.

    If today's rainfall determined the label, the model would only relearn a
    rule we already have. Agreement must be well below perfect.
    """
    frame, thresholds, _ = flood_setup
    labels = label_flood(frame, thresholds, horizon_days=3)
    same_day = (frame["precipitation_sum"].to_numpy() >= thresholds.r95p_mm).astype(float)
    valid = ~np.isnan(labels)
    assert (same_day[valid] == labels[valid]).mean() < 0.99


def test_longer_horizon_cannot_reduce_positives(flood_setup):
    """A wider future window can only include more flood-generating days."""
    frame, thresholds, _ = flood_setup
    short = label_flood(frame, thresholds, horizon_days=1)
    long = label_flood(frame, thresholds, horizon_days=7)
    common = ~np.isnan(short) & ~np.isnan(long)
    assert np.nansum(long[common]) >= np.nansum(short[common])


def test_flood_generating_day_needs_both_conditions(flood_setup):
    """Extreme rain on dry ground is not flagged; both terms must hold."""
    frame, thresholds, _ = flood_setup
    generating = flood_generating_days(frame, thresholds)
    extreme = frame["precipitation_sum"].to_numpy() >= thresholds.r95p_mm
    flagged = np.nansum(generating)
    assert flagged < extreme.sum(), "soil condition never excluded anything"
    assert flagged > 0, "soil condition excluded everything"


def test_flood_label_undefined_when_threshold_undefined():
    """An arid location yields no label rather than an all-zero column."""
    dates = pd.date_range("1995-01-01", "2004-12-31", freq="D")
    frame = pd.DataFrame(
        {
            "location_id": "ARID",
            "date": dates,
            "precipitation_sum": np.zeros(len(dates)),
            "soil_moisture_0_to_7cm_mean": np.full(len(dates), 0.05),
        }
    )
    thresholds = fit_thresholds(frame, np.ones(len(dates), dtype=bool))
    assert np.isnan(label_flood(frame, thresholds, 3)).all()


def test_flood_positive_rate_is_plausible(flood_setup):
    """A label that fires on most days would be describing weather, not extremes."""
    frame, thresholds, _ = flood_setup
    labels = label_flood(frame, thresholds, horizon_days=3)
    rate = np.nanmean(labels)
    assert 0.001 < rate < 0.30, f"implausible positive rate {rate:.3f}"
