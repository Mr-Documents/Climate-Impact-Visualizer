/**
 * Proxy to the Python ML service for flood and drought risk.
 *
 * WHY EXPRESS STAYS IN FRONT
 * Express already owns CORS origin allowlisting, general and per-endpoint rate
 * limiting, and Supabase logging. Exposing the Python service to the browser
 * would mean rebuilding all of that and operating a second public origin with
 * its own CORS policy. Keeping Python internal leaves one public API, one place
 * to change, and keeps the model files off the public internet. The cost is one
 * extra hop, negligible beside the upstream climate API calls already in the
 * request path.
 *
 * WHAT THIS CONTROLLER DOES NOT DO
 * It performs no feature engineering and applies no thresholds. Every number in
 * the response comes from the Python service, which computes features with the
 * same code that trained the models. Recomputing anything here would recreate
 * exactly the train/serve drift that made the previous prediction system return
 * a constant answer for every location on Earth.
 */

import { supabase } from '../routes/supabaseClient.js';

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000';

// A cold request fetches 30 years of climate data upstream (~5s observed), so
// the timeout has to allow for that plus headroom. Too short and a legitimate
// first-visit request looks like an outage.
const REQUEST_TIMEOUT_MS = Number(process.env.ML_TIMEOUT_MS || 45000);

/**
 * Calls the ML service with a hard timeout.
 * Returns the parsed body and status rather than throwing, so the caller can
 * map upstream failures onto its own response contract.
 */
async function callMlService(path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${ML_SERVICE_URL}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const text = await response.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // A non-JSON body means the service is broken or something else is
      // listening on that port. Treat it as unavailable rather than forwarding.
      return { ok: false, status: 502, body: { error: 'ml service returned a malformed response' } };
    }
    return { ok: response.ok, status: response.status, body: parsed };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { ok: false, status: 504, body: { error: 'ml service timed out' } };
    }
    return { ok: false, status: 503, body: { error: 'ml service unreachable' } };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * POST /api/ml-risk
 * Body: { latitude, longitude }
 */
export async function getMlRisk(req, res) {
  const { latitude, longitude } = req.body || {};

  // Validate here as well as in Python: rejecting malformed input at the edge
  // avoids a pointless network hop, and keeps the error shape consistent with
  // the rest of this API.
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({
      error: 'latitude and longitude are required and must be numbers',
    });
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return res.status(400).json({ error: 'coordinates out of range' });
  }

  const result = await callMlService('/predict', { latitude: lat, longitude: lon });

  if (!result.ok) {
    // Forward the service's own explanation where it gave one - a 422 for an
    // unsupported location is genuinely useful to the user - but never forward
    // anything from a 5xx, which may carry internal detail.
    const isClientError = result.status >= 400 && result.status < 500;
    return res.status(result.status).json({
      error: isClientError
        ? (result.body?.error || 'prediction unavailable for this location')
        : 'risk prediction service unavailable',
      detail: isClientError ? result.body?.detail : undefined,
    });
  }

  // Log for the dashboard's history panel. A logging failure must never cost
  // the user their prediction, so it is fire-and-forget.
  persistPrediction(lat, lon, result.body).catch((err) =>
    console.error('[ML RISK] logging failed:', err.message)
  );

  return res.json(result.body);
}

/**
 * GET /api/ml-health
 * Surfaces the ML service's own health so the frontend can distinguish
 * "models not deployed" from "this location is unsupported".
 */
export async function getMlHealth(req, res) {
  const result = await callMlService('/health');
  if (!result.ok) {
    return res.status(503).json({ status: 'unavailable', detail: 'ml service unreachable' });
  }
  return res.json(result.body);
}

async function persistPrediction(latitude, longitude, prediction) {
  if (!prediction?.flood || !prediction?.drought) return;

  const { data: location, error: locationError } = await supabase
    .from('locations')
    .upsert(
      { latitude: Number(latitude.toFixed(4)), longitude: Number(longitude.toFixed(4)) },
      { onConflict: 'latitude,longitude' }
    )
    .select()
    .single();

  if (locationError || !location) return;

  await supabase.from('climate_logs').insert({
    location_id: location.id,
    flood_risk_label: prediction.flood.band,
    flood_risk_score: prediction.flood.probability,
    drought_risk_label: prediction.drought.band,
    drought_risk_score: prediction.drought.probability,
  });
}
