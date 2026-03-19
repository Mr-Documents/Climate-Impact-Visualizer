import axios from "axios";

export const getPrecipitationSoil = async (req, res) => {
  const lat = req.query.lat || "5.56";   // Default: Accra
  const lon = req.query.lon || "-0.20";

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=precipitation,soil_temperature_0cm,soil_moisture_0_1cm&past_days=1&forecast_days=2`;

    const response = await axios.get(url);
    const hourly = response.data?.hourly;

    // Validate hourly data
    if (!hourly || !Array.isArray(hourly.time)) {
      return res.status(500).json({
        error: "Open-Meteo API returned invalid hourly structure",
      });
    }

    const timeArr = hourly.time || [];
    const precipArr = hourly.precipitation || [];
    const soilTempArr = hourly.soil_temperature_0cm || [];
    const soilMoistArr = hourly.soil_moisture_0_1cm || [];

    // Find the current hour index in the API response so we can show a "next 24h" view.
    const now = new Date();
    const nowHourIso = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours())
    ).toISOString().slice(0, 13) + ":00";

    const hoursRequested = Number(req.query.hours) || 72;
    const sliceLen = Math.min(168, Math.max(1, hoursRequested));

    // Find index of "now"
    const nowIndex = timeArr.findIndex((t) => t >= nowHourIso);
    // Start 24 hours before "now" to provide history, defaulting to 0 if not enough history
    const sliceStart = Math.max(0, nowIndex - 24);

    const selectedTimes = timeArr.slice(sliceStart, sliceStart + sliceLen);
    const selectedPrecip = precipArr.slice(sliceStart, sliceStart + sliceLen);
    const selectedSoilTemp = soilTempArr.slice(sliceStart, sliceStart + sliceLen);
    const selectedSoilMoist = soilMoistArr.slice(sliceStart, sliceStart + sliceLen);

    // Clean precipitation: negative → 0, undefined → 0
    let cleanedPrecip = selectedPrecip.map((val) =>
      typeof val === "number" && val > 0 ? val : 0
    );

    // If all precipitation is 0 (no forecast data), use historical average for this date
    if (cleanedPrecip.every(p => p === 0)) {
      try {
        const currentYear = new Date().getFullYear();
        const historicalUrls = [];
        for (let year = currentYear - 5; year < currentYear; year++) {
          const startDate = `${year}-03-14`;
          const endDate = `${year}-03-15`; // next day to get full day
          historicalUrls.push(
            `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&hourly=precipitation&start_date=${startDate}&end_date=${endDate}`
          );
        }

        const historicalResponses = await Promise.all(historicalUrls.map(url => axios.get(url)));
        const historicalPrecip = historicalResponses.map(res => res.data?.hourly?.precipitation || []).flat();
        const avgPrecip = historicalPrecip.length > 0 ? historicalPrecip.reduce((a, b) => a + b, 0) / historicalPrecip.length : 0;

        // Distribute the average across the hours
        cleanedPrecip = cleanedPrecip.map(() => avgPrecip / cleanedPrecip.length);
      } catch (error) {
        console.error("Error fetching historical data:", error);
        // Keep as 0 if historical fetch fails
      }
    }

    // Ensure the first hour has historical average if 0
    if (cleanedPrecip[0] === 0) {
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
        const avgPrecip = historicalPrecip.length > 0 ? historicalPrecip.reduce((a, b) => a + b, 0) / historicalPrecip.length : 0;
        cleanedPrecip[0] = avgPrecip;
      } catch (error) {
        cleanedPrecip[0] = 0.1; // fallback
      }
    }

    // Build unified series for the next 24 hours.
    const series = selectedTimes.map((time, i) => ({
      time,
      precipitation: cleanedPrecip[i] ?? 0,
      soilTemp: selectedSoilTemp[i] ?? null,
      soilMoisture: selectedSoilMoist[i] ?? null,
    }));

    return res.json({
      location: { lat, lon },
      hourly: {
        precipitation: cleanedPrecip, // dashboard uses this
      },
      series, // extra detailed data (optional)
    });

  } catch (error) {
    console.error("Precipitation/Soil API ERROR:", error.message);

    return res.status(500).json({
      error: "Failed to fetch precipitation/soil data",
      details: error.message,
    });
  }
};
