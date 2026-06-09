"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function SetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    let resolved = false;

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        setExpired(true);
      }
    }, 10000);

    function resolve(hasSession: boolean) {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      if (hasSession) setReady(true);
      else setExpired(true);
    }

    // L'SDK processa automaticamente #access_token=... dall'hash (implicit flow)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) resolve(true);
      else if (_event === "INITIAL_SESSION") resolve(false);
    });

    return () => {
      resolved = true;
      clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("La password deve essere di almeno 8 caratteri");
      return;
    }
    if (password !== confirm) {
      setError("Le password non coincidono");
      return;
    }

    setLoading(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) {
        setError(err.message);
        return;
      }

      // Pulisci la sessione recovery e forza un login pulito con la nuova password
      try { await supabase.auth.signOut(); } catch {}
      router.replace("/login");
    } catch (e) {
      setError((e as Error).message || "Errore durante il salvataggio");
    } finally {
      setLoading(false);
    }
  }

  if (expired) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-logo">THE MAP</div>
          <div className="login-subtitle">Link non valido o scaduto</div>
          <p style={{ fontSize: 13, color: "var(--fg2)", textAlign: "center", margin: "16px 0" }}>
            Chiedi all&apos;amministratore di inviarti un nuovo invito.
          </p>
          <button className="login-btn" onClick={() => router.replace("/login")}>
            Vai al login
          </button>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-logo">THE MAP</div>
          <div className="login-subtitle">Verifica in corso...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">THE MAP</div>
        <div className="login-subtitle">Imposta la tua password</div>

        <form onSubmit={handleSubmit}>
          <label className="login-label">Nuova password</label>
          <input
            className="login-input"
            type="password"
            placeholder="Almeno 8 caratteri"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />

          <label className="login-label" style={{ marginTop: 12 }}>Conferma password</label>
          <input
            className="login-input"
            type="password"
            placeholder="Ripeti la password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />

          {error && <div className="login-error">{error}</div>}

          <button className="login-btn" type="submit" disabled={loading}>
            {loading ? "Salvataggio..." : "Imposta password"}
          </button>
        </form>
      </div>
    </div>
  );
}
