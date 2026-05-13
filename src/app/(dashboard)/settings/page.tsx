"use client";

import { useState, useEffect } from "react";
import { fetchCompanies, getCachedCompanies, type Company } from "@/lib/companies";
import { useAuth } from "@/components/AuthProvider";
import { isAdmin, type Ruolo } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

interface UserProfile {
  id: string;
  email: string;
  nome: string;
  ruolo: Ruolo;
  funzione: string;
  aziende: string;
}

const FUNZIONI = ["", "OPERATION", "SALES", "MARKETING", "AMMINISTRAZIONE", "DIREZIONE"];
const FN_COLORS: Record<string, string> = {
  OPERATION: "#f59e0b", SALES: "#22c55e", MARKETING: "#a855f7",
  AMMINISTRAZIONE: "#ec4899", DIREZIONE: "#06b6d4",
};

type Tab = "accessi" | "aziende" | "generali";

async function getToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || "";
}

export default function SettingsPage() {
  const { session } = useAuth();
  const admin = isAdmin(session);
  const [tab, setTab] = useState<Tab>("accessi");
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [companies, setCompanies] = useState<Company[]>(getCachedCompanies);
  const [editing, setEditing] = useState<UserProfile | "new" | null>(null);
  const [confirmDel, setConfirmDel] = useState<UserProfile | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => { fetchCompanies().then(setCompanies); }, []);

  useEffect(() => {
    if (admin) loadUsers();
  }, [admin]);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  async function loadUsers() {
    const token = await getToken();
    const res = await fetch("/api/users", { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setUsers(await res.json());
  }

  async function handleSave(data: { id?: string; email: string; password?: string; nome: string; ruolo: Ruolo; funzione: string; aziende: string }) {
    const token = await getToken();
    const isEdit = !!data.id;

    const res = await fetch("/api/users", {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });

    const result = await res.json();
    if (!res.ok) { showToast(result.error || "Errore", false); return; }

    await loadUsers();
    setEditing(null);
    showToast(isEdit ? "Utente aggiornato" : "Utente creato");
  }

  async function handleDelete(user: UserProfile) {
    const token = await getToken();
    const res = await fetch("/api/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: user.id }),
    });

    if (!res.ok) {
      const r = await res.json();
      showToast(r.error || "Errore", false);
      return;
    }

    await loadUsers();
    setConfirmDel(null);
    showToast("Utente rimosso");
  }

  return (
    <div>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Settings</h1>

      {toast && (
        <div className="fws-toast" style={{ background: toast.ok ? "var(--grn)" : "#ef4444" }}>
          {toast.msg}
        </div>
      )}

      <div className="ee-subnav" style={{ marginBottom: 20 }}>
        {(["accessi", "aziende", "generali"] as Tab[]).map((t) => (
          <button key={t} className={`ee-tab${tab === t ? " active" : ""}`} onClick={() => setTab(t)}>
            {t === "accessi" ? "Gestione Accessi" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === "accessi" && (
        <div className="ac-page">
          <div className="ac-head">
            Gestione Accessi
            {admin && <button onClick={() => setEditing("new")}>+ Invita utente</button>}
          </div>

          {!admin && (
            <div className="ac-empty">Solo gli amministratori possono gestire gli accessi.</div>
          )}

          {admin && users.length === 0 && (
            <div className="ac-empty">Nessun utente configurato.</div>
          )}

          {admin && users.length > 0 && (
            <table className="ac-table">
              <thead>
                <tr>
                  <th>NOME</th>
                  <th>EMAIL</th>
                  <th>RUOLO</th>
                  <th>FUNZIONE</th>
                  <th>AZIENDE</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.nome || "\u2014"}</td>
                    <td className="ac-email">{u.email}</td>
                    <td>
                      <span className={`ac-ruolo ${u.ruolo === "ADMIN" ? "admin" : "operativo"}`}>
                        {u.ruolo}
                      </span>
                    </td>
                    <td>
                      {u.funzione ? (
                        <span className="ac-fn-tag" style={{
                          background: (FN_COLORS[u.funzione] || "#6b7280") + "22",
                          color: FN_COLORS[u.funzione] || "#6b7280",
                        }}>{u.funzione}</span>
                      ) : (
                        <span style={{ color: "var(--fg3)", fontSize: 11 }}>{"\u2014"}</span>
                      )}
                    </td>
                    <td>
                      <div className="ac-aziende">
                        {u.aziende === "*" ? (
                          <span className="ac-az-tag" style={{ background: "rgba(245,158,11,.15)", color: "#f59e0b" }}>Tutte</span>
                        ) : u.aziende ? (
                          u.aziende.split(",").map((az) => {
                            const slug = az.trim().toLowerCase();
                            const comp = companies.find((c) => c.slug === slug);
                            return (
                              <span key={az} className="ac-az-tag" style={{ borderLeft: `3px solid ${comp?.color || "var(--fg3)"}` }}>
                                {comp?.name || az.trim()}
                              </span>
                            );
                          })
                        ) : (
                          <span style={{ color: "var(--fg3)", fontSize: 11 }}>Nessuna</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="ac-actions">
                        <button onClick={() => setEditing(u)}>Modifica</button>
                        {u.email !== session?.email && (
                          <button className="ac-del" onClick={() => setConfirmDel(u)}>Elimina</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "aziende" && (
        <div style={{ maxWidth: 700 }}>
          <table className="ac-table">
            <thead><tr><th style={{ width: 48 }}>Colore</th><th>Nome</th><th>Slug</th></tr></thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.slug}>
                  <td><span className="ni-dot" style={{ background: c.color, display: "inline-block" }} /></td>
                  <td>{c.name}</td>
                  <td style={{ color: "var(--fg3)" }}>{c.slug}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "generali" && (
        <div className="cd" style={{ maxWidth: 480 }}>
          <label className="setting-label">Nome applicazione</label>
          <input className="setting-input" defaultValue="THE MAP" />
          <label className="setting-label" style={{ marginTop: 16 }}>Valuta predefinita</label>
          <input className="setting-input" defaultValue="EUR" />
          <div style={{ marginTop: 20 }}>
            <button className="btn-save" onClick={() => showToast("Impostazioni salvate")}>Salva</button>
          </div>
        </div>
      )}

      {confirmDel && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setConfirmDel(null); }}>
          <div className="modal" style={{ maxWidth: 380, textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 8, color: "#ef4444" }}>{"\u26A0"}</div>
            <h3>Rimuovi accesso</h3>
            <p style={{ fontSize: 13, color: "var(--fg2)", margin: "0 0 12px", lineHeight: 1.5 }}>
              L&apos;utente non potrà più accedere a The Map.
            </p>
            <div style={{ background: "var(--bg2)", border: "1px solid var(--bd)", borderRadius: 8, padding: "10px 16px", fontSize: 13, fontWeight: 600, color: "var(--fg)", marginBottom: 12 }}>
              {confirmDel.email}
            </div>
            <div className="modal-foot" style={{ justifyContent: "center" }}>
              <button className="btn-cancel" onClick={() => setConfirmDel(null)}>Annulla</button>
              <button className="btn-save" style={{ background: "#ef4444" }} onClick={() => handleDelete(confirmDel)}>Rimuovi</button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <UserModal
          user={editing === "new" ? null : editing}
          companies={companies}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function UserModal({
  user, companies, onSave, onClose,
}: {
  user: UserProfile | null;
  companies: Company[];
  onSave: (data: { id?: string; email: string; password?: string; nome: string; ruolo: Ruolo; funzione: string; aziende: string }) => void;
  onClose: () => void;
}) {
  const isEdit = !!user;
  const [email, setEmail] = useState(user?.email || "");
  const [password, setPassword] = useState("");
  const [nome, setNome] = useState(user?.nome || "");
  const [ruolo, setRuolo] = useState<Ruolo>(user?.ruolo || "OPERATIVO");
  const [funzione, setFunzione] = useState(user?.funzione || "");
  const [allAz, setAllAz] = useState(user?.aziende === "*" || !user);
  const [selectedAz, setSelectedAz] = useState<string[]>(() => {
    if (!user || user.aziende === "*") return companies.map((c) => c.slug);
    return user.aziende.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  });

  function toggleAz(slug: string) {
    setSelectedAz((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  }

  function handleSave() {
    if (!email.trim()) return;
    if (!isEdit && !password) return;
    const aziende = allAz ? "*" : selectedAz.join(",");
    onSave({
      ...(isEdit ? { id: user!.id } : {}),
      email: email.trim().toLowerCase(),
      ...(password ? { password } : {}),
      nome, ruolo, funzione, aziende,
    });
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <h3>{isEdit ? "Modifica" : "Invita"} Utente</h3>

        <label>Nome</label>
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome e cognome" />

        <label>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          readOnly={isEdit} style={isEdit ? { opacity: 0.6 } : undefined} />

        {!isEdit && (
          <>
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 6 caratteri" />
          </>
        )}

        <div className="modal-row">
          <div>
            <label>Ruolo</label>
            <select value={ruolo} onChange={(e) => setRuolo(e.target.value as Ruolo)}>
              <option value="OPERATIVO">OPERATIVO</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </div>
          <div>
            <label>Funzione</label>
            <select value={funzione} onChange={(e) => setFunzione(e.target.value)}>
              {FUNZIONI.map((f) => <option key={f} value={f}>{f || "\u2014"}</option>)}
            </select>
          </div>
        </div>

        <label>Aziende visibili</label>
        <div className="ac-az-checks">
          <label className="ac-az-check">
            <input type="checkbox" checked={allAz} onChange={(e) => {
              setAllAz(e.target.checked);
              if (e.target.checked) setSelectedAz(companies.map((c) => c.slug));
            }} />
            <b>Tutte</b>
          </label>
          {companies.map((c) => (
            <label key={c.slug} className="ac-az-check">
              <input type="checkbox" checked={allAz || selectedAz.includes(c.slug)}
                disabled={allAz} onChange={() => toggleAz(c.slug)} />
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <span className="ni-dot" style={{ background: c.color, width: 8, height: 8 }} />
                {c.name}
              </span>
            </label>
          ))}
        </div>

        <div className="modal-foot">
          <button className="btn-cancel" onClick={onClose}>Annulla</button>
          <button className="btn-save" onClick={handleSave}>Salva</button>
        </div>
      </div>
    </div>
  );
}
