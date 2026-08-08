/**
 * Trains the climate forecasting LSTM.
 *
 * Unlike the previous classifier, this model does NOT predict a risk class.
 * Risk classes were hand-written threshold rules over the same features fed in,
 * so the network could only re-derive a rule we already knew and any accuracy
 * figure was circular. Instead this model forecasts two physically measurable
 * quantities 24 hours ahead:
 *
 *   target[0] = soil moisture (m^3/m^3) at t + 24h
 *   target[1] = total precipitation (mm) accumulated over t+1 .. t+24
 *
 * Both have real ground truth in the historical record, so validation RMSE is
 * an honest number and can be compared against a persistence baseline.
 * riskIndex.js then converts the forecast into Low/Medium/High via a documented,
 * explainable formula.
 *
 * Run: node trainForecastModel.js
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- 0. FIX TENSORFLOW NATIVE LOADING ON WINDOWS ---
if (process.platform === 'win32') {
  const tfDllPath = path.join(__dirname, 'node_modules', '@tensorflow', 'tfjs-node', 'deps', 'lib');
  if (fs.existsSync(tfDllPath) && !process.env.PATH.includes(tfDllPath)) {
    process.env.PATH = `${process.env.PATH}${path.delimiter}${tfDllPath}`;
  }
}

// tfjs-node calls util.isArray / util.isNullOrUndefined, removed in Node 23.
import util from 'util';
if (typeof util.isArray !== 'function') util.isArray = Array.isArray;
if (typeof util.isNullOrUndefined !== 'function') util.isNullOrUndefined = (v) => v === null || v === undefined;

const tf = await import('@tensorflow/tfjs-node');

// --- 1. CONFIGURATION ---
const TIME_STEPS = 24;   // hours of history fed to the LSTM
const HORIZON = 24;      // hours ahead we forecast
const STRIDE = 6;        // sample a sequence every N hours (bounds memory)
const TRAIN_SPLIT = 0.8; // chronological, applied per city
const EPOCHS = 20;
const BATCH_SIZE = 256;
const LEARNING_RATE = 0.001;

// Encoding is shared with prediction.js so the two can never drift apart.
import { FEATURE_NAMES, NUM_FEATURES, BASEL_VPD_HPA_TO_KPA, encodeFeatures } from './features.js';

// --- 2. CSV LOADING ---
function loadCsv(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean);
  const header = lines[0].replace(/^﻿/, '').split(',');
  return { header, lines: lines.slice(1) };
}

/**
 * Parses the YYYYMMDDTHHMM timestamp used by both datasets. The global export
 * carries a trailing padding digit, so we slice by position rather than length.
 * Times are local to each city (Open-Meteo was queried with timezone=auto),
 * which is what we want: the diurnal cycle should align with local solar time.
 */
function parseTimestamp(ts) {
  const year = +ts.slice(0, 4);
  const month = +ts.slice(4, 6);
  const day = +ts.slice(6, 8);
  const hour = +ts.slice(9, 11);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day) || !Number.isFinite(hour)) return null;
  return { hour, month, sortKey: Date.UTC(year, month - 1, day, hour) };
}

/**
 * Builds one chronologically ordered record array per city. Keeping cities
 * separate is essential: the previous loader interleaved all five cities into a
 * single array, so a "24 hour" window actually spanned five continents.
 */
function loadCitySeries() {
  const cities = {};

  // Basel: single city, VPD in hPa, soil 0-7cm.
  const baselPath = path.join(__dirname, 'data', 'dataset-10yrs.csv');
  if (fs.existsSync(baselPath)) {
    const { header, lines } = loadCsv(baselPath);
    const col = (name) => header.indexOf(name);
    const ci = {
      temp: col('Basel Temperature [2 m elevation corrected]'),
      precip: col('Basel Precipitation Total'),
      hum: col('Basel Relative Humidity [2 m]'),
      wind: col('Basel Wind Speed [10 m]'),
      dir: col('Basel Wind Direction [10 m]'),
      vpd: col('Basel Vapor Pressure Deficit [2 m]'),
      soil: col('Basel Soil Moisture [0-7 cm down]')
    };
    const records = [];
    for (const line of lines) {
      const p = line.split(',');
      const t = parseTimestamp(p[0]);
      if (!t) continue;
      const rec = {
        ...t,
        temp: +p[ci.temp], humidity: +p[ci.hum], soil: +p[ci.soil],
        windSpeed: +p[ci.wind], windDir: +p[ci.dir], precip: +p[ci.precip],
        vpd: +p[ci.vpd] * BASEL_VPD_HPA_TO_KPA
      };
      records.push(rec);
    }
    cities['Basel'] = records;
  }

  // Global export: five cities sharing one timestamp column, VPD already kPa.
  const globalPath = path.join(__dirname, 'data', 'training_dataset.csv');
  if (fs.existsSync(globalPath)) {
    const { header, lines } = loadCsv(globalPath);
    const names = ['Addis_Ababa', 'Nairobi', 'Sao_Paulo', 'Madrid', 'Accra'];
    const cols = {};
    for (const n of names) {
      cols[n] = {
        temp: header.indexOf(`${n}_Temp`), precip: header.indexOf(`${n}_Precip`),
        hum: header.indexOf(`${n}_Humidity`), wind: header.indexOf(`${n}_WindSpeed`),
        dir: header.indexOf(`${n}_WindDir`), vpd: header.indexOf(`${n}_VPD`),
        soil: header.indexOf(`${n}_SoilMoisture`)
      };
      cities[n] = [];
    }
    for (const line of lines) {
      const p = line.split(',');
      const t = parseTimestamp(p[0]);
      if (!t) continue;
      for (const n of names) {
        const c = cols[n];
        cities[n].push({
          ...t,
          temp: +p[c.temp], humidity: +p[c.hum], soil: +p[c.soil],
          windSpeed: +p[c.wind], windDir: +p[c.dir], precip: +p[c.precip],
          vpd: +p[c.vpd]
        });
      }
    }
  }

  for (const name of Object.keys(cities)) {
    cities[name].sort((a, b) => a.sortKey - b.sortKey);
  }
  return cities;
}

// --- 3. FEATURE / TARGET CONSTRUCTION ---
// encodeFeatures lives in features.js; precipitation is zero-inflated so it
// enters both the model and the target through log1p, and errors are reported
// back in millimetres via expm1.

/** A record is usable only if every physical channel parsed and soil is plausible. */
const isValid = (r) =>
  [r.temp, r.humidity, r.soil, r.windSpeed, r.windDir, r.vpd, r.precip].every(Number.isFinite) &&
  r.soil > 0 && r.humidity >= 0 && r.humidity <= 100;

/**
 * Emits [features, targets] sequences that never span a gap, a city boundary,
 * or an invalid record.
 */
function buildSequences(records) {
  const xs = [];
  const ys = [];
  const need = TIME_STEPS + HORIZON;

  for (let start = 0; start + need <= records.length; start += STRIDE) {
    const window = records.slice(start, start + need);

    if (!window.every(isValid)) continue;
    // Reject windows with a clock gap (hours must be strictly consecutive).
    let contiguous = true;
    for (let i = 1; i < window.length; i++) {
      if (window[i].sortKey - window[i - 1].sortKey !== 3600000) { contiguous = false; break; }
    }
    if (!contiguous) continue;

    const history = window.slice(0, TIME_STEPS);
    const future = window.slice(TIME_STEPS);

    const precipSum = future.reduce((s, r) => s + Math.max(0, r.precip), 0);
    xs.push(history.map(encodeFeatures));
    ys.push([future[future.length - 1].soil, Math.log1p(precipSum)]);
  }
  return { xs, ys };
}

// --- 4. SCALING ---
/** Column-wise mean/std, computed on the training split only to avoid leakage. */
function fitScaler(rows, width) {
  const mean = new Float64Array(width);
  const std = new Float64Array(width);
  for (const row of rows) for (let j = 0; j < width; j++) mean[j] += row[j];
  for (let j = 0; j < width; j++) mean[j] /= rows.length;
  for (const row of rows) for (let j = 0; j < width; j++) std[j] += (row[j] - mean[j]) ** 2;
  for (let j = 0; j < width; j++) std[j] = Math.sqrt(std[j] / rows.length) || 1;
  return { mean: Array.from(mean), std: Array.from(std) };
}

const toFlatTensor3d = (sequences, scaler) => {
  const n = sequences.length;
  const buf = new Float32Array(n * TIME_STEPS * NUM_FEATURES);
  let k = 0;
  for (const seq of sequences) {
    for (const step of seq) {
      for (let j = 0; j < NUM_FEATURES; j++) buf[k++] = (step[j] - scaler.mean[j]) / scaler.std[j];
    }
  }
  return tf.tensor3d(buf, [n, TIME_STEPS, NUM_FEATURES]);
};

const toFlatTensor2d = (rows, scaler) => {
  const width = rows[0].length;
  const buf = new Float32Array(rows.length * width);
  let k = 0;
  for (const row of rows) {
    for (let j = 0; j < width; j++) buf[k++] = (row[j] - scaler.mean[j]) / scaler.std[j];
  }
  return tf.tensor2d(buf, [rows.length, width]);
};

// --- 5. MODEL ---
function createModel() {
  const model = tf.sequential();
  model.add(tf.layers.lstm({ units: 64, inputShape: [TIME_STEPS, NUM_FEATURES], returnSequences: false }));
  model.add(tf.layers.dropout({ rate: 0.2 }));
  model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
  model.add(tf.layers.dense({ units: 2 })); // linear: regression, not classification
  model.compile({ optimizer: tf.train.adam(LEARNING_RATE), loss: 'meanSquaredError', metrics: ['mae'] });
  return model;
}

async function saveModelToDisk(model, dirPath) {
  let absolutePath = path.resolve(dirPath);
  if (process.platform === 'win32') absolutePath = absolutePath.replace(/\\/g, '/');
  await model.save(`file://${absolutePath}`);
}

// --- 6. MAIN ---
async function main() {
  console.log('Loading city series...');
  const cities = loadCitySeries();

  const trainX = [], trainY = [], valX = [], valY = [];
  // Persistence baseline: soil in 24h == soil now; rain in next 24h == rain in last 24h.
  const baseline = [];

  for (const [name, records] of Object.entries(cities)) {
    if (!records.length) continue;
    const splitAt = Math.floor(records.length * TRAIN_SPLIT);
    const trainSeq = buildSequences(records.slice(0, splitAt));
    const valSeq = buildSequences(records.slice(splitAt));

    trainX.push(...trainSeq.xs); trainY.push(...trainSeq.ys);
    valX.push(...valSeq.xs); valY.push(...valSeq.ys);

    // Baseline uses the same validation windows, so the comparison is like-for-like.
    for (let i = 0; i < valSeq.xs.length; i++) {
      const lastStep = valSeq.xs[i][TIME_STEPS - 1];
      const soilNow = lastStep[2];
      const precipPrev24 = valSeq.xs[i].reduce((s, step) => s + Math.expm1(step[4]), 0);
      baseline.push({
        predSoil: soilNow, trueSoil: valSeq.ys[i][0],
        predPrecip: precipPrev24, truePrecip: Math.expm1(valSeq.ys[i][1])
      });
    }
    console.log(`  ${name.padEnd(12)} records=${records.length}  train=${trainSeq.xs.length}  val=${valSeq.xs.length}`);
  }

  if (!trainX.length) throw new Error('No training sequences produced. Check the data files.');
  console.log(`\nTotal sequences: train=${trainX.length}  val=${valX.length}`);

  // Fit scalers on training data only.
  const flatTrainSteps = [];
  for (const seq of trainX) flatTrainSteps.push(...seq);
  const featureScaler = fitScaler(flatTrainSteps, NUM_FEATURES);
  const targetScaler = fitScaler(trainY, 2);
  flatTrainSteps.length = 0;

  const xTrain = toFlatTensor3d(trainX, featureScaler);
  const yTrain = toFlatTensor2d(trainY, targetScaler);
  const xVal = toFlatTensor3d(valX, featureScaler);
  const yVal = toFlatTensor2d(valY, targetScaler);
  trainX.length = 0; valX.length = 0;

  const model = createModel();
  model.summary();

  console.log('\n[TRAINING] forecast model (soil moisture + 24h precipitation)...');
  await model.fit(xTrain, yTrain, {
    epochs: EPOCHS,
    batchSize: BATCH_SIZE,
    validationData: [xVal, yVal],
    // Both entries must be Callback instances; tfjs rejects a bare object literal
    // mixed into the same array.
    callbacks: [
      tf.callbacks.earlyStopping({ monitor: 'val_loss', patience: 3, restoreBestWeight: true }),
      new tf.CustomCallback({
        onEpochEnd: (epoch, logs) =>
          console.log(`  Epoch ${epoch + 1}/${EPOCHS} - loss: ${logs.loss.toFixed(5)} - val_loss: ${logs.val_loss.toFixed(5)} - val_mae: ${logs.val_mae.toFixed(5)}`)
      })
    ]
  });

  // --- Honest evaluation, denormalized into physical units ---
  const predNorm = model.predict(xVal);
  const pred = await predNorm.array();
  const metrics = { soil: { se: 0, ae: 0 }, precip: { se: 0, ae: 0 } };
  const base = { soil: { se: 0, ae: 0 }, precip: { se: 0, ae: 0 } };

  for (let i = 0; i < pred.length; i++) {
    const soilHat = pred[i][0] * targetScaler.std[0] + targetScaler.mean[0];
    const precipHat = Math.max(0, Math.expm1(pred[i][1] * targetScaler.std[1] + targetScaler.mean[1]));
    const soilTrue = valY[i][0];
    const precipTrue = Math.expm1(valY[i][1]);

    metrics.soil.se += (soilHat - soilTrue) ** 2; metrics.soil.ae += Math.abs(soilHat - soilTrue);
    metrics.precip.se += (precipHat - precipTrue) ** 2; metrics.precip.ae += Math.abs(precipHat - precipTrue);

    base.soil.se += (baseline[i].predSoil - soilTrue) ** 2; base.soil.ae += Math.abs(baseline[i].predSoil - soilTrue);
    base.precip.se += (baseline[i].predPrecip - precipTrue) ** 2; base.precip.ae += Math.abs(baseline[i].predPrecip - precipTrue);
  }
  const n = pred.length;
  const fmt = (m) => `RMSE=${Math.sqrt(m.se / n).toFixed(4)} MAE=${(m.ae / n).toFixed(4)}`;

  console.log('\n=== VALIDATION (physical units, held-out final 20% of each city) ===');
  console.log(`Soil moisture (m3/m3)  model: ${fmt(metrics.soil)}   persistence: ${fmt(base.soil)}`);
  console.log(`Precip 24h    (mm)     model: ${fmt(metrics.precip)}   persistence: ${fmt(base.precip)}`);
  const soilSkill = 1 - Math.sqrt(metrics.soil.se / n) / Math.sqrt(base.soil.se / n);
  const precipSkill = 1 - Math.sqrt(metrics.precip.se / n) / Math.sqrt(base.precip.se / n);
  console.log(`Skill score vs persistence -> soil: ${(soilSkill * 100).toFixed(1)}%  precip: ${(precipSkill * 100).toFixed(1)}%`);

  // --- Save model + scaler. The scaler is what the old pipeline lost. ---
  const savePath = path.join(__dirname, 'saved_model_forecast');
  await saveModelToDisk(model, savePath);
  fs.writeFileSync(
    path.join(savePath, 'scaler.json'),
    JSON.stringify({
      featureNames: FEATURE_NAMES,
      timeSteps: TIME_STEPS,
      horizon: HORIZON,
      features: featureScaler,
      targets: targetScaler,
      targetNames: ['soil_moisture_t+24h', 'log1p_precip_sum_24h'],
      trainedAt: new Date().toISOString()
    }, null, 2)
  );
  console.log(`\nModel + scaler saved to ${savePath}`);

  tf.dispose([xTrain, yTrain, xVal, yVal, predNorm]);
  model.dispose();
}

main().catch(err => { console.error(err); process.exit(1); });
