import { NavLink } from "react-router-dom";
import {
  FaBook,
  FaBolt,
  FaChartBar,
  FaChartLine,
  FaCloud,
  FaCloudRain,
  FaCloudSun,
  FaDatabase,
  FaFire,
  FaGlobe,
  FaLeaf,
  FaMap,
  FaRobot,
  FaShieldAlt,
  FaSun,
  FaThermometerHalf,
  FaTint,
  FaUsers,
  FaWater,
  FaWind,
} from "react-icons/fa";

const navigationSections = [
  {
    label: "CLIMATE MONITORING",
    links: [
      { to: "/", label: "Overview dashboard", icon: FaChartBar, end: true },
      { to: "/explorer", label: "Global climate explorer", icon: FaGlobe },
      { to: "/data-explorer", label: "Climate data explorer", icon: FaDatabase },
      { to: "/conditions", label: "Live conditions", icon: FaCloudSun },
    ],
  },
  {
    label: "CLIMATE ANALYSIS",
    links: [
      { to: "/temperature", label: "Temperature", icon: FaThermometerHalf },
      { to: "/precipitation", label: "Precipitation", icon: FaCloudRain },
      { to: "/drought-analysis", label: "Drought analysis", icon: FaTint },
      { to: "/heat", label: "Extreme heat", icon: FaSun },
      { to: "/atmosphere", label: "Wind & atmosphere", icon: FaWind },
      { to: "/sea-level", label: "Sea level & coastal", icon: FaWater },
      { to: "/emissions", label: "GHG & emissions", icon: FaBolt },
      { to: "/anomalies", label: "Climate anomalies", icon: FaChartLine },
    ],
  },
  {
    label: "AI & FORECASTS",
    links: [
      { to: "/predictions", label: "Prediction center", icon: FaRobot },
      { to: "/temperature-forecast", label: "Temperature forecast", icon: FaThermometerHalf },
      { to: "/rainfall-forecast", label: "Rainfall forecast", icon: FaCloudRain },
      { to: "/flood", label: "Flood risk prediction", icon: FaWater },
      { to: "/wildfire", label: "Wildfire risk", icon: FaFire },
      { to: "/drought", label: "Drought prediction", icon: FaTint },
      { to: "/projections", label: "Long-term projections", icon: FaChartLine },
    ],
  },
  {
    label: "CLIMATE IMPACT",
    links: [
      { to: "/impact", label: "Impact assessment", icon: FaShieldAlt },
      { to: "/environmental-risk", label: "Environmental risk", icon: FaLeaf },
      { to: "/agriculture", label: "Agriculture", icon: FaLeaf },
      { to: "/urban", label: "Urban climate", icon: FaMap },
      { to: "/ecosystems", label: "Ecosystems", icon: FaCloud },
      { to: "/communities", label: "Community vulnerability", icon: FaUsers },
    ],
  },
];

function Navbar({ onToggleTheme, theme, onCloseMenu }) {
  return (
    <aside className="workspace-sidebar">
      <NavLink className="brand-lockup" to="/" onClick={onCloseMenu}>
        <img src="/climate_visualizer_transparent.png" alt="Climate Impact Visualizer" className="brand-logo" />
      </NavLink>

      <nav className="sidebar-nav climate-sidebar-nav" aria-label="Climate sections">
        {navigationSections.map((section) => (
          <div className="sidebar-nav-section" key={section.label}>
            <div className="sidebar-section-label">{section.label}</div>
            {section.links.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}
                to={to}
                end={end}
                onClick={onCloseMenu}
              >
                <Icon aria-hidden="true" />
                <span>{label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-bottom climate-sidebar-bottom">
        <NavLink className="sidebar-link" to="/climate" onClick={onCloseMenu}>
          <FaChartLine aria-hidden="true" /><span>Climate overview</span>
        </NavLink>
        <NavLink className="sidebar-link" to="/map" onClick={onCloseMenu}>
          <FaGlobe aria-hidden="true" /><span>Climate map</span>
        </NavLink>
        <NavLink className="sidebar-link" to="/docs" onClick={onCloseMenu}>
          <FaBook aria-hidden="true" /><span>Documentation</span>
        </NavLink>
        <button className="sidebar-theme-toggle" type="button" onClick={onToggleTheme}>
          <span>{theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}</span>
          <span aria-hidden="true">{theme === "dark" ? "☼" : "☾"}</span>
        </button>
      </div>
    </aside>
  );
}

export function Topbar({ theme, onToggleTheme, onMenuClick }) {
  return (
    <header className="workspace-topbar">
      <button className="icon-button mobile-menu-button" type="button" onClick={onMenuClick} aria-label="Open navigation">
        <span aria-hidden="true">☰</span>
      </button>
      <div className="topbar-context">
        <span className="status-dot" />
        <span>Climate Impact Visualizer</span>
        <span className="topbar-divider">/</span>
        <span className="topbar-live">Climate workspace</span>
      </div>
      <div className="topbar-actions">
        <span className="live-status"><span className="status-dot" /> Climate monitoring</span>
        <button className="icon-button" type="button" onClick={onToggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
          <span aria-hidden="true">{theme === "dark" ? "☼" : "☾"}</span>
        </button>
        <button className="avatar-button" type="button" aria-label="User profile">R</button>
      </div>
    </header>
  );
}

export default Navbar;
