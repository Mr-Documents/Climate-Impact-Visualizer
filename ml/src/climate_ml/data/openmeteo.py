"""Reproducible acquisition of daily ERA5 records from the Open-Meteo archive.

Design notes
------------
*Resumable.* Each location is cached to its own Parquet file. Re-running the
script skips anything already present, so an interrupted multi-hour download
resumes instead of restarting.

*Honest about gaps.* Missing values are preserved as NaN. Nothing is
interpolated, forward-filled or defaulted at this stage - a fabricated zero for
rainfall or soil moisture would silently become a real observation to every
downstream step, which is exactly how the previous pipeline corrupted its own
training data.

*Validated.* A response is rejected if the date axis is the wrong length, if a
requested variable is absent, or if a variable is entirely null. Rejected
locations are recorded rather than silently dropped.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from pathlib import Path

import pandas as pd
import requests

from climate_ml import config
from climate_ml.data.locations import Location

logger = logging.getLogger(__name__)


class AcquisitionError(RuntimeError):
    """The location itself is unusable - e.g. every value is null over ice."""


class TransientError(RuntimeError):
    """The network or server failed us, not the location.

    DNS failures, connection resets and 5xx responses say nothing about whether
    a coordinate is usable. Treating them as rejections is what a nine-hour
    connectivity outage exposed: 119 perfectly good locations were discarded
    because ``getaddrinfo`` failed, burning ~96 replacement draws and silently
    destroying the land-area-proportional sample. These must be waited out and
    retried on the SAME location, exactly like rate limiting.
    """


class RateLimitError(RuntimeError):
    """The API throttled us. Transient, and emphatically NOT a bad location.

    Open-Meteo weights a request by span and variable count:
    ``weight = (days / 14) * max(1, variables / 10)``. A 75-year, 8-variable
    request costs ~1,957 of the 10,000 free calls per day, so throttling is
    expected and must be waited out rather than treated as a rejection.
    """


@dataclass(frozen=True)
class FetchResult:
    location_id: str
    path: Path
    rows: int
    elevation_m: float
    from_cache: bool


def cache_path(location_id: str) -> Path:
    return config.RAW_DIR / f"{location_id}.parquet"


def _request(latitude: float, longitude: float, end_date: str | None = None) -> dict:
    """Fetch one location with bounded retries and exponential backoff.

    Args:
        end_date: Last day to request, ``YYYY-MM-DD``. Defaults to
            ``config.END_DATE``, which is what TRAINING must always use so the
            committed results stay reproducible. The prediction service passes
            today instead - see ``api/inference.py``. Every statistic that gets
            fitted (the SPEI distribution, the R95p threshold, the day-of-year
            soil climatology) is masked by YEAR against ``TRAIN_END_YEAR`` in
            ``assemble.py``, so extending the record cannot move them; this is
            asserted in ``tests/test_serving_window.py``.
    """
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "start_date": config.START_DATE,
        "end_date": end_date or config.END_DATE,
        "daily": ",".join(config.DAILY_VARIABLES),
        "timezone": "UTC",
    }

    last_error: Exception | None = None
    last_was_transient = False
    for attempt in range(1, config.MAX_RETRIES + 1):
        try:
            response = requests.get(
                config.ARCHIVE_URL, params=params, timeout=config.REQUEST_TIMEOUT_S
            )
            if response.status_code == 429:
                raise RateLimitError("HTTP 429 - hourly or daily quota exhausted")
            response.raise_for_status()
            payload = response.json()
            if "error" in payload:
                raise AcquisitionError(str(payload.get("reason", "unknown API error")))
            return payload
        except RateLimitError:
            raise
        except (requests.ConnectionError, requests.Timeout) as exc:
            # No DNS, no route, or the server never answered. Nothing to do with
            # this coordinate.
            last_error, last_was_transient = exc, True
        except requests.HTTPError as exc:
            status = exc.response.status_code if exc.response is not None else 0
            # 5xx is the server having a bad day; 4xx means our request is wrong.
            last_error, last_was_transient = exc, status >= 500
        except Exception as exc:  # noqa: BLE001 - retried and re-raised below
            last_error, last_was_transient = exc, False
            if attempt == config.MAX_RETRIES:
                break
            backoff = 2 ** attempt * config.REQUEST_PAUSE_S
            logger.warning(
                "attempt %d/%d failed for (%.3f, %.3f): %s - retrying in %.0fs",
                attempt, config.MAX_RETRIES, latitude, longitude, exc, backoff,
            )
            time.sleep(backoff)

    message = (
        f"failed after {config.MAX_RETRIES} attempts at ({latitude}, {longitude}): {last_error}"
    )
    # The distinction matters enormously: a transient failure must never cause
    # the caller to discard and replace this location.
    raise TransientError(message) if last_was_transient else AcquisitionError(message)


def _validate(frame: pd.DataFrame, location_id: str, end_date: str | None = None) -> None:
    """Reject structurally unusable responses rather than training on them."""
    missing = [v for v in config.DAILY_VARIABLES if v not in frame.columns]
    if missing:
        raise AcquisitionError(f"{location_id}: response omitted {missing}")

    expected_start = pd.Timestamp(config.START_DATE)
    expected_end = pd.Timestamp(end_date or config.END_DATE)
    if frame["date"].min() != expected_start or frame["date"].max() != expected_end:
        raise AcquisitionError(
            f"{location_id}: date axis {frame['date'].min().date()}..{frame['date'].max().date()} "
            f"does not match requested {expected_start.date()}..{expected_end.date()}"
        )

    expected_rows = (expected_end - expected_start).days + 1
    if len(frame) != expected_rows:
        raise AcquisitionError(f"{location_id}: got {len(frame)} rows, expected {expected_rows}")

    # A variable that is null everywhere means this point is not usable land -
    # open water, permanent ice, or outside the land-surface model's domain.
    for variable in config.DAILY_VARIABLES:
        if frame[variable].isna().all():
            raise AcquisitionError(f"{location_id}: '{variable}' is entirely null")


def fetch_location(
    location: Location, *, force: bool = False, end_date: str | None = None
) -> FetchResult:
    """Download one location, or return the cached copy if present."""
    path = cache_path(location.location_id)
    if path.exists() and not force:
        cached = pd.read_parquet(path)
        return FetchResult(
            location_id=location.location_id,
            path=path,
            rows=len(cached),
            elevation_m=float(cached["elevation_m"].iloc[0]),
            from_cache=True,
        )

    payload = _request(location.latitude, location.longitude, end_date)
    daily = payload["daily"]

    frame = pd.DataFrame(daily)
    frame = frame.rename(columns={"time": "date"})
    frame["date"] = pd.to_datetime(frame["date"])
    _validate(frame, location.location_id, end_date)

    # Carry the identifying context on every row so per-location files can be
    # concatenated without losing which point they describe.
    frame.insert(0, "location_id", location.location_id)
    frame["latitude"] = payload.get("latitude", location.latitude)
    frame["longitude"] = payload.get("longitude", location.longitude)
    frame["elevation_m"] = payload.get("elevation", float("nan"))
    frame["band_south"] = location.band_south
    frame["band_north"] = location.band_north

    path.parent.mkdir(parents=True, exist_ok=True)
    frame.to_parquet(path, index=False)

    return FetchResult(
        location_id=location.location_id,
        path=path,
        rows=len(frame),
        elevation_m=float(frame["elevation_m"].iloc[0]),
        from_cache=False,
    )


def load_all(location_ids: list[str] | None = None) -> pd.DataFrame:
    """Concatenate cached locations into a single long-format frame."""
    paths = (
        sorted(config.RAW_DIR.glob("*.parquet"))
        if location_ids is None
        else [cache_path(i) for i in location_ids]
    )
    if not paths:
        raise FileNotFoundError(
            f"No cached locations in {config.RAW_DIR}. Run scripts/download_climate_data.py first."
        )
    frames = [pd.read_parquet(p) for p in paths]
    return pd.concat(frames, ignore_index=True).sort_values(["location_id", "date"])


def estimated_request_weight() -> float:
    """Weighted API-call cost of one full-record request for a single location.

    Open-Meteo counts a request as ``(days / 14) * max(1, variables / 10)`` calls.
    Verified empirically: at 1,957 calls per location, two requests succeeded
    (3,913) and the third crossed the 5,000/hour ceiling and returned HTTP 429.
    """
    days = (pd.Timestamp(config.END_DATE) - pd.Timestamp(config.START_DATE)).days + 1
    return (days / 14) * max(1.0, len(config.DAILY_VARIABLES) / 10)
