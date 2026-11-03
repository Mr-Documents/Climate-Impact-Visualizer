import React, { useState } from "react";
import CoordinateForm from "../components/forms/coordinateform";
import UnifiedMap from "../components/map/mapview";
import WeatherIcon from "../components/ui/weathericon";
import axios from "axios";
import ResultCard from "../components/reusable/resultcard";
import { Line } from 'react-chartjs-2';
import { FaInfoCircle, FaExclamationTriangle, FaMapMarkerAlt, FaRobot, FaShieldAlt, FaListUl } from "react-icons/fa";
import { Circle } from "react-leaflet";
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

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000/api";

const DroughtRiskPage = () => {
  const [coords, setCoords] = useState({ lat: 5.6037, lon: -0.1870, bounds: null });
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [validationError, setValidationError] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const [locationName, setLocationName] = useState("Selected Coordinate");

  const handleAnalyze = async (lat, lon, bounds = null) => {
    // 1. Validation
    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      setValidationError("Invalid coordinates. Latitude must be between -90 and 90, Longitude between -180 and 180.");
      return;
    }
    setValidationError(null);
    setLocationError(null);

    setCoords({ lat, lon, bounds });
    setLoading(true);
    setData(null);
    setLocationError(null);

    try {
      // Trigger both requests simultaneously
      const predictionPromise = axios.post(`${API_BASE}/predict`, {
        latitude: lat, longitude: lon,
      });

      const geoUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=en`;
      const geoPromise = axios.get(geoUrl, { headers: { 'User-Agent': 'ClimateImpactVisualizer/1.0' } });

      const [res, geoRes] = await Promise.all([
        predictionPromise,
        geoPromise.catch(() => null) // Ensure geocoding errors don't block the AI result
      ]);

      console.log("DroughtRisk - Backend prediction response:", res.data);
      console.log("DroughtRisk - Nominatim geocoding response:", geoRes?.data);
      setData(res.data);

      // For showing local name + English name in brackets
      const englishName = geoRes?.data?.display_name?.split(',').slice(0, 3).join(',') || "";
      const backendName = res.data?.locationName || "Selected Coordinate";

      if (englishName && backendName.toLowerCase() !== englishName.toLowerCase()) {
        setLocationName(`${backendName} (${englishName})`);
      } else {
        setLocationName(backendName);
      }
      
      if (res.data?.isWater) {
        setLocationError("Analysis Unavailable: The selected location is identified as a water body. Drought risk assessment is not applicable.");
      }
    } catch (err) {
      console.error(err);
      const errorMessage = err.response?.data?.error || "System Error: Failed to retrieve drought risk prediction. Please try again.";
      setLocationError(errorMessage);
      setData(null); // Resets predictions to N/A
    } finally {
      setLoading(false);
    }
  };

  const handleLocationSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setLoading(true);
    setData(null); // Clear previous data on new search
    setLocationError(null);
    try {
      const res = await axios.get(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&limit=1`);
      if (res.data && res.data.length > 0) {
        const { lat, lon, boundingbox } = res.data[0];
        const bounds = boundingbox ? [
          [parseFloat(boundingbox[0]), parseFloat(boundingbox[2])],
          [parseFloat(boundingbox[1]), parseFloat(boundingbox[3])]
        ] : null;
        handleAnalyze(parseFloat(lat), parseFloat(lon), bounds);
        setSearchQuery("");
      } else {
        setLocationError("Location not found. Please check the spelling or try a different area name.");
        setData(null); // Clear data if location not found
      }
    } catch (err) {
      setLocationError("Location service is currently unavailable. Please try again later.");
      setData(null); // Clear data if search service fails
    } finally {
      setLoading(false);
    }
  };

  const isWater = data?.isWater || false;
  const rawPrediction = data?.prediction?.drought; // This will be undefined if data is null

  const droughtPrediction = React.useMemo(() => {
    if (isWater) return { label: 'N/A', score: 0 };
    if (loading) return { label: '--', score: 0 };
    if (!data) return { label: 'N/A', score: 0 };
    console.log("DroughtRisk - droughtPrediction useMemo - data:", data, "isWater:", isWater, "loading:", loading, "rawPrediction:", rawPrediction);
    return rawPrediction || { label: '--', score: 0 };
  }, [data, isWater, loading, rawPrediction]);
    
  const weather = data?.weather;
  const history = data?.history;

  const getAIReasoning = (label) => {
    if (isWater) return "Analysis bypassed: Maritime regions do not support terrestrial soil-moisture analysis.";
    const temp = weather?.temperature || 0;
    const soil = weather?.soilMoisture || 0;
    const hum = weather?.humidity || 0;

    let reasons = [];
    if (temp > 35) reasons.push(`Thermal Stress (${temp.toFixed(1)}°C)`);
    if (soil < 0.15) reasons.push(`Critical Moisture Deficit (${(soil * 100).toFixed(0)}%)`);
    if (hum < 30) reasons.push(`Atmospheric Aridity (${hum.toFixed(0)}% RH)`);

    if (label === 'Low' || reasons.length === 0) {
      return reasons.length > 0 ? `Stability maintained despite ${reasons.join(", ")}. Current trends suggest these factors do not currently pose a significant drought threat.` : "Environmental moisture levels are currently within optimal parameters for regional vegetation.";
    }
    return `Vulnerability detected due to: ${reasons.join(" + ")}. Convergence of these factors is accelerating soil evapotranspiration and regional moisture loss.`;
  };

  const getSafetyProtocols = (label) => {
    const protocols = {
      High: [
        "Implement mandatory water rationing and conservation protocols.",
        "Activate emergency agricultural irrigation support.",
        "Monitor for regional wildfire markers due to extreme aridity.",
        "Minimize outdoor thermal exposure during peak solar hours."
      ],
      Medium: [
        "Optimize reservoir management and irrigation scheduling.",
        "Mulch terrestrial areas to minimize moisture loss.",
        "Monitor livestock for heat stress indicators.",
        "Audit water distribution infrastructure for leakages."
      ],
      Low: [
        "Maintain standard water conservation practices.",
        "Monitor long-term rainfall anomaly trends.",
        "Evaluate seasonal soil moisture baseline deviations."
      ]
    };
    return protocols[label] || protocols.Low;
  };

  const chartData = history ? {
       labels: history.time.map((t, i) => {
      // Attempt to parse; replace space with 'T' for better ISO compatibility
      let dateObj = new Date(typeof t === 'string' ? t.replace(' ', 'T') : t);
      
      if (isNaN(dateObj.getTime())) {
        // Fallback: Generate labels for the past 24h based on current system time
        dateObj = new Date();
        dateObj.setMinutes(0, 0, 0);
        dateObj.setHours(dateObj.getHours() - (history.time.length - 1 - i));
      }
      const hour = dateObj.getHours().toString().padStart(2, '0');
      return `${dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${hour}:00`;
    }),
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
      {
        label: 'Humidity (%)',
        data: history.humidity,
        borderColor: 'rgb(54, 162, 235)',
        backgroundColor: 'rgba(54, 162, 235, 0.5)',
        yAxisID: 'y',
      },
    ],
  } : null;

  const chartOptions = {
    responsive: true,
    interaction: { mode: 'index', intersect: false },
    scales: {
      y: { type: 'linear', display: true, position: 'left', title: { display: true, text: 'Environment Metrics (°C | %)' } },
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
    if (label === 'N/A' || label === '--') return "Analysis Unavailable: The selected location is identified as a water body. Drought risk assessment requires terrestrial soil metrics.";
    if (label === 'High') return "Severe moisture deficit detected. High temperatures combined with critically low soil moisture suggest vegetation stress and water scarcity risks.";
    if (label === 'Medium') return "Developing dry conditions. Soil moisture levels are declining relative to the current temperature. Monitor local water resources.";
    return "Hydrological conditions are healthy. Soil moisture and humidity levels are sufficient to sustain typical vegetation.";
  };

  return (
    <div className="container py-4">
      <h2 className="mb-3 d-flex align-items-center gap-2">
        <WeatherIcon type="drought" size={35} />
        Drought Risk Analysis
      </h2>

      <div className="row">
        <div className="col-md-4">
          <div className="card shadow-sm border-0 mb-3 bg-light">
            <div className="card-body p-3">
              <div className="small text-uppercase fw-bold text-secondary mb-1">Target Location</div>
              <div className="d-flex align-items-center gap-2 text-dark fw-bold">
                <FaMapMarkerAlt className="text-warning" />
                <span>{loading ? "Locating..." : locationName}</span>
              </div>
            </div>
          </div>

          <form onSubmit={handleLocationSearch} className="mb-3">
            <div className="input-group shadow-sm">
              <input 
                type="text" 
                className="form-control" 
                placeholder="Enter city or area name..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button className="btn btn-warning" type="submit" disabled={loading}>Search</button>
            </div>
          </form>
          <div className="text-muted small mb-2">Or enter coordinates:</div>
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
              <FaExclamationTriangle /> {locationError}
            </div>
          )}
          <div className="mt-3">
            <UnifiedMap
              lat={coords.lat}
              lon={coords.lon}
              bounds={coords.bounds}
              onSelect={(lat, lon) => handleAnalyze(lat, lon)}
            >
              {!loading && !isWater && droughtPrediction?.label === 'High' && (
                <Circle 
                  center={[coords.lat, coords.lon]} 
                  radius={8000} 
                  pathOptions={{ color: '#ffc107', fillColor: '#ffc107', fillOpacity: 0.15, weight: 2, dashArray: '10, 10' }} 
                />
              )}
            </UnifiedMap>
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
              {/* AI Explanation Box */}
              <div className="card border-0 shadow-sm overflow-hidden">
                <div className="card-header bg-dark text-white py-3">
                  <div className="d-flex align-items-center gap-2">
                    <FaRobot className="text-warning" />
                    <h6 className="mb-0 fw-bold">Diagnostic Reasoning Engine</h6>
                  </div>
                </div>
                <div className="card-body bg-white">
                  <p className="lead fs-6 mb-0 text-dark">
                    {getAIReasoning(droughtPrediction?.label)}
                  </p>
                </div>
              </div>

              <ResultCard
                title="Prediction Result"
                icon={<WeatherIcon type="drought" size={28} />}
                color={getRiskColor(droughtPrediction.label)}
              >
                <div className="row text-center">
                  <div className="col-12">
                    <h3 className={`text-${getRiskColor(droughtPrediction?.label || '--')}`}>{droughtPrediction?.label || '--'}</h3>
                    <small className="text-muted">Risk Level</small>
                  </div>
                </div>
                <hr />
                <div className="row mt-3">
                  <div className="col-4">
                    <strong>Temperature</strong><br />
                    {isWater ? "--" : weather?.temperature ?? "--"} °C
                  </div>
                  <div className="col-4">
                    <strong>Humidity</strong><br />
                    {isWater ? "--" : (weather?.humidity != null ? `${weather.humidity.toFixed(0)}%` : '--')}
                  </div>
                  <div className="col-4">
                    <strong>Soil Moisture</strong><br />
                    {isWater ? "--" : weather?.soilMoisture ?? '--'} m³/m³
                  </div>
                </div>
              </ResultCard>

              {chartData && !isWater && (
                <div className="card shadow-sm border-0 p-3">
                  <h5 className="fw-bold h6 mb-3">24-Hour Regional Stress Trends</h5>
                  <Line options={chartOptions} data={chartData} />
                </div>
              )}

              {/* Safety Recommendations */}
              {!isWater && (
                <div className="card border-0 shadow-sm">
                  <div className="card-header bg-white py-3 border-bottom">
                    <div className="d-flex align-items-center gap-2">
                      <FaShieldAlt className="text-primary" />
                      <h6 className="mb-0 fw-bold">Resilience Protocols</h6>
                    </div>
                  </div>
                  <div className="card-body">
                    <ul className="list-group list-group-flush">
                      {getSafetyProtocols(droughtPrediction?.label).map((step, i) => (
                        <li key={i} className="list-group-item border-0 px-0 d-flex gap-3 small">
                          <FaListUl className="mt-1 text-muted flex-shrink-0" />
                          <span>{step}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              <div className={`alert ${droughtPrediction?.label === 'High' ? 'alert-danger' : droughtPrediction?.label === 'Medium' ? 'alert-warning' : (droughtPrediction?.label === '--' || isWater) ? 'alert-secondary' : 'alert-success'} shadow-sm border-0 d-flex gap-3 align-items-start`}>
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
