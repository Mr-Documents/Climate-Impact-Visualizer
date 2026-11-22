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
import { FaArrowDown, FaArrowUp, FaBolt, FaCheckCircle, FaLeaf, FaRegClock } from "react-icons/fa";
import { useLocation } from "react-router-dom";
import { useTheme } from "../providers/themecontext";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, Filler);

const pages = {
  "/emissions": {
    title: "Emissions",
    description: "Track greenhouse gas emissions across your portfolio.",
    metric: "12,456 tCO₂e",
    change: "8.4%",
    label: "Total emissions",
    chartTitle: "Emissions by scope",
    rowsTitle: "Scope breakdown",
    rows: [["Scope 1 · Direct emissions", "3,234 tCO₂e", "26.0%", "#37bd80"], ["Scope 2 · Purchased energy", "4,556 tCO₂e", "36.6%", "#5689f5"], ["Scope 3 · Value chain", "4,666 tCO₂e", "37.4%", "#9b6ce2"]],
  },
  "/sources": {
    title: "Sources",
    description: "Understand the activities contributing to your footprint.",
    metric: "4 categories",
    change: "2 updated",
    label: "Tracked sources",
    chartTitle: "Emissions by source",
    rowsTitle: "Source breakdown",
    rows: [["Electricity", "4,556 tCO₂e", "36.6%", "#37bd80"], ["Transportation", "3,234 tCO₂e", "26.0%", "#5689f5"], ["Purchased goods", "2,456 tCO₂e", "19.7%", "#9b6ce2"], ["Other sources", "2,210 tCO₂e", "17.7%", "#e5b64e"]],
  },
  "/analytics": {
    title: "Analytics",
    description: "Explore trends and patterns across your climate data.",
    metric: "−8.4%",
    change: "vs previous period",
    label: "Emissions change",
    chartTitle: "Emissions trend",
    rowsTitle: "Key indicators",
    rows: [["Scope 1 change", "−6.1%", "Improving", "#37bd80"], ["Scope 2 change", "−9.3%", "Improving", "#5689f5"], ["Scope 3 change", "−9.7%", "Improving", "#9b6ce2"]],
  },
  "/insights": {
    title: "AI Insights",
    description: "Recommendations based on your portfolio’s sample activity.",
    metric: "3 opportunities",
    change: "Potential savings",
    label: "Insights available",
    chartTitle: "Estimated reduction opportunities",
    rowsTitle: "Recommended actions",
    rows: [["Shift to renewable electricity", "Up to 18%", "High impact", "#37bd80"], ["Optimize business travel", "Up to 12%", "Medium effort", "#5689f5"], ["Review supplier mix", "Up to 9%", "In progress", "#9b6ce2"]],
  },
  "/targets": {
    title: "Targets",
    description: "Monitor progress toward your climate commitments.",
    metric: "42%",
    change: "on track",
    label: "Net zero by 2040",
    chartTitle: "Progress toward target",
    rowsTitle: "Climate commitments",
    rows: [["Net zero emissions", "2040", "42% complete", "#37bd80"], ["Reduce scope 1 and 2", "2030", "58% complete", "#5689f5"], ["Renewable electricity", "2028", "71% complete", "#9b6ce2"]],
  },
  "/reports": {
    title: "Reports",
    description: "A clear view of your saved climate reporting workspace.",
    metric: "4 reports",
    change: "Sample library",
    label: "Available reports",
    chartTitle: "Reporting-period emissions",
    rowsTitle: "Recent reports",
    rows: [["Portfolio climate summary", "May 2024", "Ready", "#37bd80"], ["Scope 1 and 2 inventory", "Q2 2024", "Draft", "#5689f5"], ["Supplier emissions review", "Q1 2024", "Ready", "#9b6ce2"]],
  },
  "/alerts": {
    title: "Alerts",
    description: "Stay informed about changes in your portfolio metrics.",
    metric: "2 active",
    change: "1 milestone",
    label: "Recent notifications",
    chartTitle: "Alert activity",
    rowsTitle: "Recent alerts",
    rows: [["High transportation emissions", "May 12 · 10:30 AM", "Review", "#e78676"], ["Energy consumption above average", "May 12 · 09:15 AM", "Monitor", "#e5b64e"], ["Low-emission milestone achieved", "May 11 · 04:45 PM", "Resolved", "#37bd80"]],
  },
  "/integrations": {
    title: "Integrations",
    description: "Connect the systems that inform your climate reporting.",
    metric: "3 connected",
    change: "Sample setup",
    label: "Data connections",
    chartTitle: "Data coverage",
    rowsTitle: "Connected sources",
    rows: [["Energy data", "Connected", "Updated today", "#37bd80"], ["Travel activity", "Connected", "Updated yesterday", "#5689f5"], ["Procurement data", "Needs review", "Last synced May 10", "#e5b64e"]],
  },
  "/settings": {
    title: "Settings",
    description: "Manage your workspace preferences and display options.",
    metric: "Portfolio 1",
    change: "Workspace",
    label: "Current workspace",
    chartTitle: "Reporting preferences",
    rowsTitle: "Workspace details",
    rows: [["Reporting currency", "EUR", "Default", "#37bd80"], ["Emissions unit", "tCO₂e", "Default", "#5689f5"], ["Reporting period", "Monthly", "Current", "#9b6ce2"]],
  },
};

function WorkspacePage() {
  const { pathname } = useLocation();
  const { theme } = useTheme();
  const page = pages[pathname] || pages["/emissions"];
  const dark = theme === "dark";
  const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"];
  const textColor = dark ? "#91a0a9" : "#6b7a80";
  const gridColor = dark ? "rgba(132, 154, 164, .12)" : "rgba(53, 78, 70, .10)";
  const chartData = {
    labels,
    datasets: [
      { label: "Scope 1", data: [18, 22, 16, 25, 20, 17, 15, 13], backgroundColor: "#37bd80", borderRadius: 2 },
      { label: "Scope 2", data: [32, 29, 34, 30, 26, 28, 24, 21], backgroundColor: "#5689f5", borderRadius: 2 },
      { label: "Scope 3", data: [25, 27, 24, 26, 22, 23, 21, 19], backgroundColor: "#9b6ce2", borderRadius: 2 },
    ],
  };
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: textColor, usePointStyle: true, boxWidth: 7 } } },
    scales: {
      x: { stacked: true, grid: { display: false }, ticks: { color: textColor } },
      y: { stacked: true, grid: { color: gridColor }, ticks: { color: textColor } },
    },
  };
  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false }, ticks: { color: textColor } },
      y: { grid: { color: gridColor }, ticks: { color: textColor } },
    },
  };
  const lineData = {
    labels,
    datasets: [{
      label: "Emissions",
      data: [58, 52, 55, 47, 49, 42, 44, 38],
      borderColor: "#37bd80",
      backgroundColor: "rgba(55, 189, 128, .12)",
      fill: true,
      tension: .4,
      pointRadius: 0,
    }],
  };

  return (
    <div className="page-content">
      <div className="page-heading">
        <div><div className="eyebrow"><span className="status-dot" /> PORTFOLIO WORKSPACE</div><h1>{page.title}</h1><p>{page.description}</p></div>
        <button className="control-button" type="button"><FaRegClock /> Last 30 days <span aria-hidden="true">⌄</span></button>
      </div>
      <div className="workspace-metrics">
        <section className="panel workspace-metric"><span className="metric-icon"><FaLeaf /></span><span className="metric-label">{page.label}</span><strong>{page.metric}</strong><span className="trend-positive"><FaArrowDown /> {page.change}</span></section>
        <section className="panel workspace-metric"><span className="metric-icon blue"><FaBolt /></span><span className="metric-label">Reporting coverage</span><strong>92%</strong><span className="metric-note">Across tracked activities</span></section>
        <section className="panel workspace-metric"><span className="metric-icon purple"><FaCheckCircle /></span><span className="metric-label">Last updated</span><strong>Today</strong><span className="metric-note">Sample workspace</span></section>
      </div>
      <div className="workspace-panels">
        <section className="panel workspace-primary-panel">
          <div className="panel-heading"><div><h2>{page.chartTitle}</h2><p>Illustrative portfolio data · tCO₂e</p></div><button className="control-button compact" type="button">Monthly <span aria-hidden="true">⌄</span></button></div>
          <div className="workspace-chart"><Bar data={chartData} options={chartOptions} /></div>
        </section>
        <section className="panel workspace-trend-panel">
          <div className="panel-heading"><div><h2>Performance trend</h2><p>Change over time</p></div><span className="trend-pill"><FaArrowDown /> 8.4%</span></div>
          <div className="workspace-line-chart"><Line data={lineData} options={lineOptions} /></div>
        </section>
        <section className="panel workspace-table-panel">
          <div className="panel-heading"><div><h2>{page.rowsTitle}</h2><p>Current sample portfolio</p></div><button className="text-button" type="button">View all <span aria-hidden="true">↗</span></button></div>
          <div className="workspace-table">
            {page.rows.map(([name, value, note, color]) => <div className="workspace-table-row" key={name}><span className="source-dot" style={{ background: color }} /><strong>{name}</strong><span>{value}</span><span className={note.includes("%") || note === "Ready" || note === "Resolved" ? "table-status good" : "table-status"}>{note}</span></div>)}
          </div>
        </section>
      </div>
      <div className="demo-caption"><FaArrowUp /> UI preview · figures shown on this page are illustrative and are not connected to backend data.</div>
    </div>
  );
}

export default WorkspacePage;
