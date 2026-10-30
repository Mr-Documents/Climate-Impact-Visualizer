import { useState } from "react";
import { FaEye, FaEyeSlash, FaLock } from "react-icons/fa";

export function AuthField({ id, label, icon, error, hint, ...inputProps }) {
  return (
    <div className="mb-3">
      <label htmlFor={id} className="form-label small fw-semibold">
        {label}
      </label>
      <div className="input-group has-validation">
        <span className="input-group-text bg-white">{icon}</span>
        <input
          id={id}
          name={id}
          className={`form-control ${error ? "is-invalid" : ""}`}
          aria-invalid={Boolean(error)}
          {...inputProps}
        />
        {error && <div className="invalid-feedback">{error}</div>}
      </div>
      {hint && !error && <div className="form-text">{hint}</div>}
    </div>
  );
}

export function PasswordField({ id, label, error, hint, ...inputProps }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="mb-3">
      <label htmlFor={id} className="form-label small fw-semibold">
        {label}
      </label>
      <div className="input-group has-validation">
        <span className="input-group-text bg-white">
          <FaLock />
        </span>
        <input
          id={id}
          name={id}
          type={visible ? "text" : "password"}
          className={`form-control border-end-0 ${error ? "is-invalid" : ""}`}
          aria-invalid={Boolean(error)}
          {...inputProps}
        />
        <button
          type="button"
          className={`btn auth-password-toggle ${error ? "is-invalid" : ""}`}
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? <FaEyeSlash /> : <FaEye />}
        </button>
        {error && <div className="invalid-feedback">{error}</div>}
      </div>
      {hint && !error && <div className="form-text">{hint}</div>}
    </div>
  );
}
