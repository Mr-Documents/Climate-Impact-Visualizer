import { Link, useNavigate } from "react-router-dom";
import { FaSignOutAlt, FaUserCircle } from "react-icons/fa";
import { useAuth } from "../../auth/authcontext";

function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <nav className="navbar navbar-expand-lg navbar-light bg-light px-3">
      <Link className="navbar-brand d-flex align-items-center gap-2" to="/">
        <img
          src="/climate_visualizer_transparent.png"
          alt="Climate Impact Visualizer logo"
          className="navbar-brand-logo"
          style={{ width: '94px', height: '68px', marginLeft: '20px' }}
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

          {user ? (
            <li className="nav-item dropdown ms-lg-3">
              <button
                className="nav-link dropdown-toggle btn btn-link text-decoration-none d-flex align-items-center gap-2"
                type="button"
                id="accountDropdown"
                data-bs-toggle="dropdown"
                aria-expanded="false"
              >
                <FaUserCircle size={20} className="text-primary" />
                {user.fullName}
              </button>
              <ul className="dropdown-menu dropdown-menu-end" aria-labelledby="accountDropdown">
                <li>
                  <span className="dropdown-item-text small text-muted">{user.email}</span>
                </li>
                <li>
                  <hr className="dropdown-divider" />
                </li>
                <li>
                  <button className="dropdown-item d-flex align-items-center gap-2" onClick={handleLogout}>
                    <FaSignOutAlt /> Log out
                  </button>
                </li>
              </ul>
            </li>
          ) : (
            <li className="nav-item d-flex flex-column flex-lg-row gap-2 ms-lg-3 py-2 py-lg-0">
              <Link className="btn btn-outline-primary btn-sm px-3" to="/login">
                Log in
              </Link>
              <Link className="btn btn-primary btn-sm px-3" to="/signup">
                Sign up
              </Link>
            </li>
          )}
        </ul>
      </div>
    </nav>
  );
}

export default Navbar;
