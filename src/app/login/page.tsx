"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const { login, session } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    if (session) router.replace("/");
  }, [session, router]);

  if (session) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim()) { setError("Inserisci la tua email"); return; }
    if (!password) { setError("Inserisci la password"); return; }
    setLoading(true);
    const err = await login(email, password);
    if (err) {
      setError(err === "Invalid login credentials" ? "Email o password non validi." : err);
    }
    setLoading(false);
  }

  async function handleReset() {
    setError(null);
    if (!email.trim()) { setError("Inserisci la tua email per il recupero"); return; }
    setLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/set-password`,
    });
    setLoading(false);
    if (err) { setError(err.message); return; }
    setResetSent(true);
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">THE MAP</div>
        <div className="login-subtitle">Cruscotto di direzione</div>

        <form onSubmit={handleSubmit}>
          <label className="login-label">Email</label>
          <input
            className="login-input"
            type="email"
            placeholder="nome@azienda.it"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />

          <label className="login-label" style={{ marginTop: 12 }}>Password</label>
          <input
            className="login-input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error && <div className="login-error">{error}</div>}
          {resetSent && (
            <div style={{ fontSize: 13, color: "var(--grn, #22c55e)", margin: "8px 0" }}>
              Email inviata. Controlla la posta per reimpostare la password.
            </div>
          )}

          <button className="login-btn" type="submit" disabled={loading}>
            {loading ? "Accesso in corso..." : "Accedi"}
          </button>
        </form>

        <button
          onClick={handleReset}
          disabled={loading}
          style={{
            background: "none", border: "none", color: "var(--fg3)", fontSize: 12,
            cursor: "pointer", marginTop: 12, textDecoration: "underline",
          }}
        >
          Password dimenticata?
        </button>
      </div>
    </div>
  );
}
