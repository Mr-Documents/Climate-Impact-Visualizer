import axios from 'axios';

export const getWeatherData = async (req, res) => {
  // Ensure we always have valid numeric coordinates.
  const latRaw = req.query.lat;
  const lonRaw = req.query.lon;
  const defaultLat = 5.56;   // Accra
  const defaultLon = -0.20;

  const lat = Number(latRaw);
  const lon = Number(lonRaw);
  const safeLat = Number.isFinite(lat) ? lat : defaultLat;
  const safeLon = Number.isFinite(lon) ? lon : defaultLon;

  try {
    // Open-Meteo does not support `soil_moisture_0_7cm` (causes 400 errors).
    // Use the supported 0-1cm soil moisture field instead.
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${safeLat}&longitude=${safeLon}&hourly=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m,cloudcover,soil_moisture_0_1cm,soil_temperature_0cm`;
    const response = await axios.get(url);

    const { hourly } = response.data;

    // Safely map series if the API returns expected arrays
    const series = (hourly?.time || []).map((time, i) => ({
      time,
      temperature: hourly.temperature_2m?.[i] ?? null,
      humidity: hourly.relative_humidity_2m?.[i] ?? null,
      precipitation: hourly.precipitation?.[i] ?? null,
      windSpeed: hourly.wind_speed_10m?.[i] ?? null,
      windDirection: hourly.wind_direction_10m?.[i] ?? null,
      cloudCover: hourly.cloudcover?.[i] ?? null,
      soilMoisture: hourly.soil_moisture_0_1cm?.[i] ?? null,
      soilTemperature: hourly.soil_temperature_0cm?.[i] ?? null,
    }));

    res.json({ location: { lat: safeLat, lon: safeLon }, series });
  } catch (error) {
    console.error('Weather fetch error:', error.response?.status, error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch weather data' });
  }
};
