import React, { useState } from "react";
import CoordinateForm from "../components/forms/coordinateform";
import UnifiedMap from "../components/map/mapview";
import LoadingSpinner from "../components/reusable/loadingspinner";
import ResultCard from "../components/reusable/resultcard";
import RainfallChart from "../components/charts/rainfallchart";
import { FaCloudRain } from "react-icons/fa";
import axios from "axios";

const PrecipitationPage = () => {
  const [coords, setCoords] = useState({ lat: 5.6037, lon: -0.1870 });
  const [loading, setLoading] = useState(false);
  const [forecast, setForecast] = useState(null);

  const handleAnalyze = async (lat, lon) => {
    setCoords({ lat, lon });
    setLoading(true);
    setForecast(null);

    try {
      const res = await axios.get(
        `http://localhost:5000/api/precipitation?lat=${lat}&lon=${lon}`
      );

      console.log("Rainfall forecast:", res.data);
      setForecast(res.data);
    } catch (err) {
      console.error("Precipitation error:", err);
      alert("Failed to fetch precipitation forecast.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container py-4">

      <h2 className="mb-3 d-flex align-items-center gap-2">
        <FaCloudRain size={32} />
        Precipitation Forecast
      </h2>

      {/* Coordinates Form (same UI as FloodRisk) */}
      <CoordinateForm
        onSubmit={handleAnalyze}
        loading={loading}
        buttonText="Get Forecast"
        buttonColor="success"
      />

      {/* Loading Spinner (same style as FloodRiskPage) */}
      {loading && (
        <div className="text-center my-4">
          <div className="spinner-border text-success" role="status"></div>
          <p className="mt-2">Fetching precipitation forecast...</p>
        </div>
      )}

      {/* Map (linked to selected coordinates) */}
      <UnifiedMap
        lat={coords.lat}
        lon={coords.lon}
        onSelect={(lat, lon) => setCoords({ lat, lon })}
      />

      {/* Results */}
      {forecast && (
        <ResultCard
          title="Rainfall Forecast"
          icon={<FaCloudRain size={28} />}
          color="success"
        >
          <p><strong>Coordinates:</strong> {coords.lat}, {coords.lon}</p>

          {/* Chart using forecast.series */}
          <RainfallChart data={forecast.series} />
        </ResultCard>
      )}

    </div>
  );
};

export default PrecipitationPage;
