import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { FaEnvelope, FaExclamationCircle, FaUser } from "react-icons/fa";
import AuthLayout from "../components/layout/authlayout";
import { AuthField, PasswordField } from "../components/forms/authfields";
import { useAuth } from "../auth/authcontext";
import { validateSignup } from "../auth/validation";

const initialForm = {
  fullName: "",
  email: "",
  password: "",
  confirmPassword: "",
  acceptTerms: false,
};

function Signup() {
  const { user, signup } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [authError, setAuthError] = useState("");

  if (user) return <Navigate to="/" replace />;

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
    setAuthError("");
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    const validationErrors = validateSignup(form);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length) return;

    const result = signup(form);
    if (!result.ok) {
      setAuthError(result.error);
      return;
    }

    navigate("/login", { replace: true, state: { registeredEmail: result.user.email } });
  };

  return (
    <AuthLayout
      title="Create an account"
      subtitle="Get started with climate insights for your location."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="fw-semibold text-decoration-none">
            Log in
          </Link>
        </>
      }
    >
      {authError && (
        <div className="alert alert-danger d-flex align-items-center gap-2 small py-2" role="alert">
          <FaExclamationCircle className="flex-shrink-0" />
          {authError}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <AuthField
          id="fullName"
          label="Full name"
          type="text"
          icon={<FaUser />}
          placeholder="Jane Doe"
          autoComplete="name"
          value={form.fullName}
          onChange={handleChange}
          error={errors.fullName}
        />

        <AuthField
          id="email"
          label="Email address"
          type="email"
          icon={<FaEnvelope />}
          placeholder="you@example.com"
          autoComplete="email"
          value={form.email}
          onChange={handleChange}
          error={errors.email}
        />

        <PasswordField
          id="password"
          label="Password"
          placeholder="Create a password"
          autoComplete="new-password"
          value={form.password}
          onChange={handleChange}
          error={errors.password}
          hint="Use at least 8 characters, including a letter and a number."
        />

        <PasswordField
          id="confirmPassword"
          label="Confirm password"
          placeholder="Repeat your password"
          autoComplete="new-password"
          value={form.confirmPassword}
          onChange={handleChange}
          error={errors.confirmPassword}
        />

        <div className="form-check mb-3">
          <input
            id="acceptTerms"
            name="acceptTerms"
            type="checkbox"
            className={`form-check-input ${errors.acceptTerms ? "is-invalid" : ""}`}
            checked={form.acceptTerms}
            onChange={handleChange}
          />
          <label htmlFor="acceptTerms" className="form-check-label small">
            I agree to the terms of use and privacy policy
          </label>
          {errors.acceptTerms && <div className="invalid-feedback">{errors.acceptTerms}</div>}
        </div>

        <button type="submit" className="btn btn-primary w-100 py-2 fw-semibold">
          Create account
        </button>
      </form>
    </AuthLayout>
  );
}

export default Signup;
