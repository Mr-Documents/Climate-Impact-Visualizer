// Dashboard.jsx - Updated with Drought Risk and live color indicators
import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import UnifiedMap from "../components/map/mapview";
import WeatherIcon from "../components/ui/weathericon";
import { Line } from "react-chartjs-2";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const Dashboard = () => {
  const [coords, setCoords] = useState({ lat: 5.6037, lon: -0.1870 });
  const [loading, setLoading] = useState(true);

  const [rainData, setRainData] = useState([]);
  const [tempData, setTempData] = useState([]);
  const [windData, setWindData] = useState([]);
  const [hourLabels, setHourLabels] = useState([]);

  const [floodRisk, setFloodRisk] = useState("N/A");
  const [droughtRisk, setDroughtRisk] = useState("N/A");

  const getRiskColor = (risk) => {
    switch (risk.toLowerCase()) {
      case "high":
        return "text-danger";
      case "medium":
        return "text-warning";
      case "low":
        return "text-success";
      default:
        return "text-muted";
    }
  };

  const fetchAllData = useCallback(async (lat, lon) => {
    setLoading(true);

    try {
      // Fetch rainfall, weather, and AI predictions
      const [rainRes, weatherRes, predictionRes] = await Promise.all([
        axios.get(`http://localhost:5000/api/precipitation?lat=${lat}&lon=${lon}`),
        axios.get(`http://localhost:5000/api/weather?lat=${lat}&lon=${lon}`),
        axios.post(`http://localhost:5000/api/predict`, { latitude: lat, longitude: lon })
      ]);

      // Rainfall data
      const series = rainRes.data?.series || [];
      const hourly = series.slice(0, 24);
      setRainData(hourly.map(s => s.precipitation ?? 0));
      setHourLabels(hourly.map((_, i) => `${i}:00`));

      // Weather data
      const weatherSeries = weatherRes.data?.series || [];
      const weatherHourly = weatherSeries.slice(0, 24);
      setTempData(weatherHourly.map(s => s.temperature ?? 0));
      setWindData(weatherHourly.map(s => s.windSpeed ?? 0));

      // AI predictions
      const predictionData = predictionRes.data?.prediction || {};
      setFloodRisk(predictionData.flood?.label ?? "N/A");
      setDroughtRisk(predictionData.drought?.label ?? "N/A");

    } catch (error) {
      console.error("Dashboard fetch error:", error);
      alert("Dashboard data failed to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllData(coords.lat, coords.lon);
  }, [coords.lat, coords.lon, fetchAllData]);

  return (
    <div className="container py-4">

      <h2 className="mb-4 d-flex align-items-center gap-2 fw-bold">
        <WeatherIcon type="dashboard" size={40} />
        Climate Impact Dashboard
      </h2>

      {loading && (
        <div className="text-center my-4">
          <div className="spinner-border text-success"></div>
          <p className="fw-semibold mt-2">Loading real-time climate data...</p>
        </div>
      )}

      <div className="row gx-4 gy-4">

        <div className="col-lg-8">
          <div className="card shadow-sm border-0">
            <div className="card-body">
              <h5 className="d-flex align-items-center gap-2 fw-bold">
                <WeatherIcon type="map" size={28} />
                Location Overview
              </h5>
              <p className="text-muted mb-2">Select any point on the map to refresh forecasts, risks, and climate insights.</p>

              <UnifiedMap
                lat={coords.lat}
                lon={coords.lon}
                onSelect={(lat, lon) => {
                  setCoords({ lat, lon });
                }}
              />
            </div>
          </div>
        </div>

        <div className="col-lg-4 d-flex flex-column gap-3">

          {/* Flood Risk */}
          <div className="card shadow-sm p-3 border-0">
            <h6 className="d-flex align-items-center gap-2 fw-bold">
              <WeatherIcon type="flood" size={28} />
              Flood Risk
            </h6>
            <p className={`fs-4 fw-bold ${getRiskColor(floodRisk)}`}>{floodRisk}</p>
            <p className="text-muted small">
              Heavy rainfall, saturated soil, and poor drainage can contribute to urban or flash flooding. Monitor water levels closely.
            </p>
          </div>

          {/* Drought Risk */}
          <div className="card shadow-sm p-3 border-0">
            <h6 className="d-flex align-items-center gap-2 fw-bold">
              <WeatherIcon type="drought" size={28} />
              Drought Risk
            </h6>
            <p className={`fs-4 fw-bold ${getRiskColor(droughtRisk)}`}>{droughtRisk}</p>
            <p className="text-muted small">
              Low precipitation, high temperatures, and reduced soil moisture increase drought potential. Plan water usage and conservation accordingly.
            </p>
          </div>

          {/* 24-Hour Rainfall */}
          <div className="card shadow-sm p-3 border-0">
            <h6 className="d-flex align-items-center gap-2 fw-bold">
              <WeatherIcon type="rain" size={28} />
              24-Hour Rainfall Total
            </h6>
            <p className="fs-4 fw-bold">{(rainData.reduce((a, b) => a + b, 0)).toFixed(1)} mm</p>
            <p className="text-muted small">
              Accumulated rainfall over the past 24 hours helps assess flood potential and short-term water availability.
            </p>
          </div>

        </div>

        {/* Climate Trends Chart */}
        <div className="col-12">
          <div className="card shadow-sm border-0">
            <div className="card-body">
              <h5 className="d-flex align-items-center gap-2 fw-bold mb-3">
                <WeatherIcon type="rain" size={28} />
                24-Hour Climate Trends
              </h5>

              <p className="text-muted small mb-3">
                This combined chart visualizes rainfall patterns, temperature stability, and wind behavior across the day — helping you understand emerging climate signals at a glance.
              </p>

              <Line
                data={{
                  labels: hourLabels,
                  datasets: [
                    {
                      label: "Rainfall (mm)",
                      data: rainData,
                      borderColor: "blue",
                      backgroundColor: "lightblue",
                      yAxisID: "y1",
                      borderWidth: 3,
                      tension: 0.4,
                    },
                    {
                      label: "Temperature (°C)",
                      data: tempData,
                      borderColor: "red",
                      backgroundColor: "rgba(255,0,0,0.2)",
                      yAxisID: "y2",
                      borderWidth: 3,
                      tension: 0.4,
                    },
                    {
                      label: "Wind Speed (km/h)",
                      data: windData,
                      borderColor: "orange",
                      backgroundColor: "rgba(255,165,0,0.2)",
                      yAxisID: "y3",
                      borderWidth: 3,
                      tension: 0.4,
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  interaction: { mode: "index", intersect: false },
                  stacked: false,
                  scales: {
                    x: { title: { display: true, text: "Hour" } },
                    y1: { type: "linear", position: "left", title: { text: "Rainfall (mm)" } },
                    y2: { type: "linear", position: "right", title: { text: "Temperature (°C)" }, grid: { drawOnChartArea: false }},
                    y3: { type: "linear", position: "right", title: { text: "Wind Speed (km/h)" }, grid: { drawOnChartArea: false }, offset: true },
                  }
                }}
              />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Dashboard;
