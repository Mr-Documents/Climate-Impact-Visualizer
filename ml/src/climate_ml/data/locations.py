"""Stratified random sampling of global land locations.

The training set must support a claim of *global* generalisation, so the
sampling scheme has to be defensible rather than convenient. Hand-picking a
list of well-known cities biases the sample toward populated, well-documented
places and toward whichever climates the author happened to think of - the
weakness identified in the previous 12-city dataset.

Instead this module draws a stratified random sample:

1.  Land surface is partitioned into latitude bands. Bands are a proxy for
    broad climate regime (tropical, subtropical, temperate, boreal) and, unlike
    country or city lists, they are objective and exhaustive.
2.  The land fraction of each band is measured directly from a land mask, so
    the allocation reflects how much land actually exists at that latitude
    rather than an assumption about it.
3.  Points are drawn uniformly at random within each band, rejected if they
    fall on water or too close to an already-accepted point, until the band's
    quota is met.
4.  A fixed seed makes the whole sample reproducible.

The resulting Koppen-Geiger distribution is *not* imposed here. It is measured
afterwards from the downloaded climatology (see ``koppen.py``) and reported, so
the achieved coverage is an observed property of the sample rather than a
target fitted to it.
"""

from __future__ import annotations

import itertools
import math
from collections.abc import Iterator
from dataclasses import asdict, dataclass

import numpy as np
from global_land_mask import globe

# Antarctica and the high Arctic are excluded: ERA5-Land carries no meaningful
# soil moisture over permanent ice, and neither flood nor drought risk is a
# useful product there. This is a scope decision, and it is stated in the
# limitations rather than hidden.
MIN_LATITUDE = -60.0
MAX_LATITUDE = 80.0
BAND_WIDTH_DEG = 10.0

# ERA5 resolves ~25 km. Two sample points closer than this would share a grid
# cell and contribute duplicated rows that inflate apparent sample size.
MIN_SEPARATION_KM = 150.0

# Every band with land gets at least this many points, so no regime rests on a
# single location. Kept low so the land-area weighting still drives most of the
# allocation rather than being flattened by the floor.
MIN_POINTS_PER_BAND = 2

EARTH_RADIUS_KM = 6371.0


@dataclass(frozen=True)
class Location:
    """One sampled study location."""

    location_id: str
    latitude: float
    longitude: float
    band_south: float
    band_north: float

    def as_dict(self) -> dict:
        return asdict(self)


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in kilometres between two coordinates."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = p2 - p1
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def latitude_bands() -> list[tuple[float, float]]:
    """Latitude bands spanning the sampled range, south to north."""
    edges = np.arange(MIN_LATITUDE, MAX_LATITUDE + BAND_WIDTH_DEG, BAND_WIDTH_DEG)
    return [(float(a), float(b)) for a, b in itertools.pairwise(edges)]


def band_land_weights(probe_resolution_deg: float = 0.5) -> dict[tuple[float, float], float]:
    """Measure each band's share of global land area.

    Land *area* rather than land *count* is what matters, so each probe point is
    weighted by cos(latitude) to correct for meridian convergence - without it,
    high-latitude bands would be over-weighted simply because their grid cells
    are narrower on the ground.
    """
    weights: dict[tuple[float, float], float] = {}
    lons = np.arange(-180.0, 180.0, probe_resolution_deg)

    for south, north in latitude_bands():
        lats = np.arange(south, north, probe_resolution_deg)
        area = 0.0
        for lat in lats:
            on_land = globe.is_land(np.full(lons.shape, lat), lons)
            area += float(on_land.sum()) * math.cos(math.radians(float(lat)))
        weights[(south, north)] = area

    total = sum(weights.values())
    if total <= 0:  # pragma: no cover - impossible with a valid land mask
        raise RuntimeError("Land mask returned no land; cannot allocate sample.")
    return {band: area / total for band, area in weights.items()}


def allocate_quota(total: int, weights: dict[tuple[float, float], float]) -> dict[tuple[float, float], int]:
    """Split a sample budget across bands proportionally to land area.

    Bands holding land receive at least ``MIN_POINTS_PER_BAND``; the remainder is
    distributed by largest fractional part so the quotas sum exactly to ``total``.
    """
    populated = {b: w for b, w in weights.items() if w > 0}
    floor_total = MIN_POINTS_PER_BAND * len(populated)
    if floor_total > total:
        raise ValueError(
            f"Sample size {total} cannot give {MIN_POINTS_PER_BAND} points to "
            f"each of {len(populated)} land-bearing bands (needs {floor_total})."
        )

    remaining = total - floor_total
    exact = {b: MIN_POINTS_PER_BAND + w * remaining for b, w in populated.items()}
    quota = {b: math.floor(v) for b, v in exact.items()}

    shortfall = total - sum(quota.values())
    by_fraction = sorted(populated, key=lambda b: exact[b] - math.floor(exact[b]), reverse=True)
    for band in by_fraction[:shortfall]:
        quota[band] += 1
    return quota


def _sample_band(
    south: float,
    north: float,
    count: int,
    rng: np.random.Generator,
    accepted: list[Location],
    max_attempts_per_point: int = 2000,
) -> Iterator[Location]:
    """Draw ``count`` land points inside one band, respecting minimum spacing."""
    placed = 0
    attempts = 0
    while placed < count:
        attempts += 1
        if attempts > count * max_attempts_per_point:
            raise RuntimeError(
                f"Could not place {count} points in band {south}..{north} - "
                "the spacing constraint is too strict for the available land."
            )
        lat = float(rng.uniform(south, north))
        lon = float(rng.uniform(-180.0, 180.0))
        if not bool(globe.is_land(lat, lon)):
            continue
        if any(
            haversine_km(lat, lon, p.latitude, p.longitude) < MIN_SEPARATION_KM
            for p in accepted
        ):
            continue
        loc = Location(
            location_id=f"L{len(accepted):04d}",
            latitude=round(lat, 4),
            longitude=round(lon, 4),
            band_south=south,
            band_north=north,
        )
        accepted.append(loc)
        placed += 1
        yield loc


def sample_locations(n: int = 150, seed: int = 20260910) -> list[Location]:
    """Draw a reproducible stratified random sample of global land locations.

    Args:
        n: Total number of locations.
        seed: RNG seed. Changing it produces a different sample, so it is
            recorded in the run metadata alongside the results.

    Returns:
        Locations ordered south to north.
    """
    rng = np.random.default_rng(seed)
    weights = band_land_weights()
    quota = allocate_quota(n, weights)

    accepted: list[Location] = []
    for band in sorted(quota):
        south, north = band
        list(_sample_band(south, north, quota[band], rng, accepted))
    return accepted


def draw_replacement(
    band: tuple[float, float],
    rng: np.random.Generator,
    accepted: list[Location],
) -> Location:
    """Draw one extra point in ``band``, avoiding everything already accepted.

    Needed because a point can be on land yet still unusable - permanent ice in
    Greenland or Antarctica carries no soil moisture in the land-surface model.
    Such points are rejected at download time and replaced from the same band,
    so the land-area-proportional allocation survives the substitution.
    """
    south, north = band
    return next(iter(_sample_band(south, north, 1, rng, accepted)))
