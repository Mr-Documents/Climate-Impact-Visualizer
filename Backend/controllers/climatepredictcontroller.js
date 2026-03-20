// controllers/predictionClimate.js
import fetch from 'node-fetch';
import { predictClimateRisk } from '../prediction.js';

/**
 * Handles /api/predict requests with live Open-Meteo weather data
 * Expects: { latitude, longitude }
 */
export async function predictClimate(req, res) {
  try {
    const { latitude, longitude } = req.body;

    if (latitude == null || longitude == null) {
      return res.status(400).json({ error: 'latitude and longitude are required' });
    }

    // Fetch current weather from Open-Meteo
    // We need past data for the sequence (LSTM context)
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m,soil_moisture_0_1cm&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,soil_moisture_0_1cm&past_days=1&forecast_days=1`;
    const response = await fetch(url);
    const data = await response.json();

    // Extract current values
    const current = data.current || {};
    const precipitation = current.precipitation || 0;
    const windSpeed = current.wind_speed_10m || 0;
    const temperature = current.temperature_2m || 25;
    
    // Check for water body (Open-Meteo returns null for soil moisture over water)
    let soilMoisture = current.soil_moisture_0_1cm;
    const isWater = soilMoisture === null || soilMoisture === undefined;
    if (isWater) soilMoisture = 0; // Default for calculation safety, but prediction will be skipped

    const humidity = current.relative_humidity_2m || 60;

    // For LSTM, we need a sequence; here we create a simple 24-hour sequence using same values repeated
    // We use the 'hourly' array to reconstruct the last 24 hours of context.
    const TIME_STEPS = 24;
    const hourly = data.hourly || {};
    const len = hourly.time ? hourly.time.length : 0;
    
    // Find the index closest to now (or just take the last 24 hours available up to now)
    // Open-Meteo returns data starting from 00:00 yesterday (due to past_days=1). 
    // We take the slice ending at the current hour.
    const nowISO = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
    let currentIndex = hourly.time.findIndex(t => t.startsWith(nowISO));
    if (currentIndex === -1) currentIndex = len - 1; // Fallback to end
    if (currentIndex < TIME_STEPS) currentIndex = TIME_STEPS; // Ensure we have enough history

    // Prepare historical data for visualization (last 24h)
    const historyData = {
      time: [],
      temperature: [],
      humidity: [],
      soilMoisture: [],
      precipitation: []
    };
    const featuresSequence = [];

    for (let i = TIME_STEPS - 1; i >= 0; i--) {
      const idx = currentIndex - i;
      
      const hTemp = hourly.temperature_2m[idx] || temperature;
      const hHum = hourly.relative_humidity_2m[idx] || humidity;
      const hSoil = hourly.soil_moisture_0_1cm[idx] || soilMoisture;
      const hWind = hourly.wind_speed_10m[idx] || windSpeed;
      const hDir = hourly.wind_direction_10m[idx] || 0;
      
      // Collect history for frontend charts
      if (hourly.time && hourly.time[idx]) {
        const tDate = new Date(hourly.time[idx]);
        historyData.time.push(`${tDate.getHours()}:00`);
        historyData.temperature.push(hTemp);
        historyData.humidity.push(hHum);
        historyData.soilMoisture.push(hSoil);
        historyData.precipitation.push(hourly.precipitation ? hourly.precipitation[idx] : 0);
      }

      // Calculate derived features matching training script
      // 1. VPD
      // SVP = 0.6108 * exp(17.27 * T / (T + 237.3))
      const svp = 0.6108 * Math.exp((17.27 * hTemp) / (hTemp + 237.3));
      const vpd = svp * (1 - (hHum / 100));

      // 2. Wind vector
      const rad = hDir * (Math.PI / 180);
      const sinWind = Math.sin(rad);
      const cosWind = Math.cos(rad);

      // 3. Time
      const date = new Date(hourly.time[idx]);
      const hour = date.getHours();
      const month = date.getMonth() + 1;

      // Feature vector must match trainClimateModel.js order:
      // [temp, humidity, soil, windSpeed, vpd, sinWind, cosWind, hour, month]
      featuresSequence.push([
        hTemp,
        hHum,
        hSoil,
        hWind,
        vpd,
        sinWind,
        cosWind,
        hour,
        month
      ]);
    }

    // Call the updated prediction function (flood + drought)
    let prediction = { drought: { score: 0, label: 'N/A' }, flood: { score: 0, label: 'N/A' } };
    
    if (!isWater) {
      prediction = await predictClimateRisk(featuresSequence);
    }

    res.json({
      location: { latitude, longitude },
      weather: { precipitation, soilMoisture: isWater ? null : soilMoisture, windSpeed, temperature, humidity },
      history: historyData,
      prediction, // contains { drought: { score, label }, flood: { score, label } }
      isWater // Flag to alert frontend
    });

  } catch (err) {
    console.error('Prediction error:', err);
    res.status(500).json({ error: 'Prediction failed', details: err.message });
  }
}