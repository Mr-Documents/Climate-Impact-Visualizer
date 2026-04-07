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
    // Removed vapour_pressure_deficit from current= (it is hourly only) to prevent API warnings
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${safeLat}&longitude=${safeLon}&current=uv_index,is_day&hourly=uv_index,vapour_pressure_deficit`;
    const response = await axios.get(url);
    const { current, hourly } = response.data;

    // Find index of current hour in the hourly array to provide "current" stats
    const nowISO = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
    let currentIndex = (hourly?.time || []).findIndex(t => t.startsWith(nowISO));
    if (currentIndex === -1) currentIndex = 0;

    const currentUV = hourly.uv_index ? hourly.uv_index[currentIndex] : 0;
    
    // Manual VPD calculation as fallback for reliability
    const temp = hourly.temperature_2m ? hourly.temperature_2m[currentIndex] : 25;
    const hum = hourly.relative_humidity_2m ? hourly.relative_humidity_2m[currentIndex] : 60;
    const svp = 0.6108 * Math.exp((17.27 * temp) / (temp + 237.3));
    const manualVPD = svp * (1 - (hum / 100));
    const currentVPD = hourly.vapour_pressure_deficit ? (hourly.vapour_pressure_deficit[currentIndex] ?? manualVPD) : manualVPD;

    const series = (hourly?.time || []).map((time, i) => ({
      time,
      uvIndex: hourly.uv_index?.[i] ?? null,
      vpd: hourly.vapour_pressure_deficit?.[i] ?? null,
    }));

    res.json({ 
      location: { lat: safeLat, lon: safeLon }, 
      current: { ...current, uvIndex: currentUV, vpd: currentVPD },
      uvIndex: currentUV, 
      vpd: currentVPD,
      hourly, 
      series 
    });
  } catch (error) {
    console.error('UV/Dryness fetch error:', error.message);
    res.status(500).json({ error: 'Failed to fetch UV/Dryness data' });
  }
};