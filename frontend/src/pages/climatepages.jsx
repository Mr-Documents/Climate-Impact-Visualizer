import { useEffect, useMemo, useState } from "react";
import { Bar, Line } from "react-chartjs-2";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";
import { CircleMarker, Popup } from "react-leaflet";
import { FaArrowDown, FaDownload, FaFilter, FaMapMarkerAlt } from "react-icons/fa";
import { useLocation } from "react-router-dom";
import UnifiedMap from "../components/map/mapview";
import { useTheme } from "../providers/themecontext";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, Filler);

const pageDefinitions = {
  "/data-explorer": {
    title: "Climate Data Explorer",
    category: "CLIMATE MONITORING",
    description: "Explore historical observations by climate variable, time period, and geographic area.",
    intro: "Build a climate data view",
    variables: ["Mean temperature", "Precipitation", "Wind speed", "Relative humidity"],
    metric: "Daily observations",
    value: "30 years",
    delta: "Historical view",
    chart: "bar",
    chartTitle: "Historical observations",
    unit: "°C",
    rows: [["Jun 1, 2024", "26.4 °C", "28.1 mm", "Accra"], ["Jun 2, 2024", "26.8 °C", "12.4 mm", "Accra"], ["Jun 3, 2024", "27.1 °C", "0.0 mm", "Accra"], ["Jun 4, 2024", "26.7 °C", "4.2 mm", "Accra"]],
  },
  "/conditions": {
    title: "Live Climate & Weather Conditions",
    category: "CLIMATE MONITORING",
    description: "A quick view of current and near-real-time environmental indicators.",
    intro: "Current conditions",
    variables: ["Temperature", "Precipitation", "Wind speed", "Humidity"],
    metric: "Temperature",
    value: "26.4 °C",
    delta: "Sample condition",
    chart: "line",
    chartTitle: "Recent conditions",
    unit: "°C",
    rows: [["Temperature", "26.4 °C", "Feels like 28 °C", "Available"], ["Relative humidity", "78%", "Moderate", "Available"], ["Precipitation", "2.4 mm", "Last hour", "Available"], ["Wind speed", "12 km/h", "SW · 225°", "Available"]],
  },
  "/temperature": {
    title: "Temperature Analysis",
    category: "CLIMATE ANALYSIS",
    description: "Review historical temperature patterns, anomalies, and seasonal changes.",
    intro: "Temperature indicators",
    variables: ["Mean temperature", "Maximum temperature", "Minimum temperature", "Temperature anomaly"],
    metric: "Mean anomaly",
    value: "+1.2 °C",
    delta: "Illustrative baseline comparison",
    chart: "line",
    chartTitle: "Temperature trend & baseline",
    unit: "°C",
    rows: [["Annual mean", "26.4 °C", "+1.2 °C", "Sample"], ["Maximum temperature", "31.8 °C", "+1.6 °C", "Sample"], ["Minimum temperature", "22.1 °C", "+0.8 °C", "Sample"], ["Warming rate", "0.18 °C", "per decade", "Sample"]],
  },
  "/precipitation": {
    title: "Precipitation & Rainfall Analysis",
    category: "CLIMATE ANALYSIS",
    description: "Explore rainfall distribution, seasonal patterns, and precipitation anomalies.",
    intro: "Rainfall indicators",
    variables: ["Precipitation", "Rainfall anomaly", "Wet days", "Dry spell duration"],
    metric: "Seasonal rainfall",
    value: "842 mm",
    delta: "Illustrative annual total",
    chart: "bar",
    chartTitle: "Monthly rainfall pattern",
    unit: "mm",
    rows: [["Annual precipitation", "842 mm", "−4.2%", "Sample"], ["Wettest month", "June", "168 mm", "Sample"], ["Wet days", "94 days", "per year", "Sample"], ["Longest dry spell", "21 days", "sample period", "Sample"]],
  },
  "/drought-analysis": {
    title: "Drought Analysis",
    category: "CLIMATE ANALYSIS",
    description: "Assess rainfall deficits, soil moisture, vegetation stress, and historical drought patterns.",
    intro: "Drought indicators",
    variables: ["Rainfall deficit", "Soil moisture", "Drought severity", "Vegetation stress"],
    metric: "Drought indicator",
    value: "−0.8 SPI",
    delta: "Illustrative index",
    chart: "line",
    chartTitle: "Moisture & rainfall history",
    unit: "Index",
    rows: [["Rainfall deficit", "−14%", "vs reference", "Sample"], ["Soil moisture", "0.21 m³/m³", "Topsoil", "Sample"], ["Drought severity", "Moderate", "Illustrative class", "Sample"], ["Vegetation stress", "Low", "Illustrative index", "Sample"]],
  },
  "/heat": {
    title: "Extreme Heat & Heatwave Analysis",
    category: "CLIMATE ANALYSIS",
    description: "Understand heatwave frequency, duration, intensity, and exposure thresholds.",
    intro: "Heat indicators",
    variables: ["Heat days", "Maximum temperature", "Heatwave duration", "Heat anomaly"],
    metric: "Heat days",
    value: "18 days",
    delta: "Illustrative annual count",
    chart: "bar",
    chartTitle: "Monthly hot-day frequency",
    unit: "Days",
    rows: [["Heat days", "18", "above local threshold", "Sample"], ["Longest heatwave", "5 days", "consecutive", "Sample"], ["Peak temperature", "38.2 °C", "illustrative maximum", "Sample"], ["Heat anomaly", "+1.4 °C", "vs reference", "Sample"]],
  },
  "/atmosphere": {
    title: "Wind & Atmospheric Analysis",
    category: "CLIMATE ANALYSIS",
    description: "Explore wind speed and direction, humidity, pressure, and other atmospheric indicators.",
    intro: "Atmospheric indicators",
    variables: ["Wind speed", "Wind direction", "Relative humidity", "Atmospheric pressure"],
    metric: "Average wind",
    value: "12 km/h",
    delta: "Illustrative period mean",
    chart: "line",
    chartTitle: "Atmospheric conditions",
    unit: "km/h",
    rows: [["Wind speed", "12 km/h", "period mean", "Sample"], ["Prevailing direction", "SW", "225°", "Sample"], ["Relative humidity", "78%", "period mean", "Sample"], ["Surface pressure", "1012 hPa", "period mean", "Sample"]],
  },
  "/sea-level": {
    title: "Sea Level & Coastal Change",
    category: "CLIMATE ANALYSIS",
    description: "Explore sea-level trends, coastal exposure, and potential impacts on vulnerable communities.",
    intro: "Coastal indicators",
    variables: ["Sea-level trend", "Coastal exposure", "Flood frequency", "Shoreline change"],
    metric: "Sea-level trend",
    value: "+3.4 mm/yr",
    delta: "Illustrative global context",
    chart: "line",
    chartTitle: "Illustrative sea-level trend",
    unit: "mm",
    rows: [["Sea-level trend", "+3.4 mm/yr", "illustrative context", "Sample"], ["Coastal exposure", "Moderate", "location dependent", "Sample"], ["High-tide flooding", "—", "dataset required", "Not connected"], ["Shoreline change", "—", "dataset required", "Not connected"]],
  },
  "/emissions": {
    title: "Greenhouse Gas & Emissions Explorer",
    category: "CLIMATE ANALYSIS",
    description: "Explore CO₂, methane, greenhouse gas trends, and country comparisons using emissions data.",
    intro: "Emissions indicators",
    variables: ["CO₂ emissions", "Methane", "Total greenhouse gases", "Per-capita emissions"],
    metric: "Emissions data",
    value: "Explore datasets",
    delta: "Weather metrics are not used as emissions proxies",
    chart: "bar",
    chartTitle: "Illustrative emissions comparison",
    unit: "MtCO₂e",
    rows: [["CO₂", "—", "Choose an emissions dataset", "Not connected"], ["Methane", "—", "Choose an emissions dataset", "Not connected"], ["Greenhouse gases", "—", "Choose an emissions dataset", "Not connected"], ["Country comparison", "—", "Choose countries", "Not connected"]],
  },
  "/anomalies": {
    title: "Climate Anomaly Explorer",
    category: "CLIMATE ANALYSIS",
    description: "Compare observed conditions with a historical baseline to identify unusual hot, cold, wet, and dry periods.",
    intro: "Anomaly comparison",
    variables: ["Temperature anomaly", "Precipitation anomaly", "Warm days", "Dry conditions"],
    metric: "Temperature anomaly",
    value: "+1.2 °C",
    delta: "Illustrative baseline comparison",
    chart: "bar",
    chartTitle: "Observed values vs baseline",
    unit: "Anomaly",
    rows: [["Temperature", "+1.2 °C", "warmer than baseline", "Sample"], ["Precipitation", "−4.2%", "drier than baseline", "Sample"], ["Warm days", "+8 days", "above baseline", "Sample"], ["Dry spell", "+3 days", "above baseline", "Sample"]],
  },
  "/predictions": {
    title: "AI Climate Prediction Center",
    category: "AI & FORECASTS",
    description: "Select a location, climate variable, forecast horizon, and model to configure a prediction.",
    intro: "Prediction setup",
    variables: ["Temperature", "Rainfall", "Flood risk", "Drought risk"],
    metric: "Prediction models",
    value: "Select a model",
    delta: "No prediction is submitted from this UI preview",
    chart: "line",
    chartTitle: "Forecast preview",
    unit: "Forecast",
    rows: [["Climate variable", "Temperature", "Choose in controls", "Preview"], ["Location", "Global sample", "Choose in controls", "Preview"], ["Forecast horizon", "12 months", "Choose in controls", "Preview"], ["Model", "Not selected", "Backend integration required", "Not connected"]],
  },
  "/temperature-forecast": {
    title: "Temperature Prediction",
    category: "AI & FORECASTS",
    description: "View a UI preview for temperature forecasts, prediction intervals, and historical comparisons.",
    intro: "Forecast configuration",
    variables: ["Mean temperature", "Maximum temperature", "Minimum temperature", "Temperature anomaly"],
    metric: "Forecast horizon",
    value: "12 months",
    delta: "Illustrative preview",
    chart: "line",
    chartTitle: "Historical vs predicted temperature",
    unit: "°C",
    rows: [["Historical mean", "26.4 °C", "reference period", "Sample"], ["Forecast mean", "27.1 °C", "illustrative preview", "Sample"], ["Prediction interval", "±1.8 °C", "illustrative range", "Sample"], ["Model confidence", "—", "model not connected", "Not connected"]],
  },
  "/rainfall-forecast": {
    title: "Rainfall Prediction",
    category: "AI & FORECASTS",
    description: "Explore rainfall forecast layouts, precipitation levels, deficits, and unusual rainfall conditions.",
    intro: "Forecast configuration",
    variables: ["Rainfall amount", "Rainfall deficit", "Wet-day probability", "Precipitation anomaly"],
    metric: "Forecast rainfall",
    value: "128 mm",
    delta: "Illustrative preview",
    chart: "bar",
    chartTitle: "Historical vs predicted rainfall",
    unit: "mm",
    rows: [["Forecast total", "128 mm", "illustrative period", "Sample"], ["Wet-day probability", "62%", "illustrative preview", "Sample"], ["Rainfall deficit", "−8%", "illustrative preview", "Sample"], ["Model confidence", "—", "model not connected", "Not connected"]],
  },
  "/wildfire": {
    title: "Wildfire Risk Prediction",
    category: "AI & FORECASTS",
    description: "Explore wildfire susceptibility indicators such as heat, humidity, wind, vegetation, and fuel moisture.",
    intro: "Wildfire indicators",
    variables: ["Fire weather index", "Temperature", "Humidity", "Wind speed"],
    metric: "Risk assessment",
    value: "Not connected",
    delta: "Requires fire and vegetation datasets",
    chart: "line",
    chartTitle: "Fire-weather indicator preview",
    unit: "Index",
    rows: [["Temperature", "—", "requires live weather data", "Not connected"], ["Humidity", "—", "requires live weather data", "Not connected"], ["Fuel moisture", "—", "requires vegetation data", "Not connected"], ["Fire susceptibility", "—", "model integration required", "Not connected"]],
  },
  "/projections": {
    title: "Long-Term Climate Projections",
    category: "AI & FORECASTS",
    description: "Compare possible future climates under scenarios, separately from short-term machine-learning forecasts.",
    intro: "Scenario configuration",
    variables: ["Temperature", "Precipitation", "Heat extremes", "Drought exposure"],
    metric: "Scenario horizon",
    value: "2050",
    delta: "Scenario projection, not a short-term forecast",
    chart: "line",
    chartTitle: "Illustrative scenario comparison",
    unit: "Change",
    rows: [["Scenario", "Select scenario", "Dataset required", "Not connected"], ["Temperature change", "—", "scenario data required", "Not connected"], ["Rainfall change", "—", "scenario data required", "Not connected"], ["Projection period", "—", "select period above", "Preview"]],
  },
  "/impact": {
    title: "Climate Impact Assessment",
    category: "CLIMATE IMPACT",
    description: "Explore climate exposure, local vulnerabilities, and potential consequences for a selected location.",
    intro: "Impact indicators",
    variables: ["Heat exposure", "Flood exposure", "Drought exposure", "Climate sensitivity"],
    metric: "Assessment status",
    value: "Configure a location",
    delta: "Impact assessment preview",
    chart: "bar",
    chartTitle: "Exposure indicator preview",
    unit: "Index",
    rows: [["Hazard exposure", "—", "requires location data", "Preview"], ["Population sensitivity", "—", "requires socioeconomic data", "Not connected"], ["Adaptive capacity", "—", "requires local indicators", "Not connected"], ["Impact summary", "—", "assessment integration required", "Not connected"]],
  },
  "/environmental-risk": {
    title: "Environmental Risk Assessment",
    category: "CLIMATE IMPACT",
    description: "Bring available hazard indicators together for a broader, location-specific environmental risk view.",
    intro: "Risk indicators",
    variables: ["Flood hazard", "Drought hazard", "Heat hazard", "Composite risk"],
    metric: "Risk indicators",
    value: "4 categories",
    delta: "Risk layers shown as UI preview",
    chart: "bar",
    chartTitle: "Environmental hazard indicators",
    unit: "Index",
    rows: [["Flood hazard", "—", "location data required", "Preview"], ["Drought hazard", "—", "location data required", "Preview"], ["Extreme heat", "—", "location data required", "Preview"], ["Composite assessment", "—", "configured indicators required", "Not connected"]],
  },
  "/agriculture": {
    title: "Agricultural Impact Analysis",
    category: "CLIMATE IMPACT",
    description: "Explore rainfall variability, heat stress, drought exposure, and crop suitability where crop data is available.",
    intro: "Agricultural indicators",
    variables: ["Rainfall variability", "Heat stress", "Drought exposure", "Crop suitability"],
    metric: "Growing season",
    value: "Configure a region",
    delta: "Crop-specific datasets may be required",
    chart: "line",
    chartTitle: "Seasonal climate indicator preview",
    unit: "Index",
    rows: [["Rainfall variability", "—", "regional data required", "Preview"], ["Heat stress", "—", "crop threshold required", "Preview"], ["Drought exposure", "—", "regional data required", "Preview"], ["Crop suitability", "—", "crop data required", "Not connected"]],
  },
  "/urban": {
    title: "Urban Climate Impact Analysis",
    category: "CLIMATE IMPACT",
    description: "Explore urban heat exposure, flooding, rainfall patterns, and other city-scale environmental threats.",
    intro: "Urban indicators",
    variables: ["Urban heat", "Flood exposure", "Rainfall intensity", "Built environment"],
    metric: "Urban indicators",
    value: "4 categories",
    delta: "City and infrastructure data may be required",
    chart: "line",
    chartTitle: "Urban indicator preview",
    unit: "Index",
    rows: [["Urban heat exposure", "—", "city data required", "Preview"], ["Flood exposure", "—", "drainage data required", "Not connected"], ["Rainfall intensity", "—", "local data required", "Preview"], ["Built environment", "—", "infrastructure data required", "Not connected"]],
  },
  "/ecosystems": {
    title: "Ecosystem & Biodiversity Impact",
    category: "CLIMATE IMPACT",
    description: "Explore ecosystem and habitat exposure to climate-related heat, drought, and rainfall changes.",
    intro: "Ecosystem indicators",
    variables: ["Vegetation condition", "Habitat exposure", "Drought stress", "Biodiversity"],
    metric: "Ecosystem layers",
    value: "Configure a region",
    delta: "Requires relevant ecological datasets",
    chart: "line",
    chartTitle: "Ecosystem indicator preview",
    unit: "Index",
    rows: [["Vegetation condition", "—", "satellite layer required", "Not connected"], ["Habitat exposure", "—", "habitat data required", "Not connected"], ["Drought stress", "—", "regional indicators required", "Preview"], ["Biodiversity", "—", "ecological data required", "Not connected"]],
  },
  "/communities": {
    title: "Population & Community Vulnerability",
    category: "CLIMATE IMPACT",
    description: "Explore population exposure, vulnerable communities, and socioeconomic vulnerability indicators.",
    intro: "Community indicators",
    variables: ["Population exposure", "Heat vulnerability", "Flood vulnerability", "Social sensitivity"],
    metric: "Community profile",
    value: "Configure a location",
    delta: "Requires population and socioeconomic datasets",
    chart: "bar",
    chartTitle: "Community vulnerability preview",
    unit: "Index",
    rows: [["Population exposure", "—", "population data required", "Not connected"], ["Heat vulnerability", "—", "local indicators required", "Preview"], ["Flood vulnerability", "—", "local indicators required", "Preview"], ["Social sensitivity", "—", "socioeconomic data required", "Not connected"]],
  },
};

const periods = {
  "30 years": ["1995", "2000", "2005", "2010", "2015", "2020", "2024"],
  "10 years": ["2015", "2017", "2019", "2021", "2023", "2024"],
  "12 months": ["Jul", "Sep", "Nov", "Jan", "Mar", "May", "Jul"],
  "30 days": ["Day 1", "Day 5", "Day 10", "Day 15", "Day 20", "Day 25", "Day 30"],
};

const valuesByVariable = {
  temperature: [22.1, 22.8, 23.2, 24.0, 24.5, 25.2, 26.4],
  precipitation: [61, 82, 71, 96, 123, 108, 91],
  rainfall: [61, 82, 71, 96, 123, 108, 91],
  wind: [9, 12, 10, 14, 11, 13, 12],
  humidity: [68, 72, 70, 76, 80, 77, 78],
  drought: [0.2, 0.1, -0.1, -0.2, -0.5, -0.7, -0.8],
  heat: [2, 3, 2, 4, 5, 4, 6],
  emission: [45, 48, 47, 43, 41, 38, 36],
  default: [12, 17, 15, 20, 18, 24, 22],
};

function ClimatePages() {
  const { pathname } = useLocation();
  const { theme } = useTheme();
  const page = pageDefinitions[pathname] || pageDefinitions["/data-explorer"];
  const [variable, setVariable] = useState(page.variables[0]);
  const [period, setPeriod] = useState("30 years");
  const [location, setLocation] = useState("Global sample");
  const [applied, setApplied] = useState(false);
  const dark = theme === "dark";
  const axisColor = dark ? "#bac3bc" : "#626d63";
  const gridColor = dark ? "rgba(222, 232, 224, .10)" : "rgba(49, 72, 53, .12)";
  const chartAccent = dark ? "#86c99b" : "#47895d";

  useEffect(() => {
    setVariable(page.variables[0]);
    setPeriod("30 years");
    setLocation("Global sample");
    setApplied(false);
  }, [pathname, page.variables]);

  const chartData = useMemo(() => {
    const key = variable.toLowerCase();
    const seriesKey = Object.keys(valuesByVariable).find((candidate) => key.includes(candidate)) || "default";
    const sourceValues = valuesByVariable[seriesKey];
    const labels = periods[period] || periods["30 years"];
    const data = labels.map((_, index) => sourceValues[index % sourceValues.length]);
    const isBar = page.chart === "bar";
    return {
      labels,
      datasets: [{
        label: variable,
        data,
        borderColor: chartAccent,
        backgroundColor: isBar ? (dark ? "rgba(119, 174, 129, .76)" : "rgba(71, 137, 93, .72)") : (dark ? "rgba(119, 174, 129, .12)" : "rgba(71, 137, 93, .10)"),
        borderWidth: isBar ? 0 : 2,
        borderRadius: isBar ? 3 : 0,
        fill: !isBar,
        tension: .38,
        pointRadius: isBar ? 0 : 2,
      }],
    };
  }, [page.chart, period, variable]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: "index" },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: dark ? "#111b24" : "#ffffff",
        titleColor: dark ? "#f4f7f8" : "#1b2b26",
        bodyColor: axisColor,
        borderColor: gridColor,
        borderWidth: 1,
        padding: 10,
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: axisColor } },
      y: { grid: { color: gridColor }, ticks: { color: axisColor }, title: { display: true, text: page.unit, color: axisColor } },
    },
  };

  const rows = page.rows.map((row, index) => [row[0], row[1], row[2], location === "Global sample" ? row[3] : "Preview"]);
  const applyFilters = (event) => {
    event.preventDefault();
    setApplied(true);
  };

  const exportSample = () => {
    const csvRows = [
      ["Observation", "Value", "Context", "Status"],
      ...rows,
    ];
    const csv = csvRows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${pathname.slice(1)}-sample-data.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page-content climate-tool-page">
      <div className="page-heading climate-tool-heading">
        <div>
          <div className="eyebrow"><span className="status-dot" /> {page.category}</div>
          <h1>{page.title}</h1>
          <p>{page.description}</p>
        </div>
        <span className="preview-badge">UI preview · sample values</span>
      </div>

      <form className="panel climate-filter-panel" onSubmit={applyFilters}>
        <div className="filter-title"><FaFilter /> {page.intro}</div>
        <label className="filter-field">
          <span>Climate variable</span>
          <select value={variable} onChange={(event) => { setVariable(event.target.value); setApplied(false); }}>
            {page.variables.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label className="filter-field">
          <span>Time period</span>
          <select value={period} onChange={(event) => { setPeriod(event.target.value); setApplied(false); }}>
            {Object.keys(periods).map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label className="filter-field location-filter">
          <span>Geographic area</span>
          <div className="filter-location"><FaMapMarkerAlt /><input value={location} onChange={(event) => { setLocation(event.target.value); setApplied(false); }} aria-label="Geographic area" /></div>
        </label>
        <button className="filter-apply" type="submit">{applied ? "View updated" : "Update view"}</button>
      </form>

      <div className="climate-metric-grid">
        <section className="panel climate-metric-card"><span className="climate-metric-label">{page.metric}</span><strong>{page.value}</strong><span className="climate-metric-detail"><FaArrowDown /> {page.delta}</span></section>
        <section className="panel climate-metric-card"><span className="climate-metric-label">Selected variable</span><strong className="small-metric-value">{variable}</strong><span className="climate-metric-detail">{location || "No area entered"}</span></section>
        <section className="panel climate-metric-card"><span className="climate-metric-label">Selected period</span><strong className="small-metric-value">{period}</strong><span className="climate-metric-detail">Illustrative interface data</span></section>
      </div>

      <div className="climate-analysis-grid">
        <section className="panel climate-chart-panel">
          <div className="panel-heading">
            <div><h2>{page.chartTitle}</h2><p>{variable} · {location || "No area entered"} · {period}</p></div>
            <button type="button" className="text-button" onClick={exportSample}><FaDownload /> Export sample CSV</button>
          </div>
          <div className="climate-chart"><ClimateChart chart={page.chart} data={chartData} options={chartOptions} /></div>
          <div className="sample-note">Illustrative chart data only. Connecting climate datasets is a separate implementation step.</div>
        </section>

        <section className="panel climate-map-panel">
          <div className="panel-heading"><div><h2>Geographic context</h2><p>{location || "Select a location"} · map preview</p></div></div>
          <div className="climate-mini-map">
            <UnifiedMap lat={18} lon={8} zoom={2} height="100%" showMarker={false}>
              {[[40, -100], [-15, -60], [51, 10], [5, 105], [-25, 135]].map(([lat, lon], index) => (
                <CircleMarker key={index} center={[lat, lon]} radius={index === 0 ? 8 : 5} pathOptions={{ color: "#77e3ab", fillColor: "#37bd80", fillOpacity: .58, weight: 1 }}>
                  <Popup>Sample location · map data preview</Popup>
                </CircleMarker>
              ))}
            </UnifiedMap>
          </div>
          <div className="sample-note">Map layers and geographic filters are UI-only in this preview.</div>
        </section>

        <section className="panel climate-table-panel">
          <div className="panel-heading"><div><h2>Observation details</h2><p>{rows.length} illustrative records</p></div><span className="preview-badge subtle">Sample data</span></div>
          <div className="climate-table-wrap">
            <table className="climate-data-table">
              <thead><tr><th>Observation</th><th>Value</th><th>Context</th><th>Status</th></tr></thead>
              <tbody>{rows.map((row, index) => <tr key={`${row[0]}-${index}`}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cellIndex === 3 ? <span className={`data-status${cell === "Available" ? " available" : ""}`}>{cell}</span> : cell}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function ClimateChart({ chart, data, options }) {
  return chart === "bar" ? <Bar data={data} options={options} /> : <Line data={data} options={options} />;
}

export default ClimatePages;
