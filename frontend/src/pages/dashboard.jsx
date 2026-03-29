// Dashboard.jsx - Updated with expanded dashboard sections and professional KPI cards
import React, { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import UnifiedMap from "../components/map/mapview";
import CoordinateForm from "../components/forms/coordinateform";
import { FaRobot, FaLightbulb, FaMapMarkerAlt } from "react-icons/fa";
import { Line } from "react-chartjs-2";
import { Circle } from "react-leaflet";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
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
  Tooltip,
  Legend
);

// ----- Helpers -----
const humanizeRisk = (label) => {
  if (!label || label === "N/A") return "--";
  if (label === "--") return "--";
  const normalized = label.toString().toLowerCase();
  if (normalized === "high") return "High";
  if (normalized === "medium") return "Medium";
  if (normalized === "low") return "Low";
  return label;
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

function RiskGauge({ label, icon, title }) {
  const color = getRiskColor(label);

  return (
    <div className="card shadow-sm border-0 p-3">
      <div className="d-flex align-items-center gap-2 fw-bold">
        {icon}
        <span className="small text-uppercase text-secondary">{title}</span>
      </div>
      <div className="fs-4 fw-bold" style={{ color }}>
        {humanizeRisk(label)}
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
  const [locationName, setLocationName] = useState("Accra, Ghana");
  const [loading, setLoading] = useState(true);
  const [isWaterBody, setIsWaterBody] = useState(false);
  const [recentSnapshot, setRecentSnapshot] = useState(null);

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
  const [validationError, setValidationError] = useState(null);
  const [locationError, setLocationError] = useState(null);
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

  // Handle manual coordinate submission with validation
  const handleManualCoordinates = (latStr, lonStr) => {
    const lat = parseFloat(latStr);
    const lon = parseFloat(lonStr);

    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      setValidationError("Invalid coordinates. Latitude must be between -90 and 90, Longitude between -180 and 180.");
      return;
    }
    
    setValidationError(null);
    setCoords({ lat, lon });
  };

  const fetchAllData = useCallback(
    async (lat, lon) => {
      setLoading(true);
      // Reset risks to "--" immediately to clear previous location's data
      setFloodRisk("--");
      setDroughtRisk("--");
      setFloodScore(0);
      setDroughtScore(0);
      setIsWaterBody(false); 
      setLocationError(null);

      try {
        // rainRes (precipitation endpoint) and weatherRes (weather endpoint) now return past+future data
        const [weatherRes, predictionRes] = await Promise.all([
          axios.get(`http://localhost:5000/api/weather?lat=${lat}&lon=${lon}`),
          axios.post(`http://localhost:5000/api/predict`, { latitude: lat, longitude: lon }),
        ]);

        // --- Weather ---
        const weatherSeries = weatherRes.data?.series || [];
        
        // Find "Now" index to split into History (past 24h) and Future (next 24h)
        const nowISO = new Date().toISOString().slice(0, 13);
        const nowIndex = weatherSeries.findIndex(item => item.time >= nowISO);
        
        // Safe fallback if index not found
        const safeNowIndex = nowIndex === -1 ? weatherSeries.length - 1 : nowIndex;

        // History: 24 hours ending at current hour
        const startHist = Math.max(0, safeNowIndex - 23);
        const historySlice = weatherSeries.slice(startHist, safeNowIndex + 1);

        // Future: 24 hours starting from next hour
        const futureSlice = weatherSeries.slice(safeNowIndex + 1, safeNowIndex + 25);

        // Data for Historical Trends Chart
        const rainHist = historySlice.map((s) => Number(s.precipitation ?? 0));
        const tempHist = historySlice.map((s) => Number(s.temperature ?? 0));
        const windHist = historySlice.map((s) => Number(s.windSpeed ?? 0));
        const labelsHist = historySlice.map((s) => {
            const d = new Date(s.time);
            return `${d.getHours()}:00`;
        });

        // Summary Values (Current)
        const currentItem = weatherSeries[safeNowIndex] || {};
        const lastHourRain = currentItem.precipitation ?? 0;
        const totalRain24 = rainHist.reduce((a, b) => a + b, 0); // Accumulate past 24h rain
        const avgTemp = computeAverage(tempHist);

        const nextWeatherSummary = {
          temperature: avgTemp,
          humidity: currentItem.humidity ?? null,
          windSpeed: currentItem.windSpeed ?? null,
          soilMoisture: currentItem.soilMoisture ?? null,
          rainfallLastHour: lastHourRain,
          rainfall24h: totalRain24,
          cloudCover: currentItem.cloudCover ?? null,
        };

        setCurrentWeather(nextWeatherSummary);

        // --- AI predictions ---
        const isWater = predictionRes.data?.isWater || false;
        setIsWaterBody(isWater);
        const predictionData = predictionRes.data?.prediction || {};
        
        let floodLabel = predictionData.flood?.label ?? "--";
        let droughtLabel = predictionData.drought?.label ?? "--";
        let floodSc = predictionData.flood?.score ?? 0;
        let droughtSc = predictionData.drought?.score ?? 0;

        if (isWater) {
          setLocationError("Selected location appears to be a water body or ice area. Soil-based predictions are invalid/unavailable.");
          floodLabel = "--";
          droughtLabel = "--";
          floodSc = 0;
          droughtSc = 0;
        } else {
          setLocationError(null);
        }

        setFloodRisk(floodLabel);
        setDroughtRisk(droughtLabel);
        setFloodScore(floodSc);
        setDroughtScore(droughtSc);

        // Real Prediction Data (Next 24 Hours)
        const projectedRain = futureSlice.map(s => Number(s.precipitation ?? 0));
        const projectedTemp = futureSlice.map(s => Number(s.temperature ?? 0));

        setPredictions({
          rainfall: projectedRain,
          temperature: projectedTemp,
          floodProbability: floodSc,
          droughtProbability: droughtSc,
        });

        refreshAlerts(nextWeatherSummary, floodLabel, droughtLabel);
      } catch (error) {
        console.error("Dashboard fetch error:", error);
        // alert("Dashboard data failed to load."); 
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
      <header className="dashboard-hero mb-4 rounded-4 overflow-hidden bg-light">
        <div className="dashboard-hero-overlay" />
        <div className="p-4 p-md-5 text-grey">
          <div className="d-flex flex-column flex-md-row align-items-start justify-content-between gap-3">
            <div>
              <h1 className="h4 fw-bold mb-1">At a glance</h1>
              <p className="mb-0 text-white-75">Real-time trends, predictions, and alerts for your location.</p>
            </div>
            <div className="d-flex flex-wrap gap-2 align-items-center">
              <div className="bg-white bg-opacity-15 rounded-3 px-3 py-2">
                <div className="small text-grey">Location</div>
                <div className="fw-semibold">{coords.lat.toFixed(2)}, {coords.lon.toFixed(2)}</div>
              </div>
              <div className="bg-white bg-opacity-15 rounded-3 px-3 py-2">
                <div className="small text-grey">Last refresh</div>
                <div className="fw-semibold">{new Date().toLocaleTimeString()}</div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Input & Validation Alerts Section */}
      <div className="card shadow-sm border-0 mb-4 p-3">
        <h5 className="mb-0 fw-bold d-flex align-items-center gap-2">
           <FaMapMarkedAlt className="text-primary" /> Update Location
        </h5>
        <CoordinateForm 
          onSubmit={handleManualCoordinates} 
          loading={loading} 
          buttonText="Analyze Location" 
          buttonColor="primary" 
        />
        {validationError && (
          <div className="alert alert-danger mt-3 mb-0 d-flex align-items-center gap-2">
            <FaExclamationTriangle /> <strong>Input Error:</strong> {validationError}
          </div>
        )}
        {locationError && (
          <div className="alert alert-warning mt-3 mb-0 d-flex align-items-center gap-2">
            <FaWater /> <strong>Invalid Terrain:</strong> {locationError}
          </div>
        )}
      </div>

      {/* Climate Resources Section */}
      <div className="bg-light py-4">
        <div className="container">
          <div className="row align-items-center">
            <div className="col-lg-8">
              <h3 className="h5 fw-bold mb-3">Explore Climate Data Sources</h3>
              <p className="text-muted mb-3">
                Access authoritative climate data and research from leading organizations worldwide.
              </p>
              <div className="d-flex flex-wrap gap-3">
                <a
                  href="https://www.noaa.gov/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-outline-primary btn-sm"
                >
                  NOAA Climate
                </a>
                <a
                  href="https://climate.nasa.gov/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-outline-primary btn-sm"
                >
                  NASA Climate
                </a>
                <a
                  href="https://www.ipcc.ch/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-outline-primary btn-sm"
                >
                  IPCC Reports
                </a>
                <a
                  href="https://www.worldweatheronline.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-outline-primary btn-sm"
                >
                  World Weather
                </a>
              </div>
            </div>
            <div className="col-lg-4 text-center">
              <FaDatabase size={60} className="text-primary mb-2" />
              <p className="text-muted small">Trusted global data sources</p>
            </div>
          </div>
        </div>
      </div>

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
                  <div className="text-secondary small fw-semibold text-uppercase">{card.label}</div>
                  <div className="fs-5 fw-bold">{card.value}</div>
                  <div className="text-muted small">{card.caption}</div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* 2, 4 & 5. LOCATION INTELLIGENCE & AI IMPACT PANELS */}
      <div className="row g-4 mb-4">
        <div className="col-lg-8">
          <div className="card shadow-sm border-0 bg-primary text-white h-100">
            <div className="card-body p-4">
              <div className="d-flex align-items-center gap-3 mb-4">
                <div className="rounded-circle bg-white bg-opacity-25 p-3"><FaRobot size={24} /></div>
                <div>
                  <h5 className="mb-0 fw-bold">AI Location Intelligence</h5>
                  <div className="small opacity-75"><FaMapMarkerAlt size={12}/> {locationName}</div>
                </div>
              </div>
              <div className="bg-white bg-opacity-10 rounded-3 p-3 mb-4">
                <h6 className="fw-bold mb-1"><FaLightbulb className="text-warning me-2"/> AI Climate Insight</h6>
                <p className="mb-0 lead fs-6">
                  {floodRisk.toLowerCase() === "high" 
                    ? `“Rising rainfall variability combined with high humidity suggests increased flood likelihood in ${locationName.split(',')[0]}.”`
                    : `“This area shows high rainfall variability and ${droughtRisk.toLowerCase()} drought risk levels.”`}
                </p>
              </div>
              <div className="row g-3">
                <div className="col-md-6">
                  <div className="small fw-bold text-uppercase opacity-75 mb-2">Impact Summary</div>
                  <div className="d-flex justify-content-between border-bottom border-white border-opacity-10 py-1">
                    <span>Flood Likelihood</span><span className="fw-bold">{floodRisk}</span>
                  </div>
                  <div className="d-flex justify-content-between border-bottom border-white border-opacity-10 py-1">
                    <span>Agricultural Impact</span><span className="fw-bold">{currentWeather.soilMoisture < 0.2 ? 'Stressed' : 'Optimal'}</span>
                  </div>
                </div>
                <div className="col-md-6">
                   <div className="small fw-bold text-uppercase opacity-75 mb-2">Water Stress Level</div>
                   <div className="progress bg-white bg-opacity-25 mb-1" style={{height: 10}}>
                      <div className="progress-bar bg-warning" style={{width: `${(1-currentWeather.soilMoisture)*100}%`}}></div>
                   </div>
                   <div className="text-end small">{(100 - (currentWeather.soilMoisture*100)).toFixed(0)}% Scarcity Index</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 7. Recent Climate Snapshot */}
        <div className="col-lg-4">
          <div className="card shadow-sm border-0 h-100">
            <div className="card-header bg-white fw-bold py-3">Recent 30-Day Snapshot</div>
            <div className="card-body">
              <div className="text-center mb-4">
                <div className="display-6 fw-bold text-primary">
                  {recentSnapshot ? (recentSnapshot.precipitation_sum?.reduce((a, b) => a + (b || 0), 0) || 0).toFixed(1) : '--'}mm
                </div>
                <div className="text-muted small">Total Rainfall (Past 30 Days)</div>
              </div>
              <div className="d-flex justify-content-between small mb-2">
                <span>Rainfall Spikes</span>
                <span className="badge bg-info text-dark">Detected: {recentSnapshot?.precipitation_sum?.filter(r => r > 10).length || 0} days</span>
              </div>
              <div className="d-flex justify-content-between small">
                <span>Temperature Pattern</span>
                <span className="text-success fw-bold">Moderate Variation</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="row gx-4 gy-4">

        {/* INTERACTIVE MAP (MAIN VISUALIZATION) */}
        <div className="col-lg-8">
          <div className="card shadow-sm border-0">
            <div className="card-body">
              <div className="d-flex align-items-center justify-content-between mb-3">
                <div className="d-flex align-items-center gap-2 fw-bold">
                  <FaMapMarkedAlt size={24} className="text-primary" />
                  <span>AI Risk Map (Visual Upgrade)</span>
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
                {/* AI Predicted Risk Circle */}
                <Circle 
                  center={[coords.lat, coords.lon]} 
                  radius={30000} 
                  pathOptions={{ color: getRiskColor(floodRisk), fillColor: getRiskColor(floodRisk), fillOpacity: 0.3 }} 
                />
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
            icon={<FaWater size={22} className="text-primary" />}
          />
          <RiskGauge
            title="Drought Severity"
            label={droughtRisk}
            icon={<FaCloudSun size={22} className="text-warning" />}
          />
          <RiskGauge
            title="Heatwave Potential"
            label={currentWeather.temperature > 32 ? "High" : currentWeather.temperature > 25 ? "Medium" : "Low"}
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
                <div className="text-muted small">24-hour forecast derived from live meteorological models.</div>
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
                        <div className="text-muted small">Model scores are derived from current temperature, humidity and soil moisture.</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

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
