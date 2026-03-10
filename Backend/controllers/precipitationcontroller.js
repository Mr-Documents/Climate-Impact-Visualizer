import axios from "axios";

export const getPrecipitationSoil = async (req, res) => {
  const lat = req.query.lat || "5.56";   // Default: Accra
  const lon = req.query.lon || "-0.20";

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=precipitation,soil_temperature_0cm,soil_moisture_0_1cm`;

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

    // Clean precipitation: negative → 0, undefined → 0
    const cleanedPrecip = precipArr
      .map((val) => (typeof val === "number" && val > 0 ? val : 0))
      .slice(0, 24);

    // Build unified full series
    const series = timeArr.slice(0, 24).map((time, i) => ({
      time,
      precipitation: cleanedPrecip[i] ?? 0,
      soilTemp: soilTempArr[i] ?? null,
      soilMoisture: soilMoistArr[i] ?? null,
    }));

    return res.json({
      location: { lat, lon },
      hourly: {
        precipitation: cleanedPrecip,   // dashboard uses this
      },
      series,                            // extra detailed data (optional)
    });

  } catch (error) {
    console.error("Precipitation/Soil API ERROR:", error.message);

    return res.status(500).json({
      error: "Failed to fetch precipitation/soil data",
      details: error.message,
    });
  }
};
