# Climate Impact Visualizer (CIV)

### *Advanced AI-Driven Environmental Monitoring & Strategic Risk Analytics*

## 🌍 Project Overview
The **Climate Impact Visualizer** is a high-performance analytical platform designed to bridge the gap between complex meteorological telemetry and actionable environmental intelligence. Developed as a comprehensive resilience framework, the system synthesizes multi-source data to provide real-time monitoring, 30-year longitudinal historical reconstruction, and AI-powered predictive risk assessments for flood, drought, and thermal stress.

## 🚀 Key Features

### 1. Geospatial Intelligence Engine
*   **Real-Time Overlays:** Dynamic Leaflet-based mapping integration providing spatial visualization of precipitation, wind velocity, and temperature gradients.
*   **Localized Telemetry:** High-precision coordinate-based analysis utilizing reverse-geocoding for granular regional insights.

### 2. AI Predictive Risk Analytics
*   **Sensor Fusion Modeling:** Custom-trained algorithms analyze the convergence of soil moisture, atmospheric aridity (VPD), and precipitation patterns.
*   **Probabilistic Forecasting:** Generates 24-hour risk scores (High/Medium/Low) with associated confidence intervals for flood and drought events.
*   **Thermal Vulnerability:** Calculates regional heat vulnerability based on peak temperature thresholds and night-time recovery potential.

### 3. Longitudinal Historical Deep-Dive
*   **30-Year Evolution:** Reconstructs climate shifts since 1993 using high-resolution historical re-analysis.
*   **Statistical Indices:** Implementation of the **Standardized Precipitation Index (SPI)** to quantify moisture deficits and identify multi-year drought cycles.
*   **Trend Identification:** Uses linear regression to isolate significant warming trends and precipitation anomalies.

### 4. Strategic Adaptation Framework
*   **Actionable Intelligence:** Automated generation of mitigation protocols (Infrastructure Prep, Resource Allocation, and Safety Advisories) based on real-time risk levels.
*   **Resilience Reports:** Tools for generating regional environmental summaries to assist in urban and agricultural planning.

## 🛠 Technical Architecture

### Frontend Stack
*   **React.js:** Component-based UI architecture for high-responsiveness.
*   **Chart.js / React-Chartjs-2:** Advanced data visualization for projection trends and historical climatology.
*   **Leaflet & React-Leaflet:** Geospatial rendering engine for atmospheric overlays.
*   **Bootstrap 5:** Professional, mobile-responsive layout and KPI dashboarding.

### Data & API Integrations
*   **Open-Meteo:** Primary source for terrestrial soil moisture and historical re-analysis.
*   **OpenWeatherMap:** Real-time atmospheric tile server and global weather telemetry.
*   **Nominatim (OSM):** Advanced geospatial geocoding and reverse-search logic.
*   **AQI Services:** Real-time monitoring of PM2.5, NO₂, and O₃ concentrations.

## 📈 Methodology
The system utilizes a **Heuristic Risk Weighting** approach combined with **Linear Regression** for trend analysis. 
*   **Flood Risk:** Evaluated via a combination of soil saturation percentage and peak hourly precipitation volume.
*   **Drought Risk:** Calculated through an Aridity Index incorporating Vapour Pressure Deficit (VPD) and persistent moisture deficits.
*   **Heat Stress:** Measured against a localized 95th percentile threshold derived from the 30-year historical baseline of the specific coordinate.

## 📦 Installation & Setup

### Prerequisites
*   Node.js (v16.x or higher)
*   npm or yarn
*   API Keys for OpenWeatherMap (Required for map layers)

### Environment Configuration
Create a `.env` file in the `frontend` directory:
```env
REACT_APP_OWM_API_KEY=your_api_key_here
```

### Launching the Frontend
```bash
cd frontend
npm install
npm start
```

## 🛡 Disclaimer
*This project was developed as a Final Year Project. The predictive models are probabilistic and intended for research and educational purposes. Always consult local emergency management agencies during extreme weather events.*

---
**Developer:** Ramzy | **Project:** Climate Impact Visualizer | **Year:** 2024

<!--
[PROMPT_SUGGESTION]Create a CONTRIBUTING.md file for the project[/PROMPT_SUGGESTION]
[PROMPT_SUGGESTION]Generate a LICENSE file for this project[/PROMPT_SUGGESTION]
-->