"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

export default function LoginPage() {
  const router = useRouter();
  const { login, session } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // If already logged in, redirect
  if (session) {
    router.replace("/");
    return null;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim()) { setError("Inserisci la tua email"); return; }
    setLoading(true);
    // Simulate async
    setTimeout(() => {
      const s = login(email);
      if (s) {
        router.replace("/");
      } else {
        setError("Email non autorizzata. Contatta l'amministratore.");
        setLoading(false);
      }
    }, 400);
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

          {error && <div className="login-error">{error}</div>}

          <button className="login-btn" type="submit" disabled={loading}>
            {loading ? "Accesso in corso..." : "Accedi"}
          </button>
        </form>

        <div className="login-hint">
          <div className="login-hint-title">Account demo:</div>
          <div className="login-hint-item" onClick={() => setEmail("admin@themap.it")}>
            admin@themap.it <span>ADMIN — Tutte le aziende</span>
          </div>
          <div className="login-hint-item" onClick={() => setEmail("marco@acme.com")}>
            marco@acme.com <span>OPERATIVO — Acme Corp</span>
          </div>
          <div className="login-hint-item" onClick={() => setEmail("anna@beta.com")}>
            anna@beta.com <span>OPERATIVO — Beta Srl</span>
          </div>
          <div className="login-hint-item" onClick={() => setEmail("luca@gamma.com")}>
            luca@gamma.com <span>OPERATIVO — Acme, Gamma</span>
          </div>
        </div>
      </div>
    </div>
  );
}
