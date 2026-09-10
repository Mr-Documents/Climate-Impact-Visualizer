"""Generate and persist the stratified global location sample.

Run:  python scripts/sample_locations.py

Writes data/processed/locations.csv. The sample is fully determined by
config.N_LOCATIONS and config.SAMPLE_SEED, so re-running reproduces it exactly.
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from climate_ml import config
from climate_ml.data.locations import band_land_weights, sample_locations

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("sample_locations")

OUTPUT = config.PROCESSED_DIR / "locations.csv"


def main() -> int:
    logger.info("Measuring land area per latitude band...")
    weights = band_land_weights()

    logger.info("Drawing %d locations (seed=%d)...", config.N_LOCATIONS, config.SAMPLE_SEED)
    locations = sample_locations(config.N_LOCATIONS, config.SAMPLE_SEED)

    frame = pd.DataFrame([loc.as_dict() for loc in locations])
    frame["land_share_of_band"] = frame.apply(
        lambda r: weights[(r.band_south, r.band_north)], axis=1
    )
    frame.to_csv(OUTPUT, index=False)

    logger.info("Wrote %d locations to %s", len(frame), OUTPUT)
    logger.info(
        "Latitude %.1f to %.1f, longitude %.1f to %.1f",
        frame.latitude.min(), frame.latitude.max(),
        frame.longitude.min(), frame.longitude.max(),
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
