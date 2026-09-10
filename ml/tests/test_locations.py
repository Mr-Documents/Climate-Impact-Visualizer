"""Tests for stratified location sampling and Koppen classification."""

from __future__ import annotations

import itertools

import numpy as np
import pytest
from global_land_mask import globe

from climate_ml.data.koppen import classify, monthly_climatology
from climate_ml.data.locations import (
    MIN_LATITUDE,
    MIN_POINTS_PER_BAND,
    MIN_SEPARATION_KM,
    allocate_quota,
    band_land_weights,
    haversine_km,
    latitude_bands,
    sample_locations,
)

# --- sampling ---------------------------------------------------------------

def test_sample_is_reproducible():
    """A fixed seed must reproduce the sample exactly, or no result is citable."""
    first = sample_locations(60, seed=20260910)
    second = sample_locations(60, seed=20260910)
    assert [loc.as_dict() for loc in first] == [loc.as_dict() for loc in second]


def test_different_seed_gives_different_sample():
    a = sample_locations(60, seed=1)
    b = sample_locations(60, seed=2)
    assert [x.as_dict() for x in a] != [x.as_dict() for x in b]


def test_sample_size_is_exact():
    assert len(sample_locations(60, seed=7)) == 60


def test_every_point_is_on_land():
    for loc in sample_locations(60, seed=11):
        assert bool(globe.is_land(loc.latitude, loc.longitude)), (
            f"{loc.location_id} at {loc.latitude},{loc.longitude} is not on land"
        )


def test_points_respect_minimum_separation():
    """Two points inside one ERA5 cell would duplicate rows and inflate n."""
    locations = sample_locations(60, seed=13)
    for i, a in enumerate(locations):
        for b in locations[i + 1 :]:
            distance = haversine_km(a.latitude, a.longitude, b.latitude, b.longitude)
            assert distance >= MIN_SEPARATION_KM, f"{a.location_id}/{b.location_id}: {distance:.0f}km"


def test_points_lie_inside_their_declared_band():
    for loc in sample_locations(60, seed=17):
        assert loc.band_south <= loc.latitude <= loc.band_north


def test_antarctica_is_excluded():
    assert all(loc.latitude >= MIN_LATITUDE for loc in sample_locations(60, seed=19))


# --- quota allocation -------------------------------------------------------

def test_quota_sums_to_requested_total():
    weights = band_land_weights()
    for total in (60, 100, 150):
        assert sum(allocate_quota(total, weights).values()) == total


def test_every_land_band_meets_the_floor():
    weights = band_land_weights()
    quota = allocate_quota(60, weights)
    assert all(count >= MIN_POINTS_PER_BAND for count in quota.values())


def test_more_land_earns_more_points():
    """Allocation must track land area, otherwise the sample is not proportional."""
    weights = band_land_weights()
    quota = allocate_quota(150, weights)
    ranked = sorted(weights, key=lambda b: weights[b], reverse=True)
    biggest, smallest = ranked[0], [b for b in ranked if weights[b] > 0][-1]
    assert quota[biggest] > quota[smallest]


def test_impossible_budget_is_rejected_loudly():
    """Too small a sample must fail, not silently drop climate regimes."""
    weights = band_land_weights()
    with pytest.raises(ValueError, match="cannot give"):
        allocate_quota(5, weights)


def test_bands_tile_the_range_without_gaps():
    bands = latitude_bands()
    for (_, north), (south_next, _) in itertools.pairwise(bands):
        assert north == south_next


# --- Koppen -----------------------------------------------------------------

def test_koppen_identifies_injected_tropical_climate(synthetic_climate):
    """The synthetic fixture is warm and wet, so it must land in group A."""
    climate = classify(monthly_climatology(synthetic_climate), latitude=5.6)
    assert climate.startswith("A"), f"expected tropical, got {climate}"


def test_koppen_identifies_a_desert():
    """Near-zero rainfall with high temperature must classify as hot desert."""
    import pandas as pd

    climatology = pd.DataFrame(
        {"month": range(1, 13), "temp": [30.0] * 12, "precip": [1.0] * 12}
    )
    assert classify(climatology, latitude=25.0) == "BWh"


def test_koppen_identifies_an_ice_cap():
    import pandas as pd

    climatology = pd.DataFrame(
        {"month": range(1, 13), "temp": [-25.0] * 12, "precip": [20.0] * 12}
    )
    assert classify(climatology, latitude=78.0) == "EF"


def test_koppen_rejects_incomplete_climatology():
    import pandas as pd

    partial = pd.DataFrame({"month": range(1, 7), "temp": [10.0] * 6, "precip": [50.0] * 6})
    with pytest.raises(ValueError, match="12 monthly rows"):
        classify(partial, latitude=0.0)


def test_hemisphere_changes_the_summer_half():
    """The same climatology can classify differently north versus south."""
    import pandas as pd

    # Rain concentrated in Jun-Aug: summer rain in the north, winter rain in the south.
    precip = [10.0] * 12
    for month in (6, 7, 8):
        precip[month - 1] = 200.0
    climatology = pd.DataFrame(
        {"month": range(1, 13), "temp": [15.0] * 12, "precip": precip}
    )
    assert classify(climatology, latitude=40.0) != classify(climatology, latitude=-40.0)


def test_haversine_matches_a_known_distance():
    """London to Paris is about 344 km."""
    distance = haversine_km(51.5074, -0.1278, 48.8566, 2.3522)
    assert 330 < distance < 360


def test_haversine_is_zero_for_identical_points():
    assert haversine_km(10.0, 20.0, 10.0, 20.0) == pytest.approx(0.0, abs=1e-9)


def test_land_weights_sum_to_one():
    assert sum(band_land_weights().values()) == pytest.approx(1.0)


def test_land_weights_are_non_negative():
    assert all(w >= 0 for w in band_land_weights().values())


def test_northern_midlatitudes_hold_more_land_than_southern():
    """A basic geographic sanity check on the land mask itself."""
    weights = band_land_weights()
    northern = weights[(40.0, 50.0)]
    southern = weights[(-50.0, -40.0)]
    assert northern > southern


def test_sample_spans_both_hemispheres():
    latitudes = np.array([loc.latitude for loc in sample_locations(60, seed=23)])
    assert (latitudes > 0).any() and (latitudes < 0).any()
