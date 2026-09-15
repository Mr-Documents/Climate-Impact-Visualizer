// Temporary in-memory user store.
// Data lives only in this array, so any accounts created via Sign Up reset on page refresh.
// Replace these functions with backend API calls once authentication is added to the server.

export const DEFAULT_USER = {
  email: "demo@climateviz.com",
  password: "Climate@123",
};

const users = [
  {
    id: 1,
    fullName: "Demo User",
    email: DEFAULT_USER.email,
    password: DEFAULT_USER.password,
    createdAt: new Date().toISOString(),
  },
];

const normalizeEmail = (email) => email.trim().toLowerCase();

// Never expose the password outside this module
const toPublicUser = ({ password, ...user }) => user;

export const findUserByEmail = (email) =>
  users.find((user) => user.email === normalizeEmail(email));

export const authenticateUser = (email, password) => {
  const user = findUserByEmail(email);

  if (!user || user.password !== password) {
    return { ok: false, error: "Invalid email or password." };
  }

  return { ok: true, user: toPublicUser(user) };
};

export const registerUser = ({ fullName, email, password }) => {
  if (findUserByEmail(email)) {
    return { ok: false, error: "An account with this email already exists." };
  }

  const user = {
    id: users.length + 1,
    fullName: fullName.trim(),
    email: normalizeEmail(email),
    password,
    createdAt: new Date().toISOString(),
  };

  users.push(user);
  return { ok: true, user: toPublicUser(user) };
};
