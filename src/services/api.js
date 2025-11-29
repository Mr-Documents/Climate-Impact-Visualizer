import axios from "axios";

const API_BASE = "http://localhost:5000/api";

export const getFloodRisk = async (lat, lon, ai = false) => {
  const res = await axios.get(`${API_BASE}/floodrisk`, {
    params: { lat, lon, ai }
  });
  return res.data;
};

export const getWildfireRisk = async (lat, lon, ai = false) => {
  const res = await axios.get(`${API_BASE}/wildfirerisk`, {
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
