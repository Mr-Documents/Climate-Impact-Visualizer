# Model Card: Flood and Drought Risk Classifiers

**Version** 1.0 · **Trained** 12 September 2026 · **Status** research / decision support

Two independent binary classifiers estimating flood-generating conditions and
meteorological drought from climate reanalysis. Built as the machine-learning
component of the Climate Impact Visualizer final-year project.

Every figure below was produced by `scripts/train.py` and is recorded in
`reports/training_report.json`. Nothing is estimated or rounded up.

---

## 1. Intended use

**In scope.** Indicative, location-general risk assessment for a visualisation
and decision-support tool. Land coordinates between 60°S and 80°N.

**Out of scope — do not use for:**

- operational flood or drought warning, or any decision where a missed event
  causes harm;
- coordinates over ocean, permanent ice, or outside 60°S–80°N (the API refuses
  these rather than extrapolating);
- any claim that a *flood* will occur. See §4.

This is not a disaster warning service. It complements operational numerical
weather prediction; it does not replace it.

---

## 2. Data

| | |
|---|---|
| Source | ECMWF ERA5 / ERA5-Land reanalysis, via the Open-Meteo archive API |
| Period | 1995-01-01 to 2024-12-31 (30 years, daily) |
| Locations | 60, stratified random over global land |
| Rows | 657,480 (10,958 per location) |
| Missing values | 0 |
| Variables | precipitation, temperature (mean/max/min), relative humidity, wind speed, reference evapotranspiration (FAO-56), soil moisture 0–7 cm |

### Location sampling

Locations were drawn by a reproducible stratified random procedure
(`src/climate_ml/data/locations.py`), not chosen by hand:

1. Land surface partitioned into 10° latitude bands.
2. Each band's land area measured directly from a land mask, cosine-weighted for
   meridian convergence.
3. Sample budget allocated proportionally to land area, with a floor of 2 per
   band so no regime is unrepresented.
4. Points drawn uniformly at random within each band, rejected if over water or
   within 150 km of an accepted point (ERA5 resolves ~25 km, so closer points
   would duplicate rows).
5. Fixed seed (`20260910`).

Hand-picking cities would bias the sample toward populated, well-documented
places and toward whichever climates the author happened to consider.

### Achieved climate coverage

Measured *from the downloaded data* using the Köppen-Geiger criteria of Peel,
Finlayson & McMahon (2007) — an observed property of the sample, not a target
fitted to it. 17 classes across 60 locations:

```
BWh 13   Aw 6   Cfb 5   Dfc 5   ET 5   Af 4   Cfc 3   BSh 3   BSk 3
Dwc 3    Cfa 2  Am 2    Dfb 2   Dsb 1  Dsa 1  BWk 1   Dfa 1
```

Hot desert through tundra; tropical rainforest through subarctic.

---

## 3. Targets

Both labels are **strictly forward-looking** and cannot be computed from any
feature. Features describe the past up to day *t*; labels describe the future
after *t*. This separation is what makes the task genuine prediction rather than
re-deriving a rule the model already receives as input.

### Drought — SPEI-3

Standardised Precipitation-Evapotranspiration Index at 3-month accumulation,
per Vicente-Serrano, Beguería & López-Moreno (2010). The climatic water balance
`P − ET₀` is standardised against each location's own distribution, fitted per
calendar month.

**Label:** 1 if SPEI-3 ≤ −1.0 (moderate drought or worse, the published class
boundary) about 30 days ahead.

**Method note.** The published log-logistic fit was measured and rejected for
this record length. With ~22 training years the estimated shape parameter ranged
from 3.8 to 75.4 across calendar months and the index had standard deviation
1.256 rather than the 1.0 SPEI is defined to have. Four variants were compared
on identical data:

| Variant | mean | std (target 1.0) |
|---|---|---|
| per-month parametric | +0.069 | 1.256 |
| **per-month empirical** | −0.000 | **0.957** |
| pooled ±1 month, parametric | −0.001 | 0.749 |
| pooled ±1 month, empirical | −0.024 | 0.687 |

The distribution-free transform is used below 30 samples per month. **Cost:** an
empirical transform is bounded by its reference sample, so SPEI ≤ −2.0
("extreme drought") is **not reliably resolvable** on a 30-year record. The
binary target sits at −1.0, comfortably inside range.

### Flood — extreme rainfall on saturated ground

```
label = 1 if, within the next 3 days:
          daily precipitation ≥ R95p   (that location's 95th percentile of wet-day rainfall)
          AND antecedent soil moisture > its seasonal median
```

R95p follows the WMO Expert Team on Climate Change Detection and Indices. Being
a per-location percentile it transfers across climates without tuning: 30 mm is
unremarkable in Manila and exceptional in Phoenix.

Both conditions are evaluated *inside the future window* — the soil term reads
the day before each candidate rainfall day. An earlier design conditioned on
soil moisture at the prediction origin, which is also a model feature, letting
the model compute part of its own target.

---

## 4. The most important limitation

**The flood model does not predict floods.** It predicts *flood-generating
hydrometeorological conditions*. Terrain, slope, drainage area, river networks,
land cover, urban imperviousness and flood defences are all absent, and they are
first-order controls on whether rainfall becomes a flood. Identical rainfall
floods one location and not another; nothing in this dataset distinguishes them.

Stating this as "flood prediction" would be scientifically indefensible.

---

## 5. Features

29 features, all computed from windows **ending** at the prediction origin.

| Group | Features |
|---|---|
| Accumulation | rolling precipitation at 1, 3, 7, 30, 90, 180 days; max 1-day in 7d and 30d |
| Water balance | P − ET₀ at 30/90/180 days; ET₀ 30-day total |
| Antecedent state | soil moisture, 7- and 30-day change, 30-day mean, antecedent precipitation index (0.9 daily decay) |
| Spell structure | consecutive dry days, consecutive wet days, wet days in 30d (ETCCDI CDD/CWD) |
| Anomaly | precipitation, temperature and soil-moisture departures from day-of-year climatology |
| Drought state | `spei_lag1m` — SPEI of the last *complete* month |
| Context | day-of-year as sin/cos, latitude, elevation, temperature |

Anomalies are what make the model transferable: 20 mm is a wet day in Phoenix
and a dry one in Singapore, but "two standard deviations above normal for this
date" means the same thing everywhere.

---

## 6. Leakage control

Every statistic — day-of-year climatologies, SPEI distributions, R95p
thresholds, imputation medians — is fitted on the **training period only**
(1995–2016) and applied unchanged thereafter.

Two automated tests enforce this rather than asserting it:

- corrupting the last 500 days of a record leaves every earlier feature
  **bit-identical**;
- corrupting the test period leaves training-period SPEI **unchanged**.

### A leak that was found and fixed

An earlier version exposed `spei_now`: the SPEI of the month *containing* `t`.
That month is unfinished on day `t`, so its value depends on days after `t`.
It was used as the persistence baseline, inflating it from **0.4557 to 0.6778**
— 49% — and making a working drought model appear to lose. Replacing it with
`spei_lag1m` (last complete month) moved the model from **−0.013 behind** to
**+0.157 ahead** of the baseline. The model never changed; only the honesty of
the comparison did.

---

## 7. Evaluation

### Splits

```
TEMPORAL   train 1995-2016 (22y) · validation 2017-2020 (4y) · test 2021-2024 (4y)
SPATIAL    6-fold grouped CV, whole locations withheld from training
```

The test set was used exactly once, after model selection. The decision
threshold was tuned on validation and applied unchanged.

### Model selection

Selected on validation PR-AUC. Accuracy is not reported: with a 3.8% positive
rate, predicting "no flood" every day scores 96.2% and is useless.

**Flood** (validation PR-AUC)

| Model | Tier | PR-AUC |
|---|---|---|
| base_rate | baseline | 0.0358 |
| persistence | baseline | 0.0895 |
| logistic_regression | baseline | 0.1292 |
| **random_forest** | candidate | **0.2288** ← selected |
| gradient_boosting | candidate | 0.1911 |

**Drought** (validation PR-AUC)

| Model | Tier | PR-AUC |
|---|---|---|
| base_rate | baseline | 0.2351 |
| persistence | baseline | 0.4557 |
| logistic_regression | baseline | 0.6081 |
| **random_forest** | candidate | **0.6129** ← selected |
| gradient_boosting | candidate | 0.6077 |

Gradient boosting lost on both targets, contrary to the expectation stated in
advance. No sequence model was trained: with rolling accumulations and anomalies
computed explicitly, most temporal structure is already in the feature vector,
and no candidate justified the added complexity. TensorFlow is therefore absent
from the production dependency list.

### Held-out test results

| | Flood | Drought |
|---|---|---|
| n | 84,220 | 83,610 |
| positives | 3,210 (3.81%) | 17,781 (21.27%) |
| **PR-AUC** | **0.2447** | **0.6475** |
| ROC-AUC | 0.8902 | 0.8659 |
| Brier | 0.0575 | 0.1192 |
| Precision | 0.2174 | 0.5035 |
| Recall | 0.6006 | 0.7532 |
| F1 | 0.3193 | 0.6035 |
| Threshold | 0.4123 | 0.3696 |
| **vs base rate** | **6.4×** | **3.0×** |

Confusion matrices:

```
FLOOD     TN 74,070   FP 6,940   FN 1,282   TP 1,928
DROUGHT   TN 52,623   FP 13,206  FN 4,389   TP 13,392
```

### Spatial generalisation

| | Mean PR-AUC | SD | Degradation vs temporal |
|---|---|---|---|
| Flood | 0.1410 | 0.0281 | −42% |
| Drought | 0.4983 | 0.0117 | −23% |

Both remain well above their base rates in locations never seen in training, but
performance is **materially worse** than the temporal figures. Quoting only the
temporal numbers as evidence of global generalisation would be misleading.

---

## 8. Error trade-off

Thresholds were tuned toward recall (flood ≥ 0.50, drought ≥ 0.70) on the stated
policy that a missed hazard costs more than a false alarm. This is a value
judgement, not an optimum, and it is the reason precision is low:

- **Flood:** 1,282 missed events, 6,940 false alarms — **3.6 false alarms per
  true event.**
- **Drought:** 4,389 missed, 13,206 false alarms — 1.0 per true event.

A deployment with different costs should retune the threshold; nothing else
needs to change.

---

## 9. Reproducibility

```
python scripts/sample_locations.py       # deterministic under SAMPLE_SEED
python scripts/download_climate_data.py  # resumable; ~26h against the free quota
python scripts/train.py                  # ~15 min
```

Environment: Python 3.14.7, scikit-learn 1.9.0, pandas 3.0.5, numpy 2.5.3.
Exact versions in `requirements-lock.txt`. Random seed 42; sampling seed
20260910.

Raw data is not committed (657k rows) but is fully reproducible from the
scripts. `data/processed/locations.csv` **is** committed, since it defines the
sample.

---

## 10. Known limitations

1. **Reanalysis is modelled, not measured.** ERA5 assimilates observations into
   a physics model on a ~25 km grid and smooths convective rainfall peaks, so
   extreme daily totals are systematically understated relative to a gauge.
2. **The flood target is a proxy** for conditions, not an observation of
   flooding (§4).
3. **30 years is short for SPEI.** WMO recommends ≥30; the training block holds
   22, which forced the distribution-free transform and makes SPEI ≤ −2.0
   unresolvable. A consequence of the API quota limiting acquisition.
4. **60 point locations are not a gridded product.** They characterise climate
   regimes; they do not make this spatially continuous.
5. **Spatial degradation is significant** (−42% flood, −23% drought).
6. **No validation against observed flood events.** Comparing flagged days
   against the Dartmouth Flood Observatory catalogue would turn the proxy from
   an assumption into a tested claim. Not done; the clearest next step.
7. **Calibration is untested beyond the Brier score.** Probabilities are shown
   to users as percentages and deserve a reliability analysis.
8. **Latitude is a feature**, so the model can in principle key on hemisphere
   rather than physics. The spatial holdout bounds how much this matters but
   does not eliminate it.

---

## 11. References

- Vicente-Serrano, Beguería & López-Moreno (2010). *A Multiscalar Drought Index
  Sensitive to Global Warming: SPEI.* J. Climate 23, 1696–1718.
- Peel, Finlayson & McMahon (2007). *Updated world map of the Köppen-Geiger
  climate classification.* HESS 11, 1633–1644.
- WMO (2012). *Standardized Precipitation Index User Guide*, WMO-No. 1090.
- WMO Expert Team on Climate Change Detection and Indices — extreme indices
  (R95p, CDD, CWD).
- Hersbach et al. (2020). *The ERA5 global reanalysis.* QJRMS 146, 1999–2049.
