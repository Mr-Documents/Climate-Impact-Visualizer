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

**The deployed API predicts from today, but was evaluated on 2021-2024.** The
`as_of` field reports the last observation used. Read section 14 on what that
does and does not guarantee.

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

Selected on **6-fold grouped cross-validation PR-AUC**, folds split by location
so every score measures performance on places the model has not seen. Accuracy
is not reported: with a 3.8% positive rate, predicting "no flood" every day
scores 96.2% and is useless.

The single-split validation column is shown beside it because the two disagree,
and that disagreement mattered (§10).

**Flood**

| Model | Tier | Grouped CV PR-AUC | Single-split val |
|---|---|---|---|
| base_rate | baseline | 0.0277 ± 0.0063 | 0.0358 |
| persistence | baseline | 0.0464 ± 0.0140 | 0.0895 |
| logistic_regression | baseline | 0.1298 ± 0.0202 | 0.1292 |
| **random_forest** | candidate | **0.1461 ± 0.0249** ← selected | 0.2453 |
| gradient_boosting | candidate | 0.1306 ± 0.0172 | 0.1911 |

**Drought**

| Model | Tier | Grouped CV PR-AUC | Single-split val |
|---|---|---|---|
| base_rate | baseline | 0.1921 ± 0.0265 | 0.2351 |
| persistence | baseline | 0.3868 ± 0.0217 | 0.4557 |
| logistic_regression | baseline | 0.5521 ± 0.0267 | **0.6073** |
| **random_forest** | candidate | **0.5609 ± 0.0174** ← selected | 0.5951 |
| gradient_boosting | candidate | 0.5379 ± 0.0308 | 0.5395 |

**The drought columns disagree, and the CV column was trusted.** The single
split puts logistic_regression 2% ahead. Per fold, random_forest against
logistic_regression:

| Fold | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| random_forest | **0.5356** | **0.5633** | **0.5662** | **0.5571** | **0.5505** | 0.5929 |
| logistic_regression | 0.5086 | 0.5456 | 0.5552 | 0.5523 | 0.5504 | **0.6005** |

Five of six, with roughly two-thirds the variance (sd 0.0174 against 0.0267).
**Fold 5 is a margin of 0.0001 and should be read as a tie**, so the honest
count is four clear wins, one tie, one loss — a real but not overwhelming edge.
It is stated that way rather than as "5 of 6" because the fold table is in the
report and a reader would find the tie anyway.

Grouped CV was preferred because it is six estimates rather than one, and
because holding out whole locations matches how the service is used — on
coordinates absent from training. The choice was made before test, and test
agreed: the selected model scored 0.6413 against the 0.5843 the single-split
choice had produced.

Grouped CV scores are lower than single-split ones throughout. That is expected
and is the point: predicting an unseen location is harder than predicting an
unseen year at a known location.

`persistence` is a fixed rule with nothing to fit, but it is scored on the *same
folds* as everything else. That matters: an earlier version of the pipeline
compared baselines on the single split against a CV-selected model, and the
mismatch fired a false "no learned model beat the baselines" warning on drought.
Grouped CV is the harder estimate, so scoring the baseline on the easier one
flattered it. Both bases are now consistent, and
`tests/test_baseline_guard.py` locks the behaviour in.

**Forest sizing.** The random forest is deliberately constrained
(150 trees, `min_samples_leaf=200`, `max_depth=18`). An unconstrained forest
(300 trees, leaf 20) reached depth 34–44 and 2.69 million nodes, producing a
557 MB pair of artefacts that exceeded the 512 MB deployment tier. Constraining
it was measured and found to *improve* single-split validation PR-AUC — flood
0.2288 → 0.2453, drought 0.6129 → 0.6238 — while shrinking that pair of
artefacts 12× to 46.2 MB.
The deep forest was overfitting; the deployment limit and the generalisation gain
pointed the same way. The shipped models total **30.4 MB**, smaller again because
drought now trains on a 5-year window (§10).

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
| **PR-AUC** | **0.2441** | **0.6413** |
| ROC-AUC | 0.8908 | 0.8672 |
| Brier | 0.0329 | 0.1155 |
| Precision | 0.2719 | 0.6449 |
| Recall | 0.4156 | 0.4888 |
| F1 | 0.3287 | 0.5561 |
| Threshold | 0.1137 | 0.4547 |
| **vs base rate** | **6.4×** | **3.0×** |

Confusion matrices:

```
FLOOD     TN 77,437   FP 3,573   FN 1,876   TP 1,334
DROUGHT   TN 61,042   FP 4,787   FN 9,089   TP 8,692
```

**The recall policy did not hold on test.** Thresholds were tuned on validation
to reach recall ≥ 0.50 (flood) and ≥ 0.70 (drought), and on validation they did
exactly that — 0.5033 and 0.7016. On test the same thresholds returned 0.4156
and 0.4888. The drought shortfall is large: the model finds under half the
drought months it was tuned to find four-fifths of.

This is reported rather than repaired because repairing it means retuning the
threshold on test, which would invalidate the test set. The cause is the
non-stationarity of §10 — a threshold fixed on one period's score distribution
does not carry a recall guarantee to a later period with a different base rate.
**A recall target tuned on held-out data is an estimate, not a contract**, and a
deployment that needs a genuine recall floor must retune on recent data and
monitor continuously.

### Spatial generalisation

| | Mean PR-AUC | SD | Degradation vs temporal |
|---|---|---|---|
| Flood | 0.1410 | 0.0281 | −42% |
| Drought | 0.4983 | 0.0117 | −22% |

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
| 1 | `spei_lag1m` | 0.1268 |
| 2 | `precip_30d_anomaly` | 0.0982 |
| 3 | `soil_anomaly` | 0.0338 |
| 4 | `water_balance_30d` | 0.0231 |
| 5 | `water_balance_90d` | 0.0184 |

Anomaly features lead on both targets, which is the empirical case for the
design argument that they carry transferability across climates.

**Pruning, verified by retraining rather than inferred from the ranking.**
Six flood features and four drought features contributed no more than their own
shuffle noise. On the single validation split, removing them appeared to *help* —
flood 0.2466 against 0.2453, and drought 0.6249 against 0.5951, a 5% gain that
would be worth acting on.

It does not survive grouped cross-validation
(`scripts/experiment_pruning.py`, `reports/pruning_experiment.json`):

| | Full 29 | Pruned | Δ | Folds won by pruned |
|---|---|---|---|---|
| Flood | 0.1461 ± 0.0249 | 0.1446 ± 0.0242 (23) | −0.0015 | 1 of 6 |
| Drought | 0.5609 ± 0.0174 | 0.5625 ± 0.0192 (25) | **+0.0016** | 3 of 6 |

Drought's apparent +0.0298 is +0.0016 when whole locations are held out, and the
pruned set wins three folds of six — a coin flip. **The full 29 features are
retained**, and the conclusion now rests on the same evidence that decided model
selection rather than on the single split that had already misled us once (§7).

This is the second time in this project a single-split result reversed under
grouped CV. The measurement is reported because "we used 29 features" should be
a finding, not an assumption — and because the finding was nearly the wrong one.

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
PR-AUC is preserved *exactly* — 0.2441 and 0.6413, unchanged.

| | ECE before | After calibration | After recent-window training | Verdict |
|---|---|---|---|---|
| Flood | 0.2329 | **0.0113** | 0.0113 | well calibrated |
| Drought | 0.1497 | 0.1108 | **0.0307** | well calibrated |

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

Measured honestly through the production pipeline — fit on train, select by
grouped cross-validation, test touched once:

| Drought | Full window | Recent window |
|---|---|---|
| Test PR-AUC | 0.6303 | **0.6413** |
| Test ROC-AUC | 0.8612 | **0.8672** |
| Test ECE | 0.1108 | **0.0307** |

The recent window is **better on every metric** — there is no trade-off.

Reaching that required fixing how candidates are selected. A first attempt chose
logistic_regression on the recent window and scored 0.5843, which looked like a
7.3% ranking cost for the calibration gain. The cause was the selection method,
not the window: a single 4-year validation split put logistic_regression 2%
ahead (0.6073 vs 0.5951), whereas 6-fold grouped cross-validation with whole
locations held out put random_forest ahead in five of six folds with lower
variance (0.5609 +/- 0.0174 against 0.5521 +/- 0.0267).

Selection now uses grouped CV over train+validation. The single split was one
noisy sample; holding locations out also matches how the model is used, on
places it has never seen. The test split took no part in this decision.

### A failed experiment, recorded

`scripts/experiment_rolling_window.py` swept nine training windows and reported
that a recent window improved *both* metrics (test PR-AUC 0.6413, ECE 0.0307).
**Its selection procedure is unsound and its validation numbers must not be
trusted.** Each variant is fitted on train+validation and then scored on
validation — rows the model has already seen — inflating validation PR-AUC to
~0.85 against a true ~0.60. Its test figures are clean, but choosing a variant by
them would be test-set selection.

The production pipeline now reproduces those exact figures, which is a
coincidence and not a vindication: a contaminated selection arriving at the same
answer is luck, and an earlier production run of the same window scored 0.5843
because it selected a different algorithm (§10 above). The conclusion is
supported by `scripts/train.py`, which selects on grouped cross-validation and
touches test once. The script is retained, annotated with its defect, as the
record of a measurement that happened to be right for unsound reasons.

---

## 11. Error trade-off

Thresholds were tuned toward recall (flood ≥ 0.50, drought ≥ 0.70) on the stated
policy that a missed hazard costs more than a false alarm. This is a value
judgement, not an optimum, and it is the reason flood precision is low (0.27;
drought reaches 0.64):

- **Flood:** 1,876 missed events, 3,573 false alarms — **2.7 false alarms per
  true event**, and more events missed than caught.
- **Drought:** 9,089 missed, 4,787 false alarms — 0.55 per true event.

Note that the realised balance is not the one the policy intended: on test both
models miss more than they were tuned to, drought especially (see §7). The
thresholds encode the intended preference; the test period did not honour it.

A deployment with different costs should retune the threshold; nothing else
needs to change.

---

## 12. Reproducibility

```
python scripts/sample_locations.py       # deterministic under SAMPLE_SEED
python scripts/download_climate_data.py  # not needed: data/raw is committed
python scripts/train.py                  # ~20 min
```

Environment: Python 3.14.7, scikit-learn 1.9.0, pandas 3.0.5, numpy 2.5.3.
Exact versions in `requirements-lock.txt`. Random seed 42; sampling seed
20260910.

**All 60 raw parquet files are committed** (12 MB, 657k rows), along with
`data/processed/locations.csv`, which defines the sample. This is deliberate:
re-acquiring the data costs roughly 47,000 weighted Open-Meteo calls against a
10,000/day free quota — about 4.7 days — which is also why training cannot run
as a deployment build step, and why `models/` is committed too.

**Reproducible to floating-point noise, not bit-identical.** Retraining from the
committed data reproduces every reported metric and both decision thresholds
exactly, but the serialised model files differ byte-for-byte between runs.
Predictions agree to ~4×10⁻¹⁶ — double-precision epsilon. The cause is
`n_jobs=-1`: parallel reductions sum in whatever order threads finish, and
floating-point addition is not associative. Setting `n_jobs=1` would restore
bit-identical artefacts at a large cost in training time. Verify a retrain by
comparing metrics, not checksums.

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
5. **Spatial degradation is significant** (−42% flood, −22% drought).
6. **No validation against observed flood events.** Comparing flagged days
   against the Dartmouth Flood Observatory catalogue would turn the proxy from
   an assumption into a tested claim. Not done; the clearest next step.
7. **The recall targets are not met on the test period** (§7): flood 0.42
   against a 0.50 target, drought 0.49 against 0.70. Thresholds tuned on one
   period do not carry a recall guarantee to another.
8. **Latitude is a feature**, so the model can in principle key on hemisphere
   rather than physics. The spatial holdout bounds how much this matters but
   does not eliminate it.
9. **The drought model uses 106,753 rows**, under a quarter of the record, so it
   is more exposed to whatever happened to occur in 2012–2016 and will need
   periodic retraining as the base rate drifts further.
10. **Model selection is sensitive to the evaluation split.** A single 4-year
   validation split and 6-fold grouped CV disagreed on the drought algorithm,
   and the difference on test was 9.8%. Reported results use grouped CV; a
   reader should treat any single-split comparison in this domain with caution.
11. **The service runs outside its evaluated period.** Predictions are made
   from the present day; every reported metric comes from 2021-2024. Given the
   non-stationarity in §10, the calibration is the figure most likely to have
   drifted. See section 14.

---

## 14. Serving window: predicting the present

The service requests climate data up to **today** and predicts forward from it:
flood over the next 3 days, drought about 30 days ahead. Training requests a
fixed window ending at `config.END_DATE` so every result in this document stays
reproducible.

This was not always true. The first deployed version requested the training
window at serving time too, so every response carried `as_of 2024-12-31` and a
given coordinate returned the same answer forever.

### Why extending the window is safe

The concern is real: if extending the record refitted the SPEI reference
distribution or the R95p threshold, the served model would score against a
target quietly different from the evaluated one, and the calibration in §9 would
no longer apply.

It does not, because every fitted statistic is masked by **year**, not by
"whatever record was supplied":

```python
split[years <= config.TRAIN_END_YEAR] = SPLIT_TRAIN
monthly_train = month_periods.dt.year <= config.TRAIN_END_YEAR
```

Measured rather than assumed. Assembling one location's record truncated at
2020-12-31, against the same location's full record through 2024-12-31:

| Quantity | Result |
|---|---|
| All 29 model features | **bit-identical** |
| `spei_lag1m`, `r95p_mm` | **bit-identical** |
| `y_flood` | differs on exactly the last **3** days (its horizon) |
| `y_drought` | differs on exactly the last **30** days (its horizon) |
| Labels that *changed value* | **0** — every difference is NaN becoming defined |

The tail differences are correct: a forward-looking label is undefined until the
days it looks ahead to exist. Inference computes no labels at all.
`tests/test_serving_window.py` asserts all of this, and was verified to fail
when the year mask is replaced with a whole-record fit.

### What this does not fix

1. **The model never sees a weather forecast.** Every feature is a past
   observation. The 3-day flood output says "the ground is primed and the recent
   pattern is wet", not "rain is forecast on Tuesday". For short horizons a
   numerical weather prediction model has information this one does not, and
   should be expected to beat it. Drought at 30 days is where antecedent state
   carries more weight than short-range NWP.
2. **Serving now runs outside the evaluated period.** Every metric here comes
   from 2021-2024. Predictions made in 2026 extrapolate two years beyond that.
3. **Calibration is the figure most at risk.** §10 found drought 34-47% more
   frequent in 2017-2024 than the 1995-2016 baseline implies, and the drought
   model trains on 2012-2016 precisely to cope. Serving in 2026 is a decade past
   that window, so the measured ECE of 0.0307 is **not re-verified for the
   serving period**. Treat the probabilities as sound for ranking and
   comparison; treat the exact percentage with more caution than §9 alone
   suggests.
4. **Recent days are preliminary.** The most recent entries come from ERA5T
   rather than final ERA5 and are revised later. This is the same data
   operational drought and flood monitors use, but a prediction made today may
   not reproduce exactly once those days are finalised.

The honest summary: the service predicts the present, and its ranking should
hold. Its calibration was measured on a period that has since moved.

---

## 15. References

- Vicente-Serrano, Beguería & López-Moreno (2010). *A Multiscalar Drought Index
  Sensitive to Global Warming: SPEI.* J. Climate 23, 1696–1718.
- Peel, Finlayson & McMahon (2007). *Updated world map of the Köppen-Geiger
  climate classification.* HESS 11, 1633–1644.
- WMO (2012). *Standardized Precipitation Index User Guide*, WMO-No. 1090.
- WMO Expert Team on Climate Change Detection and Indices — extreme indices
  (R95p, CDD, CWD).
- Hersbach et al. (2020). *The ERA5 global reanalysis.* QJRMS 146, 1999–2049.
