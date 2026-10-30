import { Link, useLocation } from "react-router-dom";
import { FaCheckCircle, FaLock } from "react-icons/fa";
import { useAuth } from "../../auth/authcontext";
import "./membersonly.css";

// Placeholder shown to guests in place of a member-only feature
export function LockedFeature({ title, description, perks = [], compact = false, className = "" }) {
  const location = useLocation();
  // After logging in, the user is sent back to the page they were on
  const redirectState = { from: location.pathname };

  if (compact) {
    return (
      <div
        className={`members-locked-compact d-flex flex-column flex-sm-row align-items-sm-center gap-3 p-3 rounded-3 ${className}`}
      >
        <span className="members-lock-icon">
          <FaLock />
        </span>
        <div className="flex-grow-1">
          <div className="fw-semibold small">{title}</div>
          {description && <div className="text-muted small">{description}</div>}
        </div>
        <Link to="/login" state={redirectState} className="btn btn-primary btn-sm px-3 flex-shrink-0">
          Log in to unlock
        </Link>
      </div>
    );
  }

  return (
    <div className={`text-center p-4 p-md-5 ${className}`}>
      <span className="members-lock-icon members-lock-icon-lg mx-auto mb-3">
        <FaLock />
      </span>
      <span className="badge rounded-pill bg-primary-subtle text-primary-emphasis fw-semibold mb-2">
        Members only
      </span>
      <h2 className="h4 fw-bold mb-2">{title}</h2>
      <p className="text-muted mx-auto mb-4 members-locked-text">{description}</p>

      {perks.length > 0 && (
        <ul className="list-unstyled d-inline-flex flex-column gap-2 text-start small mb-4">
          {perks.map((perk) => (
            <li key={perk} className="d-flex align-items-start gap-2">
              <FaCheckCircle className="text-success mt-1 flex-shrink-0" />
              <span>{perk}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="d-flex flex-column flex-sm-row justify-content-center gap-2">
        <Link to="/login" state={redirectState} className="btn btn-primary px-4">
          Log in
        </Link>
        <Link to="/signup" state={redirectState} className="btn btn-outline-primary px-4">
          Create free account
        </Link>
      </div>
    </div>
  );
}

// Renders children for logged-in members, otherwise the locked placeholder
function MembersOnly({ children, fullPage = false, ...lockedProps }) {
  const { user } = useAuth();

  if (user) return children;

  if (fullPage) {
    return (
      <div className="container py-5">
        <div className="row justify-content-center">
          <div className="col-lg-8 col-xl-7">
            <div className="card border-0 shadow-sm rounded-4">
              <LockedFeature {...lockedProps} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <LockedFeature {...lockedProps} />;
}

export default MembersOnly;
