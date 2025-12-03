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

      // Safely extract rain data
      const hourlyRain = Array.isArray(rainRes.data?.series)
        ? rainRes.data.series.map(s => s.precipitation).slice(0, 24)
        : [];

      setRainData(hourlyRain);

      // Wildfire risk: fallback to "N/A" if missing
      const wfRisk = wildRes.data?.wildfireRisk;
      setWildfireRisk(
        wfRisk && typeof wfRisk === "string" ? wfRisk : "N/A"
      );

      // Flood risk: fallback to "N/A" if missing
      const flRisk = floodRes.data?.floodRisk;
      setFloodRisk(
        flRisk && typeof flRisk === "string" ? flRisk : "N/A"
      );

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
          <p>Please wait...</p>
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
              <UnifiedMap lat={coords.lat} lon={coords.lon} />
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
          </div>

          <div className="card shadow-sm p-3">
            <h6 className="d-flex align-items-center gap-2">
              <WeatherIcon type="flood" size={28} />
              Flood Risk
            </h6>
            <p className="fs-4 fw-bold text-primary">{floodRisk}</p>
          </div>

          <div className="card shadow-sm p-3">
            <h6 className="d-flex align-items-center gap-2">
              <WeatherIcon type="rain" size={28} />
              24-hr Rainfall Total
            </h6>
            <p className="fs-4 fw-bold">
              {rainData.length > 0 ? rainData.reduce((a, b) => a + b, 0).toFixed(1) : "0.0"} mm
            </p>
          </div>
        </div>

        {/* RAINFALL CHART */}
        <div className="col-12">
          <div className="card shadow-sm">
            <div className="card-body">
              <h5 className="d-flex align-items-center gap-2">
                <WeatherIcon type="rain" size={28} />
                Rainfall Trend (Next 24 Hours)
              </h5>

              <Line
                data={{
                  labels: rainData.map((_, i) => `${i}:00`),
                  datasets: [
                    {
                      label: "Rainfall (mm)",
                      data: rainData,
                      borderColor: "blue",
                      backgroundColor: "lightblue",
                      borderWidth: 3,
                      tension: 0.4,
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  plugins: { legend: { display: true } },
                  scales: {
                    x: { title: { display: true, text: "Hour" } },
                    y: { title: { display: true, text: "Rainfall (mm)" } },
                  },
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
