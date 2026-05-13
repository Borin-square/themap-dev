"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

export default function LoginPage() {
  const router = useRouter();
  const { login, session } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
    // redirect handled by useEffect when session updates
  }

  function fillDemo(e: string, p: string) {
    setEmail(e);
    setPassword(p);
    setError(null);
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

          <button className="login-btn" type="submit" disabled={loading}>
            {loading ? "Accesso in corso..." : "Accedi"}
          </button>
        </form>

        <div className="login-hint">
          <div className="login-hint-title">Account demo:</div>
          <div className="login-hint-item" onClick={() => fillDemo("admin@themap.it", "admin123!")}>
            admin@themap.it <span>ADMIN</span>
          </div>
          <div className="login-hint-item" onClick={() => fillDemo("marco@acme.com", "demo123!")}>
            marco@acme.com <span>OPERATIVO — Acme</span>
          </div>
          <div className="login-hint-item" onClick={() => fillDemo("anna@beta.com", "demo123!")}>
            anna@beta.com <span>OPERATIVO — Beta</span>
          </div>
          <div className="login-hint-item" onClick={() => fillDemo("luca@gamma.com", "demo123!")}>
            luca@gamma.com <span>OPERATIVO — Acme, Gamma</span>
          </div>
        </div>
      </div>
    </div>
  );
}
