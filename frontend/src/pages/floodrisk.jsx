import React, { useState } from "react";
import CoordinateForm from "../components/forms/coordinateform";
import UnifiedMap from "../components/map/mapview";
import WeatherIcon from "../components/ui/weathericon";
import axios from "axios";
import ResultCard from "../components/reusable/resultcard";
import { Line } from 'react-chartjs-2';
import { FaInfoCircle, FaExclamationTriangle, FaWater, FaMapMarkerAlt, FaRobot, FaShieldAlt, FaListUl } from "react-icons/fa";
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

const FloodRiskPage = () => {
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
      // Start both requests in parallel
      const predictionPromise = axios.post("http://localhost:5000/api/predict", {
        latitude: lat, longitude: lon,
      });

      const geoUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=en`;
      const geoPromise = axios.get(geoUrl, { headers: { 'User-Agent': 'ClimateImpactVisualizer/1.0' } });

      // Wait for both to complete
      const [response, geoRes] = await Promise.all([
        predictionPromise,
        geoPromise.catch(() => null) // Ensure geocoding errors don't block the AI result
      ]);

      console.log("FloodRisk - Backend prediction response:", response.data);
      console.log("FloodRisk - Nominatim geocoding response:", geoRes?.data);
      setData(response.data);

      // Logic to show local name + English name in brackets
      const englishName = geoRes?.data?.display_name?.split(',').slice(0, 3).join(',') || "";
      const backendName = response.data?.locationName || "Selected Coordinate";

      if (englishName && backendName.toLowerCase() !== englishName.toLowerCase()) {
        setLocationName(`${backendName} (${englishName})`);
      } else {
        setLocationName(backendName);
      }

      // 2. Check for Water Body
      if (response.data?.isWater) {
        setLocationError("Analysis Unavailable: The selected location is identified as a water body. Flood risk assessment is not applicable.");
      }
    } catch (err) {
      console.error(err);
      const errorMessage = err.response?.data?.error || "Failed to analyze flood risk. Please try again.";
      setLocationError(errorMessage);
      setData(null); // Crucial: Reset data to trigger N/A
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
        setLocationError("Location name not found. Please try a different search term.");
        setData(null); // Clear data if location not found
      }
    } catch (err) {
      setLocationError("Unable to reach the location service. Please verify your connection.");
      setData(null); // Clear data if search service fails
    } finally {
      setLoading(false);
    }
  };

  // Derived state for display
  const isWater = data?.isWater || false;
  const rawPrediction = data?.prediction?.flood;

  const floodPrediction = React.useMemo(() => {
    if (isWater) return { label: 'N/A', score: 0 };
    if (loading) return { label: '--', score: 0 };
    if (!data) return { label: 'N/A', score: 0 };
    console.log("FloodRisk - floodPrediction useMemo - data:", data, "isWater:", isWater, "loading:", loading, "rawPrediction:", rawPrediction);
    return rawPrediction || { label: '--', score: 0 };
  }, [data, isWater, loading, rawPrediction]);

  const weather = data?.weather;
  const history = data?.history;

  const getAIReasoning = (label) => {
    if (isWater) return "Analysis bypassed: Maritime coordinates do not support terrestrial runoff modeling.";
    const precip = weather?.precipitation || 0;
    const soil = weather?.soilMoisture || 0;
    
    let reasons = [];
    if (precip > 15) reasons.push(`Extreme Rainfall (${precip.toFixed(1)}mm/hr)`);
    else if (precip > 5) reasons.push(`Moderate Precipitation (${precip.toFixed(1)}mm/hr)`);
    
    if (soil > 0.7) reasons.push(`Critical Soil Saturation (${(soil * 100).toFixed(0)}%)`);
    else if (soil > 0.4) reasons.push(`Elevated Surface Moisture (${(soil * 100).toFixed(0)}%)`);

    if (label === 'Low' || reasons.length === 0) {
      return reasons.length > 0 ? `Nominal risk levels maintained despite ${reasons.join(", ")}. Model sequences indicate insufficient volume to trigger a flood event.` : "Environmental parameters are currently within nominal safety thresholds.";
    }
    return `Risk is driven by: ${reasons.join(" + ")}. Convergence of these factors increases regional runoff probability and land-surface vulnerability.`;
  };

  const getSafetyProtocols = (label) => {
    const protocols = {
      High: [
        "Immediate evacuation of low-lying areas and floodplains.",
        "Avoid all travel through standing water or submerged roads.",
        "Disconnect utilities and move critical equipment to higher elevations.",
        "Monitor emergency broadcast channels for flash flood updates."
      ],
      Medium: [
        "Clear drainage channels and gutters of debris.",
        "Secure outdoor items and move valuable assets from basements.",
        "Plan alternative travel routes avoiding identified flood zones.",
        "Prepare an emergency kit with 72-hour supplies."
      ],
      Low: [
        "Monitor local weather forecasts for sudden intensity shifts.",
        "Ensure secondary drainage systems are functional.",
        "Standard awareness of local topography and water collection points."
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
      {
        label: 'Wind Speed (km/h)',
        data: history.windSpeed,
        borderColor: 'rgb(153, 102, 255)',
        backgroundColor: 'rgba(153, 102, 255, 0.5)',
        yAxisID: 'y',
      },
    ],
  } : null;

  const chartOptions = {
    responsive: true,
    interaction: { mode: 'index', intersect: false },
    scales: {
      y: { type: 'linear', display: true, position: 'left', title: { display: true, text: 'Atmospheric Metrics (mm | km/h)' } },
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
    if (label === 'N/A' || label === '--') return "Analysis Unavailable: The selected location is identified as a water body. Flood risk models are calibrated for land-surface runoff.";
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
          <div className="card shadow-sm border-0 mb-3 bg-light">
            <div className="card-body p-3">
              <div className="small text-uppercase fw-bold text-secondary mb-1">Target Location</div>
              <div className="d-flex align-items-center gap-2 text-dark fw-bold">
                <FaMapMarkerAlt className="text-primary" />
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
              {!loading && !isWater && floodPrediction?.label === 'High' && (
                <Circle 
                  center={[coords.lat, coords.lon]} 
                  radius={5000} 
                  pathOptions={{ color: '#dc3545', fillColor: '#dc3545', fillOpacity: 0.2, weight: 2, dashArray: '5, 10' }} 
                />
              )}
            </UnifiedMap>
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
              {/* AI Explanation Box */}
              <div className="card border-0 shadow-sm overflow-hidden">
                <div className="card-header bg-dark text-white py-3">
                  <div className="d-flex align-items-center gap-2">
                    <FaRobot className="text-primary" />
                    <h6 className="mb-0 fw-bold">Diagnostic Reasoning Engine</h6>
                  </div>
                </div>
                <div className="card-body bg-white">
                  <p className="lead fs-6 mb-0 text-dark">
                    {getAIReasoning(floodPrediction?.label)}
                  </p>
                </div>
              </div>

              <ResultCard
                title="Prediction Result"
                icon={<WeatherIcon type="flood" size={28} />}
                color={getRiskColor(floodPrediction?.label)}
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
                    {isWater ? "--" : weather?.precipitation ?? "--"} mm
                  </div>
                  <div className="col-4">
                    <strong>Soil Moisture</strong><br />
                    {isWater ? "--" : weather?.soilMoisture ?? '--'} m³/m³
                  </div>
                  <div className="col-4">
                    <strong>Wind Speed</strong><br />
                    {isWater ? "--" : weather?.windSpeed ?? "--"} km/h
                  </div>
                </div>
              </ResultCard>

              {chartData && !isWater && (
                <div className="card shadow-sm border-0 p-3">
                  <h5 className="fw-bold h6 mb-3">24-Hour Environmental Trend Analysis</h5>
                  <Line options={chartOptions} data={chartData} />
                </div>
              )}

              {/* Safety Recommendations */}
              {!isWater && (
                <div className="card border-0 shadow-sm">
                  <div className="card-header bg-white py-3 border-bottom">
                    <div className="d-flex align-items-center gap-2">
                      <FaShieldAlt className="text-success" />
                      <h6 className="mb-0 fw-bold">Professional Safety Protocols</h6>
                    </div>
                  </div>
                  <div className="card-body">
                    <ul className="list-group list-group-flush">
                      {getSafetyProtocols(floodPrediction?.label).map((step, i) => (
                        <li key={i} className="list-group-item border-0 px-0 d-flex gap-3 small">
                          <FaListUl className="mt-1 text-muted flex-shrink-0" />
                          <span>{step}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              <div className={`alert ${floodPrediction?.label === 'High' ? 'alert-danger' : floodPrediction?.label === 'Medium' ? 'alert-warning' : (floodPrediction?.label === '--' || isWater) ? 'alert-secondary' : 'alert-success'} shadow-sm border-0 d-flex gap-3 align-items-start`}>
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
