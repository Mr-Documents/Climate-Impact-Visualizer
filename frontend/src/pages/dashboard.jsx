// Dashboard.jsx - Updated with expanded dashboard sections and professional KPI cards
import React, { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import UnifiedMap from "../components/map/mapview";
import WeatherIcon from "../components/ui/weathericon";
import { Line } from "react-chartjs-2";
import { Circle } from "react-leaflet";
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
import {
  FaTemperatureHigh,
  FaCloudRain,
  FaTint,
  FaExclamationTriangle,
  FaWater,
  FaDownload,
  FaDatabase,
  FaChartLine,
  FaMapMarkedAlt,
  FaCloudSun
} from "react-icons/fa";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

// ----- Helpers -----
const humanizeRisk = (label) => {
  if (!label) return "N/A";
  const normalized = label.toString().toLowerCase();
  if (normalized === "high") return "High";
  if (normalized === "medium") return "Medium";
  if (normalized === "low") return "Low";
  return label;
};

const riskToPercent = (label) => {
  const normalized = label?.toString().toLowerCase?.();
  if (normalized === "high") return 0.85;
  if (normalized === "medium") return 0.55;
  if (normalized === "low") return 0.25;
  return 0.1;
};

const getRiskColor = (risk) => {
  switch (risk.toString().toLowerCase()) {
    case "high":
      return "#dc3545"; // red
    case "medium":
      return "#ffc107"; // yellow
    case "low":
      return "#28a745"; // green
    default:
      return "#6c757d"; // gray
  }
};

const formatDegrees = (value) => (value == null || Number.isNaN(value) ? "--" : `${value.toFixed(1)}°C`);
const formatMillimeters = (value) => (value == null || Number.isNaN(value) ? "--" : `${value.toFixed(1)} mm`);
const formatPercent = (value) => (value == null || Number.isNaN(value) ? "--" : `${(value * 100).toFixed(0)}%`);

const computeAverage = (arr) => {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const filtered = arr.filter((v) => typeof v === "number" && !Number.isNaN(v));
  if (!filtered.length) return null;
  return filtered.reduce((sum, v) => sum + v, 0) / filtered.length;
};

const generateProjection = (baseArray, variation = 0.18) => {
  if (!Array.isArray(baseArray) || baseArray.length === 0) return [];
  const tail = baseArray.slice(-6);
  return tail.map((value, idx) => {
    const jitter = (Math.random() - 0.5) * variation * (idx + 1);
    return Math.max(0, (value || 0) + jitter);
  });
};

function RiskGauge({ label, value = 0, icon, title }) {
  const pct = Math.min(1, Math.max(0, value));
  const color = getRiskColor(label);

  return (
    <div className="card shadow-sm border-0 p-3">
      <div className="d-flex align-items-start justify-content-between">
        <div>
          <div className="d-flex align-items-center gap-2 fw-bold">
            {icon}
            <span className="small text-uppercase text-secondary">{title}</span>
          </div>
          <div className="fs-4 fw-bold" style={{ color }}>{humanizeRisk(label)}</div>
        </div>
        <div className="d-flex align-items-center justify-content-center" style={{ width: 60, height: 60 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: `conic-gradient(${color} 0% ${Math.round(pct * 100)}%, rgba(0,0,0,0.08) ${Math.round(pct * 100)}% 100%)`,
              display: "grid",
              placeItems: "center",
              fontSize: 12,
              fontWeight: 600,
              color: "#343a40"
            }}
          >
            {Math.round(pct * 100)}%
          </div>
        </div>
      </div>
    </div>
  );
}

function MapOverlays({ center, layers }) {
  if (!center) return null;

  const baseOptions = { fillOpacity: 0.18, weight: 1 };

  return (
    <>
      {layers.floodRisk && (
        <Circle
          center={center}
          radius={25000}
          pathOptions={{ ...baseOptions, color: "#007bff", fillColor: "rgba(0,123,255,0.25)" }}
        />
      )}
      {layers.drought && (
        <Circle
          center={center}
          radius={20000}
          pathOptions={{ ...baseOptions, color: "#ffc107", fillColor: "rgba(255,193,7,0.2)" }}
        />
      )}
      {layers.temperature && (
        <Circle
          center={center}
          radius={22000}
          pathOptions={{ ...baseOptions, color: "#dc3545", fillColor: "rgba(220,53,69,0.2)" }}
        />
      )}
      {layers.rainfall && (
        <Circle
          center={center}
          radius={18000}
          pathOptions={{ ...baseOptions, color: "#17a2b8", fillColor: "rgba(23,162,184,0.2)" }}
        />
      )}
    </>
  );
}

const Dashboard = () => {
  const [coords, setCoords] = useState({ lat: 5.6037, lon: -0.1870 });
  const [loading, setLoading] = useState(true);

  const [rainData, setRainData] = useState([]);
  const [tempData, setTempData] = useState([]);
  const [windData, setWindData] = useState([]);
  const [hourLabels, setHourLabels] = useState([]);

  const [currentWeather, setCurrentWeather] = useState({
    temperature: null,
    humidity: null,
    windSpeed: null,
    soilMoisture: null,
    rainfallLastHour: null,
    rainfall24h: null,
    cloudCover: null,
  });

  const [floodRisk, setFloodRisk] = useState("N/A");
  const [droughtRisk, setDroughtRisk] = useState("N/A");
  const [floodScore, setFloodScore] = useState(0);
  const [droughtScore, setDroughtScore] = useState(0);

  const [alerts, setAlerts] = useState([]);
  const [mapLayers, setMapLayers] = useState({
    floodRisk: true,
    drought: false,
    temperature: false,
    rainfall: false,
  });

  const [predictions, setPredictions] = useState({
    rainfall: [],
    temperature: [],
    floodProbability: 0,
    droughtProbability: 0,
  });

  const dataSources = useMemo(
    () => [
      "Open-Meteo (weather + soil)",
      "Satellite-derived indices",
      "Local weather stations",
      "National Oceanic and Atmospheric Administration (NOAA)",
    ],
    []
  );

  const downloadFile = (fileName, content, mimeType) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const prepareCsv = (data) => {
    const headers = Object.keys(data[0] || {});
    const rows = data.map((row) => headers.map((key) => JSON.stringify(row[key] ?? "")).join(","));
    return [headers.join(","), ...rows].join("\n");
  };

  const buildExportPayload = () => {
    return {
      timestamp: new Date().toISOString(),
      location: coords,
      summary: currentWeather,
      risks: { flood: floodRisk, drought: droughtRisk, score: { flood: floodScore, drought: droughtScore } },
      alerts,
      predictions,
      sources: dataSources,
    };
  };

  const refreshAlerts = useCallback(
    (weather, floodLabel, droughtLabel) => {
      const newAlerts = [];

      if (floodLabel?.toLowerCase?.() === "high") {
        newAlerts.push({
          type: "Flood",
          message: "Flood warning: heavy precipitation and saturated soils detected.",
          icon: <FaExclamationTriangle className="text-danger" />,
          timestamp: new Date().toISOString(),
        });
      }
      if (droughtLabel?.toLowerCase?.() === "high") {
        newAlerts.push({
          type: "Drought",
          message: "Drought alert: soil moisture is low while temperatures are high.",
          icon: <FaExclamationTriangle className="text-warning" />,
          timestamp: new Date().toISOString(),
        });
      }

      if (weather?.rainfallLastHour > 15) {
        newAlerts.push({
          type: "Rain",
          message: "Heavy rainfall detected in the last hour.",
          icon: <FaCloudRain className="text-info" />,
          timestamp: new Date().toISOString(),
        });
      }

      setAlerts(newAlerts);
    },
    []
  );

  const fetchAllData = useCallback(
    async (lat, lon) => {
      setLoading(true);

      try {
        const [rainRes, weatherRes, predictionRes] = await Promise.all([
          axios.get(`http://localhost:5000/api/precipitation?lat=${lat}&lon=${lon}`),
          axios.get(`http://localhost:5000/api/weather?lat=${lat}&lon=${lon}`),
          axios.post(`http://localhost:5000/api/predict`, { latitude: lat, longitude: lon }),
        ]);

        // --- Precipitation ---
        const precipSeries = rainRes.data?.series || [];
        const hourlyPrecip = precipSeries.slice(0, 24);
        const rainValues = hourlyPrecip.map((s) => Number(s.precipitation ?? 0));
        const totalRain24 = rainValues.reduce((a, b) => a + b, 0);
        const lastHourRain = rainValues[0] || 0;

        // --- Weather ---
        const weatherSeries = weatherRes.data?.series || [];
        const hourlyWeather = weatherSeries.slice(0, 24);
        const tempValues = hourlyWeather.map((s) => Number(s.temperature ?? 0));
        const windValues = hourlyWeather.map((s) => Number(s.windSpeed ?? 0));
        const soilMoist = hourlyWeather[0]?.soilMoisture ?? null;

        const avgTemp = computeAverage(tempValues);

        setRainData(rainValues);
        setTempData(tempValues);
        setWindData(windValues);
        setHourLabels(hourlyPrecip.map((_, i) => `${i}:00`));

        const nextWeatherSummary = {
          temperature: avgTemp,
          humidity: hourlyWeather[0]?.humidity ?? null,
          windSpeed: hourlyWeather[0]?.windSpeed ?? null,
          soilMoisture: soilMoist,
          rainfallLastHour: lastHourRain,
          rainfall24h: totalRain24,
          cloudCover: hourlyWeather[0]?.cloudCover ?? null,
        };

        setCurrentWeather(nextWeatherSummary);

        // --- AI predictions ---
        const predictionData = predictionRes.data?.prediction || {};
        const floodLabel = predictionData.flood?.label ?? "N/A";
        const droughtLabel = predictionData.drought?.label ?? "N/A";
        const floodSc = predictionData.flood?.score ?? 0;
        const droughtSc = predictionData.drought?.score ?? 0;

        setFloodRisk(floodLabel);
        setDroughtRisk(droughtLabel);
        setFloodScore(floodSc);
        setDroughtScore(droughtSc);

        // Generate projection data (dummy / approximate)
        const projectedRain = generateProjection(rainValues, 0.25);
        const projectedTemp = generateProjection(tempValues, 0.08);

        setPredictions({
          rainfall: projectedRain,
          temperature: projectedTemp,
          floodProbability: floodSc,
          droughtProbability: droughtSc,
        });

        refreshAlerts(nextWeatherSummary, floodLabel, droughtLabel);
      } catch (error) {
        console.error("Dashboard fetch error:", error);
        alert("Dashboard data failed to load.");
      } finally {
        setLoading(false);
      }
    },
    [refreshAlerts]
  );

  useEffect(() => {
    fetchAllData(coords.lat, coords.lon);
  }, [coords.lat, coords.lon, fetchAllData]);

  const kpiCards = [
    {
      label: "Current Rainfall",
      value: formatMillimeters(currentWeather.rainfallLastHour),
      icon: <FaCloudRain size={22} className="text-info" />,
      caption: "Last hour",
    },
    {
      label: "Avg Temperature",
      value: formatDegrees(currentWeather.temperature),
      icon: <FaTemperatureHigh size={22} className="text-danger" />,
      caption: "24-hour average",
    },
    {
      label: "Soil Moisture",
      value: formatPercent(currentWeather.soilMoisture),
      icon: <FaTint size={22} className="text-primary" />,
      caption: "Topsoil 0-1cm",
    },
    {
      label: "Flood Risk Level",
      value: humanizeRisk(floodRisk),
      icon: <FaWater size={22} className="text-primary" />,
      caption: "AI prediction",
    },
    {
      label: "Drought Severity",
      value: humanizeRisk(droughtRisk),
      icon: <FaCloudSun size={22} className="text-warning" />,
      caption: "AI prediction",
    },
    {
      label: "Extreme Alerts",
      value: alerts.length ? `${alerts.length} active` : "None",
      icon: <FaExclamationTriangle size={22} className="text-danger" />,
      caption: "Real-time warnings",
    },
  ];

  return (
    <div className="container py-4">
      <header className="mb-4">
        <h2 className="d-flex align-items-center gap-2 fw-bold">
          <WeatherIcon type="dashboard" size={40} />
          Climate Impact Dashboard
        </h2>
        <p className="text-muted mb-0">Explore real-time climate indicators, model forecasts, and risk insights at a glance.</p>
      </header>

      {loading && (
        <div className="text-center my-3">
          <div className="spinner-border text-primary" role="status" />
          <p className="text-muted small mt-2">Refreshing climate insights...</p>
        </div>
      )}

      {/* KPI CLIMATE CARDS */}
      <section className="row g-3 mb-4">
        {kpiCards.map((card) => (
          <div key={card.label} className="col-12 col-sm-6 col-lg-4">
            <div className="card border-0 shadow-sm">
              <div className="card-body d-flex align-items-center gap-3">
                <div className="rounded-circle bg-light d-flex align-items-center justify-content-center" style={{ width: 48, height: 48 }}>
                  {card.icon}
                </div>
                <div>
                  <div className="text-secondary small fw-semibold">{card.label}</div>
                  <div className="fs-5 fw-bold">{card.value}</div>
                  <div className="text-muted small">{card.caption}</div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </section>

      <div className="row gx-4 gy-4">

        {/* INTERACTIVE MAP (MAIN VISUALIZATION) */}
        <div className="col-lg-8">
          <div className="card shadow-sm border-0">
            <div className="card-body">
              <div className="d-flex align-items-center justify-content-between mb-3">
                <div className="d-flex align-items-center gap-2 fw-bold">
                  <FaMapMarkedAlt size={24} className="text-primary" />
                  <span>Interactive Map</span>
                </div>
                <div className="d-flex align-items-center gap-2">
                  {Object.entries(mapLayers).map(([key, enabled]) => (
                    <button
                      key={key}
                      type="button"
                      className={`btn btn-sm ${enabled ? "btn-primary" : "btn-outline-secondary"}`}
                      onClick={() => setMapLayers((prev) => ({ ...prev, [key]: !prev[key] }))}
                    >
                      {key === "floodRisk" && "Flood"}
                      {key === "drought" && "Drought"}
                      {key === "temperature" && "Temp"}
                      {key === "rainfall" && "Rain"}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-muted small mb-3">
                Toggle layers to view flood risk zones, drought severity, temperature anomalies, and rainfall distribution.
              </p>

              <UnifiedMap
                lat={coords.lat}
                lon={coords.lon}
                onSelect={(lat, lon) => setCoords({ lat, lon })}
              >
                <MapOverlays center={[coords.lat, coords.lon]} layers={mapLayers} />
              </UnifiedMap>

              <div className="mt-3 d-flex gap-2 flex-wrap">
                <span className="badge bg-primary">Flood risk</span>
                <span className="badge bg-warning text-dark">Drought severity</span>
                <span className="badge bg-danger">Temperature anomaly</span>
                <span className="badge bg-info text-dark">Precipitation</span>
              </div>
            </div>
          </div>
        </div>

        {/* PREDICTION CHARTS | RISK GAUGES */}
        <div className="col-lg-4 d-flex flex-column gap-3">
          <RiskGauge
            title="Flood Risk"
            label={floodRisk}
            value={riskToPercent(floodRisk)}
            icon={<FaWater size={22} className="text-primary" />}
          />
          <RiskGauge
            title="Drought Severity"
            label={droughtRisk}
            value={riskToPercent(droughtRisk)}
            icon={<FaCloudSun size={22} className="text-warning" />}
          />
          <RiskGauge
            title="Heatwave Potential"
            label={currentWeather.temperature > 32 ? "High" : currentWeather.temperature > 25 ? "Medium" : "Low"}
            value={currentWeather.temperature ? Math.min(1, Math.max(0, (currentWeather.temperature - 15) / 30)) : 0}
            icon={<FaTemperatureHigh size={22} className="text-danger" />}
          />
        </div>

        {/* PREDICTION CHARTS */}
        <div className="col-12">
          <div className="card shadow-sm border-0">
            <div className="card-body">
              <div className="d-flex align-items-center justify-content-between mb-3">
                <div className="d-flex align-items-center gap-2 fw-bold">
                  <FaChartLine size={24} className="text-success" />
                  <span>Climate Prediction Charts</span>
                </div>
                <div className="text-muted small">Predictions are model-based and partially derived from local observations. (Dummy projections when live data is unavailable.)</div>
              </div>

              <div className="row gy-4">
                <div className="col-lg-6">
                  <div className="card border-0 shadow-sm">
                    <div className="card-body">
                      <h6 className="fw-bold">Predicted Rainfall (next hours)</h6>
                      <Line
                        data={{
                          labels: predictions.rainfall.map((_, idx) => `+${idx + 1}h`),
                          datasets: [
                            {
                              label: "Rainfall (mm)",
                              data: predictions.rainfall,
                              borderColor: "#17a2b8",
                              backgroundColor: "rgba(23,162,184,0.2)",
                              tension: 0.35,
                              fill: true,
                            },
                          ],
                        }}
                        options={{
                          responsive: true,
                          plugins: { legend: { display: false } },
                          scales: { y: { title: { display: true, text: "mm" } } },
                        }}
                      />
                    </div>
                  </div>
                </div>
                <div className="col-lg-6">
                  <div className="card border-0 shadow-sm">
                    <div className="card-body">
                      <h6 className="fw-bold">Temperature Projection</h6>
                      <Line
                        data={{
                          labels: predictions.temperature.map((_, idx) => `+${idx + 1}h`),
                          datasets: [
                            {
                              label: "Temperature (°C)",
                              data: predictions.temperature,
                              borderColor: "#dc3545",
                              backgroundColor: "rgba(220,53,69,0.2)",
                              tension: 0.35,
                              fill: true,
                            },
                          ],
                        }}
                        options={{
                          responsive: true,
                          plugins: { legend: { display: false } },
                          scales: { y: { title: { display: true, text: "°C" } } },
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="row mt-4 gy-4">
                <div className="col-lg-6">
                  <div className="card border-0 shadow-sm">
                    <div className="card-body">
                      <h6 className="fw-bold">Predicted Flood Probability</h6>
                      <div className="d-flex align-items-center gap-3">
                        <div className="fs-2 fw-bold" style={{ color: getRiskColor(floodRisk) }}>
                          {(predictions.floodProbability * 100).toFixed(0)}%
                        </div>
                        <div className="text-muted small">Based on current rainfall, soil moisture and wind conditions.</div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="col-lg-6">
                  <div className="card border-0 shadow-sm">
                    <div className="card-body">
                      <h6 className="fw-bold">Predicted Drought Risk</h6>
                      <div className="d-flex align-items-center gap-3">
                        <div className="fs-2 fw-bold" style={{ color: getRiskColor(droughtRisk) }}>
                          {(predictions.droughtProbability * 100).toFixed(0)}%
                        </div>
                        <div className="text-muted small">Model scores are derived from current temperature, humidity and soil moisture.</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* HISTORICAL TRENDS (LINE CHARTS) */}
        <div className="col-12">
          <div className="card shadow-sm border-0">
            <div className="card-body">
              <div className="d-flex align-items-center justify-content-between mb-3">
                <div className="d-flex align-items-center gap-2 fw-bold">
                  <FaChartLine size={24} className="text-secondary" />
                  <span>Historical Trends</span>
                </div>
                <div className="text-muted small">Past 24 hours at selected location.</div>
              </div>

              <Line
                data={{
                  labels: hourLabels,
                  datasets: [
                    {
                      label: "Rainfall (mm)",
                      data: rainData,
                      borderColor: "#17a2b8",
                      backgroundColor: "rgba(23,162,184,0.2)",
                      yAxisID: "y1",
                      tension: 0.35,
                      fill: true,
                    },
                    {
                      label: "Temperature (°C)",
                      data: tempData,
                      borderColor: "#dc3545",
                      backgroundColor: "rgba(220,53,69,0.2)",
                      yAxisID: "y2",
                      tension: 0.35,
                      fill: true,
                    },
                    {
                      label: "Wind Speed (km/h)",
                      data: windData,
                      borderColor: "#6f42c1",
                      backgroundColor: "rgba(111,66,193,0.2)",
                      yAxisID: "y3",
                      tension: 0.35,
                      fill: true,
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  interaction: { mode: "index", intersect: false },
                  scales: {
                    y1: {
                      type: "linear",
                      position: "left",
                      title: { display: true, text: "Rainfall (mm)" },
                    },
                    y2: {
                      type: "linear",
                      position: "right",
                      title: { display: true, text: "Temperature (°C)" },
                      grid: { drawOnChartArea: false },
                    },
                    y3: {
                      type: "linear",
                      position: "right",
                      title: { display: true, text: "Wind Speed (km/h)" },
                      grid: { drawOnChartArea: false },
                      offset: true,
                    },
                  },
                }}
              />
            </div>
          </div>
        </div>

        {/* CLIMATE IMPACT ANALYSIS */}
        <div className="col-lg-6">
          <div className="card shadow-sm border-0">
            <div className="card-body">
              <div className="d-flex align-items-center gap-2 mb-3">
                <FaCloudSun size={24} className="text-warning" />
                <h5 className="mb-0 fw-bold">Climate Impact Analysis</h5>
              </div>
              <ul className="list-unstyled mb-0">
                <li className="mb-2">
                  <strong className="text-secondary">Flood potential:</strong> {floodRisk} risk based on soil moisture and precipitation.
                </li>
                <li className="mb-2">
                  <strong className="text-secondary">Drought outlook:</strong> {droughtRisk} risk with soil moisture at {formatPercent(currentWeather.soilMoisture)}.
                </li>
                <li className="mb-2">
                  <strong className="text-secondary">Temperature anomaly:</strong> Current average of {formatDegrees(currentWeather.temperature)} suggests {currentWeather.temperature > 30 ? "heatwave conditions" : "near-normal conditions"}.
                </li>
                <li className="mb-2">
                  <strong className="text-secondary">Rainfall trend:</strong> {formatMillimeters(currentWeather.rainfall24h)} over 24h – {currentWeather.rainfall24h > 20 ? "elevated" : "moderate"}.
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* EVENT TIMELINE + ALERTS */}
        <div className="col-lg-6">
          <div className="card shadow-sm border-0">
            <div className="card-body">
              <div className="d-flex align-items-center gap-2 mb-3">
                <FaExclamationTriangle size={24} className="text-danger" />
                <h5 className="mb-0 fw-bold">Event Timeline & Alerts</h5>
              </div>
              {alerts.length === 0 ? (
                <div className="text-muted">No active alerts at this location.</div>
              ) : (
                <ul className="list-group list-group-flush">
                  {alerts.map((alert, idx) => (
                    <li key={idx} className="list-group-item d-flex align-items-start gap-3">
                      <div className="mt-1">{alert.icon}</div>
                      <div>
                        <div className="fw-semibold">{alert.type} alert</div>
                        <div className="text-muted small">{alert.message}</div>
                        <div className="text-muted small">{new Date(alert.timestamp).toLocaleString()}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* DATA SOURCES + DOWNLOAD */}
        <div className="col-12">
          <div className="card shadow-sm border-0">
            <div className="card-body">
              <div className="d-flex align-items-center justify-content-between mb-3">
                <div className="d-flex align-items-center gap-2 fw-bold">
                  <FaDatabase size={24} className="text-secondary" />
                  <span>Data Sources & Export</span>
                </div>
                <div className="d-flex gap-2">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary"
                    onClick={() => {
                      const payload = buildExportPayload();
                      downloadFile("climate-dashboard-data.json", JSON.stringify(payload, null, 2), "application/json");
                    }}
                  >
                    <FaDownload className="me-1" /> Export JSON
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => {
                      const exportData = [
                        { label: "Temperature", value: currentWeather.temperature },
                        { label: "Rainfall 24h", value: currentWeather.rainfall24h },
                        { label: "Soil Moisture", value: currentWeather.soilMoisture },
                        { label: "Flood Risk", value: floodRisk },
                        { label: "Drought Risk", value: droughtRisk },
                      ];
                      const csv = prepareCsv(exportData);
                      downloadFile("climate-dashboard-data.csv", csv, "text/csv");
                    }}
                  >
                    <FaDownload className="me-1" /> Export CSV
                  </button>
                </div>
              </div>
              <div className="row">
                <div className="col-md-6">
                  <h6 className="mb-2 fw-semibold">Trusted sources</h6>
                  <ul className="list-unstyled small mb-0">
                    {dataSources.map((src) => (
                      <li key={src} className="mb-1">
                        <span className="text-secondary">•</span> {src}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="col-md-6">
                  <h6 className="mb-2 fw-semibold">Notes</h6>
                  <p className="small text-muted mb-0">
                    Some charts use derived projections and placeholder values when real forecast data is unavailable. Verify against official sources before critical decisions.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Dashboard;
