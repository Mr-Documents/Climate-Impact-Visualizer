import React, { useState } from "react";
import CoordinateForm from "../components/forms/coordinateform";
import UnifiedMap from "../components/map/mapview";
import WeatherIcon from "../components/ui/weathericon";
import axios from "axios";
import ResultCard from "../components/reusable/resultcard";

const FloodRiskPage = () => {
  const [coords, setCoords] = useState({ lat: 5.6037, lon: -0.1870 });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleAnalyze = async (lat, lon) => {
    setCoords({ lat, lon });
    setLoading(true);
    setResult(null);

    try {
      const response = await axios.get(
        `http://localhost:5000/api/floodrisk?lat=${lat}&lon=${lon}&ai=true`
      );
      setResult(response.data);
    } catch (err) {
      console.error(err);
      alert("Failed to analyze flood risk");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container py-4">

      <h2 className="mb-3 d-flex align-items-center gap-2">
        <WeatherIcon type="flood" size={35} />
        Flood Risk Analysis
      </h2>

      {/* Coordinates Form — Now identical to PrecipitationPage */}
      <CoordinateForm
        onSubmit={handleAnalyze}
        loading={loading}
        buttonText="Analyze Flood Risk"
        buttonColor="primary"
      />

      {/* Loading Spinner */}
      {loading && (
        <div className="text-center my-4">
          <div className="spinner-border text-primary" role="status"></div>
          <p className="mt-2">Analyzing flood risk...</p>
        </div>
      )}

      {/* Map — now clickable like precipitation page */}
      <UnifiedMap
        lat={coords.lat}
        lon={coords.lon}
        onSelect={(lat, lon) => setCoords({ lat, lon })}
      />

      {/* Results */}
      {result && (
        <ResultCard
          title="Flood Risk Analysis"
          icon={<WeatherIcon type="flood" size={28} />}
          color={
            result.risk === "High"
              ? "danger"
              : result.risk === "Medium"
              ? "warning"
              : "success"
          }
        >
          <p><strong>AI Predicted Risk:</strong> {result.risk}</p>
          <p><strong>Rainfall:</strong> {result.rainfall} mm</p>
          <p><strong>Soil Moisture:</strong> {result.soilMoisture} %</p>
          <p><strong>Humidity:</strong> {result.humidity} %</p>
          <p><strong>Notes:</strong> {result.message}</p>
          <p><strong>Coordinates:</strong> {coords.lat}, {coords.lon}</p>
        </ResultCard>
      )}

    </div>
  );
};

export default FloodRiskPage;
