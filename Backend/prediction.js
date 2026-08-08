import path from "path";
import fs from "fs";
import util from "util";
import { fileURLToPath } from 'url';
import { NUM_FEATURES, encodeFeatures, applyScaler } from './features.js';
import {
  computeDroughtRisk, computeFloodRisk,
  antecedentPrecipitationIndex, drySpellDays
} from './riskIndex.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Fix Windows DLL loading
if (process.platform === 'win32') {
    const tfDllPath = path.resolve(__dirname, 'node_modules', '@tensorflow', 'tfjs-node', 'deps', 'lib');
    if (fs.existsSync(tfDllPath) && !process.env.PATH.includes(tfDllPath)) {
        process.env.PATH = `${process.env.PATH}${path.delimiter}${tfDllPath}`;
    }
}

// tfjs-node calls util.isArray and util.isNullOrUndefined, which Node removed in v23.
// Restore them so the native backend runs on hosts that provide a newer runtime than
// the one pinned in .node-version. Both are no-ops on Node 18-22, where they still exist.
if (typeof util.isArray !== 'function') {
    util.isArray = Array.isArray;
}
if (typeof util.isNullOrUndefined !== 'function') {
    util.isNullOrUndefined = (value) => value === null || value === undefined;
}

// Dynamic import to apply PATH and util changes first
const tf = await import("@tensorflow/tfjs-node");

const MODEL_DIR = path.join(__dirname, "saved_model_forecast");

let loadedModel = null;
let scaler = null;

/**
 * Loads the forecast model and, critically, the scaling statistics saved
 * alongside it. Feeding raw values into a model trained on normalized inputs
 * saturates the network and pins its output constant regardless of location -
 * the failure mode this pipeline replaced.
 */
async function ensureLoaded() {
  if (loadedModel && scaler) return;

  const modelPath = path.join(MODEL_DIR, "model.json");
  const scalerPath = path.join(MODEL_DIR, "scaler.json");

  if (!fs.existsSync(modelPath) || !fs.existsSync(scalerPath)) {
    throw new Error(
      "Forecast model not found. Run 'node trainForecastModel.js' to build saved_model_forecast."
    );
  }

  scaler = JSON.parse(fs.readFileSync(scalerPath, 'utf8'));

  // Build the file:// URL manually to avoid %20 encoding of spaces in the path.
  let resolved = path.resolve(modelPath);
  if (process.platform === 'win32') resolved = resolved.replace(/\\/g, '/');
  loadedModel = await tf.loadLayersModel(`file://${resolved}`);
}

/**
 * Forecasts the next 24 hours and converts that forecast into drought and flood
 * risk bands.
 *
 * @param {object} input
 * @param {object[]} input.history - hourly observations, most recent LAST, at least
 *        scaler.timeSteps entries. Each: { temp, humidity, soil, windSpeed,
 *        windDir, precip, vpd, hour, month }
 * @param {number[]} [input.recentPrecipHourly] - up to 168h of rainfall (mm),
 *        most recent last, used for antecedent wetness and dry-spell length
 * @param {number} [input.dryDays] - dry-spell length in days. Pass this when a
 *        longer archive than the hourly window is available; otherwise it is
 *        derived from recentPrecipHourly.
 * @returns {Promise<{drought:object, flood:object, forecast:object}>}
 */
export async function predictClimateRisk({ history, recentPrecipHourly = [], dryDays }) {
  if (!Array.isArray(history) || history.length === 0) {
    throw new Error("history must be a non-empty array of hourly observations");
  }
  await ensureLoaded();

  const steps = scaler.timeSteps;
  if (history.length < steps) {
    throw new Error(`history needs at least ${steps} hourly records, received ${history.length}`);
  }
  const window = history.slice(-steps);

  // Encode and scale with the SAVED training statistics.
  const flat = new Float32Array(steps * NUM_FEATURES);
  let k = 0;
  for (const record of window) {
    const scaled = applyScaler(encodeFeatures(record), scaler.features);
    for (let j = 0; j < NUM_FEATURES; j++) flat[k++] = scaled[j];
  }

  const raw = tf.tidy(() => {
    const input = tf.tensor3d(flat, [1, steps, NUM_FEATURES]);
    return loadedModel.predict(input).arraySync()[0];
  });

  const latest = window[window.length - 1];

  // Denormalize back into physical units. The model predicts the CHANGE in soil
  // moisture over 24h, so it is added to the latest observation; scaler.json
  // records this via soilTargetIsDelta. Models trained before that change
  // emitted the absolute level, so fall back to using the value directly.
  const soilRaw = raw[0] * scaler.targets.std[0] + scaler.targets.mean[0];
  const soilForecast = scaler.soilTargetIsDelta ? latest.soil + soilRaw : soilRaw;

  const precipForecast = Math.max(
    0,
    Math.expm1(raw[1] * scaler.targets.std[1] + scaler.targets.mean[1])
  );
  const api7d = antecedentPrecipitationIndex(recentPrecipHourly);
  const effectiveDryDays = Number.isFinite(dryDays) ? dryDays : drySpellDays(recentPrecipHourly);

  const drought = computeDroughtRisk({
    soil: soilForecast,
    vpd: latest.vpd,
    dryDays: effectiveDryDays,
    forecastPrecip24h: precipForecast
  });
  const flood = computeFloodRisk({
    soil: soilForecast,
    forecastPrecip24h: precipForecast,
    api7d
  });

  return {
    drought,
    flood,
    forecast: {
      soilMoisture24h: Number(soilForecast.toFixed(4)),
      precip24hMm: Number(precipForecast.toFixed(2)),
      antecedentPrecipIndexMm: Number(api7d.toFixed(2)),
      drySpellDays: Number(effectiveDryDays.toFixed(2))
    }
  };
}
