"""Flood-risk targets from extreme rainfall on already-wet ground.

WHAT THIS LABEL IS, AND IS NOT
------------------------------
This is NOT an observation that a flood occurred. Without river discharge,
terrain, drainage area and land cover, no point-based dataset can support that
claim. What it marks is *flood-generating hydrometeorological conditions*:
rainfall extreme by local standards, falling on ground already wetter than
normal for the time of year. The distinction is stated here, in the model card,
and in the write-up, because overstating it would be indefensible.

The rainfall threshold is R95p as defined by the WMO Expert Team on Climate
Change Detection and Indices (ETCCDI): the 95th percentile of wet-day (>= 1 mm)
rainfall over a base period. Being a per-location percentile, it transfers
across climates without hand-tuning - 30 mm is unremarkable in Manila and
exceptional in Phoenix, and the threshold adapts automatically.

The soil condition matters because saturated ground cannot absorb more water,
so identical rainfall produces very different runoff depending on antecedent
wetness. Rainfall alone is a poor flood predictor for exactly this reason.

AVOIDING CIRCULARITY
--------------------
An earlier draft of this design conditioned the label on soil moisture *at the
prediction origin* - which is also a model feature, so the model could compute
part of its own target. Both conditions are therefore evaluated inside the
future window instead: the soil term is read on the day before each candidate
rainfall day. The label is then a property of the future alone and cannot be
derived from any feature.

LEAKAGE CONTROL
---------------
The R95p threshold and the day-of-year soil climatology are estimated on the
training period only and applied unchanged to validation and test.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

# ETCCDI defines a "wet day" as >= 1 mm; drier days are excluded from the
# percentile so the threshold describes rainfall intensity, not how often it rains.
WET_DAY_MM = 1.0

# Half-width of the window used to pool days when estimating the day-of-year soil
# climatology. +/- 15 days pools ~31 days per year of record, enough for a stable
# median without smearing the seasonal cycle.
CLIMATOLOGY_WINDOW_DAYS = 15

MIN_WET_DAYS_FOR_THRESHOLD = 30


@dataclass(frozen=True)
class FloodThresholds:
    """Per-location quantities estimated on the training period."""

    location_id: str
    r95p_mm: float
    wet_days_used: int
    soil_median_by_doy: np.ndarray  # length 366, indexed by day-of-year - 1


def wet_day_percentile(
    precipitation: np.ndarray,
    fit_mask: np.ndarray,
    percentile: float = 95.0,
) -> tuple[float, int]:
    """ETCCDI wet-day percentile over the fitting period.

    Returns:
        The threshold in millimetres and the number of wet days it was based on.
        Returns ``(nan, n)`` when there are too few wet days to be meaningful -
        genuinely arid locations where an extreme-rainfall label is not
        supportable, and which are excluded rather than given a fabricated one.
    """
    usable = fit_mask & np.isfinite(precipitation)
    wet = precipitation[usable & (precipitation >= WET_DAY_MM)]
    if wet.size < MIN_WET_DAYS_FOR_THRESHOLD:
        return float("nan"), int(wet.size)
    return float(np.percentile(wet, percentile)), int(wet.size)


def soil_climatology_by_doy(
    soil: np.ndarray,
    day_of_year: np.ndarray,
    fit_mask: np.ndarray,
    window_days: int = CLIMATOLOGY_WINDOW_DAYS,
) -> np.ndarray:
    """Median soil moisture for each day of year, pooled over a moving window.

    Pooling neighbouring days is what makes the estimate stable: a single
    calendar day has only as many samples as there are years in the record.
    """
    medians = np.full(366, np.nan)
    usable = fit_mask & np.isfinite(soil)
    if not usable.any():
        return medians

    fit_soil = soil[usable]
    fit_doy = day_of_year[usable]

    for doy in range(1, 367):
        # Circular distance so the window wraps across the year boundary.
        delta = np.abs(fit_doy - doy)
        delta = np.minimum(delta, 366 - delta)
        selected = fit_soil[delta <= window_days]
        if selected.size:
            medians[doy - 1] = float(np.median(selected))
    return medians


def fit_thresholds(
    frame: pd.DataFrame,
    fit_mask: np.ndarray,
    percentile: float = 95.0,
) -> FloodThresholds:
    """Estimate R95p and the soil climatology for one location."""
    precipitation = frame["precipitation_sum"].to_numpy(dtype=float)
    soil = frame["soil_moisture_0_to_7cm_mean"].to_numpy(dtype=float)
    doy = frame["date"].dt.dayofyear.to_numpy()

    r95p, wet_days = wet_day_percentile(precipitation, fit_mask, percentile)
    if not np.isfinite(r95p):
        logger.warning(
            "%s: only %d wet days in the fitting period - flood label undefined",
            frame["location_id"].iloc[0], wet_days,
        )

    return FloodThresholds(
        location_id=str(frame["location_id"].iloc[0]),
        r95p_mm=r95p,
        wet_days_used=wet_days,
        soil_median_by_doy=soil_climatology_by_doy(soil, doy, fit_mask),
    )


def flood_generating_days(frame: pd.DataFrame, thresholds: FloodThresholds) -> np.ndarray:
    """Mark each day as flood-generating: extreme rain on wetter-than-normal ground.

    The soil term is read on the *previous* day, so it describes the state the
    rain fell onto rather than the state the rain itself produced - rainfall
    raises soil moisture, so using the same day would make the condition
    partly self-fulfilling.
    """
    precipitation = frame["precipitation_sum"].to_numpy(dtype=float)
    soil = frame["soil_moisture_0_to_7cm_mean"].to_numpy(dtype=float)
    doy = frame["date"].dt.dayofyear.to_numpy()

    if not np.isfinite(thresholds.r95p_mm):
        return np.full(len(frame), np.nan)

    extreme_rain = precipitation >= thresholds.r95p_mm

    soil_previous = np.roll(soil, 1)
    soil_previous[0] = np.nan
    normal_previous = thresholds.soil_median_by_doy[np.roll(doy, 1) - 1]
    normal_previous[0] = np.nan
    wetter_than_normal = soil_previous > normal_previous

    generating = (extreme_rain & wetter_than_normal).astype(float)
    generating[~np.isfinite(precipitation) | ~np.isfinite(soil_previous)] = np.nan
    return generating


def label_flood(
    frame: pd.DataFrame,
    thresholds: FloodThresholds,
    horizon_days: int,
) -> np.ndarray:
    """1 if any flood-generating day falls in the next ``horizon_days``.

    The window is strictly forward - days ``t+1`` through ``t+horizon`` - so the
    label describes only the future and shares no information with any feature
    computed at or before ``t``. The final ``horizon_days`` rows have no
    complete window and are returned as NaN rather than assumed negative.
    """
    generating = flood_generating_days(frame, thresholds)
    n = len(generating)
    labels = np.full(n, np.nan)

    for i in range(n - horizon_days):
        window = generating[i + 1 : i + 1 + horizon_days]
        if np.isnan(window).all():
            continue
        labels[i] = float(np.nanmax(window))
    return labels
