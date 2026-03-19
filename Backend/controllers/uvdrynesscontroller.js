import axios from 'axios';

/**
 * Fetches UV Index and Dryness data (Vapour Pressure Deficit) from Open-Meteo.
 * Vapour Pressure Deficit (VPD) is used here as a high-quality proxy for atmospheric dryness.
 */
export const getUVDryness = async (req, res) => {
  // Ensure we always have valid numeric coordinates (Defaulting to Accra)
  const latRaw = req.query.lat;
  const lonRaw = req.query.lon;
  const defaultLat = 5.56;
  const defaultLon = -0.20;

  const lat = Number(latRaw);
  const lon = Number(lonRaw);
  const safeLat = Number.isFinite(lat) ? lat : defaultLat;
  const safeLon = Number.isFinite(lon) ? lon : defaultLon;

  try {
    // Open-Meteo Forecast API: 'uv_index' and 'vapour_pressure_deficit'
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${safeLat}&longitude=${safeLon}&current=uv_index,vapour_pressure_deficit&hourly=uv_index,vapour_pressure_deficit`;
    const response = await axios.get(url);
    const { current, hourly } = response.data;

    const series = (hourly?.time || []).map((time, i) => ({
      time,
      uvIndex: hourly.uv_index?.[i] ?? null,
      drynessIndex: hourly.vapour_pressure_deficit?.[i] ?? null,
    }));

    res.json({ location: { lat: safeLat, lon: safeLon }, current, series });
  } catch (error) {
    console.error('UV/Dryness fetch error:', error.message);
    res.status(500).json({ error: 'Failed to fetch UV/Dryness data' });
  }
};