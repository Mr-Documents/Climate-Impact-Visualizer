import React, { useState } from "react";
import CoordinateForm from "../components/forms/coordinateform";
import UnifiedMap from "../components/map/mapview";
import WeatherIcon from "../components/ui/weathericon";
import axios from "axios";
import ResultCard from "../components/reusable/resultcard";
import { Line } from 'react-chartjs-2';
import { FaInfoCircle, FaExclamationTriangle, FaWater } from "react-icons/fa";
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
  const [validationError, setValidationError] = useState(null);
  const [locationError, setLocationError] = useState(null);

  const handleAnalyze = async (lat, lon) => {
    // 1. Validation
    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      setValidationError("Invalid coordinates. Latitude must be between -90 and 90, Longitude between -180 and 180.");
      return;
    }
    setValidationError(null);
    setLocationError(null);

    setCoords({ lat, lon });
    setLoading(true);
    setData(null);
    setLocationError(null);

    try {
      const res = await axios.post("http://localhost:5000/api/predict", {
        latitude: lat,
        longitude: lon,
      });
      setData(res.data);
      
      if (res.data?.isWater) {
        setLocationError("Analysis Unavailable: The selected location is identified as a water body. Drought risk assessment is not applicable.");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to analyze drought risk");
    } finally {
      setLoading(false);
    }
  };

  const isWater = data?.isWater || false;
  const rawPrediction = data?.prediction?.drought;
  const droughtPrediction = isWater 
    ? { label: '--', score: 0 } 
    : rawPrediction;
    
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
    if (!label || label === '--' || label === 'N/A') return 'secondary';
    const norm = label.toString().toLowerCase();
    if (norm === 'high') return 'danger';
    if (norm === 'medium') return 'warning';
    if (norm === 'low') return 'success';
    return 'secondary'; // Default to gray for unknown states
  };

  const getInsight = (label) => {
    if (label === '--') return "Analysis Unavailable: The selected location is identified as a water body or non-terrestrial surface. Drought risk assessment is not applicable.";
    if (label === 'High') return "Severe moisture deficit detected. High temperatures combined with critically low soil moisture suggest vegetation stress and water scarcity risks.";
    if (label === 'Medium') return "Developing dry conditions. Soil moisture levels are declining relative to the current temperature. Monitor local water resources.";
    return "Hydrological conditions are healthy. Soil moisture and humidity levels are sufficient to sustain typical vegetation.";
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
          {validationError && (
            <div className="alert alert-danger mt-3 mb-0 small d-flex align-items-center gap-2">
              <FaExclamationTriangle /> {validationError}
            </div>
          )}
          {locationError && (
            <div className="alert alert-warning mt-3 mb-0 small d-flex align-items-center gap-2">
              <FaWater /> {locationError}
            </div>
          )}
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

          {!loading && data && (droughtPrediction || isWater) && (
            <div className="d-flex flex-column gap-3">
              <ResultCard
                title="Prediction Result"
                icon={<WeatherIcon type="drought" size={28} />}
                color={getRiskColor(droughtPrediction?.label)}
              >
                <div className="row text-center">
                  <div className="col-6">
                    <h3 className={`text-${getRiskColor(droughtPrediction?.label || '--')}`}>{droughtPrediction?.label || '--'}</h3>
                    <small className="text-muted">Risk Level</small>
                  </div>
                  <div className="col-6">
                    <h3>{isWater || droughtPrediction?.label === '--' ? '--' : `${(droughtPrediction?.score * 100).toFixed(1)}%`}</h3>
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
                    {weather.soilMoisture ?? '--'} m³/m³
                  </div>
                </div>
              </ResultCard>

              {chartData && !isWater && (
                <div className="card shadow-sm p-3">
                  <h5>24-Hour Environmental Trend</h5>
                  <Line options={chartOptions} data={chartData} />
                </div>
              )}

              <div className={`alert ${droughtPrediction?.label === 'High' ? 'alert-danger' : droughtPrediction?.label === 'Medium' ? 'alert-warning' : droughtPrediction?.label === '--' ? 'alert-secondary' : 'alert-success'} shadow-sm border-0 d-flex gap-3 align-items-start`}>
                <FaInfoCircle className="mt-1 flex-shrink-0" size={20} />
                <div>
                  <h5 className="alert-heading fw-bold h6">AI Prediction Insight</h5>
                  <p className="mb-0 small">{getInsight(droughtPrediction?.label)}</p>
                </div>
              </div>
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
