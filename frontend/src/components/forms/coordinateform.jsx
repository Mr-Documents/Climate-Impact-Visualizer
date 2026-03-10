import { useState } from "react";

function CoordinateForm({ onSubmit, loading, buttonText = "Analyze", buttonColor = "primary" }) {
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(lat, lon);
  };

  return (
    <form onSubmit={handleSubmit} className="row mt-3">

      <div className="col-md-3">
        <input
          className="form-control"
          placeholder="Latitude"
          value={lat}
          onChange={(e) => setLat(e.target.value)}
          required
        />
      </div>

      <div className="col-md-3">
        <input
          className="form-control"
          placeholder="Longitude"
          value={lon}
          onChange={(e) => setLon(e.target.value)}
          required
        />
      </div>

      <div className="col-md-3">
        <button
          type="submit"
          className={`btn btn-${buttonColor} w-100`}
          disabled={loading}
        >
          {loading ? "Loading..." : buttonText}
        </button>
      </div>

    </form>
  );
}

export default CoordinateForm;
