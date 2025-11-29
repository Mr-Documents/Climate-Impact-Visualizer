// src/pages/WildfirePage.jsx
import { useState } from "react";
import axios from "axios";
import CoordinateForm from "../components/forms/coordinateform";
import UnifiedMap from "../components/map/mapview";
import LocationButton from "../components/reusable/locationbutton";
import LoadingSpinner from "../components/reusable/loadingspinner";
import ResultCard from "../components/reusable/resultcard";
import { Line } from "react-chartjs-2";
import { FaFire } from "react-icons/fa";

function WildfirePage() {
  const [coords, setCoords] = useState({ lat: "", lon: "" });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  // --- FIXED FUNCTION ---
  const analyze = async (lat, lon) => {
    setCoords({ lat, lon });
    setLoading(true);
    setResult(null);

    try {
      const res = await axios.get(
        `http://localhost:5000/api/wildfirerisk?lat=${lat}&lon=${lon}&ai=true`
      );
      setResult(res.data);
    } catch (err) {
      console.error("Wildfire error:", err);
      alert("Failed to get wildfire prediction.");
    }

    setLoading(false);
  };

  // --- CHART DATA ---
  const getChart = () => {
    if (!result || !result.trends) return null;

    const chartData = {
      labels: result.trends.hours.map((h) => `${h}:00`),
      datasets: [
        {
          label: "Wind Speed (km/h)",
          data: result.trends.wind,
          borderWidth: 2,
          tension: 0.3,
        },
        {
          label: "Temperature (°C)",
          data: result.trends.temperature,
          borderWidth: 2,
          tension: 0.3,
        },
      ],
    };

    return <Line data={chartData} />;
  };

  return (
    <div className="container mt-4">
      <h2 className="mb-3">
        <FaFire className="me-2 text-danger" />
        Wildfire Risk Prediction
      </h2>

      {/* MAP */}
      <UnifiedMap onSelect={(lat, lon) => setCoords({ lat, lon })} />

      {/* GET USER LOCATION */}
      <LocationButton onSelect={(lat, lon) => setCoords({ lat, lon })} />

      {/* FORM (FIXED PROP NAME) */}
      <CoordinateForm
        onSubmit={analyze}
        loading={loading}
        buttonText="Analyze"
        buttonColor="danger"
      />

      {/* LOADING */}
      {loading && <LoadingSpinner />}

      {/* RESULTS */}
      {result && (
        <ResultCard
          title="Wildfire Risk Analysis"
          icon={<FaFire />}
          color={
            result.risk === "High"
              ? "danger"
              : result.risk === "Medium"
              ? "warning"
              : "success"
          }
        >
          <p>
            <strong>AI Predicted Risk:</strong>{" "}
            <span className="badge bg-dark">{result.risk}</span>
          </p>

          <p><strong>Confidence Score:</strong> {result.score}</p>
          <p><strong>Coordinates:</strong> {coords.lat}, {coords.lon}</p>

          <hr />

          <h5>Climate Trends</h5>
          {getChart()}
        </ResultCard>
      )}
    </div>
  );
}

export default WildfirePage;

