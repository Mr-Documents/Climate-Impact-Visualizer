import { BrowserRouter, Routes, Route } from "react-router-dom";
import Navbar from "./components/layout/navbar";
import Footer from "./components/layout/footer";

import Dashboard from "./pages/dashboard";
import MapPage from "./pages/map";
import DocumentationPage from "./pages/documentation";
import DroughtRisk from "./pages/droughtrisk";
import FloodRisk from "./pages/floodrisk";

function AppLayout() {
  return (
    <>
      <Navbar />

      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/docs" element={<DocumentationPage />} />
        <Route path="/drought" element={<DroughtRisk />} />
        <Route path="/flood" element={<FloodRisk />} />
      </Routes>

      <Footer />
    </>
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
