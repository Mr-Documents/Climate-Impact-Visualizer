import axios from 'axios';

export const getCloudSolar = async (req, res) => {
  const lat = req.query.lat || '5.56';  // Default Accra
  const lon = req.query.lon || '-0.20';

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=cloudcover,shortwave_radiation`;
    const response = await axios.get(url);

    const { hourly } = response.data;
    const series = hourly.time.map((time, i) => ({
      time,
      cloudCover: hourly.cloudcover[i],
      solarRadiation: hourly.shortwave_radiation[i],
    }));

    res.json({ location: { lat, lon }, series });
  } catch (error) {
    console.error('Cloud/Solar fetch error:', error.message);
    res.status(500).json({ error: 'Failed to fetch cloud/solar data' });
  }
};
