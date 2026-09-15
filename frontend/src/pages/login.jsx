import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { FaEnvelope, FaExclamationCircle, FaCheckCircle, FaInfoCircle } from "react-icons/fa";
import AuthLayout from "../components/layout/authlayout";
import { AuthField, PasswordField } from "../components/forms/authfields";
import { useAuth } from "../auth/authcontext";
import { DEFAULT_USER } from "../auth/users";
import { validateLogin } from "../auth/validation";

function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const registeredEmail = location.state?.registeredEmail;
  // Set when a guest was sent here from a members-only feature
  const redirectTo = location.state?.from || "/";

  const [form, setForm] = useState({ email: registeredEmail || "", password: "" });
  const [errors, setErrors] = useState({});
  const [authError, setAuthError] = useState("");

  if (user) return <Navigate to={redirectTo} replace />;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
    setAuthError("");
  };

  const fillAdminAccount = () => {
    setForm({ email: DEFAULT_USER.email, password: DEFAULT_USER.password });
    setErrors({});
    setAuthError("");
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    const validationErrors = validateLogin(form);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length) return;

    const result = login(form.email, form.password);
    if (!result.ok) {
      setAuthError(result.error);
      return;
    }

    navigate(redirectTo, { replace: true });
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to continue to your climate dashboard."
      footer={
        <>
          Don't have an account?{" "}
          <Link
            to="/signup"
            state={location.state?.from ? { from: location.state.from } : undefined}
            className="fw-semibold text-decoration-none"
          >
            Sign up
          </Link>
        </>
      }
    >
      {registeredEmail && !authError && (
        <div className="alert alert-success d-flex align-items-center gap-2 small py-2" role="status">
          <FaCheckCircle className="flex-shrink-0" />
          Account created successfully. Log in to continue.
        </div>
      )}

      {authError && (
        <div className="alert alert-danger d-flex align-items-center gap-2 small py-2" role="alert">
          <FaExclamationCircle className="flex-shrink-0" />
          {authError}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
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
          placeholder="Enter your password"
          autoComplete="current-password"
          value={form.password}
          onChange={handleChange}
          error={errors.password}
        />

        <button type="submit" className="btn btn-primary w-100 py-2 fw-semibold mt-2">
          Log in
        </button>
      </form>

      <div className="auth-demo-box rounded-3 p-3 mt-4 small">
        <div className="d-flex align-items-center gap-2 fw-semibold mb-1">
          <FaInfoCircle className="text-primary" /> Admin account
        </div>
        <div className="text-muted text-break">
          {DEFAULT_USER.email} · {DEFAULT_USER.password}
        </div>
        <button
          type="button"
          className="btn btn-link btn-sm p-0 mt-1 text-decoration-none"
          onClick={fillAdminAccount}
        >
          Use admin credentials
        </button>
      </div>
    </AuthLayout>
  );
}

export default Login;
