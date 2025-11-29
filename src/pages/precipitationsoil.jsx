import { useState } from "react";
import CoordinateForm from "../components/forms/coordinateform";
import UnifiedMap from "../components/map/mapview";
import LocationButton from "../components/reusable/locationbutton";
import LoadingSpinner from "../components/reusable/loadingspinner";
import ResultCard from "../components/reusable/resultcard";
import RainfallChart from "../components/charts/rainfallchart";
import { FaCloudRain } from "react-icons/fa";
import axios from "axios";

function PrecipitationPage() {
  const [coords, setCoords] = useState({ lat: "", lon: "" });
  const [loading, setLoading] = useState(false);
  const [forecast, setForecast] = useState(null);

  const analyze = async (lat, lon) => {
    setLoading(true);
    setForecast(null);

    try {
      const res = await axios.get(
        `http://localhost:5000/api/precipitation?lat=${lat}&lon=${lon}`
      );
      console.log("Forecast received:", res.data);


      setForecast(res.data);
    } catch (err) {
      console.error("Precipitation error:", err);
      alert("Failed to fetch precipitation forecast.");
    }

    setLoading(false);
  };

  return (
    <div className="container mt-4">

      <h2>
        <FaCloudRain className="me-2" />
        Precipitation Forecast
      </h2>

      {/* MAP */}
      <UnifiedMap onSelect={(lat, lon) => setCoords({ lat, lon })} />

      {/* LOCATION BUTTON */}
      <LocationButton onSelect={(lat, lon) => setCoords({ lat, lon })} />

      {/* FORM — FIXED */}
      <CoordinateForm
  onSubmit={(lat, lon) => analyze(lat, lon)}
  loading={loading}
  buttonColor="success"
  buttonText="Get Forecast"
/>

{/* RESULTS */}
{forecast && (
  <ResultCard
    title="Rainfall Forecast"
    icon={<FaCloudRain />}
    color="success"
  >
    <p><strong>Latitude:</strong> {coords.lat}</p>
    <p><strong>Longitude:</strong> {coords.lon}</p>

    {/* Pass series instead of hourly_rainfall */}
    <RainfallChart data={forecast.series} />
  </ResultCard>
)}
      
    </div>
  );
}

export default PrecipitationPage;
