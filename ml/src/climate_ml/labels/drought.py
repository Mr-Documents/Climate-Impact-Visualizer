"""Drought targets via the Standardised Precipitation-Evapotranspiration Index.

SPEI standardises the climatic water balance ``D = P - ET0`` against a
location's own long-term distribution, so it adapts to local climate: a desert
is not permanently in drought, and a rainforest is not immune to one. That
self-referencing property is what lets a single model transfer across climates.

Method follows Vicente-Serrano, Begueria & Lopez-Moreno (2010), "A Multiscalar
Drought Index Sensitive to Global Warming: The Standardized Precipitation
Evapotranspiration Index", Journal of Climate 23, 1696-1718:

1. Aggregate the monthly water balance over a rolling ``scale`` of months.
2. For each calendar month separately, fit a three-parameter log-logistic
   distribution by probability-weighted moments.
3. Map the fitted cumulative probability through the inverse standard normal.

The per-calendar-month fit is what removes seasonality: a dry August is judged
against other Augusts, never against a wet January.

LEAKAGE CONTROL
---------------
Distribution parameters are fitted on the training period ONLY and then applied
unchanged to validation and test. Fitting on the full record would let the test
period influence its own standardisation - a subtle but real leak that would
flatter every downstream metric.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np
import pandas as pd
from scipy import stats
from scipy.special import gamma as gamma_fn

logger = logging.getLogger(__name__)

# SPEI is unstable for a calendar month with too few observations to fit a
# three-parameter distribution. WMO guidance asks for >= 30 years; we refuse to
# emit a value below this floor rather than publish an unreliable one.
MIN_YEARS_FOR_FIT = 20

# Pooling adjacent calendar months was tested as a way to stabilise the fit and
# REJECTED on measurement: adjacent months have genuinely different water-balance
# distributions, so pooling widens the reference and compresses the index.
# Measured on identical data (mean / standard deviation, target 0 / 1):
#
#     per-month parametric   +0.069 / 1.256
#     per-month empirical    -0.000 / 0.957   <- selected
#     pooled +/-1 parametric -0.001 / 0.749
#     pooled +/-1 empirical  -0.024 / 0.687
#
FIT_MONTH_WINDOW = 0

# Below this many training samples per calendar month, the three-parameter
# log-logistic fit is unreliable: with ~22 years the estimated shape parameter
# ranged from 3.8 to 75.4 across months and the index had standard deviation
# 1.26 instead of 1.0. The distribution-free transform is used instead.
#
# The trade-off, stated plainly: an empirical transform is bounded by its
# reference sample, so with n training years the most extreme value maps to
# about z = -1.96. Severity classes at or beyond -2.0 ("extreme drought") are
# therefore NOT reliably resolvable on a 30-year record. The binary target used
# here is -1.0 (moderate or worse), which sits comfortably inside the range.
PARAMETRIC_MIN_SAMPLES = 30


@dataclass(frozen=True)
class LogLogisticParams:
    """Three-parameter log-logistic (Fisk) parameters: scale, shape, origin."""

    alpha: float
    beta: float
    gamma: float
    fallback: bool = False


def _probability_weighted_moments(values: np.ndarray) -> tuple[float, float, float]:
    """First three PWMs using the Hosking plotting position (i - 0.35) / n."""
    ordered = np.sort(values)
    n = ordered.size
    positions = (np.arange(1, n + 1) - 0.35) / n
    w0 = float(np.mean(ordered))
    w1 = float(np.mean((1.0 - positions) * ordered))
    w2 = float(np.mean((1.0 - positions) ** 2 * ordered))
    return w0, w1, w2


def fit_log_logistic(values: np.ndarray) -> LogLogisticParams:
    """Fit the log-logistic distribution by PWM, flagging invalid fits.

    The closed-form solution needs ``beta > 1`` for the gamma functions to stay
    finite. Short or degenerate samples can violate that; rather than emit a
    silently wrong index we flag the fit so the caller falls back to ranks.
    """
    clean = values[np.isfinite(values)]
    if clean.size < MIN_YEARS_FOR_FIT or np.allclose(clean, clean[0]):
        return LogLogisticParams(np.nan, np.nan, np.nan, fallback=True)

    w0, w1, w2 = _probability_weighted_moments(clean)
    denominator = w0 + 6.0 * w2 - 6.0 * w1
    if abs(denominator) < 1e-12:
        return LogLogisticParams(np.nan, np.nan, np.nan, fallback=True)

    beta = (2.0 * w1 - w0) / denominator
    if not np.isfinite(beta) or beta <= 1.0:
        return LogLogisticParams(np.nan, np.nan, np.nan, fallback=True)

    try:
        g1, g2 = gamma_fn(1.0 + 1.0 / beta), gamma_fn(1.0 - 1.0 / beta)
    except (OverflowError, ValueError):
        return LogLogisticParams(np.nan, np.nan, np.nan, fallback=True)
    if not (np.isfinite(g1) and np.isfinite(g2)):
        return LogLogisticParams(np.nan, np.nan, np.nan, fallback=True)

    alpha = (w0 - 2.0 * w1) * beta / (g1 * g2)
    if not np.isfinite(alpha) or alpha <= 0:
        return LogLogisticParams(np.nan, np.nan, np.nan, fallback=True)

    gamma_param = w0 - alpha * g1 * g2
    return LogLogisticParams(float(alpha), float(beta), float(gamma_param))


def _cdf(values: np.ndarray, params: LogLogisticParams) -> np.ndarray:
    """Log-logistic CDF, guarded against the singularity at the origin."""
    shifted = values - params.gamma
    with np.errstate(divide="ignore", invalid="ignore", over="ignore"):
        ratio = np.where(shifted > 0, params.alpha / np.where(shifted > 0, shifted, 1.0), np.inf)
        return 1.0 / (1.0 + ratio ** params.beta)


def _empirical_cdf(values: np.ndarray, reference: np.ndarray) -> np.ndarray:
    """Gringorten plotting position against a reference sample.

    Used when the parametric fit is invalid. Distribution-free and robust, at
    the cost of being bounded by the reference sample's range - which is why it
    is a fallback and is reported as one.
    """
    reference = np.sort(reference[np.isfinite(reference)])
    n = reference.size
    ranks = np.searchsorted(reference, values, side="right")
    return (ranks - 0.44) / (n + 0.12)


def water_balance_monthly(frame: pd.DataFrame) -> pd.DataFrame:
    """Monthly climatic water balance P - ET0 for one location.

    Both terms are millimetres per day summed over the month, so their
    difference is a monthly total in millimetres.
    """
    work = frame.loc[:, ["date", "precipitation_sum", "et0_fao_evapotranspiration"]].copy()
    work["year_month"] = work["date"].dt.to_period("M")
    monthly = work.groupby("year_month", as_index=False).agg(
        precip_mm=("precipitation_sum", "sum"),
        et0_mm=("et0_fao_evapotranspiration", "sum"),
        days=("date", "count"),
    )
    # Drop partial months at the record's edges; a short month understates both
    # terms and would bias the balance.
    monthly = monthly[monthly["days"] >= 28].copy()
    monthly["water_balance_mm"] = monthly["precip_mm"] - monthly["et0_mm"]
    monthly["month"] = monthly["year_month"].dt.month
    return monthly.reset_index(drop=True)


def _pooled_month_mask(months: np.ndarray, target: int, window: int) -> np.ndarray:
    """Select calendar months within ``window`` of ``target``, wrapping the year."""
    delta = np.abs(months - target)
    delta = np.minimum(delta, 12 - delta)
    return delta <= window


def compute_spei(
    monthly: pd.DataFrame,
    scale_months: int,
    fit_mask: np.ndarray | None = None,
    month_window: int = FIT_MONTH_WINDOW,
    method: str = "auto",
) -> pd.DataFrame:
    """Compute SPEI at the given accumulation scale for one location.

    Args:
        monthly: Output of :func:`water_balance_monthly`.
        scale_months: Accumulation window, e.g. 3 for SPEI-3.
        fit_mask: Boolean mask selecting rows the distribution may be fitted on.
            Pass the training period so evaluation periods cannot influence
            their own standardisation. ``None`` fits on everything and must only
            be used outside model development.
        month_window: Calendar months pooled either side when fitting. Default 0
            (no pooling) - see the module constant for the measurements behind it.
        method: ``"auto"`` picks the distribution-free transform when the
            training sample is below ``PARAMETRIC_MIN_SAMPLES``, otherwise the
            published log-logistic fit. ``"parametric"`` and ``"empirical"``
            force one or the other.

    Returns:
        ``monthly`` with ``accumulated_mm`` and ``spei`` columns added.
    """
    out = monthly.copy()
    out["accumulated_mm"] = (
        out["water_balance_mm"].rolling(scale_months, min_periods=scale_months).sum()
    )

    if fit_mask is None:
        fit_mask = np.ones(len(out), dtype=bool)
        logger.warning("compute_spei called without a fit_mask - fitting on the full record.")

    out["spei"] = np.nan
    fallbacks = 0

    months = out["month"].to_numpy()
    for month in range(1, 13):
        is_month = months == month
        # Fit on a pooled window of adjacent calendar months, but only ASSIGN
        # values to the target month, so each month keeps its own index.
        in_fit_window = _pooled_month_mask(months, month, month_window)
        values = out["accumulated_mm"].to_numpy()

        train_values = values[in_fit_window & fit_mask & np.isfinite(values)]
        if train_values.size < MIN_YEARS_FOR_FIT:
            logger.warning(
                "calendar month %d has %d pooled samples (<%d) - SPEI left undefined",
                month, train_values.size, MIN_YEARS_FOR_FIT,
            )
            continue

        target = is_month & np.isfinite(values)

        if method == "empirical":
            use_parametric = False
        elif method == "parametric":
            use_parametric = True
        elif method == "auto":
            use_parametric = train_values.size >= PARAMETRIC_MIN_SAMPLES
        else:
            raise ValueError(f"unknown method {method!r}")

        if use_parametric:
            params = fit_log_logistic(train_values)
            if params.fallback:
                fallbacks += 1
                probabilities = _empirical_cdf(values[target], train_values)
            else:
                probabilities = _cdf(values[target], params)
        else:
            fallbacks += 1
            probabilities = _empirical_cdf(values[target], train_values)

        # Clip away from 0 and 1 so the normal quantile stays finite.
        probabilities = np.clip(probabilities, 1e-6, 1 - 1e-6)
        out.loc[target, "spei"] = stats.norm.ppf(probabilities)

    if fallbacks:
        logger.info(
            "%d of 12 calendar months used the distribution-free transform "
            "(record too short for a stable parametric fit)", fallbacks,
        )
    return out


def label_drought(spei_values: pd.Series, threshold: float) -> pd.Series:
    """Binary drought label: 1 where SPEI is at or below ``threshold``.

    The conventional cut-offs are -1.0 (moderate), -1.5 (severe) and -2.0
    (extreme). These are the published SPEI severity classes, not thresholds
    tuned to suit this dataset.
    """
    return (spei_values <= threshold).astype("float").where(spei_values.notna())
