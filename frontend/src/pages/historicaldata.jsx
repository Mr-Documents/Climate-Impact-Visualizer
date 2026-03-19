import React, { useState } from "react";
import axios from "axios";
import { FaHistory } from "react-icons/fa";

const HistoricalDataPage = () => {
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState(null);

  const fetchHistory = async () => {
    setLoading(true);
    setHistory(null);

    try {
      const res = await axios.get("http://localhost:5000/api/precipitation?historic=true");
      setHistory(res.data);
    } catch (err) {
      console.error("Historical data error:", err);
      alert("Failed to load historical data.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container py-4">
      <h2 className="mb-3 d-flex align-items-center gap-2">
        <FaHistory size={32} />
        Historical Data
      </h2>

      <p className="text-muted mb-4">
        View past climate trends and recorded observations for your selected region.
      </p>

      <button className="btn btn-outline-primary mb-4" onClick={fetchHistory} disabled={loading}>
        {loading ? "Loading…" : "Load historical data"}
      </button>

      {history ? (
        <pre className="bg-light p-3 rounded" style={{ maxHeight: 380, overflow: "auto" }}>
          {JSON.stringify(history, null, 2)}
        </pre>
      ) : (
        <div className="text-muted">Click the button above to fetch history from the API.</div>
      )}
    </div>
  );
};

export default HistoricalDataPage;
