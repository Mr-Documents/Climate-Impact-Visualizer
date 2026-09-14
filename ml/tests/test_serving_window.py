"""Extending the record must not move anything that was fitted.

The prediction service requests data up to *today* while training requests a
fixed window ending at ``config.END_DATE``. That is only sound if every fitted
statistic - the SPEI reference distribution, the R95p wet-day threshold, the
day-of-year soil climatology - is pinned to the training YEARS rather than to
"whatever record I was handed". If extending the record refitted them, the
served model would be scoring against a target quietly different from the one
every metric in MODEL_CARD.md describes, and the reported calibration would no
longer apply.

``assemble.py`` pins them by year:

    split[years <= config.TRAIN_END_YEAR] = SPLIT_TRAIN
    monthly_train = month_periods.dt.year <= config.TRAIN_END_YEAR

These tests assert that property holds, because it is load-bearing and a
plausible future refactor ("just fit on all the data we have") would silently
break it. The only values allowed to change are the forward-looking labels at
the tail, which become defined once the days they look ahead to exist.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from climate_ml import config
from climate_ml.data.assemble import assemble_location, model_features
from climate_ml.data.openmeteo import load_all

TRUNCATE_AT = "2020-12-31"


@pytest.fixture(scope="module")
def assembled():
    """One location assembled twice: truncated, and with the full record."""
    raw = load_all()
    if raw.empty:
        pytest.skip("no cached climate data available")
    location = min(raw["location_id"].unique())
    record = raw[raw["location_id"] == location].sort_values("date").reset_index(drop=True)
    if record["date"].max() <= pd.Timestamp(TRUNCATE_AT):
        pytest.skip("record does not extend past the truncation point")

    short = assemble_location(record[record["date"] <= TRUNCATE_AT].copy())
    full = assemble_location(record.copy())
    features = model_features(full)
    assert features, "model_features returned nothing; the fixture proves nothing"
    return short.merge(full, on="date", suffixes=("_short", "_full")), features


@pytest.fixture(scope="module")
def pair(assembled):
    return assembled[0]


@pytest.fixture(scope="module")
def features(assembled):
    return assembled[1]


def test_features_are_bit_identical_when_the_record_is_extended(pair, features):
    """The serving window may be longer; the features must not notice."""
    offenders = {}
    compared = 0
    for column in features:
        a, b = f"{column}_short", f"{column}_full"
        assert a in pair and b in pair, f"{column} missing from the merged frame"
        x = pair[a].to_numpy(dtype=float)
        y = pair[b].to_numpy(dtype=float)
        compared += 1
        if not np.array_equal(x, y, equal_nan=True):
            offenders[column] = float(np.nanmax(np.abs(x - y)))

    assert compared == len(features), "not every feature was checked"
    assert compared >= 25, f"only {compared} features compared; expected ~29"
    assert not offenders, (
        "extending the record changed these features, which means something is "
        f"being fitted on the whole record instead of the training years: {offenders}"
    )


def test_the_fitted_flood_threshold_does_not_move(pair):
    """R95p is a fitted statistic and the clearest canary."""
    if "r95p_mm_short" not in pair:
        pytest.skip("r95p_mm not exposed by assemble_location")
    short_values = pair["r95p_mm_short"].dropna().unique()
    full_values = pair["r95p_mm_full"].dropna().unique()
    assert np.allclose(short_values, full_values, equal_nan=True), (
        f"R95p threshold moved when the record was extended: "
        f"{short_values[:3]} -> {full_values[:3]}"
    )


def test_the_fitted_drought_index_does_not_move(pair):
    """SPEI is standardised against the training distribution."""
    x = pair["spei_lag1m_short"].to_numpy(dtype=float)
    y = pair["spei_lag1m_full"].to_numpy(dtype=float)
    assert np.array_equal(x, y, equal_nan=True), (
        "spei_lag1m changed when the record was extended, so the SPEI reference "
        "distribution is being refitted on the served window"
    )


@pytest.mark.parametrize(
    ("column", "horizon"),
    [("y_flood", config.FLOOD_HORIZON_DAYS), ("y_drought", config.DROUGHT_HORIZON_DAYS)],
)
def test_only_the_forward_looking_tail_gains_labels(pair, column, horizon):
    """Labels may become defined at the tail - and may do nothing else."""
    x = pair[f"{column}_short"].to_numpy(dtype=float)
    y = pair[f"{column}_full"].to_numpy(dtype=float)

    differing = np.flatnonzero(~((x == y) | (np.isnan(x) & np.isnan(y))))
    if differing.size == 0:
        return

    both_defined = ~np.isnan(x[differing]) & ~np.isnan(y[differing])
    assert not both_defined.any(), (
        f"{column}: {int(both_defined.sum())} rows had a label that CHANGED value. "
        "Extending the record must only fill in labels, never revise them."
    )

    # Every change must sit within one horizon of the truncated record's end.
    distance_from_end = len(x) - 1 - differing
    assert distance_from_end.max() < horizon, (
        f"{column}: a label changed {int(distance_from_end.max())} days from the "
        f"end of the record, beyond its {horizon}-day horizon"
    )


def test_training_still_requests_the_frozen_window():
    """Serving moved to 'today'; training must not have followed it."""
    import inspect

    from climate_ml.data import openmeteo

    source = inspect.getsource(openmeteo._request)
    assert "end_date or config.END_DATE" in source, (
        "the default acquisition window is no longer config.END_DATE; training "
        "runs would stop being reproducible against the committed results"
    )
