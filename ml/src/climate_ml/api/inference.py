"""Model loading and prediction for arbitrary coordinates.

THE CENTRAL DESIGN DECISION
--------------------------
Inference calls ``assemble_location`` - the *same function training calls*.
Not a reimplementation, not a port, the same code. Feature engineering, the
day-of-year climatology, the SPEI distribution fit and the R95p threshold are
therefore identical by construction rather than by careful maintenance.

This is deliberate. The system this replaces computed features one way in
training and another way at serving time, and the two drifted until the model's
output was constant everywhere on Earth. A shared code path makes that class of
bug impossible rather than merely unlikely.

The cost is that a prediction needs the same 30-year record training used:
~783 weighted API calls for a coordinate we have not seen before, which is
about 12 new locations per day against the free quota. Results are cached per
rounded coordinate, so only the first request for a place pays that price.

Reducing the inference window below 30 years would be faster and cheaper, but
the climatology and SPEI distribution would then be estimated from less data
than in training - reintroducing exactly the train/serve skew this design
exists to prevent.
"""

from __future__ import annotations

import datetime as _dt
import logging
import threading
from dataclasses import dataclass
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from climate_ml import config
from climate_ml.data.assemble import assemble_location, model_features
from climate_ml.data.openmeteo import (
    AcquisitionError,
    RateLimitError,
    TransientError,
    _request,
)

logger = logging.getLogger(__name__)

# Coordinates are rounded before caching. 2 decimal places is ~1.1 km, well
# inside ERA5's ~25 km grid, so nearby clicks share one cache entry and one
# quota charge.
CACHE_PRECISION = 2

# Probability bands for display. These are presentation thresholds, not model
# outputs - the probability is the model's answer and is always returned.
BAND_EDGES = ((0.25, "Low"), (0.50, "Moderate"), (0.75, "High"))


class ModelNotAvailable(RuntimeError):
    """The trained artefacts are missing or unreadable."""


class UpstreamUnavailable(RuntimeError):
    """Climate data could not be retrieved for this coordinate."""


class LocationUnsupported(RuntimeError):
    """This coordinate cannot be served - ocean, permanent ice, or no soil data."""


@dataclass(frozen=True)
class Assessment:
    probability: float
    band: str
    exceeds_threshold: bool
    threshold: float
    model_version: str
    horizon_days: int
    definition: str


def band_for(probability: float) -> str:
    for edge, label in BAND_EDGES:
        if probability < edge:
            return label
    return "Very High"


class PredictionService:
    """Loads the trained models once and serves predictions for coordinates."""

    def __init__(self, models_dir: Path | None = None) -> None:
        self.models_dir = models_dir or config.MODELS_DIR
        self._bundles: dict[str, dict] = {}
        # Keyed by (rounded lat, rounded lon, ISO date) - see _fetch_history.
        self._history_cache: dict[tuple[float, float, str], pd.DataFrame] = {}
        self._lock = threading.Lock()
        self._load_models()

    # --- startup ------------------------------------------------------------

    def _load_models(self) -> None:
        """Load both models at startup so no request pays the cost.

        Training and prediction are separate processes: nothing here ever fits a
        model, it only loads artefacts produced by scripts/train.py.
        """
        for target in ("flood", "drought"):
            path = self.models_dir / f"{target}_model.joblib"
            if not path.exists():
                raise ModelNotAvailable(
                    f"{path} not found. Run scripts/train.py before serving."
                )
            try:
                bundle = joblib.load(path)
            except Exception as exc:
                raise ModelNotAvailable(f"could not load {path}: {exc}") from exc

            for key in ("model", "features", "threshold"):
                if key not in bundle:
                    raise ModelNotAvailable(f"{path} is missing '{key}'")
            self._bundles[target] = bundle
            logger.info(
                "loaded %s model (%s, %d features, threshold %.3f)",
                target, bundle.get("selected_model", "unknown"),
                len(bundle["features"]), bundle["threshold"],
            )

    @property
    def loaded(self) -> list[str]:
        return sorted(self._bundles)

    # --- data ---------------------------------------------------------------

    def _fetch_history(self, latitude: float, longitude: float) -> pd.DataFrame:
        """Fetch (or reuse) the daily record for one coordinate, up to today.

        Training requests a fixed window ending at ``config.END_DATE`` so its
        results stay reproducible. Serving must not: a prediction anchored to the
        end of the training record is the same answer forever, which is what this
        service used to return (every response said ``as_of 2024-12-31``).

        Extending the window is safe because every fitted statistic is masked by
        YEAR against ``TRAIN_END_YEAR``, not by "whatever record I was handed".
        Measured on a real location: assembling a record truncated at 2020
        against the full record through 2024 gives bit-identical values for all
        29 features, ``spei_lag1m`` and ``r95p_mm``. Only the forward-looking
        labels differ, on exactly the last 3 days (flood horizon) and last 30
        days (drought horizon), and only by becoming defined where they had been
        NaN. ``tests/test_serving_window.py`` keeps that true.
        """
        # UTC, not the server's local date: the archive request asks for
        # timezone=UTC, and a Render instance in another zone would otherwise
        # ask for a day the archive does not consider finished.
        today = _dt.datetime.now(_dt.UTC).date().isoformat()
        # The date is part of the key so a cached record is reused within a day
        # and refetched the next, rather than pinning the service to whatever
        # day it happened to start on.
        key = (round(latitude, CACHE_PRECISION), round(longitude, CACHE_PRECISION), today)
        with self._lock:
            cached = self._history_cache.get(key)
        if cached is not None:
            return cached

        try:
            payload = _request(latitude, longitude, today)
        except RateLimitError as exc:
            raise UpstreamUnavailable(
                "climate data provider quota exhausted; try again later"
            ) from exc
        except TransientError as exc:
            raise UpstreamUnavailable("climate data provider unreachable") from exc
        except AcquisitionError as exc:
            raise UpstreamUnavailable(f"climate data request failed: {exc}") from exc

        frame = pd.DataFrame(payload["daily"]).rename(columns={"time": "date"})
        frame["date"] = pd.to_datetime(frame["date"])
        frame.insert(0, "location_id", f"req_{key[0]}_{key[1]}")
        frame["latitude"] = payload.get("latitude", latitude)
        frame["longitude"] = payload.get("longitude", longitude)
        frame["elevation_m"] = payload.get("elevation", np.nan)

        # A coordinate with no soil moisture at all is ocean or permanent ice -
        # the models have nothing to say about it, and saying so is better than
        # returning a confident number.
        if frame["soil_moisture_0_to_7cm_mean"].isna().all():
            raise LocationUnsupported(
                "no land-surface data at this coordinate (ocean, ice, or outside "
                "the land model domain)"
            )

        with self._lock:
            # Yesterday's entries for this coordinate are dead weight once the
            # date rolls over; drop them rather than growing without bound.
            stale = [k for k in self._history_cache if k[:2] == key[:2] and k != key]
            for k in stale:
                del self._history_cache[k]
            self._history_cache[key] = frame
        logger.info("fetched %d days for %s through %s", len(frame), key[:2], today)
        return frame

    # --- prediction ---------------------------------------------------------

    def predict(self, latitude: float, longitude: float) -> dict:
        """Assess flood and drought risk at one coordinate."""
        history = self._fetch_history(latitude, longitude)

        # The same assembly used in training. Labels come back NaN for recent
        # rows because their future windows do not exist yet - that is correct,
        # and only the feature columns are used here.
        table = assemble_location(history)
        features = model_features(table)

        usable = table[table[features].notna().all(axis=1)]
        if usable.empty:
            raise LocationUnsupported(
                "insufficient history to compute features at this coordinate"
            )
        latest = usable.iloc[-1]
        row = latest[features].to_numpy(dtype=float).reshape(1, -1)

        results = {}
        flood_definition = (
            "Probability that rainfall exceeding this location's 95th-percentile "
            "wet-day threshold falls on wetter-than-normal ground within the "
            "horizon. This describes flood-generating conditions, not observed "
            "flooding, and excludes terrain, drainage and flood defences."
        )
        drought_definition = (
            "Probability that SPEI-3 falls to -1.0 or below (moderate drought or "
            "worse) about one month ahead."
        )
        for target, horizon, definition in (
            ("flood", config.FLOOD_HORIZON_DAYS, flood_definition),
            ("drought", config.DROUGHT_HORIZON_DAYS, drought_definition),
        ):
            bundle = self._bundles[target]
            if list(bundle["features"]) != list(features):
                raise ModelNotAvailable(
                    f"{target} model expects {len(bundle['features'])} features but the "
                    f"pipeline produced {len(features)}; retrain before serving."
                )
            probability = float(bundle["model"].predict_proba(row)[0, 1])
            results[target] = Assessment(
                probability=round(probability, 4),
                band=band_for(probability),
                exceeds_threshold=bool(probability >= bundle["threshold"]),
                threshold=float(bundle["threshold"]),
                model_version=str(bundle.get("trained_at", "unknown")),
                horizon_days=horizon,
                definition=definition,
            )

        return {
            "latitude": float(history["latitude"].iloc[0]),
            "longitude": float(history["longitude"].iloc[0]),
            "as_of": str(latest["date"].date()),
            "observations_used": len(history),
            "flood": results["flood"],
            "drought": results["drought"],
        }
