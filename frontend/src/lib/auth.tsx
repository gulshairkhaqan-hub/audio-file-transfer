"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { clearAuth, loadAuth, saveAuth, type StoredAuth } from "@/lib/api";

export type User = { name: string; email: string };

type AuthContextType = {
  user: User | null;
  loading: boolean;
  login: (auth: StoredAuth) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // loadAuth() returns null unless a valid token is stored, so a pre-token
    // session (or a cleared one) starts out signed out.
    const stored = loadAuth();
    if (stored) setUser({ name: stored.name, email: stored.email });
    setLoading(false);
  }, []);

  const login = (auth: StoredAuth) => {
    saveAuth(auth);
    setUser({ name: auth.name, email: auth.email });
  };

  const logout = () => {
    setUser(null);
    clearAuth();
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
