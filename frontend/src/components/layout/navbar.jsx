import { NavLink } from "react-router-dom";
import {
  FaBell,
  FaBolt,
  FaChartBar,
  FaChartLine,
  FaCloudSun,
  FaCog,
  FaFileAlt,
  FaGlobe,
  FaLeaf,
  FaLightbulb,
  FaPlug,
  FaBullseye,
  FaTint,
} from "react-icons/fa";

const primaryLinks = [
  { to: "/", label: "Dashboard", icon: FaChartBar, end: true },
  { to: "/emissions", label: "Emissions", icon: FaLeaf },
  { to: "/sources", label: "Sources", icon: FaBolt },
  { to: "/analytics", label: "Analytics", icon: FaChartLine },
  { to: "/insights", label: "AI Insights", icon: FaLightbulb },
  { to: "/targets", label: "Targets", icon: FaBullseye },
  { to: "/reports", label: "Reports", icon: FaFileAlt },
  { to: "/alerts", label: "Alerts", icon: FaBell },
  { to: "/integrations", label: "Integrations", icon: FaPlug },
  { to: "/settings", label: "Settings", icon: FaCog },
];

function Navbar({ onToggleTheme, theme, onCloseMenu }) {
  return (
    <aside className="workspace-sidebar">
      <NavLink className="brand-lockup" to="/" onClick={onCloseMenu}>
        <span className="brand-mark"><FaLeaf /></span>
        <span className="brand-name">CLIMATE<span>PRO</span></span>
      </NavLink>

      <div className="sidebar-section-label">WORKSPACE</div>
      <nav className="sidebar-nav" aria-label="Main navigation">
        {primaryLinks.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}
            to={to}
            end={end}
            onClick={onCloseMenu}
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
            {label === "Alerts" && <span className="nav-count">2</span>}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <NavLink className="sidebar-link" to="/climate" onClick={onCloseMenu}>
          <FaChartLine aria-hidden="true" /><span>Climate overview</span>
        </NavLink>
        <NavLink className="sidebar-link" to="/map" onClick={onCloseMenu}>
          <FaGlobe aria-hidden="true" /><span>Climate map</span>
        </NavLink>
        <NavLink className="sidebar-link" to="/flood" onClick={onCloseMenu}>
          <FaTint aria-hidden="true" /><span>Flood risk</span>
        </NavLink>
        <NavLink className="sidebar-link" to="/drought" onClick={onCloseMenu}>
          <FaCloudSun aria-hidden="true" /><span>Drought risk</span>
        </NavLink>
        <NavLink className="sidebar-link" to="/docs" onClick={onCloseMenu}>
          <FaFileAlt aria-hidden="true" /><span>Documentation</span>
        </NavLink>
        <div className="sidebar-promo">
          <span className="promo-sprout"><FaLeaf /></span>
          <strong>Small actions,<br />big impact.</strong>
          <span>Build a more sustainable future.</span>
        </div>
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
        <span>Climate intelligence</span>
        <span className="topbar-divider">/</span>
        <span className="topbar-live">Portfolio 1</span>
      </div>
      <div className="topbar-actions">
        <span className="live-status"><span className="status-dot" /> All systems operational</span>
        <button className="icon-button" type="button" onClick={onToggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
          <span aria-hidden="true">{theme === "dark" ? "☼" : "☾"}</span>
        </button>
        <button className="avatar-button" type="button" aria-label="User profile">R</button>
      </div>
    </header>
  );
}

export default Navbar;
