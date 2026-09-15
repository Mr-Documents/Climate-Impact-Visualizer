import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import Navbar from "./components/layout/navbar";
import Footer from "./components/layout/footer";
import { AuthProvider } from "./auth/authcontext";
import LogoutModal from "./components/auth/logoutmodal";

import Dashboard from "./pages/dashboard";
import MapPage from "./pages/map";
import DocumentationPage from "./pages/documentation";
import DroughtRisk from "./pages/droughtrisk";
import Login from "./pages/login";
import Signup from "./pages/signup";

// Legacy/utility pages (still available but not exposed via primary navigation)
import FloodRisk from "./pages/floodrisk";

// Auth pages use their own full-screen layout, so the site navbar/footer are hidden there
const AUTH_ROUTES = ["/login", "/signup"];

function AppLayout() {
  const { pathname } = useLocation();
  const isAuthPage = AUTH_ROUTES.includes(pathname);

  return (
    <>
      {!isAuthPage && <Navbar />}

      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/docs" element={<DocumentationPage />} />
        <Route path="/drought" element={<DroughtRisk />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        {/* Legacy pages (keep for compatibility) */}
        <Route path="/flood" element={<FloodRisk />} />
      </Routes>

      {!isAuthPage && <Footer />}

      {/* Shared logout confirmation, opened from any page via useAuth().requestLogout */}
      <LogoutModal />
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppLayout />
      </BrowserRouter>
    </AuthProvider>
  );
}
export default App;
