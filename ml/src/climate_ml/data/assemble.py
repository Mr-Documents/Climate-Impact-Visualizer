"""Assemble the modelling table: features, labels and splits.

For each location the pipeline runs in a fixed order, and the order matters:

1.  Decide the temporal split FIRST, so every statistic that follows knows which
    rows it is allowed to see.
2.  Fit climatologies, SPEI distributions and the R95p threshold on the training
    rows ONLY.
3.  Build features from strictly backward-looking windows.
4.  Build labels from strictly forward-looking windows.

DROUGHT PERSISTENCE - READ THIS BEFORE INTERPRETING ANY DROUGHT METRIC
----------------------------------------------------------------------
SPEI-3 for month M accumulates the water balance over months M-2, M-1 and M. If
we predict the SPEI of the month roughly 30 days after day ``t``, part of that
window has already been observed by day ``t``. This is NOT a leak - the target
month's own balance is still unknown - but it does mean a large share of the
target is determined by antecedent conditions.

That persistence is precisely why drought is forecastable at all, and it is also
why a naive "current SPEI continues" baseline is strong. Any claim that the
model has learned something must therefore be made against that baseline, not
against a random-guess floor. ``spei_persistence_baseline`` is emitted here for
exactly that comparison.
"""

from __future__ import annotations

import logging

import numpy as np
import pandas as pd

from climate_ml import config
from climate_ml.features.build import build_features, feature_columns, fit_climatology
from climate_ml.labels.drought import compute_spei, label_drought, water_balance_monthly
from climate_ml.labels.flood import fit_thresholds, label_flood

logger = logging.getLogger(__name__)

SPLIT_TRAIN = "train"
SPLIT_VALIDATION = "validation"
SPLIT_TEST = "test"


def assign_split(years: np.ndarray) -> np.ndarray:
    """Chronological split. Later years are never used to fit anything earlier."""
    split = np.full(years.shape, SPLIT_TEST, dtype=object)
    split[years <= config.TRAIN_END_YEAR] = SPLIT_TRAIN
    split[(years > config.TRAIN_END_YEAR) & (years <= config.VALIDATION_END_YEAR)] = (
        SPLIT_VALIDATION
    )
    return split


def _drought_targets(frame: pd.DataFrame, train_mask: np.ndarray) -> pd.DataFrame:
    """Daily drought label plus the persistence baseline it must be judged against.

    SPEI is a monthly index, so it is computed monthly and then joined back onto
    daily rows: the label at day ``t`` is the SPEI of the month containing
    ``t + DROUGHT_HORIZON_DAYS``.
    """
    monthly = water_balance_monthly(frame)
    if monthly.empty:
        return pd.DataFrame(index=frame.index)

    month_periods = monthly["year_month"]
    monthly_train = month_periods.dt.year.to_numpy() <= config.TRAIN_END_YEAR
    spei = compute_spei(monthly, config.SPEI_SCALE_MONTHS, fit_mask=monthly_train)

    lookup = pd.Series(spei["spei"].to_numpy(), index=month_periods)

    dates = frame["date"]
    current_month = dates.dt.to_period("M")
    target_month = (dates + pd.Timedelta(days=config.DROUGHT_HORIZON_DAYS)).dt.to_period("M")

    spei_now = current_month.map(lookup).astype(float)
    spei_future = target_month.map(lookup).astype(float)

    out = pd.DataFrame(index=frame.index)
    out["spei_now"] = spei_now.to_numpy()
    out["y_drought"] = label_drought(spei_future, config.DROUGHT_THRESHOLD).to_numpy()
    # Baseline: assume today's drought state simply persists.
    out["spei_persistence_baseline"] = label_drought(
        spei_now, config.DROUGHT_THRESHOLD
    ).to_numpy()
    # Guard against the join silently succeeding past the end of the record.
    beyond_record = target_month > month_periods.max()
    out.loc[beyond_record.to_numpy(), "y_drought"] = np.nan
    return out


def assemble_location(frame: pd.DataFrame) -> pd.DataFrame:
    """Build features, labels and splits for one location's daily record."""
    frame = frame.sort_values("date").reset_index(drop=True)
    years = np.asarray(frame["date"].dt.year)
    split = assign_split(years)
    train_mask = split == SPLIT_TRAIN

    if not train_mask.any():
        raise ValueError(f"{frame['location_id'].iloc[0]}: no training rows")

    climatology = fit_climatology(frame, train_mask)
    features = build_features(frame, climatology)

    flood_thresholds = fit_thresholds(frame, train_mask, config.FLOOD_PERCENTILE)
    features["y_flood"] = label_flood(frame, flood_thresholds, config.FLOOD_HORIZON_DAYS)
    features["r95p_mm"] = flood_thresholds.r95p_mm

    drought = _drought_targets(frame, train_mask)
    for column in drought.columns:
        features[column] = drought[column].to_numpy()

    features["split"] = split
    features["year"] = years
    return features


def assemble(raw: pd.DataFrame) -> pd.DataFrame:
    """Assemble every location into one modelling table.

    Locations are processed independently - climatologies, thresholds and index
    distributions are all per-location - then concatenated.
    """
    tables = []
    for location_id, group in raw.groupby("location_id", sort=True):
        try:
            tables.append(assemble_location(group))
        except (ValueError, KeyError) as exc:
            logger.warning("skipping %s: %s", location_id, exc)

    if not tables:
        raise RuntimeError("No location could be assembled.")

    table = pd.concat(tables, ignore_index=True)
    logger.info(
        "Assembled %d rows across %d locations (%d features)",
        len(table), table["location_id"].nunique(), len(model_features(table)),
    )
    return table


def model_features(table: pd.DataFrame) -> list[str]:
    """Feature columns only - never labels, identifiers, splits or diagnostics."""
    excluded = {
        "location_id", "date", "split", "year",
        "y_flood", "y_drought", "r95p_mm",
        "spei_now", "spei_persistence_baseline",
    }
    return [c for c in feature_columns(table) if c not in excluded]


def training_frame(table: pd.DataFrame, target: str) -> pd.DataFrame:
    """Rows usable for one target: label present and all features finite.

    Dropping incomplete rows rather than imputing keeps the training set honest.
    The first ~180 days of each location have undefined long-window features and
    are removed here rather than filled with a fabricated value.
    """
    columns = model_features(table)
    usable = table[table[target].notna()].copy()
    complete = usable[columns].notna().all(axis=1)
    dropped = len(usable) - int(complete.sum())
    if dropped:
        logger.info("%s: dropped %d rows with incomplete features", target, dropped)
    return usable[complete]
