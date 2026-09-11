"""Download the daily ERA5 record for every sampled location.

Run:  python scripts/download_climate_data.py [--limit N] [--force]

Resumable: each location is cached to data/raw/<id>.parquet and skipped on a
re-run, so an interrupted download continues rather than restarting.

Locations that fail validation - most often permanent ice, where the land
surface model carries no soil moisture - are recorded and replaced by a fresh
draw from the same latitude band, preserving the land-area-proportional design.
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from climate_ml import config
from climate_ml.data.locations import Location, draw_replacement
from climate_ml.data.openmeteo import (
    AcquisitionError,
    RateLimitError,
    TransientError,
    estimated_request_weight,
    fetch_location,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s",
                    datefmt="%H:%M:%S")
logger = logging.getLogger("download")

LOCATIONS_CSV = config.PROCESSED_DIR / "locations.csv"
MANIFEST_CSV = config.PROCESSED_DIR / "acquisition_manifest.csv"
MAX_REPLACEMENTS_PER_SLOT = 5


def load_locations() -> list[Location]:
    if not LOCATIONS_CSV.exists():
        raise SystemExit(f"{LOCATIONS_CSV} not found. Run scripts/sample_locations.py first.")
    frame = pd.read_csv(LOCATIONS_CSV)
    return [
        Location(
            location_id=r.location_id,
            latitude=float(r.latitude),
            longitude=float(r.longitude),
            band_south=float(r.band_south),
            band_north=float(r.band_north),
        )
        for r in frame.itertuples()
    ]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=None, help="only process the first N slots")
    parser.add_argument("--force", action="store_true", help="re-download even if cached")
    parser.add_argument("--cooldown-min", type=float, default=61.0,
                        help="minutes to wait after HTTP 429 before retrying the same location")
    parser.add_argument("--budget", type=int, default=None,
                        help="stop after roughly this many weighted API calls (free tier: 10000/day)")
    args = parser.parse_args()

    locations = load_locations()
    if args.limit:
        locations = locations[: args.limit]

    weight = estimated_request_weight()
    logger.info(
        "Each location costs ~%.0f weighted calls; free tier allows 10,000/day "
        "(~%.1f locations/day).", weight, 10000 / weight,
    )
    if args.budget:
        logger.info("Budget %d calls -> stopping after ~%d fetches this run.",
                    args.budget, int(args.budget // weight))

    spent = 0.0
    network_failures = 0
    rng = np.random.default_rng(config.SAMPLE_SEED + 1)
    accepted = list(locations)
    records: list[dict] = []
    started = time.time()

    for index, original in enumerate(locations, start=1):
        candidate = original
        for attempt in range(MAX_REPLACEMENTS_PER_SLOT):
            # NOTE: only AcquisitionError reaches the replacement path below.
            # Rate limiting and network failure both `continue` without
            # consuming an attempt.
            try:
                result = fetch_location(candidate, force=args.force)
            except RateLimitError as exc:
                # Throttling says nothing about this location. Wait it out and
                # retry the SAME point - replacing it would silently corrupt the
                # land-area-proportional sample for no reason.
                logger.warning(
                    "[%3d/%3d] %s: %s - sleeping %.0f min then retrying same location",
                    index, len(locations), candidate.location_id, exc,
                    args.cooldown_min,
                )
                time.sleep(args.cooldown_min * 60)
                continue
            except TransientError as exc:
                # Network or server failure. Also NOT the location's fault, so
                # the same rule applies: wait, retry this point, never replace it.
                # A shorter wait than the rate-limit cooldown, because
                # connectivity usually returns sooner than a quota resets.
                wait_min = min(args.cooldown_min, 5.0 * (2 ** min(network_failures, 4)))
                network_failures += 1
                logger.warning(
                    "[%3d/%3d] %s: network unavailable - waiting %.0f min, retry %d "
                    "(same location). %s",
                    index, len(locations), candidate.location_id, wait_min,
                    network_failures, str(exc)[:120],
                )
                time.sleep(wait_min * 60)
                continue
            except AcquisitionError as exc:
                logger.warning("[%3d/%3d] %s rejected: %s", index, len(locations),
                               candidate.location_id, exc)
                records.append({
                    "slot": index, "location_id": candidate.location_id,
                    "latitude": candidate.latitude, "longitude": candidate.longitude,
                    "status": "rejected", "detail": str(exc), "rows": 0, "elevation_m": np.nan,
                })
                if attempt == MAX_REPLACEMENTS_PER_SLOT - 1:
                    logger.error("[%3d/%3d] slot exhausted after %d replacements",
                                 index, len(locations), MAX_REPLACEMENTS_PER_SLOT)
                    break
                candidate = draw_replacement(
                    (original.band_south, original.band_north), rng, accepted
                )
                logger.info("           replacement drawn: %s (%.3f, %.3f)",
                            candidate.location_id, candidate.latitude, candidate.longitude)
                time.sleep(config.REQUEST_PAUSE_S)
                continue

            elapsed = time.time() - started
            rate = elapsed / index
            remaining = (len(locations) - index) * rate
            logger.info(
                "[%3d/%3d] %s %s  rows=%d  elev=%.0fm  eta=%.0fmin",
                index, len(locations), candidate.location_id,
                "cached" if result.from_cache else "fetched",
                result.rows, result.elevation_m, remaining / 60,
            )
            records.append({
                "slot": index, "location_id": candidate.location_id,
                "latitude": candidate.latitude, "longitude": candidate.longitude,
                "status": "cached" if result.from_cache else "fetched",
                "detail": "", "rows": result.rows, "elevation_m": result.elevation_m,
            })
            if not result.from_cache:
                spent += weight
                time.sleep(config.REQUEST_PAUSE_S)
            break

        if args.budget and spent >= args.budget:
            logger.info("Weighted-call budget reached (%.0f). Re-run tomorrow to continue.", spent)
            break

    manifest = pd.DataFrame(records)
    manifest.to_csv(MANIFEST_CSV, index=False)

    ok = int((manifest.status != "rejected").sum())
    rejected = int((manifest.status == "rejected").sum())
    logger.info("Done in %.1f min - %d usable, %d rejected. Manifest: %s",
                (time.time() - started) / 60, ok, rejected, MANIFEST_CSV)
    return 0 if ok > 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
