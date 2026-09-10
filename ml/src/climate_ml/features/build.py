"""Feature engineering for the flood and drought models.

Every feature is computed from a window ENDING at the prediction origin ``t``.
No feature may see day ``t+1`` or later, because the labels live there. Pandas
rolling windows are right-aligned and inclusive of the current row, which is
exactly the required semantics, so the rule is enforced simply by never using
``shift(-n)`` or ``center=True`` anywhere in this module.

Feature groups, and why each earns its place:

Accumulation
    Rolling rainfall totals over 1 to 180 days. Short windows drive flooding;
    long windows drive drought. This is the single most important group.
Anomaly
    Departures from the location's own day-of-year climatology. This is what
    makes a model transferable: 20 mm is a wet day in Phoenix and a dry one in
    Singapore, but "three standard deviations above normal for this date" means
    the same thing everywhere.
Water balance
    P - ET0 accumulated over 30/90/180 days - the physical quantity SPEI
    standardises, supplied to the model in raw form.
Antecedent state
    Soil moisture, its recent change, and a decay-weighted antecedent
    precipitation index. Catchment wetness governs how much rainfall becomes
    runoff.
Spell structure
    Consecutive dry and wet days (ETCCDI CDD/CWD). Duration carries information
    that totals do not: 60 mm in one day and 60 mm over a month are different
    events.
Context
    Cyclically encoded day-of-year, latitude, elevation. Seasonality is cyclic,
    so 31 December must sit next to 1 January rather than 364 days away.

LEAKAGE CONTROL
---------------
Climatological means and standard deviations used for anomalies are fitted on
the training period only, then applied unchanged everywhere. Fitting them on the
full record would let each row's own future contribute to its normalisation.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

PRECIP_WINDOWS = (3, 7, 30, 90, 180)
BALANCE_WINDOWS = (30, 90, 180)
SOIL_CHANGE_WINDOWS = (7, 30)

WET_DAY_MM = 1.0
CLIMATOLOGY_WINDOW_DAYS = 15

# Decay applied per day to older rainfall in the antecedent index. 0.9 gives
# rain a ~7-day effective memory, the usual choice in flood hydrology.
API_DECAY = 0.9
API_WINDOW_DAYS = 30

ANOMALY_SOURCES = {
    "precip_30d": "precipitation_sum",
    "temp": "temperature_2m_mean",
    "soil": "soil_moisture_0_to_7cm_mean",
}


@dataclass
class Climatology:
    """Day-of-year mean and standard deviation, fitted on the training period."""

    means: dict[str, np.ndarray] = field(default_factory=dict)
    stds: dict[str, np.ndarray] = field(default_factory=dict)

    def normalise(self, name: str, values: np.ndarray, doy: np.ndarray) -> np.ndarray:
        mean = self.means[name][doy - 1]
        std = self.stds[name][doy - 1]
        # A zero standard deviation means the quantity never varies on that date
        # in the training record; the anomaly is then undefined, not infinite.
        with np.errstate(divide="ignore", invalid="ignore"):
            return np.where(std > 1e-9, (values - mean) / std, np.nan)


def fit_climatology(
    frame: pd.DataFrame,
    fit_mask: np.ndarray,
    window_days: int = CLIMATOLOGY_WINDOW_DAYS,
) -> Climatology:
    """Estimate day-of-year mean and standard deviation for each anomaly source.

    Neighbouring days are pooled so each estimate rests on roughly
    ``(2 * window_days + 1) * years`` samples instead of one per year.
    """
    doy = np.asarray(frame["date"].dt.dayofyear)
    climatology = Climatology()

    for name, column in ANOMALY_SOURCES.items():
        series = frame[column].to_numpy(dtype=float)
        if name == "precip_30d":
            series = pd.Series(series).rolling(30, min_periods=15).sum().to_numpy()

        usable = fit_mask & np.isfinite(series)
        means = np.full(366, np.nan)
        stds = np.full(366, np.nan)
        if usable.any():
            fit_values, fit_doy = series[usable], doy[usable]
            for day in range(1, 367):
                delta = np.abs(fit_doy - day)
                delta = np.minimum(delta, 366 - delta)
                selected = fit_values[delta <= window_days]
                if selected.size >= 10:
                    means[day - 1] = float(np.mean(selected))
                    stds[day - 1] = float(np.std(selected))
        climatology.means[name] = means
        climatology.stds[name] = stds

    return climatology


def _consecutive_run(condition: np.ndarray) -> np.ndarray:
    """Length of the run of True values ending at each position."""
    out = np.zeros(condition.size, dtype=float)
    run = 0
    for i, flag in enumerate(condition):
        run = run + 1 if flag else 0
        out[i] = run
    return out


def _antecedent_precipitation_index(precipitation: np.ndarray) -> np.ndarray:
    """Decay-weighted rainfall total, heavier on recent days.

    Implemented as an exponentially weighted sum, which is mathematically the
    same as the classic API but computed in one pass.
    """
    weights = API_DECAY ** np.arange(API_WINDOW_DAYS)
    padded = np.nan_to_num(precipitation, nan=0.0)
    result = np.full(precipitation.size, np.nan)
    for i in range(precipitation.size):
        start = max(0, i - API_WINDOW_DAYS + 1)
        window = padded[start : i + 1][::-1]
        result[i] = float(np.dot(window, weights[: window.size]))
    return result


def build_features(frame: pd.DataFrame, climatology: Climatology) -> pd.DataFrame:
    """Build the feature table for one location.

    Args:
        frame: Daily records for a single location, sorted by date.
        climatology: Fitted on the training period by :func:`fit_climatology`.

    Returns:
        A frame indexed like ``frame`` with the engineered feature columns.
    """
    out = pd.DataFrame({"location_id": frame["location_id"], "date": frame["date"]})

    precipitation = frame["precipitation_sum"].to_numpy(dtype=float)
    et0 = frame["et0_fao_evapotranspiration"].to_numpy(dtype=float)
    soil = frame["soil_moisture_0_to_7cm_mean"].to_numpy(dtype=float)
    temperature = frame["temperature_2m_mean"].to_numpy(dtype=float)
    doy = np.asarray(frame["date"].dt.dayofyear)

    precip_series = pd.Series(precipitation)
    balance_series = pd.Series(precipitation - et0)

    # --- Accumulation ------------------------------------------------------
    out["precip_1d"] = precipitation
    for window in PRECIP_WINDOWS:
        out[f"precip_{window}d"] = precip_series.rolling(
            window, min_periods=max(1, window // 2)
        ).sum().to_numpy()
    out["precip_max_1d_in_7d"] = precip_series.rolling(7, min_periods=3).max().to_numpy()
    out["precip_max_1d_in_30d"] = precip_series.rolling(30, min_periods=10).max().to_numpy()

    # --- Water balance -----------------------------------------------------
    for window in BALANCE_WINDOWS:
        out[f"water_balance_{window}d"] = balance_series.rolling(
            window, min_periods=max(1, window // 2)
        ).sum().to_numpy()
    out["et0_30d"] = pd.Series(et0).rolling(30, min_periods=10).sum().to_numpy()

    # --- Antecedent state --------------------------------------------------
    out["soil"] = soil
    soil_series = pd.Series(soil)
    for window in SOIL_CHANGE_WINDOWS:
        out[f"soil_change_{window}d"] = (soil_series - soil_series.shift(window)).to_numpy()
    out["soil_mean_30d"] = soil_series.rolling(30, min_periods=10).mean().to_numpy()
    out["antecedent_precip_index"] = _antecedent_precipitation_index(precipitation)

    # --- Spell structure ---------------------------------------------------
    out["consecutive_dry_days"] = _consecutive_run(precipitation < WET_DAY_MM)
    out["consecutive_wet_days"] = _consecutive_run(precipitation >= WET_DAY_MM)
    out["wet_days_in_30d"] = (
        pd.Series((precipitation >= WET_DAY_MM).astype(float))
        .rolling(30, min_periods=10).sum().to_numpy()
    )

    # --- Anomalies ---------------------------------------------------------
    out["precip_30d_anomaly"] = climatology.normalise(
        "precip_30d", out["precip_30d"].to_numpy(), doy
    )
    out["temp_anomaly"] = climatology.normalise("temp", temperature, doy)
    out["soil_anomaly"] = climatology.normalise("soil", soil, doy)

    # --- Context -----------------------------------------------------------
    angle = 2 * np.pi * doy / 366.0
    out["doy_sin"] = np.sin(angle)
    out["doy_cos"] = np.cos(angle)
    out["latitude"] = frame["latitude"].to_numpy(dtype=float)
    out["elevation_m"] = frame["elevation_m"].to_numpy(dtype=float)
    out["temperature"] = temperature

    return out


def feature_columns(frame: pd.DataFrame) -> list[str]:
    """Model input columns - everything except identifiers."""
    return [c for c in frame.columns if c not in {"location_id", "date"}]
