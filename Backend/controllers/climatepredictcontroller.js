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
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&hourly=soil_moisture_0_7cm`;
    const response = await fetch(url);
    const data = await response.json();

    // Extract values
    const precipitation = data.current_weather?.precipitation || 0; // mm/h
    const windSpeed = data.current_weather?.windspeed || 0; // km/h
    const temperature = data.current_weather?.temperature || 25; // °C

    // Get latest soil moisture from hourly if available
    const soilMoistureHourly = data.hourly?.soil_moisture_0_7cm;
    const soilMoisture = soilMoistureHourly && soilMoistureHourly.length > 0
      ? soilMoistureHourly[soilMoistureHourly.length - 1] / 100 // normalize 0-1
      : 0.5;

    // Use default humidity if Open-Meteo doesn’t provide
    const humidity = data.current_weather?.humidity !== undefined
      ? data.current_weather.humidity / 100
      : 0.7;

    // Call prediction function
    const prediction = await predictClimateRisk({
      precipitation,
      soilMoisture,
      windSpeed,
      temperature,
      humidity
    });

    res.json({
      location: { latitude, longitude },
      weather: { precipitation, soilMoisture, windSpeed, temperature, humidity },
      prediction
    });

  } catch (err) {
    console.error('Prediction error:', err);
    res.status(500).json({ error: 'Prediction failed', details: err.message });
  }
}