"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { getSession, login as doLogin, logout as doLogout, type Session } from "@/lib/auth";

interface AuthCtx {
  session: Session | null;
  loading: boolean;
  login: (email: string) => Session | null;
  logout: () => void;
  refresh: () => void;
}

const AuthContext = createContext<AuthCtx>({
  session: null,
  loading: true,
  login: () => null,
  logout: () => {},
  refresh: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setSession(getSession());
    setLoading(false);
  }, []);

  const login = useCallback((email: string) => {
    const s = doLogin(email);
    setSession(s);
    return s;
  }, []);

  const logout = useCallback(() => {
    doLogout();
    setSession(null);
  }, []);

  const refresh = useCallback(() => {
    setSession(getSession());
  }, []);

  return (
    <AuthContext.Provider value={{ session, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
