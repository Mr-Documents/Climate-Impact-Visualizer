/**
 * Transparent climate risk index.
 *
 * The LSTM forecasts physical quantities (soil moisture and rainfall 24h ahead).
 * This module turns those forecasts into Low / Medium / High risk bands using an
 * explicit, documented formula rather than a learned classifier.
 *
 * Why not learn the class directly? The previous pipeline generated its labels
 * with threshold rules over the very features it fed the network, so the model
 * could only ever rediscover a rule we already had, and its accuracy score was
 * circular. Separating "forecast the physics" (learned, verifiable against the
 * historical record) from "convert physics to a risk band" (a stated policy)
 * means every number here can be defended and tuned independently.
 *
 * TERMINOLOGY: this reports water stress in absolute terms, not a meteorological
 * anomaly. Dubai in a normal year has no rainfall *deficit* relative to its own
 * climatology, but it is severely water-stressed in absolute terms. A dashboard
 * labelled "Drought Severity" is read the second way, so that is what we compute.
 */

/** Clamp to [0,1]. */
const unit = (x) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

// --- Reference constants (m^3/m^3 for soil, kPa for VPD, mm for rain) ---

/** Soil moisture at or above which the 0-7cm layer is comfortably moist. */
export const SOIL_MOIST_REFERENCE = 0.30;
/** Approximate saturation of the 0-7cm layer; above this, water sheds as runoff. */
export const SOIL_SATURATION_REFERENCE = 0.45;
/** VPD representing extreme atmospheric evaporative demand. */
export const VPD_EXTREME_KPA = 4.0;
/** Rainfall in 24h that constitutes a significant flood-producing event. */
export const PRECIP_FLOOD_24H_MM = 50;
/** Rainfall in 24h sufficient to meaningfully relieve dry soil. */
export const PRECIP_RELIEF_24H_MM = 20;
/** Consecutive rainless days at which dry-spell persistence saturates. */
export const DRY_SPELL_MAX_DAYS = 30;
/** Antecedent precipitation index (7d, mm) at which catchment wetness saturates. */
export const API_SATURATION_MM = 100;
/** Daily decay applied to older rainfall in the antecedent index. */
export const API_DECAY = 0.9;

/** Band edges applied to both scores. */
export const MEDIUM_THRESHOLD = 0.35;
export const HIGH_THRESHOLD = 0.65;

/** Maps a 0-1 score onto the label the dashboard displays. */
export function classify(score) {
  if (!Number.isFinite(score)) return 'N/A';
  if (score >= HIGH_THRESHOLD) return 'High';
  if (score >= MEDIUM_THRESHOLD) return 'Medium';
  return 'Low';
}

/**
 * Antecedent Precipitation Index: how wet the catchment already is, weighting
 * recent rain more heavily than older rain. Standard hydrological practice.
 *
 * @param {number[]} hourlyPrecipMm - most recent hour last
 * @returns {number} decay-weighted rainfall total in mm
 */
export function antecedentPrecipitationIndex(hourlyPrecipMm = []) {
  if (!hourlyPrecipMm.length) return 0;
  let api = 0;
  const n = hourlyPrecipMm.length;
  for (let i = 0; i < n; i++) {
    const mm = Number(hourlyPrecipMm[i]);
    if (!Number.isFinite(mm) || mm <= 0) continue;
    const daysAgo = (n - 1 - i) / 24;
    api += mm * Math.pow(API_DECAY, daysAgo);
  }
  return api;
}

/**
 * Counts back from the most recent hour to find how long it has been raining
 * less than `thresholdMm` per day - a dry spell.
 *
 * @param {number[]} hourlyPrecipMm - most recent hour last
 */
export function drySpellDays(hourlyPrecipMm = [], thresholdMm = 1) {
  if (!hourlyPrecipMm.length) return 0;
  let dryHours = 0;
  let dayAccumulator = 0;
  for (let i = hourlyPrecipMm.length - 1; i >= 0; i--) {
    const mm = Number(hourlyPrecipMm[i]) || 0;
    dayAccumulator += mm;
    dryHours++;
    if (dayAccumulator >= thresholdMm) break;
  }
  return dryHours / 24;
}

/**
 * Dry-spell length from daily rainfall totals, most recent day last.
 *
 * Preferred over the hourly variant when a longer archive is available: the
 * live forecast window only reaches 7 days back, which would cap the dry-spell
 * term well below its intended 30-day scale in genuinely arid places.
 *
 * @param {number[]} dailyPrecipMm
 * @param {number} [thresholdMm] - daily total counting as meaningful rain
 */
export function drySpellDaysFromDaily(dailyPrecipMm = [], thresholdMm = 1) {
  let days = 0;
  for (let i = dailyPrecipMm.length - 1; i >= 0; i--) {
    const mm = Number(dailyPrecipMm[i]);
    if (Number.isFinite(mm) && mm >= thresholdMm) break;
    days++;
  }
  return days;
}

/**
 * Drought / water-stress severity.
 *
 * score = 0.45*dryness + 0.35*evaporative demand + 0.20*dry-spell persistence
 *         - 0.15*incoming rainfall relief
 *
 * @param {object} p
 * @param {number} p.soil            - forecast soil moisture at +24h (m^3/m^3)
 * @param {number} p.vpd             - current vapour pressure deficit (kPa)
 * @param {number} [p.dryDays]       - length of the current dry spell in days
 * @param {number} [p.forecastPrecip24h] - forecast rainfall over next 24h (mm)
 */
export function computeDroughtRisk({ soil, vpd, dryDays = 0, forecastPrecip24h = 0 }) {
  const dryness = unit((SOIL_MOIST_REFERENCE - soil) / SOIL_MOIST_REFERENCE);
  const demand = unit(vpd / VPD_EXTREME_KPA);
  const persistence = unit(dryDays / DRY_SPELL_MAX_DAYS);
  const relief = unit(forecastPrecip24h / PRECIP_RELIEF_24H_MM);

  const score = unit(0.45 * dryness + 0.35 * demand + 0.20 * persistence - 0.15 * relief);
  return {
    score: Number(score.toFixed(3)),
    label: classify(score),
    drivers: {
      dryness: Number(dryness.toFixed(3)),
      evaporativeDemand: Number(demand.toFixed(3)),
      drySpell: Number(persistence.toFixed(3)),
      rainfallRelief: Number(relief.toFixed(3))
    }
  };
}

/**
 * Flood risk.
 *
 * score = 0.40*incoming rainfall + 0.35*soil saturation + 0.25*antecedent wetness
 *
 * Saturated ground cannot absorb more water, so the same rainfall produces very
 * different runoff depending on how wet the catchment already is - hence all
 * three terms rather than rainfall alone.
 *
 * @param {object} p
 * @param {number} p.soil            - forecast soil moisture at +24h (m^3/m^3)
 * @param {number} [p.forecastPrecip24h] - forecast rainfall over next 24h (mm)
 * @param {number} [p.api7d]         - antecedent precipitation index (mm)
 */
export function computeFloodRisk({ soil, forecastPrecip24h = 0, api7d = 0 }) {
  const incoming = unit(forecastPrecip24h / PRECIP_FLOOD_24H_MM);
  const saturation = unit(soil / SOIL_SATURATION_REFERENCE);
  const antecedent = unit(api7d / API_SATURATION_MM);

  const score = unit(0.40 * incoming + 0.35 * saturation + 0.25 * antecedent);
  return {
    score: Number(score.toFixed(3)),
    label: classify(score),
    drivers: {
      incomingRainfall: Number(incoming.toFixed(3)),
      soilSaturation: Number(saturation.toFixed(3)),
      antecedentWetness: Number(antecedent.toFixed(3))
    }
  };
}
