// controllers/predictionClimate.js
import fetch from 'node-fetch';
import { predictClimateRisk } from '../prediction.js';
import { supabase } from '../routes/supabaseClient.js';

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
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m,soil_moisture_0_1cm&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,soil_moisture_0_1cm,uv_index,vapour_pressure_deficit&past_days=1&forecast_days=1`;
    const response = await fetch(url);
    const data = await response.json();

    // Extract current values
    const current = data.current || {};
    const precipitation = current.precipitation || 0;
    const windSpeed = current.wind_speed_10m || 0;
    const temperature = current.temperature_2m || 25;
    // Robust water detection: If soil moisture is entirely null or strictly zero across the series, treat as water/invalid.
    const hourlySoil = data.hourly?.soil_moisture_0_1cm || [];
    const isWater = !hourlySoil.some(v => v !== null && v !== undefined && v !== 0);

    let soilMoisture = current.soil_moisture_0_1cm;
    // Default for safety if terrestrial, but flag ensures prediction is bypassed if water
    if (isWater) soilMoisture = 0; 

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
    if (len === 0) throw new Error("Meteorological data arrays are empty.");

    let currentIndex = hourly.time.findIndex(t => t.startsWith(nowISO));
    if (currentIndex === -1 || currentIndex < TIME_STEPS - 1) currentIndex = Math.min(len - 1, TIME_STEPS - 1);
    currentIndex = Math.max(0, Math.min(currentIndex, len - 1));

    // Extract current UV and VPD from hourly data using the currentIndex
    const uvIndex = hourly.uv_index ? hourly.uv_index[currentIndex] : 0;
    
    // Calculate current VPD manually for higher precision based on current temp/humidity
    const currentSvp = 0.6108 * Math.exp((17.27 * temperature) / (temperature + 237.3));
    const vpdValue = currentSvp * (1 - ((current.relative_humidity_2m || 60) / 100));

    // Prepare historical data for visualization (last 24h)
    const historyData = {
      time: [],
      temperature: [],
      humidity: [],
      soilMoisture: [],
      precipitation: [],
      windSpeed: []
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
        historyData.windSpeed.push(hWind);
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
    let prediction = { drought: { score: 0, label: 'N/A' }, flood: { score: 0, label: 'N/A' } };
    
    if (!isWater) {
      prediction = await predictClimateRisk(featuresSequence);
    }

    // --- Persist to Supabase ---
    try {
      // 1. Upsert Location
      const { data: locData, error: locError } = await supabase
        .from('locations')
        .upsert({ latitude, longitude, name: locationName }, { onConflict: 'latitude,longitude' })
        .select()
        .single();

      if (locError) {
        throw new Error(`Location upsert failed: ${locError.message}`);
      }

      if (locData) {
        // 2. Log Climate Data & Predictions to 'climate_logs'
        await supabase.from('climate_logs').insert({
          location_id: locData.id,
          temp_avg: temperature,
          humidity: humidity,
          soil_moisture: isWater ? null : soilMoisture,
          precipitation: precipitation,
          flood_risk_label: prediction.flood.label,
          flood_risk_score: prediction.flood.score,
          drought_risk_label: prediction.drought.label,
          drought_risk_score: prediction.drought.score,
          // Note: heatwave_potential is calculated on frontend in current setup, 
          // but we can log raw inputs or calculate here if needed.
        });
      }

      // 3. Log active alerts to 'weather_alerts' table
      const alertsToLog = [];
      if (prediction.flood.label === "High") {
        alertsToLog.push({ location_id: locData.id, alert_type: 'Flood', severity: 'High', message: 'Flood warning: heavy precipitation and saturated soils detected.' });
      }
      if (prediction.drought.label === "High") {
        alertsToLog.push({ location_id: locData.id, alert_type: 'Drought', severity: 'High', message: 'Drought alert: soil moisture is low while temperatures are high.' });
      }
      // Basic backend heatwave check (matching front-end advisory logic)
      if (temperature > 35) {
        alertsToLog.push({ 
          location_id: locData.id, 
          alert_type: 'Heatwave', 
          severity: temperature >= 38 ? 'High' : 'Medium', 
          message: `Heat advisory: Temperatures (${temperature.toFixed(1)}°C) are approaching or exceeding the local threshold.` 
        });
      }

      if (alertsToLog.length > 0) {
        await supabase.from('weather_alerts').insert(alertsToLog);
      }
    } catch (dbError) {
      console.error('Supabase logging failed:', dbError.message);
      // We don't block the response if DB logging fails
    }

    res.json({
      location: { latitude, longitude },
      locationName,
      weather: { 
        precipitation: precipitation, 
        soilMoisture: isWater ? null : soilMoisture, 
        windSpeed: Number(windSpeed.toFixed(1)), 
        temperature: Number(temperature.toFixed(1)), 
        humidity: Math.round(humidity),
        uvIndex: Number(uvIndex.toFixed(1)),
        vpd: Number(vpdValue.toFixed(2))
      },
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
 * Fetches recent climate search history from Supabase
 */
export async function getSearchHistory(req, res) {
  try {
    const { data, error } = await supabase
      .from('climate_logs')
      .select('*, locations(name, latitude, longitude)')
      .order('created_at', { ascending: false })
      .limit(10); // Return last 10 searches

    if (error) throw error;
    res.json(data);
  } catch (err) {
      console.error('[DATABASE ERROR] History fetch failed:', err.message);
    res.status(500).json({ error: 'Failed to fetch history', details: err.message });
  }
}

/**
 * Fetches all global alerts from Supabase
 */
export async function getGlobalAlerts(req, res) {
  try {
    const { data, error } = await supabase
      .from('weather_alerts')
      .select('*, locations(name)')
      .order('timestamp', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
      console.error('[DATABASE ERROR] Alerts fetch failed:', err.message);
    res.status(500).json({ error: 'Failed to fetch alerts', details: err.message });
  }
}

/**
 * Deep Historical Analysis Engine (30+ Years)
 */
export async function getHistoricalAnalysis(req, res) {
  try {
    const { lat, lon, start_year = new Date().getFullYear() - 30 } = req.query;
    
    if (!lat || !lon) {
      return res.status(400).json({ error: "Latitude and Longitude are required." });
    }

    // 1. Check Supabase for existing cached data (within last 30 days)
    const { data: cachedData } = await supabase
      .from('historical_cache')
      .select('analysis_data, created_at')
      .eq('latitude', Number(lat).toFixed(2))
      .eq('longitude', Number(lon).toFixed(2))
      .eq('start_year', start_year)
      .maybeSingle();

    if (cachedData) {
      const cacheAge = Date.now() - new Date(cachedData.created_at).getTime();
      const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
      
      if (cacheAge < THIRTY_DAYS) {
        console.log(`[Cache Hit] Serving persisted historical data for ${lat},${lon}`);
        return res.json(cachedData.analysis_data);
      }
    }

    // Open-Meteo Archive lag: Set end_date to 5 days ago to ensure data availability
    const date = new Date();
    date.setDate(date.getDate() - 5);
    const end_date = date.toISOString().split('T')[0];
    const start_date = `${start_year}-01-01`;

    // Added temperature_2m_max for robust heatwave percentile thresholding
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${start_date}&end_date=${end_date}&daily=temperature_2m_mean,temperature_2m_max,precipitation_sum,shortwave_radiation_sum&timezone=auto`;
    
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
    const tempsRaw = data.daily.temperature_2m_mean || [];
    const n = data.daily.time.length;
    const validTemps = tempsRaw.filter(t => t !== null && t > -50 && t < 60);
    
    if (validTemps.length < 2 || n < 2) {
      return res.status(404).json({ error: "No data points found for this range." });
    }

    // Calculate 99th percentile of Maximum Temperatures (Relative Threshold)
    const maxTempsRaw = data.daily.temperature_2m_max || [];
    const validMaxTemps = maxTempsRaw.filter(t => t !== null);
    const maxSorted = [...validMaxTemps].sort((a, b) => a - b);
    const tempThreshold = maxSorted.length > 0 ? Math.max(33, maxSorted[Math.floor(maxSorted.length * 0.99)]) : 35;
    
    // Linear Regression for Trend (Using index 0...n-1 as X)
    let xSum = 0, ySum = 0, xySum = 0, xSqSum = 0;
    let validPoints = 0;
    for (let i = 0; i < n; i++) {
      if (tempsRaw[i] === null || tempsRaw[i] <= -50 || tempsRaw[i] >= 60) continue;
      xSum += i;
      ySum += tempsRaw[i];
      xySum += i * tempsRaw[i];
      xSqSum += i * i;
      validPoints++;
    }
    const denominator = (validPoints * xSqSum - xSum * xSum);
    const slope = denominator !== 0 ? (validPoints * xySum - xSum * ySum) / denominator : 0;

    // Anomaly Detection: Compare last 365 days to the long-term average
    const rainData = data.daily.precipitation_sum || [];
    const totalRain = rainData.reduce((a, b) => a + (b || 0), 0);
    const yearsCount = Math.max(1, n / 365);
    const avgAnnualRain = (totalRain / yearsCount);
    const lastYearRain = rainData.slice(-365).reduce((a, b) => a + (b || 0), 0);

    // --- Extreme Rainfall Calculations ---
    const wetDays = rainData.filter(r => r > 0.1).sort((a, b) => a - b);
    const p95Threshold = wetDays.length > 0 ? wetDays[Math.floor(wetDays.length * 0.95)] : 50;
    const extremeRainDays = rainData.filter(r => r > p95Threshold).length;
    const maxDailyRain = Math.max(...rainData, 0);
    const extremeRainFrequency = ((extremeRainDays / n) * 100).toFixed(2);

    
    // Prevent division by zero if avgAnnualRain is 0
    const rainAnomaly = avgAnnualRain > 0 ? (((lastYearRain - avgAnnualRain) / avgAnnualRain) * 100).toFixed(1) : "0.0";

    // --- Drought Index Calculation (Approximated SPI) ---
    // Aggregate precipitation by year
    const yearlyRain = {};
    data.daily.time.forEach((t, i) => {
      const year = t.split('-')[0];
      yearlyRain[year] = (yearlyRain[year] || 0) + (data.daily.precipitation_sum[i] || 0);
    });

    const years = Object.keys(yearlyRain);
    const rainValues = Object.values(yearlyRain);
    const meanRain = rainValues.reduce((a, b) => a + b, 0) / rainValues.length;
    const stdDevRain = Math.sqrt(rainValues.reduce((s, v) => s + Math.pow(v - meanRain, 2), 0) / rainValues.length);

    const droughtIndexSeries = years.map(year => {
      const val = yearlyRain[year];
      // SPI Formula: (Value - Mean) / StdDev
      const spi = stdDevRain > 0 ? (val - meanRain) / stdDevRain : 0;
      return {
        year,
        spi: Number(spi.toFixed(2)),
        totalRain: Number(val.toFixed(1))
      };
    });

    const result = {
      raw: {
        ...data.daily,
        humidity_2m_mean: Array(n).fill(null), // Archive API doesn't provide daily mean humidity
        shortwave_radiation_sum: data.daily.shortwave_radiation_sum || []
      },
      insights: {
        tempTrend: (slope * n).toFixed(2),
        isWarming: (slope * n) > 0,
        tempThreshold: Number(tempThreshold.toFixed(1)),
        extremeRainThreshold: Number(p95Threshold.toFixed(1)),
        avgPrecip: avgAnnualRain.toFixed(2),
        rainAnomaly: rainAnomaly,
        droughtSeries: droughtIndexSeries,
        maxDailyRain: maxDailyRain.toFixed(1),
        extremeRainCount: extremeRainDays,
        extremeRainFrequency: extremeRainFrequency
      }
    };

    // 2. Store in Supabase cache before returning
    await supabase.from('historical_cache').upsert({
      latitude: Number(lat).toFixed(2),
      longitude: Number(lon).toFixed(2),
      start_year: start_year,
      analysis_data: result,
      created_at: new Date().toISOString()
    });

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

    // Using GMT to match frontend ISO time comparison and 2 days to handle date-line transitions
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=uv_index,vapour_pressure_deficit&forecast_days=2&timezone=GMT`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    res.json(data);
  } catch (err) {
    console.error("UV/Dryness Fetch Error:", err);
    res.status(500).json({ error: "Failed to retrieve UV and Dryness data" });
  }
}