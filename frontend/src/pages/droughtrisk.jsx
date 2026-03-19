import React, { useState } from "react";
import CoordinateForm from "../components/forms/coordinateform";
import UnifiedMap from "../components/map/mapview";
import WeatherIcon from "../components/ui/weathericon";
import axios from "axios";
import ResultCard from "../components/reusable/resultcard";

const DroughtRiskPage = () => {
  const [coords, setCoords] = useState({ lat: 5.6037, lon: -0.1870 });
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  const handleAnalyze = async (lat, lon) => {
    setCoords({ lat, lon });
    setLoading(true);
    setData(null);

    try {
      const res = await axios.post("http://localhost:5000/api/predict", {
        latitude: lat,
        longitude: lon,
      });
      setData(res.data);
    } catch (err) {
      console.error("Drought prediction error:", err);
      alert("Failed to retrieve drought prediction.");
    } finally {
      setLoading(false);
    }
  };

  // ✅ FIXED: use "data" instead of undefined "prediction"
  const droughtRisk = data?.prediction?.drought;
  const weather = data?.weather;

  const getRiskColor = (riskLabel) => {
    const r = (riskLabel || "").toLowerCase();
    if (r === "high") return "danger";
    if (r === "medium") return "warning";
    if (r === "low") return "success";
    return "secondary";
  };

  const humidityPct =
    weather?.humidity != null
      ? Math.round(weather.humidity * 100)
      : null;

  const soilMoisturePct =
    weather?.soilMoisture != null
      ? Math.round((weather.soilMoisture || 0) * 100)
      : null;

  const drynessIndex = weather
    ? Number((weather.temperature * (1 - (weather.humidity ?? 0))).toFixed(1))
    : null;

  return (
    <div className="container py-4">
      <h2 className="mb-3 d-flex align-items-center gap-2">
        <WeatherIcon type="drought" size={35} />
        Drought Severity Prediction
      </h2>

      <p className="text-muted mb-3">
        Use AI-powered predictions to estimate drought severity based on recent
        weather, soil moisture, and temperature data.
      </p>

      <CoordinateForm
        onSubmit={handleAnalyze}
        loading={loading}
        buttonText="Analyze Drought Risk"
        buttonColor="warning"
      />

      {loading && (
        <div className="text-center my-4">
          <div className="spinner-border text-warning" role="status" />
          <p className="mt-2">Calculating drought severity...</p>
        </div>
      )}

      <UnifiedMap
        lat={coords.lat}
        lon={coords.lon}
        onSelect={(lat, lon) => setCoords({ lat, lon })}
      />

      {/* ✅ FIXED: safe rendering */}
      {data?.prediction?.drought && (
        <ResultCard
          title="Drought Risk Prediction"
          icon={<WeatherIcon type="drought" size={28} />}
          color={getRiskColor(droughtRisk.label)}
        >
          <p>
            <strong>AI Predicted Severity:</strong>{" "}
            {droughtRisk.label} (
            {((droughtRisk.score ?? 0) * 100).toFixed(1)}%)
          </p>

          {weather && (
            <>
              <p>
                <strong>Temperature:</strong> {weather.temperature}°C
              </p>
              <p>
                <strong>Humidity:</strong>{" "}
                {humidityPct != null ? `${humidityPct}%` : "N/A"}
              </p>
              <p>
                <strong>Soil Moisture:</strong>{" "}
                {soilMoisturePct != null ? `${soilMoisturePct}%` : "N/A"}
              </p>
              <p>
                <strong>Precipitation:</strong>{" "}
                {weather.precipitation ?? "N/A"} mm
              </p>
              <p>
                <strong>Dryness Index:</strong>{" "}
                {drynessIndex != null ? drynessIndex : "N/A"}
              </p>
            </>
          )}

          <p>
            <strong>Coordinates:</strong> {coords.lat}, {coords.lon}
          </p>

          <p className="text-muted small mb-0">
            Tip: Higher dryness index values, low humidity, and low soil
            moisture indicate a stronger drought signal.
          </p>
        </ResultCard>
      )}
    </div>
  );
};

export default DroughtRiskPage;

