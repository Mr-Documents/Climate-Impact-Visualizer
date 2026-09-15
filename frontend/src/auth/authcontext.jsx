import { createContext, useContext, useState } from "react";
import { authenticateUser, registerUser } from "./users";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  const login = (email, password) => {
    const result = authenticateUser(email, password);
    if (result.ok) setUser(result.user);
    return result;
  };

  // Creates the account only; the user signs in afterwards on the login page
  const signup = (details) => registerUser(details);

  const logout = () => setUser(null);

  return (
    <AuthContext.Provider value={{ user, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
