const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const validateEmail = (email) => {
  if (!email.trim()) return "Email is required.";
  if (!EMAIL_REGEX.test(email.trim())) return "Enter a valid email address.";
  return null;
};

// Returns an object of field -> message; empty object means the form is valid
export const validateLogin = ({ email, password }) => {
  const errors = {};

  const emailError = validateEmail(email);
  if (emailError) errors.email = emailError;
  if (!password) errors.password = "Password is required.";

  return errors;
};

export const validateSignup = ({ fullName, email, password, confirmPassword, acceptTerms }) => {
  const errors = {};

  if (fullName.trim().length < 2) errors.fullName = "Enter your full name.";

  const emailError = validateEmail(email);
  if (emailError) errors.email = emailError;

  if (password.length < 8) {
    errors.password = "Password must be at least 8 characters.";
  } else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    errors.password = "Password must include at least one letter and one number.";
  }

  if (!confirmPassword) {
    errors.confirmPassword = "Please confirm your password.";
  } else if (confirmPassword !== password) {
    errors.confirmPassword = "Passwords do not match.";
  }

  if (!acceptTerms) errors.acceptTerms = "You must accept the terms to continue.";

  return errors;
};
