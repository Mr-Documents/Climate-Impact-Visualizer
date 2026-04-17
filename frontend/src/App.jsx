import { BrowserRouter, Routes, Route } from "react-router-dom";
import Navbar from "./components/layout/navbar";
import Footer from "./components/layout/footer";

import Dashboard from "./pages/dashboard";
import MapPage from "./pages/map";
import DocumentationPage from "./pages/documentation";
import DroughtRisk from "./pages/droughtrisk";

// Legacy/utility pages (still available but not exposed via primary navigation)
import FloodRisk from "./pages/floodrisk";

function App() {
  
  return (
    
    <BrowserRouter>
      <Navbar />

      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/docs" element={<DocumentationPage />} />
        <Route path="/drought" element={<DroughtRisk />} />

        {/* Legacy pages (keep for compatibility) */}
        <Route path="/flood" element={<FloodRisk />} />
       
      </Routes>

      <Footer />
    </BrowserRouter>
  );
}
console.log("NEW UI LOADED");
export default App;
