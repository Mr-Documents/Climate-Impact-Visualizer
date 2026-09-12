import axios from "axios";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000/api";

export const getFloodRisk = async (lat, lon, ai = false) => {
  const res = await axios.get(`${API_BASE}/floodrisk`, {
    params: { lat, lon, ai }
  });
  return res.data;
};

export const getPrecipitation = async (lat, lon, days = 3) => {
  const res = await axios.get(`${API_BASE}/precipitation`, {
    params: { lat, lon, days }
  });
  return res.data;
};

/**
 * Trained flood and drought risk from the Python ML service.
 *
 * Returns calibrated probabilities from gradient-boosted / random-forest
 * classifiers trained on 30 years of ERA5 reanalysis across 60 globally
 * stratified locations - not the hand-weighted rule the earlier
 * /predict endpoint used.
 *
 * Throws on failure so callers can fall back deliberately rather than
 * silently showing a rule-based number as if it came from the model.
 */
export const getMlRisk = async (latitude, longitude) => {
  const res = await axios.post(`${API_BASE}/ml-risk`, { latitude, longitude });
  return res.data;
};

/** Reports whether the ML service is reachable and has its models loaded. */
export const getMlHealth = async () => {
  const res = await axios.get(`${API_BASE}/ml-health`);
  return res.data;
};
