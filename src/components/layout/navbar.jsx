import { Link } from "react-router-dom";
import DarkModeToggle from "./darklightmode";


function Navbar() {
  return (
    <nav className="navbar navbar-expand-lg navbar-dark bg-dark px-3">
      <Link className="navbar-brand" to="/">Climate Visualizer</Link>

      <div className="collapse navbar-collapse">
        <ul className="navbar-nav ms-auto">
          <li className="nav-item">
            <Link className="nav-link" to="/flood">Flood Risk</Link>
          </li>
          <li className="nav-item">
            <Link className="nav-link" to="/wildfire">Wildfire Risk</Link>
          </li>
          <li className="nav-item">
            <Link className="nav-link" to="/precipitation">Precipitation</Link>
          </li>
          
        </ul>
        
      </div>
      <DarkModeToggle />

    </nav>
  );
}

export default Navbar;
