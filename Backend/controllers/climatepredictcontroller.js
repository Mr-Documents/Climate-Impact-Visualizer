// controllers/predictionClimate.js
import fetch from 'node-fetch';
import { predictClimateRisk } from '../prediction.js';

// In-memory cache for historical analysis to prevent API rate limiting
const historicalCache = new Map();
const CACHE_LIMIT = 100; // Keep last 100 locations

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

    // 1. Reverse Geocoding for readable location name
    const geoUrl = `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`;
    const geoRes = await fetch(geoUrl, { headers: { 'User-Agent': 'ClimateVisualizer/1.0' } });
    const geoData = await geoRes.json();
    const locationName = geoData.display_name?.split(',').slice(0, 3).join(',') || "Unknown Location";

    // 2. Fetch 30-day Recent Snapshot
    const lastMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const snapshotUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${latitude}&longitude=${longitude}&start_date=${lastMonth}&end_date=${new Date().toISOString().split('T')[0]}&daily=precipitation_sum,temperature_2m_mean&timezone=auto`;
    const snapshotRes = await fetch(snapshotUrl);
    const snapshotData = await snapshotRes.json();

    // Fetch current weather from Open-Meteo
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m,soil_moisture_0_1cm&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,soil_moisture_0_1cm&past_days=1&forecast_days=1`;
    const response = await fetch(url);
    const data = await response.json();

    // Extract current values
    const current = data.current || {};
    const precipitation = current.precipitation || 0;
    const windSpeed = current.wind_speed_10m || 0;
    const temperature = current.temperature_2m || 25;
    
    // Check for water body (Open-Meteo returns null for soil moisture over water in hourly data)
    let soilMoisture = current.soil_moisture_0_1cm;
    const hourlySoil = data.hourly?.soil_moisture_0_1cm || [];
    
    // Consider it water if current is null, OR if valid hourly readings are non-existent (all nulls)
    const hasValidHistory = hourlySoil.some(v => v !== null && v !== undefined);
    const isWater = (soilMoisture === null || soilMoisture === undefined) || !hasValidHistory;

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
    // Default to '--' if water/invalid so frontend treats it as invalid data
    let prediction = { drought: { score: 0, label: '--' }, flood: { score: 0, label: '--' } };
    
    if (!isWater) {
      prediction = await predictClimateRisk(featuresSequence);
    }

    res.json({
      location: { latitude, longitude },
      locationName,
      weather: { precipitation, soilMoisture: isWater ? null : soilMoisture, windSpeed, temperature, humidity },
      history: historyData,
      recentSnapshot: snapshotData.daily,
      prediction, // contains { drought: { score, label }, flood: { score, label } }
      isWater // Flag to alert frontend
    });

  } catch (err) {
    console.error('Prediction error:', err);
    res.status(500).json({ error: 'Prediction failed', details: err.message });
  }
}

/**
 * Deep Historical Analysis Engine (30+ Years)
 */
export async function getHistoricalAnalysis(req, res) {
  try {
    const { lat, lon, start_year = 1990 } = req.query;
    
    if (!lat || !lon) {
      return res.status(400).json({ error: "Latitude and Longitude are required." });
    }

    // 1. Define the cache key and check for existing data
    const cacheKey = `${Number(lat).toFixed(2)}_${Number(lon).toFixed(2)}_${start_year}`;
    if (historicalCache.has(cacheKey)) {
      console.log(`[Cache Hit] Serving historical data for ${cacheKey}`);
      return res.json(historicalCache.get(cacheKey));
    }

    // Open-Meteo Archive lag: Set end_date to 5 days ago to ensure data availability
    const date = new Date();
    date.setDate(date.getDate() - 5);
    const end_date = date.toISOString().split('T')[0];
    const start_date = `${start_year}-01-01`;

    // Corrected parameter: relative_humidity_2m_mean
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${start_date}&end_date=${end_date}&daily=temperature_2m_mean,precipitation_sum,relative_humidity_2m_mean&timezone=auto`;
    
    const response = await fetch(url);
    const data = await response.json();

    // Handle API Rate Limiting specifically
    if (data.error && (data.reason?.includes("limit") || response.status === 429)) {
      return res.status(429).json({ 
        error: "API Limit Reached", 
        reason: "The weather provider is currently busy. Please wait 60 seconds before requesting new historical data." 
      });
    }

    if (data.error || !data.daily || !data.daily.temperature_2m_mean) {
      console.error("Open-Meteo Archive Error:", data.reason || "Invalid coordinates or missing data");
      return res.status(400).json({ 
        error: "Historical data not found", 
        reason: data.reason || "The weather archive is unavailable for this specific coordinate/year range." 
      });
    }

    // Statistical Computations
    // Filter out nulls to ensure valid regression
    const temps = data.daily.temperature_2m_mean.filter(t => t !== null);
    const n = temps.length;
    
    if (n < 2) {
      return res.status(404).json({ error: "No data points found for this range." });
    }
    
    // Linear Regression for Trend (Using index 0...n-1 as X)
    let xSum = 0, ySum = 0, xySum = 0, xSqSum = 0;
    for (let i = 0; i < n; i++) {
      xSum += i;
      ySum += temps[i];
      xySum += i * temps[i];
      xSqSum += i * i;
    }
    const denominator = (n * xSqSum - xSum * xSum);
    const slope = denominator !== 0 ? (n * xySum - xSum * ySum) / denominator : 0;

    // Anomaly Detection: Compare last 365 days to the long-term average
    const rainData = data.daily.precipitation_sum || [];
    const totalRain = rainData.reduce((a, b) => a + (b || 0), 0);
    const yearsCount = Math.max(1, n / 365);
    const avgAnnualRain = (totalRain / yearsCount);
    const lastYearRain = rainData.slice(-365).reduce((a, b) => a + (b || 0), 0);
    
    // Prevent division by zero if avgAnnualRain is 0
    const rainAnomaly = avgAnnualRain > 0 ? (((lastYearRain - avgAnnualRain) / avgAnnualRain) * 100).toFixed(1) : "0.0";

    const result = {
      raw: {
        ...data.daily,
        humidity_2m_mean: data.daily.relative_humidity_2m_mean || Array(n).fill(null)
      },
      insights: {
        tempTrend: (slope * n).toFixed(2),
        isWarming: (slope * n) > 0,
        avgPrecip: avgAnnualRain.toFixed(2),
        rainAnomaly: rainAnomaly
      }
    };

    // Store in cache before returning
    if (historicalCache.size >= CACHE_LIMIT) {
      const firstKey = historicalCache.keys().next().value;
      historicalCache.delete(firstKey);
    }
    historicalCache.set(cacheKey, result);

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * Handles /api/uv-dryness requests
 * Fetches UV Index and Vapour Pressure Deficit (Dryness)
 */
export async function getUVDryness(req, res) {
  try {
    const { lat, lon } = req.query;
    if (!lat || !lon) return res.status(400).json({ error: 'Coordinates required' });

    // Open-Meteo API for UV (hourly/current) and VPD (hourly)
    // Removed &timezone=auto to ensure response uses UTC, matching frontend's ISO date comparison
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=uv_index,vapour_pressure_deficit&current=uv_index,is_day&forecast_days=1`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    res.json(data);
  } catch (err) {
    console.error("UV/Dryness Fetch Error:", err);
    res.status(500).json({ error: "Failed to retrieve UV and Dryness data" });
  }
}