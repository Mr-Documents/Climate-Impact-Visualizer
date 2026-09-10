"""Koppen-Geiger climate classification from a monthly climatology.

Used to *measure* the climate coverage the stratified sample actually achieved,
rather than to assert it. Because Koppen classes are defined directly from
monthly temperature and precipitation, they can be derived from the same
downloaded record the models train on - no external climate-zone dataset, and
no possibility of the classification disagreeing with the training data.

Criteria follow Peel, Finlayson & McMahon (2007), "Updated world map of the
Koppen-Geiger climate classification", Hydrology and Earth System Sciences 11,
1633-1644, which is the standard modern formulation.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

# Months forming the warm half-year, by hemisphere.
_NORTHERN_SUMMER = {4, 5, 6, 7, 8, 9}
_SOUTHERN_SUMMER = {10, 11, 12, 1, 2, 3}

CLASS_DESCRIPTIONS: dict[str, str] = {
    "Af": "Tropical rainforest", "Am": "Tropical monsoon", "Aw": "Tropical savanna",
    "BWh": "Hot desert", "BWk": "Cold desert", "BSh": "Hot steppe", "BSk": "Cold steppe",
    "Csa": "Mediterranean, hot summer", "Csb": "Mediterranean, warm summer",
    "Csc": "Mediterranean, cold summer",
    "Cwa": "Humid subtropical, dry winter", "Cwb": "Subtropical highland",
    "Cwc": "Subpolar oceanic, dry winter",
    "Cfa": "Humid subtropical", "Cfb": "Oceanic", "Cfc": "Subpolar oceanic",
    "Dsa": "Continental, dry hot summer", "Dsb": "Continental, dry warm summer",
    "Dsc": "Continental, dry cold summer", "Dsd": "Continental, dry summer, very cold winter",
    "Dwa": "Continental, dry winter, hot summer", "Dwb": "Continental, dry winter, warm summer",
    "Dwc": "Subarctic, dry winter", "Dwd": "Subarctic, dry winter, very cold",
    "Dfa": "Continental, hot summer", "Dfb": "Continental, warm summer",
    "Dfc": "Subarctic", "Dfd": "Subarctic, very cold winter",
    "ET": "Tundra", "EF": "Ice cap",
}


def monthly_climatology(frame: pd.DataFrame) -> pd.DataFrame:
    """Mean monthly temperature (C) and total monthly precipitation (mm).

    Precipitation is averaged over *years* rather than over days, so the result
    is a monthly total in the usual climatological sense.
    """
    work = frame.loc[:, ["date", "temperature_2m_mean", "precipitation_sum"]].copy()
    work["year"] = work["date"].dt.year
    work["month"] = work["date"].dt.month

    monthly_totals = (
        work.groupby(["year", "month"], as_index=False)
        .agg(temp=("temperature_2m_mean", "mean"), precip=("precipitation_sum", "sum"))
    )
    return (
        monthly_totals.groupby("month", as_index=False)
        .agg(temp=("temp", "mean"), precip=("precip", "mean"))
        .sort_values("month")
        .reset_index(drop=True)
    )


def classify(climatology: pd.DataFrame, latitude: float) -> str:
    """Return the Koppen-Geiger class for one location.

    Args:
        climatology: 12 rows with columns ``month``, ``temp`` (C), ``precip`` (mm).
        latitude: Used only to decide which half-year is summer.
    """
    if len(climatology) != 12:
        raise ValueError(f"Expected 12 monthly rows, got {len(climatology)}")

    temp = climatology["temp"].to_numpy(dtype=float)
    precip = climatology["precip"].to_numpy(dtype=float)
    months = climatology["month"].to_numpy(dtype=int)

    t_hot, t_cold, t_annual = temp.max(), temp.min(), temp.mean()
    months_above_10 = int((temp >= 10).sum())
    map_mm = precip.sum()
    p_dry = precip.min()

    summer_months = _NORTHERN_SUMMER if latitude >= 0 else _SOUTHERN_SUMMER
    is_summer = np.isin(months, list(summer_months))
    p_summer, p_winter = precip[is_summer], precip[~is_summer]

    # --- Aridity threshold -------------------------------------------------
    summer_share = p_summer.sum() / map_mm if map_mm > 0 else 0.0
    if summer_share >= 0.70:
        p_threshold = 2 * t_annual + 28
    elif summer_share <= 0.30:
        p_threshold = 2 * t_annual
    else:
        p_threshold = 2 * t_annual + 14

    # --- B: arid (tested first, it overrides temperature groups) -----------
    if map_mm < 10 * p_threshold:
        arid = "BW" if map_mm < 5 * p_threshold else "BS"
        return arid + ("h" if t_annual >= 18 else "k")

    # --- E: polar ----------------------------------------------------------
    if t_hot < 10:
        return "ET" if t_hot > 0 else "EF"

    # --- A: tropical -------------------------------------------------------
    if t_cold >= 18:
        if p_dry >= 60:
            return "Af"
        return "Am" if p_dry >= 100 - map_mm / 25 else "Aw"

    # --- C and D: seasonality letter ---------------------------------------
    p_s_dry, p_w_dry = p_summer.min(), p_winter.min()
    p_s_wet, p_w_wet = p_summer.max(), p_winter.max()

    if p_s_dry < 40 and p_s_dry < p_w_wet / 3:
        seasonality = "s"
    elif p_w_dry < p_s_wet / 10:
        seasonality = "w"
    else:
        seasonality = "f"

    # --- Temperature letter -------------------------------------------------
    if t_hot >= 22:
        heat = "a"
    elif months_above_10 >= 4:
        heat = "b"
    elif t_cold < -38:
        heat = "d"
    else:
        heat = "c"

    group = "C" if t_cold > 0 else "D"
    if group == "C" and heat == "d":  # 'd' exists only in the D group
        heat = "c"
    return group + seasonality + heat


def classify_frame(frame: pd.DataFrame) -> pd.DataFrame:
    """Classify every location in a long-format daily frame."""
    rows = []
    for location_id, group in frame.groupby("location_id", sort=True):
        latitude = float(group["latitude"].iloc[0])
        climate = classify(monthly_climatology(group), latitude)
        rows.append(
            {
                "location_id": location_id,
                "latitude": latitude,
                "longitude": float(group["longitude"].iloc[0]),
                "elevation_m": float(group["elevation_m"].iloc[0]),
                "koppen": climate,
                "koppen_group": climate[0],
                "description": CLASS_DESCRIPTIONS.get(climate, "Unclassified"),
            }
        )
    return pd.DataFrame(rows)
