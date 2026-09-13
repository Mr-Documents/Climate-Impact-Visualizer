"""The prediction service must not import the global land mask.

``global_land_mask`` materialises a 21600x43200 boolean array - 933 MB resident
- at import time. It is needed only to sample training locations.

This was not a hypothetical. ``openmeteo.py`` imports the ``Location`` dataclass
from ``locations.py``, and ``locations.py`` imported the mask at module level,
so the mask was pulled into the API process transitively. The service used
1166 MB and was OOM-killed by Render's 512 MB tier before it could bind a port:
the deploy log showed "No open ports detected" followed by "Out of memory (used
over 512Mi)". With the import deferred the service peaks at ~262 MB.

The import must be checked in a SUBPROCESS. Inside the main pytest process
another test may already have imported the mask, which would make the assertion
pass or fail for reasons unrelated to the service's own import graph.
"""

from __future__ import annotations

import subprocess
import sys
import textwrap
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "src"


def _run(code: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "-c", textwrap.dedent(code)],
        capture_output=True, text=True, timeout=300, check=False,
        cwd=str(SRC.parent),
    )


def test_api_import_does_not_load_the_land_mask():
    result = _run(f"""
        import sys
        sys.path.insert(0, {str(SRC)!r})
        import climate_ml.api.service  # noqa: F401
        loaded = "global_land_mask" in sys.modules
        print("LOADED" if loaded else "NOT_LOADED")
    """)
    assert result.returncode == 0, f"import failed:\n{result.stderr}"
    assert "NOT_LOADED" in result.stdout, (
        "climate_ml.api.service pulled in global_land_mask, which costs 933 MB "
        "and will OOM the 512 MB deployment tier. Something re-added a "
        "module-level 'from global_land_mask import globe'."
    )


def test_importing_location_dataclass_does_not_load_the_land_mask():
    """The specific path that caused the outage: openmeteo -> locations."""
    result = _run(f"""
        import sys
        sys.path.insert(0, {str(SRC)!r})
        from climate_ml.data.openmeteo import load_all  # noqa: F401
        from climate_ml.data.locations import Location  # noqa: F401
        print("LOADED" if "global_land_mask" in sys.modules else "NOT_LOADED")
    """)
    assert result.returncode == 0, f"import failed:\n{result.stderr}"
    assert "NOT_LOADED" in result.stdout, (
        "importing Location loaded the land mask; the import in locations.py "
        "must stay inside _globe()"
    )


def test_sampling_still_works_with_the_deferred_import():
    """Deferring the import must not break the code that genuinely needs it."""
    result = _run(f"""
        import sys
        sys.path.insert(0, {str(SRC)!r})
        from climate_ml.data.locations import _globe
        globe = _globe()
        print("LAND" if bool(globe.is_land(5.56, -0.20)) else "WATER")
        print("OCEAN_OK" if not bool(globe.is_land(0.0, -30.0)) else "OCEAN_BAD")
        print("MASK_LOADED" if "global_land_mask" in sys.modules else "MASK_MISSING")
    """)
    assert result.returncode == 0, f"sampling import failed:\n{result.stderr}"
    assert "LAND" in result.stdout, "Accra should be land"
    assert "OCEAN_OK" in result.stdout, "mid-Atlantic should be ocean"
    assert "MASK_LOADED" in result.stdout, "_globe() must actually load the mask"
