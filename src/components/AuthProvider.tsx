"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { supabase, supabaseReady } from "@/lib/supabase";
import type { Session, UserProfile } from "@/lib/auth";
import { type DisabledFeatures, type FeatureState, fetchFeatureState } from "@/lib/features";

interface AuthCtx {
  session: Session | null;
  loading: boolean;
  disabledFeatures: DisabledFeatures;
  featureState: FeatureState;
  login: (email: string, password: string) => Promise<string | null>;
  logout: () => void;
  refresh: () => void;
  refreshFeatures: () => void;
}

const EMPTY_FEATURE_STATE: FeatureState = { disabled: new Set(), enabled: new Set() };

const AuthContext = createContext<AuthCtx>({
  session: null,
  loading: true,
  disabledFeatures: new Set(),
  featureState: EMPTY_FEATURE_STATE,
  login: async () => null,
  logout: () => {},
  refresh: () => {},
  refreshFeatures: () => {},
});

function toSession(p: UserProfile): Session {
  return { email: p.email, nome: p.nome, ruolo: p.ruolo, funzione: p.funzione, aziende: p.aziende };
}

async function loadProfile(userId: string): Promise<Session | null> {
  try {
    const { data, error } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("id", userId)
      .single();
    if (error || !data) return null;
    return toSession(data as UserProfile);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [featureState, setFeatureState] = useState<FeatureState>(EMPTY_FEATURE_STATE);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  useEffect(() => {
    const timeout = setTimeout(() => setLoading(false), 5000);

    if (!supabaseReady) {
      setLoading(false);
      clearTimeout(timeout);
      return;
    }

    // Load existing session on mount
    supabase.auth.getSession()
      .then(async ({ data: { session: authSession } }) => {
        if (authSession?.user) {
          const profile = await loadProfile(authSession.user.id);
          if (profile) {
            setSession(profile);
            fetchFeatureState().then(setFeatureState);
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        setLoading(false);
        clearTimeout(timeout);
      });

    // Handle ALL auth state changes (sign-in from invite/reset + sign-out)
    // IMPORTANTE: non fare await su operazioni che usano supabase dentro questo
    // callback — l'SDK tiene il lock e causa deadlock con getSession/updateUser.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, authSession) => {
      // Recovery flow: porta l'utente a /set-password indipendentemente da dove è atterrato
      if (_event === "PASSWORD_RECOVERY" && authSession) {
        if (typeof window !== "undefined" && !window.location.pathname.startsWith("/set-password")) {
          window.location.replace("/set-password");
          return;
        }
      }
      if (!authSession) {
        setSession(null);
      } else if (!sessionRef.current) {
        // Fire-and-forget: non bloccare _notifyAllSubscribers
        loadProfile(authSession.user.id).then(profile => {
          if (profile) setSession(profile);
          setLoading(false);
        });
      }
    });

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<string | null> => {
    if (!supabaseReady) return "Supabase non configurato";
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return error.message;
      if (data.user) {
        const profile = await loadProfile(data.user.id);
        if (!profile) return "Profilo utente non trovato. Contatta l'amministratore.";
        setSession(profile);
        fetchFeatureState().then(setFeatureState);
      }
      return null;
    } catch (e) {
      return (e as Error).message || "Errore di connessione";
    }
  }, []);

  const logout = useCallback(async () => {
    setSession(null);
    try { await supabase.auth.signOut(); } catch {}
  }, []);

  const refresh = useCallback(async () => {
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (authSession?.user) {
        const profile = await loadProfile(authSession.user.id);
        if (profile) setSession(profile);
      }
    } catch {}
  }, []);

  const refreshFeatures = useCallback(() => {
    fetchFeatureState().then(setFeatureState);
  }, []);

  return (
    <AuthContext.Provider value={{ session, loading, disabledFeatures: featureState.disabled, featureState, login, logout, refresh, refreshFeatures }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
