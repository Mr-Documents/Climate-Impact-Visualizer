"""Central configuration.

Paths are resolved relative to the package so nothing depends on the current
working directory, and every tunable that affects a scientific result is
declared here rather than buried in a script.
"""

from __future__ import annotations

import os
from pathlib import Path

# ml/src/climate_ml/config.py -> ml/
PACKAGE_ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = PACKAGE_ROOT.parent.parent

DATA_DIR = PROJECT_ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
EXTERNAL_DIR = DATA_DIR / "external"
PROCESSED_DIR = DATA_DIR / "processed"
MODELS_DIR = PROJECT_ROOT / "models"
REPORTS_DIR = PROJECT_ROOT / "reports"

for _d in (RAW_DIR, EXTERNAL_DIR, PROCESSED_DIR, MODELS_DIR, REPORTS_DIR):
    _d.mkdir(parents=True, exist_ok=True)

# --- Data acquisition -------------------------------------------------------

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"

# ERA5 reaches back to 1940, but Open-Meteo weights each request by
# (days / 14) * max(1, variables / 10) against a 10,000-call daily free-tier
# quota. A 75-year record costs ~1,957 calls per location, making 150 locations
# a 29-day download. 30 years still satisfies the WMO minimum record length for
# a standardised drought index while costing 783 calls per location, so the
# sample is broad enough to test spatial generalisation within a usable time.
START_DATE = "1995-01-01"
END_DATE = "2024-12-31"

# Daily is the correct scale: flood and drought are daily-to-monthly processes,
# and hourly rows would multiply the dataset 24x without adding signal.
DAILY_VARIABLES = (
    "precipitation_sum",
    "temperature_2m_mean",
    "temperature_2m_max",
    "temperature_2m_min",
    "relative_humidity_2m_mean",
    "wind_speed_10m_max",
    "et0_fao_evapotranspiration",
    "soil_moisture_0_to_7cm_mean",
)

N_LOCATIONS = 60
SAMPLE_SEED = 20260910

# The archive answers a 75-year single-point request in roughly 80 seconds, so
# acquisition is deliberately slow and resumable rather than parallel-and-fragile.
REQUEST_TIMEOUT_S = 300
REQUEST_PAUSE_S = float(os.getenv("CLIMATE_ML_REQUEST_PAUSE_S", "2.0"))
MAX_RETRIES = 4

# --- Target construction ----------------------------------------------------

# WMO guidance recommends >= 30 years of monthly values for a standardised
# index; the 1950-2024 record supplies 75.
SPEI_SCALE_MONTHS = 3
DROUGHT_THRESHOLD = -1.0          # moderate drought or worse
DROUGHT_HORIZON_DAYS = 30         # predict one month ahead

FLOOD_PERCENTILE = 95             # ETCCDI R95p, computed per location
FLOOD_HORIZON_DAYS = 3

# --- Splits -----------------------------------------------------------------

# The record is 30 years, and SPEI's distribution is fitted on the training
# period alone to avoid leakage - so the training block must stay long enough to
# fit a three-parameter distribution per calendar month. A 22/4/4 split leaves 22
# years for that fit while still holding out genuinely unseen later years.
# This is tighter than the textbook 30-year SPEI baseline, and is a direct
# consequence of shortening the record to fit the API quota; it is recorded in
# the limitations rather than glossed over.
TRAIN_END_YEAR = 2016        # 1995-2016 inclusive, 22 years
VALIDATION_END_YEAR = 2020   # 2017-2020, 4 years
# Test is everything after VALIDATION_END_YEAR, i.e. 2021-2024.

# Spatial generalisation is the primary test and does not depend on the temporal
# split: whole locations are held out via grouped cross-validation.
SPATIAL_FOLDS = 6

# --- Training window, per target -------------------------------------------
#
# Drought's base rate is non-stationary: 13.78% over 1995-2016 against 21.20%
# in 2021-2024, because drought has become markedly more frequent. A model
# trained on the long record learns a prior that no longer holds, which is why
# its probabilities were badly calibrated (ECE 0.111).
#
# A nine-variant sweep (scripts/experiment_rolling_window.py), selected on
# validation only, found that a short window with recency weighting inside it
# improves BOTH metrics:
#
#     drought  full -> recent5_w   PR-AUC 0.6303 -> 0.6413   ECE 0.1108 -> 0.0307
#
# Weighting alone fixed ranking; a short window alone fixed calibration;
# combining them got both, because they were never the same problem.
#
# Flood keeps the full record deliberately. Its base rate barely drifts
# (2.61% -> 3.81%) and every variant landed between 0.2438 and 0.2487 test
# PR-AUC - within noise. Discarding 77% of the data for an indistinguishable
# difference is not justified, and the sweep finding no effect there is the
# expected result rather than a disappointing one.
TRAINING_WINDOW = {
    "drought": {"first_year": 2012, "half_life_years": 3.0},
    "flood": {"first_year": 1995, "half_life_years": None},
}

RANDOM_STATE = 42
