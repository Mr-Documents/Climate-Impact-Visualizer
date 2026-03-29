import React, { useState } from "react";
import CoordinateForm from "../components/forms/coordinateform";
import ResultCard from "../components/reusable/resultcard";
import WeatherIcon from "../components/ui/weathericon";
import axios from "axios";
import { FaChartLine } from "react-icons/fa";

const PredictionsPage = () => {
  const [coords, setCoords] = useState({ lat: 5.6037, lon: -0.1870 });
  const [loading, setLoading] = useState(false);
  const [prediction, setPrediction] = useState(null);

  const handleAnalyze = async (lat, lon) => {
    setCoords({ lat, lon });
    setLoading(true);
    setPrediction(null);

    try {
      const res = await axios.post("http://localhost:5000/api/predict", {
        latitude: lat,
        longitude: lon,
      });

      setPrediction(res.data?.prediction ?? null);
    } catch (err) {
      console.error("Predictions error:", err);
      alert("Failed to retrieve predictions.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container py-4">
      <h2 className="mb-3 d-flex align-items-center gap-2">
        <FaChartLine size={32} />
        Flood & Drought Predictions
      </h2>

      <p className="text-muted mb-4">
        Generate AI-based flood and drought risk scores for a location using recent weather and soil data.
      </p>

      <CoordinateForm
        onSubmit={handleAnalyze}
        loading={loading}
        buttonText="Analyze Predictions"
        buttonColor="primary"
      />

      {loading && (
        <div className="text-center my-4">
          <div className="spinner-border text-primary" role="status" />
          <p className="mt-2">Calculating predictions...</p>
        </div>
      )}

      {prediction && (
        <ResultCard
          title="Model Predictions"
          icon={<WeatherIcon type="dashboard" size={28} />}
          color="info"
        >
          <p>
            <strong>Flood risk:</strong> {prediction.flood?.label ?? "N/A"}.
          </p>
          <p>
            <strong>Drought risk:</strong> {prediction.drought?.label ?? "N/A"}.
          </p>
          <p>
            <strong>Coordinates:</strong> {coords.lat}, {coords.lon}
          </p>
        </ResultCard>
      )}
    </div>
  );
};

export default PredictionsPage;
