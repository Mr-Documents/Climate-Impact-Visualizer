import { createContext, useContext, useState } from "react";
import * as userStore from "./users";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLogoutPromptOpen, setLogoutPromptOpen] = useState(false);
  // The store is a plain array, so bump this after each change to re-render consumers
  const [, setDataVersion] = useState(0);
  const refresh = () => setDataVersion((v) => v + 1);

  const login = (email, password) => {
    const result = userStore.authenticateUser(email, password);
    if (result.ok) setUser(result.user);
    return result;
  };

  // Creates the account only; the user signs in afterwards on the login page
  const signup = (details) => userStore.registerUser(details);

  const logout = () => {
    setLogoutPromptOpen(false);
    setUser(null);
  };

  // Any page can ask for a logout; the shared LogoutModal handles the confirmation
  const requestLogout = () => setLogoutPromptOpen(true);
  const cancelLogout = () => setLogoutPromptOpen(false);

  /* ---------- Member-only data (no-ops for guests) ---------- */

  const savedLocations = user ? userStore.getSavedLocations(user.id) : [];
  const searchHistory = user ? userStore.getSearchHistory(user.id) : [];

  const isLocationSaved = (coords) =>
    Boolean(user && userStore.findSavedLocation(user.id, coords));

  const toggleSavedLocation = (location) => {
    if (!user) return;
    const existing = userStore.findSavedLocation(user.id, location);
    if (existing) {
      userStore.removeSavedLocation(user.id, existing.id);
    } else {
      userStore.addSavedLocation(user.id, location);
    }
    refresh();
  };

  const removeSavedLocation = (locationId) => {
    if (!user) return;
    userStore.removeSavedLocation(user.id, locationId);
    refresh();
  };

  const recordSearch = (entry) => {
    if (!user) return;
    userStore.addSearchHistoryEntry(user.id, entry);
    refresh();
  };

  const clearSearchHistory = () => {
    if (!user) return;
    userStore.clearSearchHistory(user.id);
    refresh();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        signup,
        logout,
        isLogoutPromptOpen,
        requestLogout,
        cancelLogout,
        savedLocations,
        isLocationSaved,
        toggleSavedLocation,
        removeSavedLocation,
        searchHistory,
        recordSearch,
        clearSearchHistory,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
