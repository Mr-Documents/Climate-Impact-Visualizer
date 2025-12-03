// src/pages/Dashboard.jsx
import React, { useState, useEffect } from "react";
import axios from "axios";
import UnifiedMap from "../components/map/mapview";
import WeatherIcon from "../components/ui/weathericon";
import { Line } from "react-chartjs-2";

// Chart.js registration
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

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const Dashboard = () => {
  const [coords, setCoords] = useState({ lat: 5.6037, lon: -0.1870 });
  const [loading, setLoading] = useState(true);

  const [rainData, setRainData] = useState([]);
  const [tempData, setTempData] = useState([]);
  const [windData, setWindData] = useState([]);
  const [hourLabels, setHourLabels] = useState([]);

  const [wildfireRisk, setWildfireRisk] = useState("N/A");
  const [floodRisk, setFloodRisk] = useState("N/A");

  useEffect(() => {
    fetchAllData(coords.lat, coords.lon);
  }, []);

  const fetchAllData = async (lat, lon) => {
    setLoading(true);

    try {
      const [rainRes, wildRes, floodRes] = await Promise.all([
        axios.get(`http://localhost:5000/api/precipitation?lat=${lat}&lon=${lon}`),
        axios.get(`http://localhost:5000/api/wildfirerisk?lat=${lat}&lon=${lon}&ai=true`),
        axios.get(`http://localhost:5000/api/floodrisk?lat=${lat}&lon=${lon}&ai=true`)
      ]);

      const series = rainRes.data?.series || [];
      const hourlyTrend = series.slice(0, 24);

      setRainData(hourlyTrend.map(s => s.precipitation));
      setTempData(hourlyTrend.map(s => s.temperature || 0));
      setWindData(hourlyTrend.map(s => s.windSpeed || 0));
      setHourLabels(hourlyTrend.map((_, i) => `${i}:00`));

      setWildfireRisk(wildRes.data?.wildfireRisk || "N/A");
      setFloodRisk(floodRes.data?.floodRisk || "N/A");

    } catch (error) {
      console.error("Dashboard fetch error:", error);
      alert("Dashboard data failed to load.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container py-4">
      <h2 className="mb-4 d-flex align-items-center gap-2">
        <WeatherIcon type="dashboard" size={40} />
        Climate Impact Dashboard
      </h2>

      {loading && (
        <div className="text-center my-4">
          <div className="spinner-border text-success"></div>
          <p>Loading real-time climate data...</p>
        </div>
      )}

      <div className="row gx-4 gy-4">

        {/* MAP */}
        <div className="col-lg-8">
          <div className="card shadow-sm">
            <div className="card-body">
              <h5 className="d-flex align-items-center gap-2">
                <WeatherIcon type="map" size={28} />
                Location Overview
              </h5>
              <p className="text-muted mb-2">Click a location on the map to refresh the dashboard for that area.</p>
              <UnifiedMap
                lat={coords.lat}
                lon={coords.lon}
                onSelect={(lat, lon) => {
                  setCoords({ lat, lon });
                  fetchAllData(lat, lon);
                }}
              />
            </div>
          </div>
        </div>

        {/* RISK CARDS */}
        <div className="col-lg-4 d-flex flex-column gap-3">

          <div className="card shadow-sm p-3">
            <h6 className="d-flex align-items-center gap-2">
              <WeatherIcon type="wildfire" size={28} />
              Wildfire Risk
            </h6>
            <p className="fs-4 fw-bold text-danger">{wildfireRisk}</p>
            <p className="text-muted">
              The AI-predicted wildfire risk based on current temperature, humidity, wind, and soil conditions.
            </p>
          </div>

          <div className="card shadow-sm p-3">
            <h6 className="d-flex align-items-center gap-2">
              <WeatherIcon type="flood" size={28} />
              Flood Risk
            </h6>
            <p className="fs-4 fw-bold text-primary">{floodRisk}</p>
            <p className="text-muted">
              The likelihood of flooding in this area over the next 24 hours based on rainfall forecasts and soil moisture.
            </p>
          </div>

          <div className="card shadow-sm p-3">
            <h6 className="d-flex align-items-center gap-2">
              <WeatherIcon type="rain" size={28} />
              24-Hour Rainfall Total
            </h6>
            <p className="fs-4 fw-bold">
              {rainData.length > 0 ? rainData.reduce((a, b) => a + b, 0).toFixed(1) : "0.0"} mm
            </p>
            <p className="text-muted">
              Cumulative precipitation expected for the next 24 hours in this location.
            </p>
          </div>
        </div>

        {/* MULTI-TREND CHART */}
        <div className="col-12">
          <div className="card shadow-sm">
            <div className="card-body">
              <h5 className="d-flex align-items-center gap-2">
                <WeatherIcon type="rain" size={28} />
                24-Hour Climate Trends
              </h5>
              <p className="text-muted mb-3">
                Hourly trends for rainfall, temperature, and wind speed over the next 24 hours.
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
                  plugins: { legend: { position: "top" } },
                  scales: {
                    x: { title: { display: true, text: "Hour" } },
                    y1: { type: "linear", position: "left", title: { display: true, text: "Rainfall (mm)" } },
                    y2: { type: "linear", position: "right", title: { display: true, text: "Temperature (°C)" }, grid: { drawOnChartArea: false } },
                    y3: { type: "linear", position: "right", title: { display: true, text: "Wind Speed (km/h)" }, grid: { drawOnChartArea: false }, offset: true },
                  },
                  plugins: {
                    tooltip: {
                      mode: "index",
                      intersect: false,
                      callbacks: {
                        label: function(context) {
                          let label = context.dataset.label || '';
                          let value = context.parsed.y;
                          return `${label}: ${value}`;
                        }
                      }
                    }
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

