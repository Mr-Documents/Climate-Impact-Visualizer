# Climate Risk ML

Flood and drought risk classifiers for the Climate Impact Visualizer, trained on
30 years of ERA5 reanalysis across 60 globally stratified locations.

Read [`MODEL_CARD.md`](MODEL_CARD.md) for methodology, measured results and
limitations. This file covers how to run things.

---

## Quick start

```bash
cd ml
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements-dev.txt   # Windows
# source .venv/bin/activate && pip install -r requirements-dev.txt  # Unix

pytest                          # 152 tests
uvicorn climate_ml.api.service:app --app-dir src --port 8000
```

The trained models are committed, so the service runs immediately without
retraining.

---

## Layout

```
ml/
├── src/climate_ml/
│   ├── config.py            every tunable that affects a result
│   ├── data/
│   │   ├── locations.py     stratified random sampling of global land
│   │   ├── openmeteo.py     resumable, validated acquisition
│   │   ├── koppen.py        climate classification (for measuring coverage)
│   │   └── assemble.py      features + labels + splits
│   ├── features/build.py    29 backward-looking features
│   ├── labels/
│   │   ├── drought.py       SPEI-3
│   │   └── flood.py         R95p on saturated ground
│   ├── models/candidates.py baselines and candidates
│   ├── evaluation/metrics.py PR-AUC, calibration, error costs
│   └── api/                 FastAPI service
├── scripts/                 sample_locations, download, train, status
├── tests/                   152 tests
├── data/raw/                60 locations, committed (12 MB)
├── models/                  trained artefacts, committed (30 MB)
└── reports/                 training_report.json — the record of what was measured
```

---

## Reproducing the pipeline

```bash
python scripts/sample_locations.py       # deterministic under SAMPLE_SEED
python scripts/download_climate_data.py  # only if data/raw is empty (~4.7 days)
python scripts/train.py                  # ~20 minutes
python scripts/analyse_models.py         # importance, calibration, pruning
python scripts/experiment_pruning.py     # grouped-CV pruning check
python scripts/status.py                 # download progress
```

`data/raw/` is committed precisely so the download can be skipped. Regenerating
it costs roughly 47,000 weighted API calls against a 10,000/day free quota —
about 4.7 days. This is also why training cannot run as a deployment build step,
and why `models/` is committed too.

Determinism: sampling seed `20260910`, model seed `42`. Re-running
`sample_locations.py` reproduces the identical 60 locations.

Retraining reproduces every reported metric and both thresholds exactly, but the
model files are **not** byte-identical between runs — `n_jobs=-1` makes parallel
float reductions order-dependent, so predictions differ by ~4e-16. Check a
retrain against `reports/training_report.json`, not against checksums.

---

## The design rule that matters

**Inference calls the same feature code as training.** `api/inference.py` calls
`assemble_location` — the function `train.py` uses, not a reimplementation.

This is deliberate. The JavaScript system this replaces computed features one
way in training and another at serving time; the two drifted until the model
returned a constant answer for every location on Earth. A shared code path makes
that class of bug impossible rather than merely unlikely.

Two tests enforce the related leakage guarantee: corrupting the last 500 days of
a record leaves every earlier feature bit-identical, and corrupting the test
period leaves training-period SPEI unchanged.

---

## API

| Endpoint | Purpose |
|---|---|
| `GET /health` | liveness and model availability |
| `POST /predict` | `{latitude, longitude}` → both hazards |

```bash
curl -X POST localhost:8000/predict \
  -H 'Content-Type: application/json' \
  -d '{"latitude":5.56,"longitude":-0.20}'
```

Returns calibrated probabilities, display bands, operating thresholds, the
model version, what each probability means, and a disclaimer that flood output
describes *conditions* rather than observed flooding.

| Status | Meaning |
|---|---|
| 200 | prediction |
| 422 | invalid coordinates, or outside 60°S–80°N, or ocean/ice |
| 503 | models or upstream climate data unavailable |
| 500 | unexpected — generic body, nothing internal leaked |

**Cold start** for a coordinate never seen before is ~4 s and fetches 30 years
of history (~783 weighted API calls). Results are cached per coordinate rounded
to 2 dp (~1 km), so repeat requests are ~0.3 s. The free quota allows roughly
12 new locations per day.

---

## Deployment

`render.yaml` configures the service. It is internal: Express stays the single
public API, so its CORS allowlist, rate limiting and Supabase logging continue
to apply. Set `ML_SERVICE_URL` on the Node service to this service's address.

| | |
|---|---|
| Memory | ~150–200 MB resident, fits the 512 MB free tier |
| Models | 30.4 MB on disk |
| TensorFlow | **not installed** — no candidate justified it |
| Workers | 1 (each loads its own copy of both models) |

---

## Environment variables

| Variable | Where | Default | Purpose |
|---|---|---|---|
| `ML_SERVICE_URL` | Node | `http://127.0.0.1:8000` | address of this service |
| `ML_TIMEOUT_MS` | Node | `45000` | must exceed a cold start |
| `LOG_LEVEL` | Python | `INFO` | |
| `CLIMATE_ML_REQUEST_PAUSE_S` | Python | `2.0` | pause between acquisition requests |

No credentials are needed: the Open-Meteo archive requires no API key for
non-commercial use.
