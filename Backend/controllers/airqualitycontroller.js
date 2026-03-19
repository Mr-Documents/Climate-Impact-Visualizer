import axios from 'axios';

export const getAirQuality = async (req, res) => {
  const lat = req.query.lat || '5.56';  // Default Accra
  const lon = req.query.lon || '-0.20';

  try {
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone&hourly=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone`;
    const response = await axios.get(url);

    const { current, hourly } = response.data;
    const series = (hourly?.time || []).map((time, i) => ({
      time,
      pm10: hourly.pm10[i],
      pm2_5: hourly.pm2_5[i],
      co: hourly.carbon_monoxide[i],
      no2: hourly.nitrogen_dioxide[i],
      so2: hourly.sulphur_dioxide[i],
      o3: hourly.ozone[i],
    }));

    res.json({ location: { lat, lon }, current, series });
  } catch (error) {
    console.error('Air quality fetch error:', error.message);
    res.status(500).json({ error: 'Failed to fetch air quality data' });
  }
};
