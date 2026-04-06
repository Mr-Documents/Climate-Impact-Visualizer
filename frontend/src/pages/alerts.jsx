import React, { useState, useEffect } from "react";
import axios from "axios";
import { FaBell } from "react-icons/fa";

const AlertsPage = () => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const res = await axios.get("http://localhost:5000/api/alerts");
        setAlerts(res.data);
      } catch (err) {
        console.error("Failed to fetch alerts:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchAlerts();
  }, []);

  return (
    <div className="container py-4">
      <h2 className="mb-3 d-flex align-items-center gap-2">
        <FaBell size={32} />
        Alerts & Notifications
      </h2>

      <p className="text-muted mb-4">
        Stay informed about key climate alerts and potential risks in your area.
      </p>

      {loading ? (
        <div className="text-center p-5"><div className="spinner-border text-primary" /></div>
      ) : alerts.length === 0 ? (
        <div className="text-muted">No active alerts at this time.</div>
      ) : (
        <div className="list-group">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`list-group-item list-group-item-action border rounded mb-2 ${
                alert.severity?.toLowerCase() === "high"
                  ? "border-danger"
                  : alert.severity?.toLowerCase() === "medium"
                  ? "border-warning"
                  : "border-secondary"
              }`}
            >
              <div className="d-flex justify-content-between align-items-start">
                <div>
                  <h5 className="mb-1">{alert.alert_type} Alert - {alert.locations?.name}</h5>
                  <p className="mb-1">{alert.message}</p>
                </div>
                <small className="text-muted">{new Date(alert.timestamp).toLocaleString()}</small>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AlertsPage;
