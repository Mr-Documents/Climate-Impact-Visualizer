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

const FloodRiskPage = () => {
  const [coords, setCoords] = useState({ lat: 5.6037, lon: -0.1870 });
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
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
      // Using the trained model endpoint
      const response = await axios.post("http://localhost:5000/api/predict", {
        latitude: lat,
        longitude: lon,
      });
      setData(response.data);

      // 2. Check for Water Body
      if (response.data?.isWater) {
        setLocationError("Analysis Unavailable: The selected location is identified as a water body. Flood risk assessment is not applicable.");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to analyze flood risk");
    } finally {
      setLoading(false);
    }
  };

  const handleLocationSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setLoading(true);
    try {
      const res = await axios.get(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&limit=1`);
      if (res.data && res.data.length > 0) {
        const { lat, lon } = res.data[0];
        handleAnalyze(parseFloat(lat), parseFloat(lon));
        setSearchQuery("");
      } else {
        alert("Area not found.");
      }
    } catch (err) {
      console.error("Search error", err);
    } finally {
      setLoading(false);
    }
  };

  // Derived state for display
  const isWater = data?.isWater || false;
  const rawPrediction = data?.prediction?.flood;
  
  // If water, override prediction values
  const floodPrediction = isWater 
    ? { label: '--', score: 0 } 
    : rawPrediction;

  const weather = data?.weather;
  const history = data?.history;

  const chartData = history ? {
    labels: history.time,
    datasets: [
      {
        label: 'Precipitation (mm)',
        data: history.precipitation,
        borderColor: 'rgb(53, 162, 235)',
        backgroundColor: 'rgba(53, 162, 235, 0.5)',
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
      y: { type: 'linear', display: true, position: 'left', title: { display: true, text: 'Precipitation (mm)' } },
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
    if (label === '--') return "Analysis Unavailable: The selected location is identified as a water body or non-terrestrial surface. Flood risk assessment is not applicable.";
    if (label === 'High') return "Critical levels of soil moisture and precipitation detected. The AI model indicates a significant probability of runoff and flash flooding. Avoid low-lying areas.";
    if (label === 'Medium') return "Moderate risk conditions observed. Soil saturation is increasing; continued rainfall may lead to localized waterlogging.";
    return "Environmental conditions are stable. Current precipitation and soil saturation levels are within safe limits, posing no immediate flood threat.";
  };

  return (
    <div className="container py-4">
      <h2 className="mb-3 d-flex align-items-center gap-2">
        <WeatherIcon type="flood" size={35} />
        Flood Risk Analysis (AI Model)
      </h2>

      <div className="row">
        <div className="col-md-4">
          <form onSubmit={handleLocationSearch} className="mb-3">
            <div className="input-group">
              <input 
                type="text" 
                className="form-control" 
                placeholder="Enter city or area name..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button className="btn btn-primary" type="submit" disabled={loading}>Search</button>
            </div>
          </form>
          <div className="text-muted small mb-2">Or enter coordinates:</div>
          <CoordinateForm
            onSubmit={handleAnalyze}
            loading={loading}
            buttonText="Analyze Flood Risk"
            buttonColor="primary"
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
              <div className="spinner-border text-primary" role="status"></div>
              <p className="mt-2">Running AI Prediction Model...</p>
            </div>
          )}

          {!loading && data && (floodPrediction || isWater) && (
            <div className="d-flex flex-column gap-3">
              <ResultCard
                title="Prediction Result"
                icon={<WeatherIcon type="flood" size={28} />}
                color={getRiskColor(floodPrediction.label)}
              >
                <div className="row text-center">
                  <div className="col-12">
                    <h3 className={`text-${getRiskColor(floodPrediction?.label || '--')}`}>{floodPrediction?.label || '--'}</h3>
                    <small className="text-muted">Risk Level</small>
                  </div>
                </div>
                <hr />
                <div className="row mt-3">
                  <div className="col-4">
                    <strong>Precipitation</strong><br />
                    {weather.precipitation} mm
                  </div>
                  <div className="col-4">
                    <strong>Soil Moisture</strong><br />
                    {weather.soilMoisture ?? '--'} m³/m³
                  </div>
                  <div className="col-4">
                    <strong>Wind Speed</strong><br />
                    {weather.windSpeed} km/h
                  </div>
                </div>
              </ResultCard>

              {chartData && !isWater && (
                <div className="card shadow-sm p-3">
                  <h5>24-Hour Environmental Trend</h5>
                  <Line options={chartOptions} data={chartData} />
                </div>
              )}

              <div className={`alert ${floodPrediction?.label === 'High' ? 'alert-danger' : floodPrediction?.label === 'Medium' ? 'alert-warning' : floodPrediction?.label === '--' ? 'alert-secondary' : 'alert-success'} shadow-sm border-0 d-flex gap-3 align-items-start`}>
                <FaInfoCircle className="mt-1 flex-shrink-0" size={20} />
                <div>
                  <h5 className="alert-heading fw-bold h6">AI Prediction Insight</h5>
                  <p className="mb-0 small">{getInsight(floodPrediction?.label)}</p>
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

export default FloodRiskPage;
