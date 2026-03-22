import { Link } from "react-router-dom";

function Navbar() {
  return (
    <nav className="navbar navbar-expand-lg navbar-light bg-light px-3">
      <Link className="navbar-brand d-flex align-items-center gap-2" to="/">
        <img
          src="/logo.png?v=2"
          alt="Climate Impact Visualizer logo"
          className="navbar-brand-logo"
          style={{ width: '70px', height: '68px', marginLeft: '20px' }}
        />
        <span className="visually-hidden">Climate Impact Visualizer</span>
      </Link>

      <button
        className="navbar-toggler"
        type="button"
        data-bs-toggle="collapse"
        data-bs-target="#mainNavbar"
        aria-controls="mainNavbar"
        aria-expanded="false"
        aria-label="Toggle navigation"
      >
        <span className="navbar-toggler-icon" />
      </button>

      <div className="collapse navbar-collapse" id="mainNavbar">
        <ul className="navbar-nav ms-auto">
          <li className="nav-item">
            <Link className="nav-link" to="/">
              Dashboard
            </Link>
          </li>

          <li className="nav-item">
            <Link className="nav-link" to="/map">
              Climate Overview
            </Link>
          </li>

          <li className="nav-item dropdown">
            <button
              className="nav-link dropdown-toggle btn btn-link text-decoration-none"
              type="button"
              id="predictionsDropdown"
              data-bs-toggle="dropdown"
              aria-expanded="false"
            >
              Predictions
            </button>
            <ul className="dropdown-menu dropdown-menu-end" aria-labelledby="predictionsDropdown">
              <li>
                <Link className="dropdown-item" to="/flood">
                  Flood Risk
                </Link>
              </li>
              <li>
                <Link className="dropdown-item" to="/drought">
                  Drought Risk
                </Link>
              </li>
            </ul>
          </li>

          <li className="nav-item">
            <Link className="nav-link" to="/docs">
              Documentation
            </Link>
          </li>
        </ul>
      </div>
    </nav>
  );
}

export default Navbar;
