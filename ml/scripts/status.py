r"""Report download progress at a glance.

Run:  .\.venv\Scripts\python.exe scripts\status.py

Reads the cache directory directly, so it is accurate whether or not a download
is currently running, and safe to run at any time - it never writes anything.
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from climate_ml import config

BAR_WIDTH = 40


def main() -> int:
    files = sorted(config.RAW_DIR.glob("*.parquet"), key=lambda p: p.stat().st_mtime)
    done = len(files)
    total = config.N_LOCATIONS
    remaining = max(0, total - done)

    filled = round(BAR_WIDTH * done / total) if total else 0
    bar = "#" * filled + "." * (BAR_WIDTH - filled)
    print(f"\n  [{bar}] {done}/{total}  ({100 * done / total:.0f}%)")

    if not files:
        print("\n  Nothing downloaded yet. Start with:")
        print("    .\\.venv\\Scripts\\python.exe scripts\\download_climate_data.py --budget 9400\n")
        return 0

    newest = datetime.fromtimestamp(files[-1].stat().st_mtime).astimezone()
    oldest = datetime.fromtimestamp(files[0].stat().st_mtime).astimezone()
    print(f"  latest    {files[-1].stem} at {newest:%d %b %H:%M}")

    # Throughput is quota-limited rather than bandwidth-limited, so the daily
    # cap is a better estimator than the observed rate once a run stalls.
    per_day = 10000 / ((10958 / 14) * max(1.0, len(config.DAILY_VARIABLES) / 10))
    if remaining:
        days = remaining / per_day
        finish = datetime.now().astimezone() + timedelta(days=days)
        print(f"  remaining {remaining} locations")
        print(f"  estimate  ~{days:.1f} days at the free-tier quota (~{per_day:.0f}/day)")
        print(f"            i.e. around {finish:%d %b}")
    else:
        elapsed = newest - oldest
        print(f"  COMPLETE - all {total} locations downloaded over {elapsed.days}d "
              f"{elapsed.seconds // 3600}h")
        print("\n  Next:  .\\.venv\\Scripts\\python.exe scripts\\train.py\n")
        return 0

    manifest = config.PROCESSED_DIR / "acquisition_manifest.csv"
    if manifest.exists():
        import pandas as pd

        rejected = pd.read_csv(manifest).query("status == 'rejected'")
        if len(rejected):
            print(f"  rejected  {len(rejected)} location(s) replaced (unusable, e.g. permanent ice)")

    print("\n  To continue:")
    print("    .\\.venv\\Scripts\\python.exe scripts\\download_climate_data.py --budget 9400\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
