import React from "react";
import { 
  FaBook,
  FaInfoCircle, 
  FaDatabase, 
  FaCogs, 
  FaShieldAlt, 
  FaChartBar, 
  FaMapMarkedAlt,
  FaExclamationTriangle,
  FaHistory,
  FaBell
} from "react-icons/fa";

const DocumentationPage = () => {
  const sections = [
    {
      title: "System Overview",
      icon: <FaInfoCircle className="text-primary" />,
      content: "The Climate Impact Visualizer is a high-performance analytical platform designed for real-time environmental monitoring and strategic risk assessment. By synthesizing multi-source meteorological telemetry with custom-trained AI, the system provides a comprehensive resilience framework for identifying and mitigating climate-driven vulnerabilities."
    },
    {
      title: "Core Analytical Modules",
      icon: <FaCogs className="text-success" />,
      content: (
        <div className="row g-3">
          <div className="col-md-6">
            <div className="p-3 border rounded bg-white">
              <h6 className="fw-bold"><FaMapMarkedAlt className="me-2"/>Geospatial Engine</h6>
              <p className="small text-muted mb-0">Utilizes Leaflet-based tiling to overlay real-time precipitation, wind speed, and temperature gradients directly from the OpenWeatherMap API.</p>
            </div>
          </div>
          <div className="col-md-6">
            <div className="p-3 border rounded bg-white">
              <h6 className="fw-bold"><FaChartBar className="me-2"/>Predictive AI</h6>
              <p className="small text-muted mb-0">Custom-trained machine learning models analyze historical soil moisture, precipitation, and heat patterns to generate 24-hour risk probabilities.</p>
            </div>
          </div>
        </div>
      )
    },
    {
      title: "Strategic Resilience Framework",
      icon: <FaShieldAlt className="text-info" />,
      content: "Beyond data visualization, the platform provides actionable adaptation strategies. Based on AI-detected risk levels (High/Medium/Low), the system recommends specific mitigation steps, ranging from infrastructure preparation for drainage management to resource allocation protocols for emergency water conservation."
    },
    {
      title: "Historical Evolution Analysis",
      icon: <FaHistory className="text-danger" />,
      content: "Our Deep Dive engine reconstructs 30+ years of climate history for any coordinate. It utilizes linear regression to identify warming trends and calculates the Standardized Precipitation Index (SPI) to detect multi-year drought cycles, providing crucial context for long-term urban and agricultural planning."
    },
    {
      title: "Interpreting Climate Metrics",
      icon: <FaDatabase className="text-warning" />,
      content: (
        <ul className="list-group list-group-flush small">
          <li className="list-group-item"><strong>Soil Moisture (m³/m³):</strong> Represents the volumetric water content in the topsoil. Values below 0.1 typically indicate drought stress.</li>
          <li className="list-group-item"><strong>Standardized Precipitation Index (SPI):</strong> A probability index that quantifies moisture deficits or surpluses relative to a 30-year baseline.</li>
          <li className="list-group-item"><strong>VPD (Vapour Pressure Deficit):</strong> Measures the atmospheric "thirst." High VPD leads to rapid plant transpiration and increased fire risk.</li>
          <li className="list-group-item"><strong>AQI Components:</strong> Monitoring PM2.5 and NO₂ concentrations according to global WHO safety standards.</li>
        </ul>
      )
    },
    {
      title: "Early Warning System (EWS)",
      icon: <FaBell className="text-primary" />,
      content: "The platform features a real-time alerting engine. When the AI model detects a 'High' risk score for flood or drought, or when meteorological sensors record extreme spikes (e.g., rainfall > 15mm/hr), an automated advisory is generated within the Alerts center."
    },
    {
      title: "Data Integrity & Sources",
      icon: <FaShieldAlt className="text-danger" />,
      content: (
        <div className="small">
          <p>The platform aggregates data from a multi-tier infrastructure:</p>
          <ul>
            <li><strong>Open-Meteo:</strong> High-resolution weather forecasts and historical re-analysis.</li>
            <li><strong>OpenWeatherMap:</strong> Global tile server for geospatial atmospheric overlays.</li>
            <li><strong>NOAA & NASA:</strong> Baseline climate indices used for model calibration.</li>
          </ul>
          <div className="alert alert-warning py-2">
            <FaExclamationTriangle className="me-2" />
            <strong>Disclaimer:</strong> Predictions are probabilistic and should be cross-referenced with local emergency management agencies during extreme weather events.
          </div>
        </div>
      )
    }
  ];

  return (
    <div className="container py-5">
      <div className="row justify-content-center">
        <div className="col-lg-10">
          <div className="d-flex align-items-center gap-3 mb-5">
            <FaBook size={40} className="text-primary" />
            <div>
              <h1 className="fw-bold mb-0">System Guide & Documentation</h1>
              <p className="text-muted mb-0">System Architecture, API Specifications, and User Guides</p>
            </div>
          </div>

          <div className="row g-4">
            {sections.map((section, index) => (
              <div key={index} className="col-12">
                <div className="card border-0 shadow-sm overflow-hidden">
                  <div className="card-header bg-white py-3 border-bottom-0">
                    <h5 className="mb-0 fw-bold d-flex align-items-center gap-2">
                      {section.icon} {section.title}
                    </h5>
                  </div>
                  <div className="card-body pt-0 text-secondary">
                    {section.content}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 p-4 rounded-4 bg-dark text-white shadow">
            <div className="row align-items-center">
              <div className="col-md-8">
                <h4 className="fw-bold">Deployment & Support</h4>
                <p className="mb-0 opacity-75">
                  For integration, API access or suggestions, please contact us via thewillingdocument@gmail.com.
                </p>
              </div>
              <div className="col-md-4 text-md-end mt-3 mt-md-0">
                <button className="btn btn-outline-light rounded-pill px-4" disabled style={{ cursor: 'not-allowed', opacity: 0.6 }}>
                  Contact Support
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DocumentationPage;
