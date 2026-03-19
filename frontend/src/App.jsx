import { BrowserRouter, Routes, Route } from "react-router-dom";
import Navbar from "./components/layout/navbar";
import Footer from "./components/layout/footer";

import Dashboard from "./pages/dashboard";
import MapPage from "./pages/map";
import HistoricalDataPage from "./pages/historicaldata";
import AlertsPage from "./pages/alerts";
import DocumentationPage from "./pages/documentation";
import DroughtRisk from "./pages/droughtrisk";

// Legacy/utility pages (still available but not exposed via primary navigation)
import FloodRisk from "./pages/floodrisk";
import Precipitation from "./pages/precipitationsoil";

function App() {
  return (
    <BrowserRouter>
      <Navbar />

      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/historical" element={<HistoricalDataPage />} />
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/docs" element={<DocumentationPage />} />
        <Route path="/drought" element={<DroughtRisk />} />

        {/* Legacy pages (keep for compatibility) */}
        <Route path="/flood" element={<FloodRisk />} />
        <Route path="/precipitation" element={<Precipitation />} />
      </Routes>

      <Footer />
    </BrowserRouter>
  );
}

export default App;
