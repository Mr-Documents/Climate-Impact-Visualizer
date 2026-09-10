"""Shared test fixtures.

The synthetic climate here is SYNTHETIC AND FOR TESTING ONLY. It never enters
training, and is kept in the test tree precisely so it cannot be confused with
the real ERA5 record in data/raw. It exists so pipeline behaviour can be
asserted against a climate whose properties are known by construction - an
injected drought year, a known seasonal cycle - which observed data cannot give
us.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

START = "1995-01-01"
END = "2024-12-31"
TRAIN_END_YEAR = 2016


@pytest.fixture(scope="session")
def dates() -> pd.DatetimeIndex:
    return pd.date_range(START, END, freq="D")


@pytest.fixture(scope="session")
def train_mask(dates: pd.DatetimeIndex) -> np.ndarray:
    return np.asarray(dates.year) <= TRAIN_END_YEAR


@pytest.fixture(scope="session")
def synthetic_climate(dates: pd.DatetimeIndex) -> pd.DataFrame:
    """A seasonal tropical climate with a deliberately injected drought year.

    Properties known by construction:
      * wet season peaks near day 15, dry season opposite
      * calendar year 2015 has rainfall scaled to 15% of normal
    """
    rng = np.random.default_rng(20260910)
    n = len(dates)
    doy = np.asarray(dates.dayofyear)
    years = np.asarray(dates.year)

    seasonal = 3.0 + 2.5 * np.cos(2 * np.pi * (doy - 15) / 365)
    precipitation = rng.gamma(shape=0.6, scale=seasonal / 0.6)
    precipitation[years == 2015] *= 0.15  # injected drought

    et0 = np.clip(
        2.0 + 1.5 * np.sin(2 * np.pi * (doy - 100) / 365) + rng.normal(0, 0.2, n), 0.1, None
    )
    soil = np.clip(
        0.25 + 0.08 * np.cos(2 * np.pi * (doy - 30) / 365) + rng.normal(0, 0.02, n), 0.01, 0.5
    )
    temperature = 26 + 4 * np.cos(2 * np.pi * (doy - 200) / 365) + rng.normal(0, 1.5, n)

    return pd.DataFrame(
        {
            "location_id": "SYNTH",
            "date": dates,
            "latitude": 5.6,
            "longitude": -0.2,
            "elevation_m": 37.0,
            "precipitation_sum": precipitation,
            "et0_fao_evapotranspiration": et0,
            "soil_moisture_0_to_7cm_mean": soil,
            "temperature_2m_mean": temperature,
        }
    )
