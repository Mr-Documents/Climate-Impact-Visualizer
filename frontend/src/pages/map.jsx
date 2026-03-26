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
  FaThermometerHalf
} from "react-icons/fa";
import ResultCard from "../components/reusable/resultcard"; 
import { Circle, Popup, Marker, TileLayer } from "react-leaflet";
import L from "leaflet";

// --- Weather Overlay Configuration ---
// IMPORTANT: You need an OpenWeatherMap API key for the weather overlays to work.
// 1. Go to https://openweathermap.org/api
// 2. Sign up and get your free API key.
// 3. Replace the placeholder below with your key.
const OWM_API_KEY = process.env.REACT_APP_OWM_API_KEY || process.env.VITE_OWM_API_KEY || 'YOUR_OPENWEATHERMAP_API_KEY';

const weatherLayers = {
  precipitation: {
    url: `https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=${OWM_API_KEY}`,
    attribution: '&copy; <a href="https://openweathermap.org/">OpenWeatherMap</a>',
    name: 'Precipitation',
    icon: <FaTint />
  },
  temperature: {
    url: `https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=${OWM_API_KEY}`,
    attribution: '&copy; <a href="https://openweathermap.org/">OpenWeatherMap</a>',
    name: 'Temperature',
    icon: <FaTemperatureHigh />
  },
  wind: {
    url: `https://tile.openweathermap.org/map/wind_new/{z}/{x}/{y}.png?appid=${OWM_API_KEY}`,
    attribution: '&copy; <a href="https://openweathermap.org/">OpenWeatherMap</a>',
    name: 'Wind Speed',
    icon: <FaWind />
  },
  clouds: {
    url: `https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid=${OWM_API_KEY}`,
    attribution: '&copy; <a href="https://openweathermap.org/">OpenWeatherMap</a>',
    name: 'Cloud Cover',
    icon: <FaCloud />
  },
};

const MapPage = () => {
  const [coords, setCoords] = useState({ lat: 5.6037, lon: -0.1870 });
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({
    weather: null,
    airQuality: null,
    uvDryness: null,
  });
  const [activeOverlays, setActiveOverlays] = useState([]);

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

  useEffect(() => {
    fetchAllClimateData(coords.lat, coords.lon);
  }, [coords.lat, coords.lon, fetchAllClimateData]);

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
    const nowISO = new Date().toISOString().slice(0, 13);
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
        <div className="position-absolute top-0 end-0 p-4 opacity-10">
          <img 
            src="/climate_visualizer_transparent.png" 
            alt="Background Logo" 
            style={{ width: '200px', filter: 'brightness(0) invert(1)' }} 
          />
        </div>
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
    </div>
  );
};

export default MapPage;
