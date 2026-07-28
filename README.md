<div align="center">

# Climate Impact Visualizer (CIV)

### *Advanced AI-Driven Environmental Monitoring & Strategic Risk Analytics*

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![React Version](https://img.shields.io/badge/react-19.1.1-blue)](https://reactjs.org/)
[![License](https://img.shields.io/badge/license-ISC-blue.svg)](LICENSE)
[![TensorFlow](https://img.shields.io/badge/TensorFlow-4.22.0-orange)](https://www.tensorflow.org/)

**A high-performance analytical platform bridging meteorological telemetry and actionable environmental intelligence**

[Features](#-key-features) • [Architecture](#-technical-architecture) • [Installation](#-installation--setup) • [Documentation](#-documentation) • [Contributing](#-contributing)

</div>

---

## 🌍 Project Overview

The **Climate Impact Visualizer** is an enterprise-grade environmental intelligence platform that synthesizes multi-source climate data to deliver real-time monitoring, historical reconstruction, and AI-powered predictive risk assessments. Designed for researchers, urban planners, and emergency management agencies, CIV provides actionable insights for flood, drought, and thermal stress risks with unprecedented precision and reliability.

### 🎯 Core Capabilities

- **Real-Time Environmental Monitoring**: Live telemetry processing with sub-minute latency
- **AI-Powered Risk Analytics**: Machine learning models with TensorFlow.js for accurate predictions
- **Historical Climate Reconstruction**: 30-year historical data analysis and trend identification
- **Geospatial Intelligence**: Interactive mapping with dynamic atmospheric overlays
- **Automated Advisory Generation**: Real-time mitigation protocols based on risk levels
- **Multi-Page Application**: Dedicated dashboards for different analysis types

---

## 📸 Screenshots & Demo

### Dashboard Overview
![Dashboard Overview](docs/screenshots/Dashboard1.png)
*Main dashboard displaying real-time environmental KPIs and risk assessments*

![Dashboard Overview 2](docs/screenshots/Dashboard2.png)
*Alternative dashboard view with detailed risk analytics*

### Geospatial Analysis
![Geospatial Analysis](docs/screenshots/Climateoverview1.png)
*Interactive map with precipitation, temperature, and wind velocity overlays*

### Historical Trends
![Historical Trends](docs/screenshots/Climateoverview2.png)
*30-year climate evolution with statistical trend analysis*

### Risk Predictions

#### Drought Risk Assessment
![Drought Risk](docs/screenshots/DroughtRisk.png)
*AI-generated drought risk predictions with aridity analysis*

#### Flood Risk Assessment
![Flood Risk](docs/screenshots/Floodrisk.png)
*AI-generated flood risk predictions with detailed environmental parameters and trend analysis*

---

## 🚀 Key Features

### 1. Geospatial Intelligence Engine
- **Real-Time Overlays**: Dynamic Leaflet-based mapping with spatial visualization of precipitation, wind velocity, and temperature gradients
- **Localized Telemetry**: High-precision coordinate-based analysis using reverse-geocoding for granular regional insights
- **Multi-Layer Rendering**: Simultaneous display of multiple atmospheric parameters with customizable opacity
- **Interactive Map Controls**: Toggle between different weather layers (Precipitation, Temperature, Wind Speed, Cloud Cover)

### 2. AI Predictive Risk Analytics
- **Sensor Fusion Modeling**: Custom-trained TensorFlow.js algorithms analyzing soil moisture, atmospheric aridity (VPD), and precipitation convergence
- **Probabilistic Forecasting**: 24-hour risk scores (High/Medium/Low) with confidence intervals for flood and drought events
- **Thermal Vulnerability Assessment**: Regional heat vulnerability calculations based on peak temperature thresholds
- **Model Performance**: Optimized inference with ONNX Runtime for fast predictions

### 3. Longitudinal Historical Deep-Dive
- **Historical Data Analysis**: Climate shift reconstruction using historical re-analysis data
- **Statistical Indices**: Implementation of Standardized Precipitation Index (SPI) for moisture deficit quantification
- **Trend Identification**: Linear regression analysis for warming trends and precipitation anomalies
- **Comparative Analysis**: Year-over-year and decadal comparison tools

### 4. Strategic Adaptation Framework
- **Actionable Intelligence**: Automated mitigation protocol generation based on real-time risk levels
- **Resilience Reports**: Regional environmental summary tools for urban and agricultural planning
- **Export Capabilities**: PDF report generation with high-resolution charts and maps

### 5. Multi-Page Application Architecture
- **Dashboard**: Main overview with real-time environmental KPIs
- **Map Page**: Dedicated geospatial analysis interface
- **Drought Risk**: Specialized drought prediction and analysis
- **Flood Risk**: Specialized flood prediction and analysis
- **Documentation**: Comprehensive user guides and API documentation

---

## 🛠 Technical Architecture

### System Architecture
```mermaid
graph TB
    A[User Interface] --> B[React Frontend]
    B --> C[React Router]
    C --> D[Dashboard Page]
    C --> E[Map Page]
    C --> F[Drought Risk Page]
    C --> G[Flood Risk Page]
    C --> H[Documentation Page]
    B --> I[API Layer]
    I --> J[Express Backend]
    J --> K[ML Models]
    J --> L[External APIs]
    L --> M[Open-Meteo]
    L --> N[OpenWeatherMap]
    L --> O[Nominatim OSM]
    K --> P[Risk Predictions]
    P --> I
    I --> B
```

### Frontend Stack
| Technology | Version | Purpose |
|------------|---------|---------|
| **React.js** | 19.1.1 | Component-based UI architecture |
| **React Router** | 7.9.6 | Client-side routing and navigation |
| **Chart.js** | 4.5.1 | Advanced data visualization |
| **React-Chartjs-2** | 5.3.1 | React integration for Chart.js |
| **Leaflet** | 1.9.4 | Geospatial rendering engine |
| **React-Leaflet** | 5.0.0 | React components for Leaflet |
| **Bootstrap 5** | 5.3.8 | Responsive layout and components |
| **React-Bootstrap** | 2.10.10 | Bootstrap React components |
| **Axios** | 1.13.2 | HTTP client for API requests |
| **React Query** | 5.90.10 | Data fetching and caching |
| **jsPDF** | 3.0.4 | PDF report generation |
| **html2canvas** | 1.4.1 | Screenshot capture functionality |
| **Recharts** | 3.5.0 | Additional charting components |

### Backend Stack
| Technology | Version | Purpose |
|------------|---------|---------|
| **Node.js** | ≥18.0.0 | Runtime environment |
| **Express.js** | 5.1.0 | Web framework and API server |
| **TensorFlow.js** | 4.22.0 | Machine learning model execution |
| **TensorFlow.js Node** | 4.22.0 | Server-side ML inference |
| **LangChain** | 0.3.34 | AI/ML workflow orchestration |
| **ONNX Runtime** | 1.22.0 | Optimized model inference |
| **Transformers.js** | 2.17.2 | NLP and transformer models |
| **CORS** | 2.8.6 | Cross-origin resource sharing |

### Data & API Integrations
- **Open-Meteo**: Primary source for terrestrial soil moisture and historical re-analysis
- **OpenWeatherMap**: Real-time atmospheric tile server and global weather telemetry
- **Nominatim (OSM)**: Advanced geospatial geocoding and reverse-search logic

---

## 📈 Methodology

### Risk Assessment Algorithms

The system utilizes a **Heuristic Risk Weighting** approach combined with **Linear Regression** for trend analysis:

#### Flood Risk Assessment
```
Flood Risk = w₁ × Soil Saturation + w₂ × Precipitation Intensity + w₃ × Historical Patterns
```
- Evaluated via soil saturation percentage and peak hourly precipitation volume
- Weighted factors based on regional historical flood data
- Confidence intervals derived from model uncertainty quantification

#### Drought Risk Assessment
```
Drought Risk = Aridity Index(VPD, Moisture Deficit) + SPI Score + Trend Analysis
```
- Calculated through Aridity Index incorporating Vapour Pressure Deficit (VPD)
- Persistent moisture deficit tracking over time windows
- SPI (Standardized Precipitation Index) for multi-year drought cycle identification

#### Heat Stress Assessment
```
Heat Stress = (Current Temp - 95th Percentile Baseline) + Night Recovery Factor
```
- Measured against localized 95th percentile threshold from historical baseline
- Night-time recovery potential analysis for urban heat island effects
- Cumulative heat stress tracking over consecutive days

---

## 📦 Installation & Setup

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher (or yarn)
- **Git**: For version control
- **API Keys**: OpenWeatherMap API key (required for map layers)

### Quick Start

#### 1. Clone the Repository
```bash
git clone https://github.com/yourusername/climate-impact-visualizer.git
cd climate-impact-visualizer
```

#### 2. Backend Setup
```bash
cd Backend
npm install
```

Create a `.env` file in the `Backend` directory:
```env
PORT=5000
OPENWEATHER_API_KEY=your_openweather_api_key
```

Start the backend server:
```bash
npm start
# or for development with auto-reload
npm run dev
```

#### 3. Frontend Setup
```bash
cd frontend
npm install
```

Create a `.env` file in the `frontend` directory:
```env
REACT_APP_OWM_API_KEY=your_openweather_api_key
REACT_APP_API_URL=http://localhost:5000
```

Start the frontend development server:
```bash
npm start
```

The application will be available at `http://localhost:3000`

### Docker Deployment (Optional)

#### Backend Dockerfile
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 5000
CMD ["npm", "start"]
```

#### Frontend Dockerfile
```dockerfile
FROM node:18-alpine as build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

---

## 📚 Documentation

### Application Pages

1. **Dashboard (`/`)**: Main overview with real-time environmental monitoring
2. **Map (`/map`)**: Interactive geospatial analysis with weather overlays
3. **Drought Risk (`/drought`)**: Specialized drought prediction and analysis
4. **Flood Risk (`/flood`)**: Specialized flood prediction and analysis
5. **Documentation (`/docs`)**: Comprehensive user guides and API documentation

### API Endpoints

#### Weather Data
```http
GET /api/weather/current?lat={latitude}&lon={longitude}
```
**Response:**
```json
{
  "temperature": 24.5,
  "humidity": 65,
  "windSpeed": 12.3,
  "precipitation": 0,
  "description": "Partly cloudy"
}
```

#### Risk Assessment
```http
GET /api/risk/assess?lat={latitude}&lon={longitude}
```
**Response:**
```json
{
  "floodRisk": "Low",
  "droughtRisk": "Medium",
  "heatStress": "Low",
  "confidence": 0.87,
  "timestamp": "2024-01-15T10:30:00Z"
}
```

---

## 🧪 Testing

### Frontend Tests
```bash
cd frontend
npm test
```

### Backend Tests
```bash
cd Backend
npm test
```

---

## 🤝 Contributing

We welcome contributions from the community! Please follow these guidelines:

### Development Workflow
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style
- Follow ESLint configuration
- Use Prettier for code formatting
- Write meaningful commit messages
- Add tests for new features
- Update documentation as needed

---

## 🗺️ Roadmap

### Phase 1: Core Enhancement
- [ ] Enhanced ML model accuracy
- [ ] Mobile application (React Native)
- [ ] Real-time alert system
- [ ] Multi-language support

### Phase 2: Advanced Features
- [ ] Satellite imagery integration
- [ ] Social media sentiment analysis
- [ ] Economic impact modeling
- [ ] API for third-party developers

### Phase 3: Enterprise Features
- [ ] White-label solutions
- [ ] Advanced analytics dashboard
- [ ] Custom report templates
- [ ] Enterprise SSO integration

---

## 🛡 Security & Privacy

- **API Key Encryption**: All keys encrypted at rest
- **Rate Limiting**: Prevents abuse and ensures fair usage
- **CORS Configuration**: Controlled cross-origin access
- **Data Privacy**: No personal data collection
- **Secure Headers**: Implemented security best practices

---

## 📄 License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **Open-Meteo** for providing free climate data APIs
- **OpenWeatherMap** for weather data and map tiles
- **OpenStreetMap** and **Nominatim** for geocoding services
- **TensorFlow.js** team for the excellent ML framework
- The open-source community for various libraries and tools

---

## 📞 Support & Contact

- **Issues**: [GitHub Issues](https://github.com/Mr-Documents/Climate-Impact-Visualizer/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Mr-Documents/Climate-Impact-Visualizer/discussions)
- **Email**: thewillingdocument@gmail.com

---

<div align="center">

[⬆ Back to Top](#climate-impact-visualizer-civ)

</div>



<!--
[PROMPT_SUGGESTION]Create a CONTRIBUTING.md file for the project[/PROMPT_SUGGESTION]
[PROMPT_SUGGESTION]Generate a LICENSE file for this project[/PROMPT_SUGGESTION]
-->