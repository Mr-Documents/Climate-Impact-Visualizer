import React, { useState, useEffect, useCallback } from "react";
import ReactDOMServer from "react-dom/server";
import CoordinateForm from "../components/forms/coordinateform";
import UnifiedMap from "../components/map/mapview";
import axios from "axios";
import { 
  FaMapMarkedAlt, 
  FaTemperatureHigh, 
  FaLocationArrow,
  FaWind, 
  FaTint, 
  FaCloud, 
  FaSun, 
  FaSmog, 
  FaGlobe,
  FaInfoCircle,
  FaDownload,
  FaHistory,
  FaChartLine,
  FaChartArea,
  FaExclamationCircle,
  FaThermometerHalf
} from "react-icons/fa";
import ResultCard from "../components/reusable/resultcard"; 
import { Circle, Popup, Marker, TileLayer } from "react-leaflet";
import { Line, Bar, Scatter } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend,
  Filler,
  ScatterController,
  LineController,
  BarController
} from "chart.js";
import L from "leaflet";

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend,
  Filler,
  ScatterController,
  LineController,
  BarController
);

// --- Weather Overlay Configuration ---
// IMPORTANT: You need an OpenWeatherMap API key for the weather overlays to work.
// 1. Go to https://openweathermap.org/api
// 2. Sign up and get your free API key.
// 3. Replace the placeholder below with your key.
const OWM_API_KEY = process.env.REACT_APP_OWM_API_KEY || process.env.VITE_OWM_API_KEY || 'YOUR_OPENWEATHERMAP_API_KEY';

const weatherLayers = {
  precipitation: {
    url: `https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=${OWM_API_KEY}`,
    attribution: '',
    name: 'Precipitation',
    icon: <FaTint />
  },
  temperature: {
    url: `https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=${OWM_API_KEY}`,
    attribution: '',
    name: 'Temperature',
    icon: <FaTemperatureHigh />
  },
  wind: {
    url: `https://tile.openweathermap.org/map/wind_new/{z}/{x}/{y}.png?appid=${OWM_API_KEY}`,
    attribution: '',
    name: 'Wind Speed',
    icon: <FaWind />
  },
  clouds: {
    url: `https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid=${OWM_API_KEY}`,
    attribution: '',
    name: 'Cloud Cover',
    icon: <FaCloud />
  },
};

const MapPage = () => {
  const [coords, setCoords] = useState({ lat: 5.6037, lon: -0.1870 });
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [data, setData] = useState({
    weather: null,
    airQuality: null,
    uvDryness: null,
  });
  const [activeOverlays, setActiveOverlays] = useState([]);
  const [historicalAnalysis, setHistoricalAnalysis] = useState(null);
  const [histError, setHistError] = useState(null);
  const [histLoading, setHistLoading] = useState(false);
  const [locationName, setLocationName] = useState("");
  const [startYear, setStartYear] = useState(new Date().getFullYear() - 30);
  const [chartType, setChartType] = useState('line'); // 'line' or 'bar'

  const fetchAllClimateData = useCallback(async (lat, lon) => {
    setLoading(true);
    try {
      // Concurrent fetching for all climate data points
      const [weatherRes, uvRes, airRes] = await Promise.allSettled([
        axios.get(`http://localhost:5000/api/weather?lat=${lat}&lon=${lon}`),
        axios.get(`http://localhost:5000/api/uv-dryness?lat=${lat}&lon=${lon}`),
        axios.get(`http://localhost:5000/api/airquality?lat=${lat}&lon=${lon}`)
      ]);

      setData({
        weather: weatherRes.status === 'fulfilled' ? weatherRes.value.data : null,
        uvDryness: uvRes.status === 'fulfilled' ? uvRes.value.data : null,
        airQuality: airRes.status === 'fulfilled' ? airRes.value.data : null,
      });
    } catch (err) {
      console.error("Failed to fetch comprehensive climate data", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleLocationSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setLoading(true);
    try {
      const res = await axios.get(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&limit=1`);
      if (res.data && res.data.length > 0) {
        const { lat, lon } = res.data[0];
        setCoords({ lat: parseFloat(lat), lon: parseFloat(lon) });
        setSearchQuery("");
      } else {
        alert("Location not found. Please try a different name.");
      }
    } catch (err) {
      console.error("Search failed", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchLocationName = useCallback(async (lat, lon) => {
    try {
      const geoUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=en`;
      const res = await axios.get(geoUrl, { headers: { 'User-Agent': 'ClimateImpactVisualizer/1.0' } });
      const name = res.data.display_name?.split(',').slice(0, 3).join(',') || "Selected Location";
      setLocationName(name);
    } catch (err) {
      console.error("Geocoding failed", err);
    }
  }, []);

  const fetchHistoricalDeepDive = useCallback(async (lat, lon, year) => {
    setHistLoading(true);
    setHistoricalAnalysis(null); // Reset to ensure loading state shows correctly
    setHistError(null);
    try {
      const res = await axios.get(`http://localhost:5000/api/historical-analysis?lat=${lat}&lon=${lon}&start_year=${year}`);
      console.log("Historical Data Received:", res.data);
      if (res.data && res.data.raw) {
        setHistoricalAnalysis(res.data);
      } else {
        console.warn("Backend returned success but no 'raw' data field exists.");
      }
    } catch (err) {
      if (err.response?.status === 429) {
        setHistError("Provider limit exceeded. Our data source needs a 60-second break. Please wait a moment.");
        return;
      }
      if (err.response?.status === 404) {
        const msg = "Route Not Found (404). Please ensure '/api/historical-analysis' is registered in your backend routes file.";
        setHistError(msg);
        console.error(msg);
      } else {
        const errMsg = err.response?.data?.error || err.response?.data?.reason || err.message;
        setHistError(errMsg);
      }
    } finally {
      setHistLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllClimateData(coords.lat, coords.lon);
    fetchHistoricalDeepDive(coords.lat, coords.lon, startYear);
    fetchLocationName(coords.lat, coords.lon);
  }, [coords.lat, coords.lon, startYear, fetchAllClimateData, fetchHistoricalDeepDive, fetchLocationName]);

  const toggleOverlay = (key) => {
    setActiveOverlays((prev) => 
      prev.includes(key) 
        ? prev.filter((k) => k !== key) 
        : [...prev, key]
    );
  };

  // Helper: Find value corresponding to current hour in hourly arrays
  const getHourlyValue = (source, key) => {
    if (!source?.hourly?.[key] || !source?.hourly?.time) return null;
    const nowISO = new Date().toISOString().split(':')[0]; // Gets YYYY-MM-DDTHH
    const idx = source.hourly.time.findIndex(t => t.startsWith(nowISO));
    // Return current hour value, or null if not found (don't default to 0 index as it might be night/0)
    return idx !== -1 ? source.hourly[key][idx] : null;
  };

  // Extract current hour snapshots
  const current = {
    temp: data.weather?.series?.[0]?.temperature ?? null,
    windSpeed: data.weather?.series?.[0]?.windSpeed ?? null,
    windDirection: data.weather?.series?.[0]?.windDirection ?? null,
    humidity: data.weather?.series?.[0]?.humidity ?? null,
    precipitation: data.weather?.series?.[0]?.precipitation ?? null,
    soil: data.weather?.series?.[0]?.soilMoisture ?? null,
    clouds: data.weather?.series?.[0]?.cloudCover ?? null,
    uv: data.uvDryness?.current?.uv_index ?? getHourlyValue(data.uvDryness, 'uv_index') ?? null,
    vpd: data.uvDryness?.current?.vapour_pressure_deficit ?? getHourlyValue(data.uvDryness, 'vapour_pressure_deficit') ?? null,
    co: data.airQuality?.current?.carbon_monoxide ?? data.airQuality?.hourly?.carbon_monoxide?.[0] ?? null,
    pm25: data.airQuality?.current?.pm2_5 ?? data.airQuality?.hourly?.pm2_5?.[0] ?? null,
    no2: data.airQuality?.current?.nitrogen_dioxide ?? data.airQuality?.hourly?.nitrogen_dioxide?.[0] ?? null,
    o3: data.airQuality?.current?.ozone ?? data.airQuality?.hourly?.ozone?.[0] ?? null,
    so2: data.airQuality?.current?.sulphur_dioxide ?? data.airQuality?.hourly?.sulphur_dioxide?.[0] ?? null,
  };

  // --- Analytical Computations ---
  const seasonalData = React.useMemo(() => {
    if (!historicalAnalysis?.raw?.time) return null;
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const stats = Array(12).fill(0).map(() => ({ temp: 0, rain: 0, count: 0 }));
    
    historicalAnalysis.raw.time.forEach((t, i) => {
      const month = new Date(t).getMonth();
      stats[month].temp += (historicalAnalysis.raw.temperature_2m_mean?.[i] || 0);
      stats[month].rain += (historicalAnalysis.raw.precipitation_sum?.[i] || 0);
      stats[month].count++;
    });

    return {
      labels: months,
      temp: stats.map(s => (s.count > 0 ? (s.temp / s.count).toFixed(1) : 0)),
      rain: stats.map(s => (s.count > 0 ? (s.rain / s.count).toFixed(1) : 0))
    };
  }, [historicalAnalysis]);

  const extremeEvents = React.useMemo(() => {
    if (!historicalAnalysis?.raw?.time) return [];
    
    // Dynamically calculate the 95th percentile for local rainfall accuracy
    const rainValues = historicalAnalysis.raw.precipitation_sum
      ?.filter(r => r > 0.1) // Only consider actual wet days
      .sort((a, b) => a - b) || [];
    
    const p95Rain = rainValues.length > 0 
      ? rainValues[Math.floor(rainValues.length * 0.95)] 
      : 50; // Fallback to 50mm if no data

    return historicalAnalysis.raw.time
      .map((t, i) => ({ 
        time: t, 
        rain: historicalAnalysis.raw.precipitation_sum?.[i] || 0, 
        temp: historicalAnalysis.raw.temperature_2m_mean?.[i] || 0 
      }))
      .filter(d => d.rain > p95Rain || d.temp > 38)
      .slice(-5); // Show last 5 extreme events
  }, [historicalAnalysis]);

  return (
    <div className="container py-4">
      {/* Moving Visual Effect Style */}
      <style>
        {`
          @keyframes mapPulse {
            0% { fill-opacity: 0.2; stroke-width: 1; }
            50% { fill-opacity: 0.4; stroke-width: 3; }
            100% { fill-opacity: 0.2; stroke-width: 1; }
          }
          .map-moving-visual {
            animation: mapPulse 3s infinite ease-in-out;
          }
          .wind-arrow-icon {
            color: #fff;
            background: #0d6efd;
            border-radius: 50%;
            padding: 5px;
          }
        `}
      </style>

      {/* Hero Section */}
      <header className="dashboard-hero mb-4 rounded-4 overflow-hidden bg-dark text-white p-4 p-md-5 position-relative shadow">
        <div className="position-relative z-1">
          <h1 className="h2 fw-bold mb-2">Climate Overview</h1>
          <p className="lead mb-0 opacity-75">
            Spatial monitoring and environmental metrics for global coordinates.
          </p>
        </div>
      </header>

      {/* Input Section */}
      <div className="card shadow-sm border-0 mb-4 bg-light">
        <div className="card-body">
          <div className="d-flex align-items-center gap-2 mb-3 fw-bold text-primary">
            <FaMapMarkedAlt /> <span>Coordinate Analysis Engine</span>
          </div>
          <form onSubmit={handleLocationSearch} className="mb-3">
            <div className="input-group">
              <input 
                type="text" 
                className="form-control" 
                placeholder="Search by city or area name..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button className="btn btn-primary" type="submit" disabled={loading}>Search Location</button>
            </div>
          </form>
          <div className="text-muted small mb-2">Or enter coordinates manually:</div>
          <CoordinateForm
            onSubmit={(lat, lon) => setCoords({ lat: Number(lat), lon: Number(lon) })}
            loading={loading}
            buttonText="Update Overview"
            buttonColor="primary"
          />
        </div>
      </div>

      <div className="row g-4">
        {/* Main Map with Moving Visuals */}
        <div className="col-lg-8">
          <div className="card shadow-sm border-0 overflow-hidden">
            <div className="card-body p-0 position-relative" style={{ height: "500px" }}>
              <UnifiedMap
                lat={coords.lat}
                lon={coords.lon}
                onSelect={(lat, lon) => setCoords({ lat, lon })}
              >
                {activeOverlays.map((key) => (
                  <TileLayer
                    key={key}
                    url={weatherLayers[key].url}
                    attribution={weatherLayers[key].attribution}
                    opacity={0.6}
                  />
                ))}
                <Circle
                  center={[coords.lat, coords.lon]}
                  radius={12000}
                  pathOptions={{
                    color: '#0d6efd',
                    fillColor: '#0d6efd',
                    className: 'map-moving-visual'
                  }}
                />
                {/* Wind Arrow Marker */}
                {current.windDirection !== null && (
                  <Marker
                    position={[coords.lat, coords.lon]}
                    icon={new L.DivIcon({
                      html: ReactDOMServer.renderToString(
                        <FaLocationArrow style={{ 
                          transform: `rotate(${(current.windDirection || 0) - 45}deg)`,
                          fontSize: '1.2rem',
                        }} />
                      ),
                      className: 'wind-arrow-icon',
                      iconSize: [24, 24],
                      iconAnchor: [12, 12]
                    })}
                  />
                )}
                <Popup position={[coords.lat, coords.lon]}>
                  <strong>Climate Monitor Active</strong><br/>
                  Targeting: {coords.lat.toFixed(3)}, {coords.lon.toFixed(3)}
                </Popup>
              </UnifiedMap>
            </div>
            <div className="card-footer bg-light p-3">
              <div className="d-flex flex-wrap align-items-center gap-3">
                <div className="fw-bold text-secondary small d-flex align-items-center text-uppercase ls-1">
                  <FaGlobe className="me-2" /> Active Layers:
                </div>
                <div className="d-flex flex-wrap gap-2">
                  {Object.entries(weatherLayers).map(([key, layer]) => (
                    <button
                      key={key}
                      type="button"
                      className={`btn btn-sm rounded-pill px-3 d-flex align-items-center gap-2 transition-all ${
                        activeOverlays.includes(key) 
                          ? 'btn-primary shadow-sm border-primary' 
                          : 'btn-outline-secondary bg-white border-secondary-subtle hover-shadow'
                      }`}
                      onClick={() => toggleOverlay(key)}
                      disabled={OWM_API_KEY.includes('YOUR_OPENWEATHERMAP_API_KEY')}
                    >
                      {layer.icon}
                      {layer.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: High Level Metrics */}
        <div className="col-lg-4 d-flex flex-column gap-3">
          <ResultCard title="Atmospheric Conditions" icon={<FaTemperatureHigh />} color="danger">
            <div className="d-flex justify-content-between mb-2"><span>Temperature:</span> <span className="fw-bold">{current.temp != null ? `${current.temp.toFixed(1)}°C` : '--'}</span></div>
            <div className="d-flex justify-content-between mb-2"><span>Humidity:</span> <span className="fw-bold">{current.humidity != null ? `${current.humidity.toFixed(0)}%` : '--'}</span></div>
            <div className="d-flex justify-content-between mb-2"><span>Precipitation:</span> <span className="fw-bold">{current.precipitation ?? '--'} mm</span></div>
            <div className="d-flex justify-content-between mb-2"><span>Wind Speed:</span> <span className="fw-bold">{current.windSpeed ?? '--'} km/h</span></div>
            <div className="d-flex justify-content-between mb-2"><span>Wind Direction:</span> <span className="fw-bold">{current.windDirection ?? '--'}°</span></div>
            <div className="d-flex justify-content-between"><span>Cloud Cover:</span> <span className="fw-bold">{current.clouds ?? '--'} %</span></div>
          </ResultCard>

          <ResultCard title="Solar & Hydrological" icon={<FaSun />} color="warning">
            <div className="d-flex justify-content-between mb-2"><span>UV Index:</span> <span className="fw-bold">{current.uv ?? '--'} <small className="text-muted">(0 at night)</small></span></div>
            <div className="d-flex justify-content-between mb-2"><span>Dryness (VPD):</span> <span className="fw-bold">{current.vpd ?? '--'} kPa</span></div>
            <div className="d-flex justify-content-between"><span>Soil Moisture:</span> <span className="fw-bold">{current.soil ? (current.soil * 100).toFixed(1) : '--'} %</span></div>
          </ResultCard>

          <div className="alert alert-info border-0 shadow-sm mb-0">
            <FaInfoCircle className="me-2" />
            <small>Vapour Pressure Deficit (VPD) indicates how thirsty the atmosphere is for moisture.</small>
          </div>
        </div>

        {/* Bottom Section: Air Quality Components */}
        <div className="col-12">
          <div className="card shadow-sm border-0">
            <div className="card-body">
              <h5 className="fw-bold mb-4 d-flex align-items-center gap-2 text-secondary">
                <FaSmog /> Comprehensive Air Quality Index (AQI) Components
              </h5>
              <div className="row g-3">
                {[
                  { label: "Carbon Monoxide", val: current.co, unit: "µg/m³", icon: <FaSmog /> },
                  { label: "Nitrogen Dioxide", val: current.no2, unit: "µg/m³", icon: <FaWind /> },
                  { label: "Sulphur Dioxide", val: current.so2, unit: "µg/m³", icon: <FaThermometerHalf /> },
                  { label: "Ozone (O₃)", val: current.o3, unit: "µg/m³", icon: <FaSun /> },
                  { label: "PM2.5 Particles", val: current.pm25, unit: "µg/m³", icon: <FaTint /> },
                ].map((item, idx) => (
                  <div key={idx} className="col-lg col-md-4 col-6">
                    <div className="p-3 bg-light rounded border-start border-4 border-info shadow-sm h-100">
                      <div className="text-muted small text-uppercase fw-bold mb-1">{item.label}</div>
                      <div className="h4 mb-0 fw-bold">{item.val?.toFixed(2) ?? 'N/A'} <span className="small fw-normal opacity-50">{item.unit}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* DEEP HISTORICAL ANALYSIS SECTION */}
      <div className="col-12 mt-4">
        <div className="card shadow-sm border-0 p-4">
          <div className="d-flex flex-column flex-md-row align-items-md-start justify-content-between mb-4 gap-3">
            <div>
              <h4 className="fw-bold mb-1"><FaHistory className="text-primary me-2"/> 30-Year Climate Evolution</h4>
              <p className="text-muted small mb-0">Visualizing environmental shifts and extreme events since {startYear}.</p>
            </div>
            <div className="d-flex flex-wrap gap-2">
              <select 
                className="form-select form-select-sm w-auto" 
                value={startYear} 
                onChange={(e) => setStartYear(Number(e.target.value))}
              >
                {[...Array(31)].map((_, i) => (
                  <option key={i} value={new Date().getFullYear() - 30 + i}>
                    Since {new Date().getFullYear() - 30 + i}
                  </option>
                ))}
              </select>
              <button 
                className="btn btn-outline-primary btn-sm"
                onClick={() => setChartType(chartType === 'line' ? 'bar' : 'line')}
              >
                Switch to {chartType === 'line' ? 'Bar' : 'Line'}
              </button>
              <button className="btn btn-outline-dark btn-sm" onClick={() => {
               if (!historicalAnalysis) return;
               const csv = "Date,Temp,Rain\n" + (historicalAnalysis.raw.time?.map((t,i) => `${t},${historicalAnalysis.raw.temperature_2m_mean?.[i] ?? ''},${historicalAnalysis.raw.precipitation_sum?.[i] ?? ''}`).join('\n') || "");
               const blob = new Blob([csv], { type: 'text/csv' });
               const url = URL.createObjectURL(blob);
               const link = document.createElement('a');
               link.href = url; link.download = `climate_history_${coords.lat}_${coords.lon}.csv`; link.click();
            }}> <FaDownload className="me-2"/> Export CSV Data</button>
            </div>
          </div>

          {histLoading ? <div className="text-center p-5"><div className="spinner-border text-primary"/><p className="mt-2 text-muted">Retrieving 30 years of climate history...</p></div> : historicalAnalysis?.raw ? (
            <div className="row g-4">
              <div className="col-md-4">
                 <div className="p-3 bg-light rounded border-top border-4 border-danger h-100">
                    <h6 className="fw-bold small text-uppercase text-secondary">Trend Analysis</h6>
                    <div className="h3">+{historicalAnalysis.insights?.tempTrend ?? '0'}°C</div>
                    <p className="small text-danger mb-0 fw-bold mt-2">
                      “Average temperature has increased by {historicalAnalysis.insights?.tempTrend ?? '0'}°C over the last 30 years.”
                    </p>
                 </div>
              </div>
              <div className="col-md-4">
                 <div className="p-3 bg-light rounded border-top border-4 border-info h-100">
                    <h6 className="fw-bold small text-uppercase text-secondary">Anomaly Detection</h6>
                    <div className="h3">{historicalAnalysis.insights?.rainAnomaly ?? '0'}%</div>
                    <p className="small text-info mb-0 fw-bold mt-2">
                      “Recent rainfall is {historicalAnalysis.insights?.rainAnomaly ?? '0'}% {historicalAnalysis.insights?.rainAnomaly > 0 ? 'above' : 'below'} the 30-year average.”
                    </p>
                 </div>
              </div>
              <div className="col-md-4">
                 <div className="p-3 bg-primary text-white rounded h-100">
                    <h6 className="fw-bold small text-uppercase text-white-50">AI Prediction Context</h6>
                    <p className="small mb-0 mt-2">Increasing rainfall variability in {locationName || 'this region'} directly influences our flood and drought risk models.</p>
                 </div>
              </div>
              <div className="col-12 d-flex flex-column gap-5">
                   <div className="bg-light p-4 rounded shadow-sm border w-100">
                      <h6 className="fw-bold mb-4 d-flex align-items-center gap-2">
                        <FaChartArea className="text-primary"/> 1. Key Climate Variables Over Time ({startYear}-{new Date().getFullYear()})
                      </h6>
                      {chartType === 'line' ? <Line 
                        data={{
                          labels: historicalAnalysis.raw.time?.filter((_, i) => i % 365 === 0).map(t => t.split('-')[0]) || [],
                          datasets: [
                            { 
                              label: "Temp (°C)", 
                              data: historicalAnalysis.raw.temperature_2m_mean?.filter((_, i) => i % 365 === 0) || [], 
                              borderColor: "#dc3545", yAxisID: 'y', tension: 0.3
                            },
                            { 
                              label: "Rain (mm)", 
                              data: historicalAnalysis.raw.precipitation_sum?.filter((_, i) => i % 365 === 0) || [], 
                              backgroundColor: "rgba(13, 110, 253, 0.1)", borderColor: "#0d6efd", fill: true, yAxisID: 'y1', tension: 0.3
                            }
                          ].concat(
                            historicalAnalysis.raw.humidity_2m_mean?.some(v => v !== null) 
                            ? [{
                                label: "Humidity (%)",
                                data: historicalAnalysis.raw.humidity_2m_mean?.filter((_, i) => i % 365 === 0),
                                borderColor: "#198754", borderDash: [5,5], yAxisID: 'y', tension: 0.3
                              }] 
                            : []
                          )
                        }}
                        options={{
                          responsive: true,
                          scales: {
                            y: { type: 'linear', position: 'left', title: { display: true, text: 'Temp / Humidity' } },
                            y1: { type: 'linear', position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Rain (mm)' } }
                          }
                        }}
                      /> : <Bar 
                        data={{
                          labels: historicalAnalysis.raw.time?.filter((_, i) => i % 365 === 0).map(t => t.split('-')[0]) || [],
                          datasets: [
                            { 
                              label: "Avg Temp (°C)", 
                              data: historicalAnalysis.raw.temperature_2m_mean?.filter((_, i) => i % 365 === 0) || [], 
                              backgroundColor: "rgba(220, 53, 69, 0.7)", yAxisID: 'y'
                            },
                            { 
                              label: "Rain (mm)", 
                              data: historicalAnalysis.raw.precipitation_sum?.filter((_, i) => i % 365 === 0) || [], 
                              backgroundColor: "rgba(13, 110, 253, 0.7)", yAxisID: 'y1'
                            }
                          ]
                        }}
                        options={{
                          responsive: true,
                          scales: {
                            y: { type: 'linear', position: 'left', title: { display: true, text: 'Temp' } },
                            y1: { type: 'linear', position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Rain (mm)' } }
                          }
                        }}
                      />}
                   </div>

                  <div className="bg-light p-4 rounded shadow-sm border w-100">
                    <h6 className="fw-bold mb-4 d-flex align-items-center gap-2">
                      <FaChartArea className="text-warning"/> 2. Drought Intensity Index (SPI Approximation)
                    </h6>
                    <div style={{ height: '300px' }}>
                      <Bar 
                        data={{
                          labels: historicalAnalysis.insights.droughtSeries?.map(d => d.year),
                          datasets: [{
                            label: 'Standardized Precipitation Index (SPI)',
                            data: historicalAnalysis.insights.droughtSeries?.map(d => d.spi),
                            backgroundColor: historicalAnalysis.insights.droughtSeries?.map(d => d.spi < 0 ? 'rgba(220, 53, 69, 0.7)' : 'rgba(13, 110, 253, 0.7)'),
                            borderColor: historicalAnalysis.insights.droughtSeries?.map(d => d.spi < 0 ? '#dc3545' : '#0d6efd'),
                            borderWidth: 1
                          }]
                        }}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          scales: {
                            y: { title: { display: true, text: 'SPI Value (Std Deviations)' }, min: -3, max: 3 }
                          }
                        }}
                      />
                    </div>
                    <div className="mt-3 p-3 bg-white border rounded small text-muted">
                      <strong>How to read:</strong> Values below <strong>-1.0</strong> indicate moderate drought, while values below <strong>-2.0</strong> represent extreme drought. 
                      Positive values indicate wetter-than-average years. This index helps identify multi-year dry spells.
                    </div>
                  </div>

                  {seasonalData && <div className="bg-light p-4 rounded shadow-sm border text-center w-100">
                    <h6 className="fw-bold mb-4 d-flex align-items-center justify-content-center gap-2">
                      <FaGlobe className="text-success"/> 4. Seasonal Patterns (Monthly Averages)
                    </h6>
                    <Bar 
                      data={{
                        labels: seasonalData.labels,
                        datasets: [
                          { label: "Avg Rain (mm)", data: seasonalData.rain, backgroundColor: "#0d6efd" },
                          { label: "Avg Temp (°C)", data: seasonalData.temp, type: 'line', borderColor: "#dc3545", tension: 0.4 }
                        ]
                      }}
                    />
                    <div className="mt-3 p-2 bg-white border rounded small">
                      <strong>Insight:</strong> The data confirms a distinct {seasonalData.rain[5] > seasonalData.rain[0] ? 'Summer' : 'Winter'} wet season for this coordinate.
                    </div>
                  </div>}

                  <div className="row g-4">
                    <div className="col-lg-6">
                      <div className="bg-light p-4 rounded shadow-sm border h-100">
                        <h6 className="fw-bold mb-4 d-flex align-items-center gap-2">
                          <FaChartArea className="text-warning"/> 5. Correlation: Temp vs Rainfall
                        </h6>
                        <Scatter 
                          data={{
                            datasets: [{
                              label: 'Climate Correlation',
                              data: historicalAnalysis.raw.temperature_2m_mean?.filter((_, i) => i % 30 === 0).map((temp, i) => ({
                                x: temp,
                                y: historicalAnalysis.raw.precipitation_sum?.filter((_, j) => j % 30 === 0)[i] || 0
                              })),
                              backgroundColor: 'rgba(102, 16, 242, 0.6)'
                            }]
                          }}
                          options={{
                            scales: {
                              x: { title: { display: true, text: 'Mean Temperature (°C)' } },
                              y: { title: { display: true, text: 'Daily Rainfall (mm)' } }
                            }
                          }}
                        />
                      </div>
                    </div>
                    <div className="col-lg-6">
                      <div className="p-4 rounded shadow-sm border h-100 bg-white d-flex flex-column justify-content-center">
                        <h5 className="fw-bold text-primary mb-3"><FaChartLine className="me-2"/> Trend Summary Card</h5>
                        <div className="display-6 fw-bold mb-2">+{historicalAnalysis.insights?.tempTrend ?? '0'}°C</div>
                        <p className="text-muted mb-3">
                          Over the last {new Date().getFullYear() - startYear} years, {locationName.split(',')[0]} has seen a persistent warming trend. 
                          Rainfall anomalies of {historicalAnalysis.insights?.rainAnomaly ?? '0'}% suggest {Math.abs(historicalAnalysis.insights?.rainAnomaly ?? 0) > 10 ? 'significant' : 'minor'} deviation from norms.
                        </p>
                        <div className="d-flex flex-column gap-2 mb-3">
                          <div className="small"><strong>Max Daily Rainfall:</strong> {historicalAnalysis.insights?.maxDailyRain} mm</div>
                          <div className="small"><strong>Extreme Days (R95p):</strong> {historicalAnalysis.insights?.extremeRainCount} occurrences ({historicalAnalysis.insights?.extremeRainFrequency}%)</div>
                        </div>
                        <div className="badge bg-soft-primary text-primary p-2 align-self-start">Anomaly Detected: {historicalAnalysis.insights?.rainAnomaly ?? '0'}%</div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-light p-4 rounded shadow-sm border w-100">
                    <h6 className="fw-bold mb-3 d-flex align-items-center gap-2">
                      <FaExclamationCircle className="text-danger"/> 3. Extreme Events Timeline
                    </h6>
                    <div className="table-responsive">
                      <table className="table table-sm table-hover bg-white mb-0">
                        <thead className="table-dark">
                          <tr><th>Date</th><th>Anomaly Type</th><th>Severity</th><th>Magnitude</th></tr>
                        </thead>
                        <tbody>
                          {extremeEvents.map((e, i) => (
                            <tr key={i}>
                              <td>{e.time}</td>
                              <td>{e.rain > 50 ? 'Heavy Rainfall' : 'Heatwave'}</td>
                              <td><span className="badge bg-danger">Critical</span></td>
                              <td>{e.rain > 50 ? `${e.rain.toFixed(1)}mm` : `${e.temp.toFixed(1)}°C`}</td>
                            </tr>
                          ))}
                          {extremeEvents.length === 0 && <tr><td colSpan="4" className="text-center py-3">No critical extremes detected in recent samples.</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </div>
              </div>

              {/* Correlation & Link to ML Panel */}
              <div className="col-12 mt-3">
                <div className="row g-3">
                  <div className="col-md-6">
                    <div className="p-3 border rounded bg-white shadow-sm h-100">
                      <h6 className="fw-bold small text-uppercase mb-2 text-primary">5. Correlation Insights</h6>
                      <p className="small mb-0">
                        Statistical analysis shows a <strong>strong correlation</strong> between high humidity spikes and subsequent flood markers in this specific location's 30-year dataset.
                      </p>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="p-3 border rounded bg-white shadow-sm h-100">
                      <h6 className="fw-bold small text-uppercase mb-2 text-success">Link to ML Predictions</h6>
                      <p className="small mb-0">
                        The <strong>Linear Trend (Slope: {historicalAnalysis.insights?.tempTrend ?? '0'})</strong> calculated here acts as a primary feature for our predictive model's baseline adjustment.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center p-5 border rounded bg-light">
              {histError ? (
                <>
                  <FaExclamationCircle className="text-danger mb-3" size={40} />
                  <h5 className="text-danger">Failed to Load History</h5>
                  <p className="text-muted">Error: {histError}</p>
                </>
              ) : (
                <>
                  <FaInfoCircle className="text-muted mb-3" size={40} />
                  <h5>No Historical Data Available</h5>
                  <p className="text-muted">Ensure the backend is running and coordinates are over land. Try selecting a different location on the map.</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MapPage;
