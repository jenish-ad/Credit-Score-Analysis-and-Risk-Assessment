import { createContext, useContext, useEffect, useMemo, useState } from "react";

const AuthContext = createContext(null);

const parseAdminFromToken = (token) => {
  if (!token) return false;

  try {
    const payloadBase64 = token.split(".")[1];
    if (!payloadBase64) return false;

    const payloadJson = atob(
      payloadBase64.replace(/-/g, "+").replace(/_/g, "/")
    );
    const payload = JSON.parse(payloadJson);

    return Boolean(payload?.is_admin);
  } catch {
    return false;
  }
};

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(null);
  const [username, setUsername] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    const storedUsername = localStorage.getItem("username");
    const storedAdminRaw = localStorage.getItem("is_admin");

    if (storedToken) {
      const tokenAdmin = parseAdminFromToken(storedToken);
      const storedAdmin =
        storedAdminRaw === null
          ? tokenAdmin
          : storedAdminRaw === "true";

      setToken(storedToken);
      setUsername(storedUsername);
      setIsAdmin(storedAdmin);
    }
  }, []);

  const login = ({ token: newToken, username: newUsername, is_admin = false }) => {
    localStorage.setItem("token", newToken);
    localStorage.setItem("username", newUsername);
    localStorage.setItem("is_admin", String(is_admin));

    setToken(newToken);
    setUsername(newUsername);
    setIsAdmin(Boolean(is_admin));
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    localStorage.removeItem("is_admin");

    setToken(null);
    setUsername(null);
    setIsAdmin(false);
  };

  const value = useMemo(
    () => ({
      token,
      username,
      isAdmin,
      isAuthenticated: Boolean(token),
      login,
      logout,
    }),
    [token, username, isAdmin]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider.");
  }

  return context;
};
