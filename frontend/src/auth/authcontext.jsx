import { createContext, useContext, useState } from "react";
import { authenticateUser, registerUser } from "./users";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLogoutPromptOpen, setLogoutPromptOpen] = useState(false);

  const login = (email, password) => {
    const result = authenticateUser(email, password);
    if (result.ok) setUser(result.user);
    return result;
  };

  // Creates the account only; the user signs in afterwards on the login page
  const signup = (details) => registerUser(details);

  const logout = () => {
    setLogoutPromptOpen(false);
    setUser(null);
  };

  // Any page can ask for a logout; the shared LogoutModal handles the confirmation
  const requestLogout = () => setLogoutPromptOpen(true);
  const cancelLogout = () => setLogoutPromptOpen(false);

  return (
    <AuthContext.Provider
      value={{ user, login, signup, logout, isLogoutPromptOpen, requestLogout, cancelLogout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
