import React, { useState } from "react";
import CoordinateForm from "../components/forms/coordinateform";
import UnifiedMap from "../components/map/mapview";
import WeatherIcon from "../components/ui/weathericon";
import axios from "axios";
import ResultCard from "../components/reusable/resultcard";
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

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
      console.error(err);
      alert("Failed to analyze drought risk");
    } finally {
      setLoading(false);
    }
  };

  const droughtPrediction = data?.prediction?.drought;
  const weather = data?.weather;
  const history = data?.history;

  const chartData = history ? {
    labels: history.time,
    datasets: [
      {
        label: 'Temperature (°C)',
        data: history.temperature,
        borderColor: 'rgb(255, 159, 64)',
        backgroundColor: 'rgba(255, 159, 64, 0.5)',
        yAxisID: 'y',
      },
      {
        label: 'Soil Moisture (m³/m³)',
        data: history.soilMoisture,
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.5)',
        yAxisID: 'y1',
      },
    ],
  } : null;

  const chartOptions = {
    responsive: true,
    interaction: { mode: 'index', intersect: false },
    scales: {
      y: { type: 'linear', display: true, position: 'left', title: { display: true, text: 'Temperature (°C)' } },
      y1: { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Soil Moisture' } },
    },
  };

  const getRiskColor = (label) => {
    if (label === 'High') return 'danger';
    if (label === 'Medium') return 'warning';
    return 'success';
  };

  return (
    <div className="container py-4">
      <h2 className="mb-3 d-flex align-items-center gap-2">
        <WeatherIcon type="drought" size={35} />
        Drought Risk Analysis (AI Model)
      </h2>

      <div className="row">
        <div className="col-md-4">
          <CoordinateForm
            onSubmit={handleAnalyze}
            loading={loading}
            buttonText="Analyze Drought Risk"
            buttonColor="warning"
          />
          <div className="mt-3">
            <UnifiedMap
              lat={coords.lat}
              lon={coords.lon}
              onSelect={(lat, lon) => setCoords({ lat, lon })}
            />
          </div>
        </div>

        <div className="col-md-8">
          {loading && (
            <div className="text-center my-5">
              <div className="spinner-border text-warning" role="status"></div>
              <p className="mt-2">Running AI Prediction Model...</p>
            </div>
          )}

          {!loading && data && droughtPrediction && (
            <div className="d-flex flex-column gap-3">
              <ResultCard
                title="Prediction Result"
                icon={<WeatherIcon type="drought" size={28} />}
                color={getRiskColor(droughtPrediction.label)}
              >
                <div className="row text-center">
                  <div className="col-6">
                    <h3 className={`text-${getRiskColor(droughtPrediction.label)}`}>{droughtPrediction.label}</h3>
                    <small className="text-muted">Risk Level</small>
                  </div>
                  <div className="col-6">
                    <h3>{(droughtPrediction.score * 100).toFixed(1)}%</h3>
                    <small className="text-muted">Confidence Score</small>
                  </div>
                </div>
                <hr />
                <div className="row mt-3">
                  <div className="col-4">
                    <strong>Temperature</strong><br />
                    {weather.temperature} °C
                  </div>
                  <div className="col-4">
                    <strong>Humidity</strong><br />
                    {weather.humidity != null ? `${weather.humidity.toFixed(0)}%` : '--'}
                  </div>
                  <div className="col-4">
                    <strong>Soil Moisture</strong><br />
                    {weather.soilMoisture} m³/m³
                  </div>
                </div>
              </ResultCard>

              {chartData && (
                <div className="card shadow-sm p-3">
                  <h5>24-Hour Environmental Trend</h5>
                  <Line options={chartOptions} data={chartData} />
                </div>
              )}
            </div>
          )}

          {!loading && !data && (
            <div className="alert alert-light text-center mt-4">
              Select a location and click "Analyze" to see AI analysis.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DroughtRiskPage;
