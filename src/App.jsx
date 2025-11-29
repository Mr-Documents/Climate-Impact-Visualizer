import { BrowserRouter, Routes, Route } from "react-router-dom";
import Navbar from "./components/layout/navbar";

import Dashboard from "./pages/dashboard";
import FloodRisk from "./pages/floodrisk";
import WildfireRisk from "./pages/wildfirerisk";
import Precipitation from "./pages/precipitationsoil";

function App() {
  return (
    <BrowserRouter>
      <Navbar />

      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/flood" element={<FloodRisk />} />
        <Route path="/wildfire" element={<WildfireRisk />} />
        <Route path="/precipitation" element={<Precipitation />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
