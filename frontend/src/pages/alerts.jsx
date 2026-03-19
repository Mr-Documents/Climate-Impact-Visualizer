import React, { useState } from "react";
import { FaBell } from "react-icons/fa";

const AlertsPage = () => {
  const [alerts] = useState([
    {
      id: "flood-1",
      title: "Flood warning",
      description: "Heavy rainfall expected in the next 12 hours. Stay clear of waterways.",
      severity: "high",
      timestamp: new Date().toISOString(),
    },
    {
      id: "drought-1",
      title: "Drought advisory",
      description: "Soil moisture remains critically low. Monitor water usage closely.",
      severity: "medium",
      timestamp: new Date().toISOString(),
    },
  ]);

  return (
    <div className="container py-4">
      <h2 className="mb-3 d-flex align-items-center gap-2">
        <FaBell size={32} />
        Alerts & Notifications
      </h2>

      <p className="text-muted mb-4">
        Stay informed about key climate alerts and potential risks in your area.
      </p>

      {alerts.length === 0 ? (
        <div className="text-muted">No active alerts at this time.</div>
      ) : (
        <div className="list-group">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`list-group-item list-group-item-action border rounded mb-2 ${
                alert.severity === "high"
                  ? "border-danger"
                  : alert.severity === "medium"
                  ? "border-warning"
                  : "border-secondary"
              }`}
            >
              <div className="d-flex justify-content-between align-items-start">
                <div>
                  <h5 className="mb-1">{alert.title}</h5>
                  <p className="mb-1">{alert.description}</p>
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
