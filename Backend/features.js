/**
 * Single source of truth for the model's input encoding.
 *
 * Training and inference MUST build feature vectors identically. The previous
 * pipeline duplicated this logic in two files and they drifted apart - the
 * training script normalized its inputs and the server did not - which silently
 * destroyed the model's output. Both sides now import from here.
 *
 * Any change to this file invalidates saved_model_forecast and requires
 * re-running trainForecastModel.js.
 */

export const FEATURE_NAMES = [
  'temp', 'humidity', 'soil', 'windSpeed', 'precipLog', 'vpd',
  'sinWind', 'cosWind', 'sinHour', 'cosHour', 'sinMonth', 'cosMonth'
];

export const NUM_FEATURES = FEATURE_NAMES.length;

/**
 * Basel VPD is stored in hectopascals while the Open-Meteo cities and the live
 * API use kilopascals. Verified against the Magnus formula: Basel row 1
 * (6.5 C, 98% RH) computes 0.0196 kPa and is stored as 0.189 - exactly 10x.
 */
export const BASEL_VPD_HPA_TO_KPA = 0.1;

/**
 * Saturation vapour pressure (kPa) via the Magnus-Tetens approximation.
 * @param {number} tempC
 */
export const saturationVapourPressure = (tempC) =>
  0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3));

/**
 * Vapour pressure deficit in kPa - the atmosphere's evaporative demand.
 * @param {number} tempC
 * @param {number} relativeHumidityPct
 */
export const vapourPressureDeficit = (tempC, relativeHumidityPct) =>
  saturationVapourPressure(tempC) * (1 - relativeHumidityPct / 100);

/**
 * Returns soil moisture for the 0-7cm layer, the depth band the model was
 * trained on.
 *
 * Open-Meteo serves different regions from different weather models, and not
 * all of them expose 0_to_7cm: North America (GFS) returns null for it while
 * still providing the 0-1cm / 1-3cm / 3-9cm bands. Phoenix, Arizona is entirely
 * null, which previously made the water-body check classify a desert city as a
 * lake. Where the direct value is missing we reconstruct it as a depth-weighted
 * average over the overlapping bands:
 *
 *     0-7cm = (1cm*[0-1] + 2cm*[1-3] + 4cm*[3-9]) / 7cm
 *
 * Cross-checked on Dubai, where both are available: bands give 0.047 against a
 * reported 0.055, well inside the model's 0.032 validation RMSE.
 *
 * @returns {number|null} m^3/m^3, or null when nothing usable is available
 */
export function composeSoilMoisture0to7({ direct, band0to1, band1to3, band3to9 }) {
  if (Number.isFinite(direct)) return direct;
  // Number(null) is 0, so missing bands must be rejected before coercion -
  // otherwise a location with no soil data reads as bone dry rather than
  // unavailable, and the drought score saturates.
  const num = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v));
  const a = num(band0to1), b = num(band1to3), c = num(band3to9);
  if (![a, b, c].every(Number.isFinite)) return null;
  return (1 * a + 2 * b + 4 * c) / 7;
}

/**
 * Encodes one hourly observation into the model's feature vector.
 *
 * Wind direction, hour and month are cyclic quantities, so each is split into
 * sine and cosine components. Feeding hour as a raw 0-23 integer would tell the
 * network that 23:00 and 00:00 are maximally distant when they are adjacent.
 *
 * Precipitation is heavily zero-inflated and enters through log1p.
 *
 * @param {object} r - { temp, humidity, soil, windSpeed, windDir, precip, vpd, hour, month }
 * @returns {number[]} vector ordered to match FEATURE_NAMES
 */
export function encodeFeatures(r) {
  const windRad = (r.windDir || 0) * Math.PI / 180;
  const hourRad = (r.hour / 24) * 2 * Math.PI;
  const monthRad = ((r.month - 1) / 12) * 2 * Math.PI;
  return [
    r.temp,
    r.humidity,
    r.soil,
    r.windSpeed,
    Math.log1p(Math.max(0, r.precip)),
    r.vpd,
    Math.sin(windRad), Math.cos(windRad),
    Math.sin(hourRad), Math.cos(hourRad),
    Math.sin(monthRad), Math.cos(monthRad)
  ];
}

/**
 * Applies the saved z-score scaling. Inference must use the statistics computed
 * during training - recomputing them from a 24-hour request window would centre
 * every location on itself and erase exactly the differences we care about.
 *
 * @param {number[]} vector
 * @param {{mean:number[], std:number[]}} scaler
 */
export function applyScaler(vector, scaler) {
  return vector.map((v, j) => (v - scaler.mean[j]) / scaler.std[j]);
}
