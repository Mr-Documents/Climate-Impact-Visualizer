// Temporary in-memory user store.
// Data lives only in this array, so accounts, saved locations and search history reset on page refresh.
// Replace these functions with backend API calls once authentication is added to the server.

export const DEFAULT_USER = {
  email: "admin@climateviz.com",
  password: "Climate@123",
};

const MAX_HISTORY_ENTRIES = 25;

const users = [
  {
    id: 1,
    fullName: "Admin",
    email: DEFAULT_USER.email,
    password: DEFAULT_USER.password,
    createdAt: new Date().toISOString(),
    savedLocations: [],
    searchHistory: [],
  },
];

let nextRecordId = 1;

const normalizeEmail = (email) => email.trim().toLowerCase();

// Only expose profile fields; passwords and member data stay inside this module
const toPublicUser = ({ password, savedLocations, searchHistory, ...user }) => user;

const findUserById = (userId) => users.find((user) => user.id === userId);

// Two coordinates within ~100m are treated as the same place
export const locationKey = ({ lat, lon }) => `${lat.toFixed(3)},${lon.toFixed(3)}`;

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
    savedLocations: [],
    searchHistory: [],
  };

  users.push(user);
  return { ok: true, user: toPublicUser(user) };
};

/* ---------- Saved locations ---------- */

export const getSavedLocations = (userId) => [...(findUserById(userId)?.savedLocations ?? [])];

export const findSavedLocation = (userId, coords) =>
  findUserById(userId)?.savedLocations.find((loc) => locationKey(loc) === locationKey(coords));

export const addSavedLocation = (userId, { name, lat, lon }) => {
  const user = findUserById(userId);
  if (!user || findSavedLocation(userId, { lat, lon })) return;

  user.savedLocations.unshift({
    id: nextRecordId++,
    name,
    lat,
    lon,
    savedAt: new Date().toISOString(),
  });
};

export const removeSavedLocation = (userId, locationId) => {
  const user = findUserById(userId);
  if (!user) return;
  user.savedLocations = user.savedLocations.filter((loc) => loc.id !== locationId);
};

/* ---------- Search history ---------- */

export const getSearchHistory = (userId) => [...(findUserById(userId)?.searchHistory ?? [])];

// Re-analyzing the same place from the same page moves it to the top instead of duplicating it
export const addSearchHistoryEntry = (userId, { source, name, lat, lon, summary }) => {
  const user = findUserById(userId);
  if (!user) return;

  const withoutDuplicate = user.searchHistory.filter(
    (entry) => !(entry.source === source && locationKey(entry) === locationKey({ lat, lon }))
  );

  user.searchHistory = [
    { id: nextRecordId++, source, name, lat, lon, summary, searchedAt: new Date().toISOString() },
    ...withoutDuplicate,
  ].slice(0, MAX_HISTORY_ENTRIES);
};

export const clearSearchHistory = (userId) => {
  const user = findUserById(userId);
  if (user) user.searchHistory = [];
};
