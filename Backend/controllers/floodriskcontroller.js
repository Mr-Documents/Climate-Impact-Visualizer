import axios from 'axios';
import { predictClimateRisk } from '../prediction.js';

export const getFloodRisk = async (req, res) => {
  const lat = req.query.lat || '5.56'; // Default Accra
  const lon = req.query.lon || '-0.20';
  const useAI = req.query.ai === 'true';

  try {
    // Fetch precipitation, soil moisture, and wind speed
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=precipitation,soil_moisture_0_1cm,wind_speed_10m`;
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
    if (!isFinite(precipitation) || precipitation < 0) precipitation = 0;
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
        const aiResult = await predictClimateRisk({ precipitation, soilMoisture, windSpeed });
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
