import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Chart as ChartJS } from "chart.js";
import Navbar, { Topbar } from "./components/layout/navbar";
import Dashboard from "./pages/dashboard";
import DocumentationPage from "./pages/documentation";
import DroughtRisk from "./pages/droughtrisk";
import FloodRisk from "./pages/floodrisk";
import MapPage from "./pages/map";
import ClimatePages from "./pages/climatepages";
import { ThemeContext } from "./providers/themecontext";
import "./App.css";

function AppLayout() {
  const [theme, setTheme] = useState(() => {
    try {
      return window.localStorage.getItem("climatepro-theme") === "light" ? "light" : "dark";
    } catch (error) {
      return "dark";
    }
  });
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    ChartJS.defaults.color = theme === "dark" ? "#91a0a9" : "#687a72";
    ChartJS.defaults.borderColor = theme === "dark" ? "rgba(132, 154, 164, .12)" : "rgba(53, 78, 70, .10)";
    try {
      window.localStorage.setItem("climatepro-theme", theme);
    } catch (error) {
      console.warn("Could not save the selected theme.", error);
    }
  }, [theme]);

  const toggleTheme = () => setTheme((current) => current === "dark" ? "light" : "dark");

  return (
    <ThemeContext.Provider value={{ theme }}>
      <div className={`workspace-shell${menuOpen ? " menu-open" : ""}`} data-theme={theme}>
        <Navbar theme={theme} onToggleTheme={toggleTheme} onCloseMenu={() => setMenuOpen(false)} />
        <div className="workspace-main">
          <Topbar theme={theme} onToggleTheme={toggleTheme} onMenuClick={() => setMenuOpen((open) => !open)} />
          <main className="workspace-route">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/climate" element={<MapPage />} />
              <Route path="/explorer" element={<MapPage />} />
              <Route path="/map" element={<MapPage />} />
              <Route path="/data-explorer" element={<ClimatePages />} />
              <Route path="/conditions" element={<ClimatePages />} />
              <Route path="/temperature" element={<ClimatePages />} />
              <Route path="/precipitation" element={<ClimatePages />} />
              <Route path="/drought-analysis" element={<ClimatePages />} />
              <Route path="/heat" element={<ClimatePages />} />
              <Route path="/atmosphere" element={<ClimatePages />} />
              <Route path="/sea-level" element={<ClimatePages />} />
              <Route path="/emissions" element={<ClimatePages />} />
              <Route path="/anomalies" element={<ClimatePages />} />
              <Route path="/predictions" element={<ClimatePages />} />
              <Route path="/temperature-forecast" element={<ClimatePages />} />
              <Route path="/rainfall-forecast" element={<ClimatePages />} />
              <Route path="/wildfire" element={<ClimatePages />} />
              <Route path="/projections" element={<ClimatePages />} />
              <Route path="/impact" element={<ClimatePages />} />
              <Route path="/environmental-risk" element={<ClimatePages />} />
              <Route path="/agriculture" element={<ClimatePages />} />
              <Route path="/urban" element={<ClimatePages />} />
              <Route path="/ecosystems" element={<ClimatePages />} />
              <Route path="/communities" element={<ClimatePages />} />
              <Route path="/docs" element={<DocumentationPage />} />
              <Route path="/drought" element={<DroughtRisk />} />
              <Route path="/flood" element={<FloodRisk />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
        {menuOpen && <button className="sidebar-backdrop" type="button" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
      </div>
    </ThemeContext.Provider>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  );
}

export default App;
