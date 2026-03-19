import { Link } from "react-router-dom";

function Footer() {
  return (
    <footer className="site-footer bg-light text-dark py-5 mt-5">
      <div className="container">
        <div className="row gy-4">
          <div className="col-md-6">
            <h5 className="fw-bold mb-3">Climate Impact Visualizer</h5>
            <p className="small text-muted mb-3">
              A lightweight dashboard for analyzing weather trends, flood/drought risk, and historical climate data. Built with open-source data and interactive mapping.
            </p>
            <p className="small text-muted mb-0">
              Need help? Visit the <Link className="text-primary text-decoration-underline" to="/docs">documentation</Link>.
            </p>
          </div>

          <div className="col-md-6">
            <h6 className="fw-semibold mb-3">Quick Links</h6>
            <ul className="list-unstyled small mb-0">
              <li className="mb-2">
                <Link className="text-primary text-decoration-none" to="/">
                  Dashboard
                </Link>
              </li>
              <li className="mb-2">
                <Link className="text-primary text-decoration-none" to="/map">
                  Map Overview
                </Link>
              </li>
              <li className="mb-2">
                <Link className="text-primary text-decoration-none" to="/alerts">
                  Alerts
                </Link>
              </li>
              <li className="mb-2">
                <Link className="text-primary text-decoration-none" to="/historical">
                  Historical Data
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <hr className="my-4 border-dark" />

        <div className="row">
          <div className="col-12 text-center">
            <p className="small text-muted mb-0">
              © {new Date().getFullYear()} Climate Impact Visualizer. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
