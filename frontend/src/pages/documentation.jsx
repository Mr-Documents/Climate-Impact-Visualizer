import React from "react";
import { FaBook } from "react-icons/fa";

const DocumentationPage = () => (
  <div className="container py-4">
    <h2 className="mb-3 d-flex align-items-center gap-2">
      <FaBook size={32} />
      Documentation
    </h2>

    <p className="text-muted mb-4">
      Learn how to use the platform, understand data sources, and interpret the key climate metrics.
    </p>

    <h5>Getting started</h5>
    <p className="text-muted">
      Use the navigation links to explore the dashboard, run predictions, and view historical records. Each page includes context and guidance to help you interpret the information.
    </p>

    <h5>Data sources</h5>
    <ul>
      <li>Weather forecasts: Open-Meteo (or configured weather provider)</li>
      <li>Predictions: AI model trained using historical climate and flood/drought indicators</li>
      <li>Alerts: Derived from thresholds in precipitation, soil moisture, and temperature</li>
    </ul>

    <h5>Support</h5>
    <p className="text-muted">
      For questions, feature requests, or contributions, please check the project repository or contact the maintainer.
    </p>
  </div>
);

export default DocumentationPage;
