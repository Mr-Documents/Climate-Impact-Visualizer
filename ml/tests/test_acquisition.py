"""Tests for data acquisition error handling.

REGRESSION CONTEXT
------------------
On 10-11 September 2026 a nine-hour connectivity outage caused 119 valid
locations to be discarded. The downloader only special-cased HTTP 429; a DNS
failure (``getaddrinfo failed``) fell through to a generic handler, was raised
as AcquisitionError, and the caller interpreted that as "this coordinate is
unusable" and drew a replacement. It burned ~96 replacement draws and skipped
whole latitude bands, silently destroying the land-area-proportional sample.

The rule these tests lock in: a failure is only a *location* rejection when the
DATA is unusable. Anything about the network, the server or the quota is
transient and must be retried on the same location.
"""

from __future__ import annotations

from unittest.mock import patch

import pandas as pd
import pytest
import requests

from climate_ml import config
from climate_ml.data.openmeteo import (
    AcquisitionError,
    RateLimitError,
    TransientError,
    _request,
    _validate,
    estimated_request_weight,
)


def _no_sleep():
    """Collapse retry backoff so tests run instantly."""
    return patch("climate_ml.data.openmeteo.time.sleep", lambda *_: None)


# --- the regression itself ---------------------------------------------------

def test_dns_failure_is_transient_not_a_rejection():
    """The exact failure from the outage: getaddrinfo fails.

    It MUST raise TransientError. If this ever reverts to AcquisitionError the
    downloader will start discarding good locations again.
    """
    dns_error = requests.ConnectionError(
        "HTTPSConnectionPool(host='archive-api.open-meteo.com', port=443): "
        "Failed to resolve 'archive-api.open-meteo.com' ([Errno 11001] getaddrinfo failed)"
    )
    with _no_sleep(), patch("requests.get", side_effect=dns_error), pytest.raises(TransientError):
        _request(5.6, -0.2)


def test_dns_failure_is_not_an_acquisition_error():
    """Stated separately because this is the distinction that broke."""
    dns_error = requests.ConnectionError("getaddrinfo failed")
    with _no_sleep(), patch("requests.get", side_effect=dns_error):
        try:
            _request(5.6, -0.2)
        except TransientError:
            pass
        except AcquisitionError:
            pytest.fail("network failure was classified as an unusable location")


def test_timeout_is_transient():
    with _no_sleep(), patch("requests.get", side_effect=requests.Timeout("timed out")), pytest.raises(TransientError):
        _request(5.6, -0.2)


def test_server_error_is_transient():
    """5xx is the server having a bad day, not a bad coordinate."""
    response = requests.Response()
    response.status_code = 503
    error = requests.HTTPError("503 Server Error", response=response)
    with _no_sleep(), patch("requests.get", side_effect=error), pytest.raises(TransientError):
        _request(5.6, -0.2)


def test_client_error_is_not_transient():
    """4xx means our request is malformed - retrying forever would not help."""
    response = requests.Response()
    response.status_code = 400
    error = requests.HTTPError("400 Bad Request", response=response)
    with _no_sleep(), patch("requests.get", side_effect=error), pytest.raises(AcquisitionError):
        _request(5.6, -0.2)


def test_rate_limit_is_raised_immediately_without_retrying():
    """429 must escape at once so the caller can sleep out the quota window."""
    response = requests.Response()
    response.status_code = 429
    calls = []

    def fake_get(*args, **kwargs):
        calls.append(1)
        return response

    with _no_sleep(), patch("requests.get", side_effect=fake_get), pytest.raises(RateLimitError):
        _request(5.6, -0.2)
    assert len(calls) == 1, "429 should not be retried in the inner loop"


def test_transient_failures_are_retried_before_giving_up():
    attempts = []

    def fake_get(*args, **kwargs):
        attempts.append(1)
        raise requests.ConnectionError("getaddrinfo failed")

    with _no_sleep(), patch("requests.get", side_effect=fake_get), pytest.raises(TransientError):
        _request(5.6, -0.2)
    assert len(attempts) == config.MAX_RETRIES


def test_recovery_after_a_transient_failure_returns_data():
    """Connectivity returning mid-retry must produce a normal success."""
    payload = {"daily": {"time": ["1995-01-01"]}, "latitude": 5.6, "longitude": -0.2}
    calls = {"n": 0}

    def fake_get(*args, **kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            raise requests.ConnectionError("getaddrinfo failed")
        response = requests.Response()
        response.status_code = 200
        response._content = pd.io.json.ujson_dumps(payload).encode() if hasattr(
            pd.io, "json"
        ) else b"{}"
        response.json = lambda: payload  # type: ignore[method-assign]
        return response

    with _no_sleep(), patch("requests.get", side_effect=fake_get):
        assert _request(5.6, -0.2) == payload


# --- genuine location rejections still work ---------------------------------

def _frame(**overrides) -> pd.DataFrame:
    dates = pd.date_range(config.START_DATE, config.END_DATE, freq="D")
    data = {"date": dates}
    for variable in config.DAILY_VARIABLES:
        data[variable] = [1.0] * len(dates)
    data.update(overrides)
    return pd.DataFrame(data)


def test_all_null_variable_is_a_genuine_rejection():
    """Permanent ice returns nulls - that IS an unusable location."""
    frame = _frame(soil_moisture_0_to_7cm_mean=[float("nan")] * 10958)
    with pytest.raises(AcquisitionError, match="entirely null"):
        _validate(frame, "L9999")


def test_missing_variable_is_a_genuine_rejection():
    frame = _frame().drop(columns=["et0_fao_evapotranspiration"])
    with pytest.raises(AcquisitionError, match="omitted"):
        _validate(frame, "L9999")


def test_wrong_row_count_is_a_genuine_rejection():
    with pytest.raises(AcquisitionError):
        _validate(_frame().head(100), "L9999")


def test_valid_frame_passes_validation():
    _validate(_frame(), "L9999")  # must not raise


# --- quota accounting --------------------------------------------------------

def test_request_weight_matches_the_published_formula():
    """weight = (days / 14) * max(1, variables / 10), verified against a real 429."""
    days = (pd.Timestamp(config.END_DATE) - pd.Timestamp(config.START_DATE)).days + 1
    expected = (days / 14) * max(1.0, len(config.DAILY_VARIABLES) / 10)
    assert estimated_request_weight() == pytest.approx(expected)


def test_daily_quota_allows_a_plausible_number_of_locations():
    per_day = 10000 / estimated_request_weight()
    assert 5 < per_day < 30, f"unexpected throughput estimate: {per_day:.1f}/day"
