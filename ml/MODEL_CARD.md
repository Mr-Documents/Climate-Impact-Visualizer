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
| **random_forest** | candidate | **0.2453** ← selected |
| gradient_boosting | candidate | 0.1911 |

**Drought** (validation PR-AUC)

| Model | Tier | PR-AUC |
|---|---|---|
| base_rate | baseline | 0.2351 |
| persistence | baseline | 0.4557 |
| logistic_regression | baseline | 0.6081 |
| **random_forest** | candidate | **0.6238** ← selected |
| gradient_boosting | candidate | 0.6077 |

**Forest sizing.** The random forest is deliberately constrained
(150 trees, `min_samples_leaf=200`, `max_depth=18`). An unconstrained forest
(300 trees, leaf 20) reached depth 34–44 and 2.69 million nodes, producing a
557 MB pair of artefacts that exceeded the 512 MB deployment tier. Constraining
it was measured and found to *improve* validation PR-AUC — flood 0.2288 → 0.2453,
drought 0.6129 → 0.6238 — while shrinking the models 12× to 46.2 MB. The deep
forest was overfitting; the deployment limit and the generalisation gain pointed
the same way.

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
| **PR-AUC** | **0.2441** | **0.5843** |
| ROC-AUC | 0.8908 | 0.8458 |
| Brier | 0.1302 | 0.1452 |
| Precision | 0.2326 | 0.5069 |
| Recall | 0.5458 | 0.7308 |
| F1 | 0.3262 | 0.5986 |
| Threshold | 0.7385 | 0.5391 |
| **vs base rate** | **6.4×** | **3.0×** |

Confusion matrices:

```
FLOOD     TN 75,231   FP 5,779   FN 1,458   TP 1,752
DROUGHT   TN 53,189   FP 12,640  FN 4,787   TP 12,994
```

### Spatial generalisation

| | Mean PR-AUC | SD | Degradation vs temporal |
|---|---|---|---|
| Flood | 0.1410 | 0.0281 | −42% |
| Drought | 0.4983 | 0.0117 | −21% |

Both remain well above their base rates in locations never seen in training, but
performance is **materially worse** than the temporal figures. Quoting only the
temporal numbers as evidence of global generalisation would be misleading.

---

## 8. Feature importance

Permutation importance on the **held-out test set**: the drop in PR-AUC when a
feature's column is shuffled. Impurity-based importance is not used — it is
computed on training data and biased toward high-cardinality continuous
features, which describes nearly every feature here.

**Flood** (top 5 of 29)

| Rank | Feature | PR-AUC drop |
|---|---|---|
| 1 | `soil_anomaly` | 0.0492 |
| 2 | `antecedent_precip_index` | 0.0328 |
| 3 | `precip_3d` | 0.0263 |
| 4 | `precip_1d` | 0.0214 |
| 5 | `consecutive_wet_days` | 0.0192 |

**Drought** (top 5 of 29)

| Rank | Feature | PR-AUC drop |
|---|---|---|
| 1 | `spei_lag1m` | 0.1328 |
| 2 | `precip_30d_anomaly` | 0.1297 |
| 3 | `soil_anomaly` | 0.0439 |
| 4 | `water_balance_30d` | 0.0247 |
| 5 | `water_balance_90d` | 0.0142 |

Anomaly features lead on both targets, which is the empirical case for the
design argument that they carry transferability across climates.

**Pruning, verified by retraining rather than inferred from the ranking.** Six
flood features showed no contribution beyond their own shuffle noise; removing
them gave validation PR-AUC 0.2466 against 0.2453 for the full set — no cost.
For drought, **0 of 29** were insignificant. The full set is retained for both,
since pruning flood buys nothing and consistency between the two models
simplifies serving.

---

## 9. Probability calibration

The dashboard presents these numbers to users as percentages, so they have to
mean what they say.

**Uncalibrated, the models were badly over-confident in every bin:**

| | Model said | Actual rate |
|---|---|---|
| Flood | 75% | 15% |
| Drought | 75% | 48% |

Expected calibration error 0.233 (flood) and 0.150 (drought). The cause is
`class_weight="balanced"`, which improves ranking but inflates minority-class
probabilities.

**Correction.** Platt (sigmoid) scaling, chosen over isotonic on a held-out half
of validation, then fitted by 3-fold cross-validation on all pre-test data
(`ensemble=False`, so one model plus one calibrator). Sigmoid is monotonic, so
PR-AUC is preserved *exactly* — 0.2441 and 0.6303, unchanged.

| | ECE before | After calibration | After recent-window training | Verdict |
|---|---|---|---|---|
| Flood | 0.2329 | **0.0113** | 0.0113 | well calibrated |
| Drought | 0.1497 | 0.1108 | **0.0315** | well calibrated |

Calibration alone did not fix drought — it remained at 0.111, saying 24% where
the observed rate was 56%. Training on a recent window did (§10). **Both targets
now produce probabilities that can be shown to users as stated.**

Two implementation errors were made and caught by measurement, both worth
recording: selecting the calibration method on the same rows it was fitted to
(isotonic scores a meaningless ECE 0.0000 there), and fitting the final model on
train only, which cost 8% test PR-AUC purely by discarding four years of data.

---

## 10. Drought is non-stationary — and that is a finding, not a bug

SPEI is standardised on the 1995–2016 training period. Later years are scored
against that same fitted distribution, so the drought rate should stay near the
15.87% implied by a −1σ threshold. It does not:

| Period | Drought rate | vs stationary expectation |
|---|---|---|
| 1995–2016 (train) | 13.78% | 0.87× |
| 2017–2020 (validation) | 23.28% | **1.47×** |
| 2021–2024 (test) | 21.20% | **1.34×** |

Drought is **34–47% more frequent** in 2017–2024 than the 1995–2016 baseline
implies. This is the signal SPEI was designed to detect, recovered here from 60
globally distributed locations.

It also explains the calibration failure directly: a model trained on a period
with 13.78% drought cannot produce calibrated probabilities for a period with
21.20%, because the class prior it learned no longer holds. **No post-hoc
calibration can fix a shifting base rate** — the correction is fitted on one
prior and applied under another.

### Mitigation: train drought on a recent window

Drought now trains on **2012–2016 only (106,753 rows), with 3-year recency
weighting inside that window**, rather than the full 1995–2016 record. Flood
keeps the full record — its base rate barely drifts, and a window sweep found
every variant within noise (0.2438–0.2487 test PR-AUC).

Measured honestly through the production pipeline — fit on train, select on
validation, test touched once:

| Drought | Full window | Recent window |
|---|---|---|
| Selected model | random_forest | logistic_regression |
| Test PR-AUC | **0.6303** | 0.5843 |
| Test ROC-AUC | 0.8612 | 0.8458 |
| Test ECE | 0.1108 | **0.0315** |

This is a **trade-off, not a free win**: −7.3% ranking for a 3.5× calibration
improvement. It was accepted because at ECE 0.111 the interface could not
honestly display a drought percentage at all, whereas at 0.032 it can, and
ranking remains strong (2.7× the base rate, well clear of the 0.4557
persistence baseline).

### A failed experiment, recorded

`scripts/experiment_rolling_window.py` swept nine training windows and reported
that a recent window improved *both* metrics (test PR-AUC 0.6413, ECE 0.0307).
**That result did not survive honest evaluation.** The script fits each variant
on train+validation and then scores it on validation — rows the model has
already seen — inflating validation PR-AUC to ~0.85 against a true ~0.60, so its
variant selection was unsound. Its test figures are clean, but selecting by them
is test-set selection.

Re-run through the production pipeline, the windowed variant selects a different
algorithm and scores 0.5843, not 0.6413. The script is retained, annotated with
its defect, as the record of an experiment that was wrong and how that was
found.

---

## 11. Error trade-off

Thresholds were tuned toward recall (flood ≥ 0.50, drought ≥ 0.70) on the stated
policy that a missed hazard costs more than a false alarm. This is a value
judgement, not an optimum, and it is the reason precision is low:

- **Flood:** 1,458 missed events, 5,779 false alarms — **3.3 false alarms per
  true event.**
- **Drought:** 4,787 missed, 12,640 false alarms — 1.0 per true event.

A deployment with different costs should retune the threshold; nothing else
needs to change.

---

## 12. Reproducibility

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

## 13. Known limitations

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
9. **Drought trades ranking for calibration.** Training on 2012–2016 rather than
   1995–2016 costs 7.3% test PR-AUC and buys a 3.5× calibration improvement
   (§10). A deployment that only ranks locations, rather than displaying
   probabilities, should prefer the full-window model.
10. **The recent-window drought model uses 106,753 rows**, under a quarter of the
   record, so it is more exposed to whatever happened to occur in 2012–2016 and
   will need periodic retraining as the base rate drifts further.

---

## 14. References

- Vicente-Serrano, Beguería & López-Moreno (2010). *A Multiscalar Drought Index
  Sensitive to Global Warming: SPEI.* J. Climate 23, 1696–1718.
- Peel, Finlayson & McMahon (2007). *Updated world map of the Köppen-Geiger
  climate classification.* HESS 11, 1633–1644.
- WMO (2012). *Standardized Precipitation Index User Guide*, WMO-No. 1090.
- WMO Expert Team on Climate Change Detection and Indices — extreme indices
  (R95p, CDD, CWD).
- Hersbach et al. (2020). *The ERA5 global reanalysis.* QJRMS 146, 1999–2049.
