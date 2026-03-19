import axios from 'axios';
import { predictClimateRisk } from '../prediction.js';

export const getFloodRisk = async (req, res) => {
  const lat = req.query.lat || '5.56'; // Default Accra
  const lon = req.query.lon || '-0.20';
  const useAI = req.query.ai === 'true';

  try {
    // Fetch precipitation, soil moisture, and wind speed
    // Added temperature, humidity, wind direction for AI model inputs
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=precipitation,soil_moisture_0_1cm,wind_speed_10m,temperature_2m,relative_humidity_2m,wind_direction_10m&past_days=1&forecast_days=1`;
    const response = await axios.get(url);
    const { hourly } = response.data;

    if (!hourly || !hourly.time?.length) {
      return res.status(500).json({ error: "Missing climate data from API" });
    }

    const idx = hourly.time.length - 1;

    // Extract values safely
    let precipitation = Number(hourly.precipitation?.[idx]);
    let soilMoisture = Number(hourly.soil_moisture_0_1cm?.[idx]);
    let windSpeed = Number(hourly.wind_speed_10m?.[idx]);

    // Provide safe defaults
    if (!isFinite(precipitation) || precipitation <= 0) {
      // Use historical average for March 14
      try {
        const currentYear = new Date().getFullYear();
        const historicalUrls = [];
        for (let year = currentYear - 5; year < currentYear; year++) {
          const startDate = `${year}-03-14`;
          const endDate = `${year}-03-15`;
          historicalUrls.push(
            `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&hourly=precipitation&start_date=${startDate}&end_date=${endDate}`
          );
        }
        const historicalResponses = await Promise.all(historicalUrls.map(url => axios.get(url)));
        const historicalPrecip = historicalResponses.map(res => res.data?.hourly?.precipitation || []).flat();
        precipitation = historicalPrecip.length > 0 ? historicalPrecip.reduce((a, b) => a + b, 0) / historicalPrecip.length : 0.1;
      } catch (error) {
        precipitation = 0.1; // fallback
      }
    }
    if (!isFinite(soilMoisture) || soilMoisture < 0) soilMoisture = 0.2;
    if (!isFinite(windSpeed) || windSpeed < 0) windSpeed = 5;

    // --- Rule-based flood risk ---
    let risk = "Low";
    if (precipitation > 20 || soilMoisture > 0.7) {
      risk = "High";
    } else if (precipitation > 10 || soilMoisture > 0.4) {
      risk = "Medium";
    }

    // --- AI-based prediction (optional) ---
    // NOTE: "AI" here is a deterministic scoring function. It uses the same
    // inputs (precipitation, soil moisture, wind speed) and returns a consistent
    // risk label/score. This is not a true machine learning model and cannot
    // guarantee ~100% real-world accuracy.
    if (useAI) {
      try {
        // Construct 24-step sequence for the AI model (same feature set as training)
        // Features: [temp, humidity, soil, windSpeed, vpd, sinWind, cosWind, hour, month]
        const TIME_STEPS = 24;
        // Find current index based on time, defaulting to last index if not found
        const nowISO = new Date().toISOString().slice(0, 13);
        let currentIndex = hourly.time.findIndex(t => t.startsWith(nowISO));
        if (currentIndex === -1 || currentIndex < TIME_STEPS) currentIndex = hourly.time.length - 1;

        const featuresSequence = [];
        for (let i = TIME_STEPS - 1; i >= 0; i--) {
          const idx = currentIndex - i;
          const hTemp = hourly.temperature_2m[idx] || 25;
          const hHum = hourly.relative_humidity_2m[idx] || 60;
          const hSoil = hourly.soil_moisture_0_1cm[idx] || 0.2;
          const hWind = hourly.wind_speed_10m[idx] || 5;
          const hDir = hourly.wind_direction_10m[idx] || 0;

          // VPD
          const svp = 0.6108 * Math.exp((17.27 * hTemp) / (hTemp + 237.3));
          const vpd = svp * (1 - (hHum / 100));

          const rad = hDir * (Math.PI / 180);

          // Date features
          const d = new Date(hourly.time[idx]);
          
          featuresSequence.push([
            hTemp,
            hHum,
            hSoil,
            hWind,
            vpd,
            Math.sin(rad),
            Math.cos(rad),
            d.getHours(),
            d.getMonth() + 1
          ]);
        }
        
        const aiResult = await predictClimateRisk(featuresSequence);
        return res.json({
          inputs: { precipitation, soilMoisture, windSpeed },
          floodRisk: aiResult.label || risk,
          score: aiResult.score || null,
        });
      } catch (aiError) {
        console.error("Flood risk AI prediction error:", aiError?.message || aiError);
        // Fall back to rule-based risk
      }
    }

    return res.json({
      inputs: { precipitation, soilMoisture, windSpeed },
      floodRisk: risk,
    });

  } catch (error) {
    console.error("Flood risk fetch error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to calculate flood risk" });
  }
};
