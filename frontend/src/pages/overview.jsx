import { Bar, Doughnut, Line } from "react-chartjs-2";
import {
  ArcElement,
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
import { FaArrowDown, FaArrowUp, FaBolt, FaLeaf, FaMapMarkerAlt, FaRegClock } from "react-icons/fa";
import UnifiedMap from "../components/map/mapview";
import { useTheme } from "../providers/themecontext";

ChartJS.register(ArcElement, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, Filler);

const periods = ["May 12", "May 16", "May 20", "May 24", "May 28", "Jun 1", "Jun 5", "Jun 9"];
const cardData = [
  { title: "Electricity", amount: "4,556", percent: "36.6%", color: "#37bd80" },
  { title: "Transportation", amount: "3,234", percent: "26.0%", color: "#5689f5" },
  { title: "Purchased goods", amount: "2,456", percent: "19.7%", color: "#9b6ce2" },
  { title: "Other sources", amount: "2,210", percent: "17.7%", color: "#e5b64e" },
];

const tooltip = {
  backgroundColor: "#111b24",
  titleColor: "#f4f7f8",
  bodyColor: "#b9c6cc",
  borderColor: "rgba(140, 164, 174, .18)",
  borderWidth: 1,
  padding: 10,
};

function DashboardOverview() {
  const { theme } = useTheme();
  const dark = theme === "dark";
  const colors = {
    text: dark ? "#91a0a9" : "#6b7a80",
    grid: dark ? "rgba(132, 154, 164, .12)" : "rgba(53, 78, 70, .10)",
  };
  const sharedOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: "index" },
    plugins: {
      legend: { labels: { color: colors.text, usePointStyle: true, boxWidth: 7, padding: 18 } },
      tooltip,
    },
    scales: {
      x: { stacked: true, grid: { display: false }, ticks: { color: colors.text, maxRotation: 0 } },
      y: { stacked: true, grid: { color: colors.grid }, ticks: { color: colors.text } },
    },
  };

  const emissionsData = {
    labels: periods,
    datasets: [
      { label: "Scope 1", data: [172, 190, 156, 204, 181, 149, 178, 166], backgroundColor: "#37bd80", borderRadius: 2, barPercentage: 0.72 },
      { label: "Scope 2", data: [298, 277, 315, 266, 306, 281, 294, 273], backgroundColor: "#5689f5", borderRadius: 2, barPercentage: 0.72 },
      { label: "Scope 3", data: [235, 274, 244, 263, 219, 258, 230, 249], backgroundColor: "#9b6ce2", borderRadius: 2, barPercentage: 0.72 },
    ],
  };
  const forecastData = {
    labels: ["Mar", "Apr", "May", "Jun", "Jul", "Aug"],
    datasets: [{
      label: "Emissions",
      data: [15.1, 16.4, 15.8, 17.4, 16.7, 17.2],
      borderColor: "#37bd80",
      backgroundColor: "rgba(55, 189, 128, .12)",
      borderWidth: 2,
      fill: true,
      tension: 0.42,
      pointRadius: 0,
    }],
  };
  const doughnutData = {
    labels: cardData.map((item) => item.title),
    datasets: [{
      data: cardData.map((item) => Number(item.amount.replace(",", ""))),
      backgroundColor: cardData.map((item) => item.color),
      borderColor: dark ? "#101820" : "#ffffff",
      borderWidth: 4,
      hoverOffset: 4,
    }],
  };
  const compactOptions = {
    ...sharedOptions,
    plugins: { ...sharedOptions.plugins, legend: { display: false } },
    scales: {
      x: { grid: { display: false }, ticks: { color: colors.text } },
      y: { grid: { color: colors.grid }, ticks: { color: colors.text } },
    },
  };
  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "73%",
    plugins: { legend: { display: false }, tooltip },
  };

  return (
    <div className="page-content overview-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow"><span className="status-dot" /> PORTFOLIO OVERVIEW</div>
          <h1>Good morning, Ramzy <span className="wave">✦</span></h1>
          <p>Here’s your climate impact at a glance.</p>
        </div>
        <button className="control-button" type="button"><FaRegClock /> Last 30 days <span aria-hidden="true">⌄</span></button>
      </div>

      <div className="overview-grid">
        <section className="panel overview-summary">
          <div className="panel-heading">
            <div><h2>Overview</h2><p>Total emissions</p></div>
            <span className="panel-icon green-icon"><FaLeaf /></span>
          </div>
          <div className="emissions-total">12,456 <small>tCO₂e</small></div>
          <div className="trend-positive"><FaArrowDown /> 8.4% <span>vs Apr 12 – May 12, 2024</span></div>
          <div className="scope-list">
            {[
              ["Scope 1", "3,234", "6.1%", "#37bd80"],
              ["Scope 2", "4,556", "9.3%", "#5689f5"],
              ["Scope 3", "4,666", "9.7%", "#9b6ce2"],
            ].map(([scope, amount, change, color]) => (
              <div className="scope-row" key={scope}>
                <span className="scope-mark" style={{ backgroundColor: color }}><FaBolt /></span>
                <div className="scope-label"><strong>{scope}</strong><span>{amount} tCO₂e</span></div>
                <span className="mini-trend"><FaArrowDown /> {change}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel region-panel">
          <div className="panel-heading">
            <div><h2>Emissions by region</h2><p>Illustrative portfolio distribution</p></div>
            <button className="text-button" type="button">View map <span aria-hidden="true">↗</span></button>
          </div>
          <div className="region-map">
            <UnifiedMap lat={18} lon={8} zoom={2} height="100%" showMarker={false}>
              {[
                [40, -100, 220000],
                [-15, -60, 170000],
                [51, 10, 125000],
                [24, 45, 80000],
                [5, 105, 95000],
                [-25, 135, 205000],
              ].map(([lat, lon, radius], index) => (
                <CircleMarker
                  key={index}
                  center={[lat, lon]}
                  radius={index === 0 || index === 5 ? 13 : 8}
                  pathOptions={{ color: "#77e3ab", fillColor: "#37bd80", fillOpacity: 0.64, weight: 1 }}
                >
                  <Popup>Sample portfolio region · {(radius / 1000).toFixed(0)} tCO₂e</Popup>
                </CircleMarker>
              ))}
            </UnifiedMap>
          </div>
          <div className="map-legend"><span>tCO₂e</span><span>Low</span><span className="legend-gradient" /><span>High</span></div>
        </section>

        <section className="panel insight-panel">
          <div className="panel-heading"><div><h2>AI insights</h2><p>Portfolio summary</p></div><span className="sparkle">✧</span></div>
          <div className="insight-graphic"><span className="orbit orbit-one" /><span className="orbit orbit-two" /><FaLeaf /></div>
          <p className="insight-copy">Emissions from your energy consumption are the highest contributor.</p>
          <div className="recommendation"><span className="recommendation-label">RECOMMENDATION</span><p>Switch to renewable energy sources to reduce emissions by up to 18%.</p></div>
        </section>

        <section className="panel emissions-chart-panel">
          <div className="panel-heading">
            <div><h2>Emissions over time</h2><p>Breakdown by scope · tCO₂e</p></div>
            <button className="control-button compact" type="button">Daily <span aria-hidden="true">⌄</span></button>
          </div>
          <div className="large-chart"><Bar data={emissionsData} options={sharedOptions} /></div>
        </section>

        <section className="panel forecast-panel">
          <div className="panel-heading"><div><h2>Emissions forecast <span className="info-dot">i</span></h2><p>Projected for Jul 12 – Aug 12, 2024</p></div></div>
          <div className="forecast-total">14,350 <small>tCO₂e</small></div>
          <div className="trend-positive"><FaArrowDown /> 5.2% <span>vs current period</span></div>
          <div className="forecast-chart"><Line data={forecastData} options={compactOptions} /></div>
        </section>

        <section className="panel sources-panel">
          <div className="panel-heading"><div><h2>Top emission sources</h2><p>Share by activity</p></div></div>
          <div className="source-content">
            <div className="donut-wrap"><Doughnut data={doughnutData} options={doughnutOptions} /><div className="donut-center"><strong>12,456</strong><span>tCO₂e</span></div></div>
            <div className="source-list">
              {cardData.map((item) => <div className="source-row" key={item.title}><span className="source-dot" style={{ background: item.color }} /><span>{item.title}</span><strong>{item.amount}</strong><span className="source-percent">{item.percent}</span></div>)}
            </div>
          </div>
        </section>

        <section className="panel target-panel">
          <div className="panel-heading"><div><h2>Progress to target <span className="info-dot">i</span></h2><p>Net zero target: 2040</p></div></div>
          <div className="target-content"><div className="progress-ring"><svg viewBox="0 0 120 120" aria-label="42 percent progress"><circle className="ring-track" cx="60" cy="60" r="48" /><circle className="ring-progress" cx="60" cy="60" r="48" /></svg><div><strong>42%</strong><span>Progress</span></div></div><div className="target-copy"><span>Remaining</span><strong>7,223 <small>tCO₂e</small></strong><p>Reduce by <b>3.2%</b> per year</p></div></div>
        </section>

        <section className="panel alerts-panel">
          <div className="panel-heading"><div><h2>Recent alerts</h2><p>Latest portfolio activity</p></div><button className="text-button" type="button">View all <span aria-hidden="true">↗</span></button></div>
          {[
            ["warning", "High emissions detected from transportation", "May 12, 2024 · 10:30 AM"],
            ["caution", "Energy consumption above average", "May 12, 2024 · 09:15 AM"],
            ["success", "New low-emission milestone achieved!", "May 11, 2024 · 04:45 PM"],
          ].map(([type, message, date]) => <div className="alert-row" key={message}><span className={`alert-symbol ${type}`}>{type === "success" ? "✓" : "!"}</span><div><strong>{message}</strong><span>{date}</span></div><FaArrowUp className="alert-arrow" /></div>)}
        </section>
      </div>
      <div className="demo-caption"><FaMapMarkerAlt /> UI preview · portfolio metrics and emissions overlays are illustrative sample data.</div>
    </div>
  );
}

export default DashboardOverview;
