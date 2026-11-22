import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Chart as ChartJS } from "chart.js";
import Navbar, { Topbar } from "./components/layout/navbar";
import Dashboard from "./pages/dashboard";
import DocumentationPage from "./pages/documentation";
import DroughtRisk from "./pages/droughtrisk";
import FloodRisk from "./pages/floodrisk";
import MapPage from "./pages/map";
import DashboardOverview from "./pages/overview";
import WorkspacePage from "./pages/workspacepage";
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
              <Route path="/" element={<DashboardOverview />} />
              <Route path="/emissions" element={<WorkspacePage />} />
              <Route path="/sources" element={<WorkspacePage />} />
              <Route path="/analytics" element={<WorkspacePage />} />
              <Route path="/insights" element={<WorkspacePage />} />
              <Route path="/targets" element={<WorkspacePage />} />
              <Route path="/reports" element={<WorkspacePage />} />
              <Route path="/alerts" element={<WorkspacePage />} />
              <Route path="/integrations" element={<WorkspacePage />} />
              <Route path="/settings" element={<WorkspacePage />} />
              <Route path="/climate" element={<Dashboard />} />
              <Route path="/map" element={<MapPage />} />
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
