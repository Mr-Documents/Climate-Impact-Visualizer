import { Link } from "react-router-dom";
import { FaChartLine, FaMapMarkedAlt, FaShieldAlt } from "react-icons/fa";
import "./authlayout.css";

const highlights = [
  { icon: <FaChartLine />, text: "Track temperature and rainfall trends over time" },
  { icon: <FaShieldAlt />, text: "AI-powered flood and drought risk predictions" },
  { icon: <FaMapMarkedAlt />, text: "Interactive climate maps for any location" },
];

function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="auth-page">
      <div className="row g-0 min-vh-100">
        {/* Brand showcase — hidden on small screens */}
        <aside className="col-lg-6 d-none d-lg-flex auth-showcase">
          <div className="auth-showcase-overlay" />
          <div className="auth-showcase-content d-flex flex-column justify-content-between p-5 text-white">
            <Link to="/" className="auth-logo-badge align-self-start">
              <img
                src="/climate_visualizer_transparent.png"
                alt="Climate Impact Visualizer"
                className="auth-logo"
              />
            </Link>

            <div className="auth-showcase-copy">
              <h2 className="display-6 fw-bold mb-3">
                Understand climate risk before it happens.
              </h2>
              <p className="auth-muted mb-4">
                Analyze weather trends, flood and drought risk, and historical climate data
                in one lightweight dashboard.
              </p>
              <ul className="list-unstyled mb-0">
                {highlights.map(({ icon, text }) => (
                  <li key={text} className="d-flex align-items-center gap-3 mb-3">
                    <span className="auth-highlight-icon">{icon}</span>
                    <span>{text}</span>
                  </li>
                ))}
              </ul>
            </div>

            <p className="small auth-muted mb-0">
              © {new Date().getFullYear()} Climate Impact Visualizer
            </p>
          </div>
        </aside>

        {/* Form panel */}
        <main className="col-12 col-lg-6 d-flex align-items-center justify-content-center bg-light auth-form-panel">
          <div className="card border-0 shadow-sm w-100 auth-card">
            <div className="card-body p-4 p-sm-5">
              <Link to="/" className="d-flex justify-content-center d-lg-none mb-3">
                <img
                  src="/climate_visualizer_transparent.png"
                  alt="Climate Impact Visualizer"
                  className="auth-logo"
                />
              </Link>

              <h1 className="h3 fw-bold mb-1">{title}</h1>
              <p className="text-muted mb-4">{subtitle}</p>

              {children}

              {footer && <p className="text-center small text-muted mt-4 mb-0">{footer}</p>}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default AuthLayout;
