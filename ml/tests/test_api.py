"""Tests for the prediction API.

The upstream climate provider is mocked throughout. Hitting it for real would
consume ~783 weighted calls of a 10,000/day quota per test, and would make the
suite depend on somebody else's uptime.
"""

from __future__ import annotations

from typing import ClassVar
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from climate_ml.api import service as service_module
from climate_ml.api.inference import (
    Assessment,
    LocationUnsupported,
    ModelNotAvailable,
    UpstreamUnavailable,
    band_for,
)
from climate_ml.api.service import app


def _assessment(probability: float = 0.31) -> Assessment:
    return Assessment(
        probability=probability,
        band=band_for(probability),
        exceeds_threshold=probability >= 0.4,
        threshold=0.4,
        model_version="2026-09-12T00:00:00+00:00",
        horizon_days=3,
        definition="test definition",
    )


class FakeService:
    """Stands in for PredictionService without touching models or the network."""

    loaded: ClassVar[list[str]] = ["drought", "flood"]

    def __init__(self, error: Exception | None = None):
        self.error = error
        self.calls: list[tuple[float, float]] = []

    def predict(self, latitude: float, longitude: float) -> dict:
        self.calls.append((latitude, longitude))
        if self.error:
            raise self.error
        return {
            "latitude": latitude,
            "longitude": longitude,
            "as_of": "2024-12-31",
            "observations_used": 10958,
            "flood": _assessment(0.13),
            "drought": _assessment(0.62),
        }


# The app builds its service inside the lifespan handler, so the CLASS must be
# patched - patching the module-level instance is overwritten on startup.
def _patched_app(error: Exception | None = None, service_present: bool = True):
    """Patch PredictionService so startup produces a fake (or fails)."""
    if not service_present:
        def boom(*args, **kwargs):
            raise ModelNotAvailable("models not found")
        return patch.object(service_module, "PredictionService", boom)

    fake = FakeService(error)
    return patch.object(service_module, "PredictionService", lambda *a, **k: fake), fake


@pytest.fixture
def client():
    """A client whose service is a fake, bypassing models and the network."""
    patcher, fake = _patched_app()
    with patcher, TestClient(app) as c:
        c.fake = fake  # type: ignore[attr-defined]
        yield c


def _client_with(error: Exception | None = None, service_present: bool = True):
    """Context manager patching startup for the failure-mode tests."""
    result = _patched_app(error, service_present)
    return result[0] if isinstance(result, tuple) else result


# --- health -----------------------------------------------------------------

def test_health_reports_ok_when_models_are_loaded(client):
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert set(body["models_loaded"]) == {"flood", "drought"}


def test_health_reports_degraded_without_models():
    with _client_with(service_present=False), TestClient(app) as c:
        body = c.get("/health").json()
    assert body["status"] == "degraded"
    assert body["models_loaded"] == []


# --- successful prediction --------------------------------------------------

def test_valid_request_returns_both_hazards(client):
    response = client.post("/predict", json={"latitude": 5.56, "longitude": -0.20})
    assert response.status_code == 200
    body = response.json()
    assert "flood" in body and "drought" in body


def test_probabilities_are_valid(client):
    body = client.post("/predict", json={"latitude": 5.56, "longitude": -0.20}).json()
    for hazard in ("flood", "drought"):
        assert 0.0 <= body[hazard]["probability"] <= 1.0


def test_response_carries_provenance_and_a_disclaimer(client):
    body = client.post("/predict", json={"latitude": 5.56, "longitude": -0.20}).json()
    assert body["as_of"] == "2024-12-31"
    assert body["observations_used"] == 10958
    assert "not observed flooding" in body["disclaimer"]
    for hazard in ("flood", "drought"):
        assert body[hazard]["model_version"]
        assert body[hazard]["definition"]
        assert body[hazard]["horizon_days"] > 0


def test_coordinates_reach_the_service_unchanged(client):
    client.post("/predict", json={"latitude": -33.87, "longitude": 151.21})
    assert client.fake.calls == [(-33.87, 151.21)]  # type: ignore[attr-defined]


# --- input validation -------------------------------------------------------

@pytest.mark.parametrize(
    ("payload", "reason"),
    [
        ({"latitude": 95.0, "longitude": 0.0}, "latitude above 90"),
        ({"latitude": -95.0, "longitude": 0.0}, "latitude below -90"),
        ({"latitude": 0.0, "longitude": 181.0}, "longitude above 180"),
        ({"latitude": 0.0, "longitude": -181.0}, "longitude below -180"),
        ({"latitude": -75.0, "longitude": 0.0}, "polar, outside training range"),
        ({"latitude": 85.0, "longitude": 0.0}, "arctic, outside training range"),
        ({"latitude": "abc", "longitude": 0.0}, "non-numeric latitude"),
        ({"latitude": None, "longitude": 0.0}, "null latitude"),
        ({"latitude": 5.0}, "missing longitude"),
        ({}, "empty body"),
        ({"latitude": 5.0, "longitude": 0.0, "unexpected": 1}, "unknown field"),
    ],
)
def test_invalid_requests_are_rejected_with_422(client, payload, reason):
    response = client.post("/predict", json=payload)
    assert response.status_code == 422, f"{reason} should be rejected"
    assert "detail" in response.json()


def test_validation_error_names_the_offending_field(client):
    body = client.post("/predict", json={"latitude": 95.0, "longitude": 0.0}).json()
    assert "latitude" in body["detail"]


def test_validation_error_does_not_leak_internals(client):
    body = client.post("/predict", json={"latitude": 999.0, "longitude": 0.0}).json()
    text = str(body)
    for leak in ("Traceback", "File \"", "climate_ml", "site-packages"):
        assert leak not in text


# --- failure modes ----------------------------------------------------------

def test_unsupported_location_returns_422():
    with _client_with(LocationUnsupported("no land-surface data")), TestClient(app) as c:
        response = c.post("/predict", json={"latitude": 0.0, "longitude": -140.0})
    assert response.status_code == 422
    assert response.json()["error"] == "unsupported location"


def test_upstream_failure_returns_503():
    """A provider outage is not the caller's fault - 503, not 500."""
    with _client_with(UpstreamUnavailable("provider unreachable")), TestClient(app) as c:
        response = c.post("/predict", json={"latitude": 5.56, "longitude": -0.20})
    assert response.status_code == 503
    assert response.json()["error"] == "climate data unavailable"


def test_missing_models_return_503_not_500():
    with _client_with(service_present=False), TestClient(app) as c:
        response = c.post("/predict", json={"latitude": 5.56, "longitude": -0.20})
    assert response.status_code == 503
    assert response.json()["error"] == "models unavailable"


def test_model_failure_does_not_leak_internal_detail():
    secret = ModelNotAvailable("/home/user/secret/path/model.joblib is corrupt")
    with _client_with(secret), TestClient(app) as c:
        response = c.post("/predict", json={"latitude": 5.56, "longitude": -0.20})
    assert response.status_code == 503
    assert "secret" not in str(response.json())


def test_unexpected_error_returns_generic_500():
    """raise_server_exceptions=False makes TestClient exercise the real handler
    instead of re-raising, which is what a deployed server actually does."""
    patcher = _client_with(RuntimeError("boom: internal detail"))
    with patcher, TestClient(app, raise_server_exceptions=False) as c:
        response = c.post("/predict", json={"latitude": 5.56, "longitude": -0.20})
    assert response.status_code == 500
    assert "boom" not in str(response.json())
    assert response.json()["error"] == "internal error"


def test_get_is_not_allowed_on_predict(client):
    assert client.get("/predict").status_code == 405


# --- display banding --------------------------------------------------------

@pytest.mark.parametrize(
    ("probability", "expected"),
    [(0.0, "Low"), (0.24, "Low"), (0.25, "Moderate"), (0.49, "Moderate"),
     (0.50, "High"), (0.74, "High"), (0.75, "Very High"), (1.0, "Very High")],
)
def test_bands_map_probabilities_consistently(probability, expected):
    assert band_for(probability) == expected


def test_bands_are_monotonic():
    order = ["Low", "Moderate", "High", "Very High"]
    seen = [band_for(p / 100) for p in range(101)]
    indices = [order.index(b) for b in seen]
    assert indices == sorted(indices), "band must never decrease as probability rises"
