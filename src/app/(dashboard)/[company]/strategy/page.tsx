"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { getCompany } from "@/lib/companies";
import { useAuth } from "@/components/AuthProvider";
import { isAdmin } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

interface StrategyDoc {
  id: string;
  company_slug: string;
  titolo: string;
  url: string;
  descrizione: string;
  created_at: string;
}

function toEmbedUrl(url: string): string {
  if (!url) return "";
  // Google Docs
  if (url.includes("docs.google.com/document")) return url.replace(/\/edit.*|\/view.*/, "/preview");
  // Google Slides
  if (url.includes("docs.google.com/presentation")) return url.replace(/\/edit.*|\/view.*/, "/embed?start=false&loop=false&delayms=3000");
  // Google Sheets
  if (url.includes("docs.google.com/spreadsheets")) return url.replace(/\/edit.*|\/view.*/, "/preview");
  // Drive file
  if (url.includes("drive.google.com/file")) return url.replace(/\/view.*/, "/preview");
  return url;
}

async function getToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || "";
}

export default function StrategyDeckPage() {
  const params = useParams();
  const slug = params.company as string;
  const company = getCompany(slug);
  const { session } = useAuth();
  const admin = isAdmin(session);

  const [docs, setDocs] = useState<StrategyDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<StrategyDoc | "new" | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [form, setForm] = useState({ titolo: "", url: "", descrizione: "" });

  const loadDocs = useCallback(async () => {
    const token = await getToken();
    const res = await fetch(`/api/strategy-docs?company=${slug}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setDocs(await res.json());
    setLoading(false);
  }, [slug]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  function startNew() {
    setForm({ titolo: "", url: "", descrizione: "" });
    setEditing("new");
  }

  function startEdit(doc: StrategyDoc) {
    setForm({ titolo: doc.titolo, url: doc.url, descrizione: doc.descrizione });
    setEditing(doc);
  }

  async function handleSave() {
    if (!form.titolo.trim()) return;
    const token = await getToken();
    const isNew = editing === "new";
    const body = isNew
      ? { company_slug: slug, ...form }
      : { id: (editing as StrategyDoc).id, ...form };

    await fetch("/api/strategy-docs", {
      method: isNew ? "POST" : "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });

    setEditing(null);
    loadDocs();
  }

  async function handleDelete(id: string) {
    const token = await getToken();
    await fetch("/api/strategy-docs", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id }),
    });
    loadDocs();
  }

  return (
    <div>
      <div className="ee-head">
        <div className="ee-title">
          {company && <span style={{ color: company.color }}>{"\u25A0"}</span>}
          {company?.name || slug} — Strategy Deck
        </div>
        {admin && (
          <button className="ee-btn ee-btn-primary" onClick={startNew}>+ Documento</button>
        )}
      </div>

      {loading && <div style={{ color: "var(--fg3)", fontSize: 13 }}>Caricamento...</div>}

      {!loading && docs.length === 0 && (
        <div className="cd" style={{ textAlign: "center", padding: 60, color: "var(--fg3)" }}>
          Nessun documento strategico.{admin && " Clicca + Documento per aggiungerne uno."}
        </div>
      )}

      <div className="sd-grid">
        {docs.map((doc) => (
          <div key={doc.id} className="sd-card">
            <div className="sd-card-head">
              <div className="sd-card-title">{doc.titolo}</div>
              {admin && (
                <div className="sd-card-actions">
                  <button className="btn-sm" onClick={() => startEdit(doc)}>Modifica</button>
                  <button className="btn-sm" style={{ color: "var(--red)" }} onClick={() => handleDelete(doc.id)}>Elimina</button>
                </div>
              )}
            </div>
            {doc.descrizione && <div className="sd-card-desc">{doc.descrizione}</div>}
            {doc.url && (
              <button className="sd-preview-btn" onClick={() => setPreview(preview === doc.id ? null : doc.id)}>
                {preview === doc.id ? "Chiudi anteprima" : "Anteprima"}
              </button>
            )}
            {doc.url && !toEmbedUrl(doc.url).startsWith("http") ? null : doc.url && (
              <a href={doc.url} target="_blank" rel="noopener noreferrer" className="sd-link">
                Apri originale &#8599;
              </a>
            )}
            {preview === doc.id && doc.url && (
              <div className="sd-embed">
                <iframe src={toEmbedUrl(doc.url)} allowFullScreen />
              </div>
            )}
          </div>
        ))}
      </div>

      {editing && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setEditing(null); }}>
          <div className="modal">
            <h3>{editing === "new" ? "Nuovo documento" : "Modifica documento"}</h3>
            <label>Titolo</label>
            <input value={form.titolo} onChange={(e) => setForm({ ...form, titolo: e.target.value })} autoFocus />
            <label>URL (Google Docs, Slides, Sheets, Drive)</label>
            <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://docs.google.com/..." />
            <label>Descrizione</label>
            <textarea value={form.descrizione} onChange={(e) => setForm({ ...form, descrizione: e.target.value })} />
            <div className="modal-foot">
              <button className="btn-cancel" onClick={() => setEditing(null)}>Annulla</button>
              <button className="btn-save" onClick={handleSave}>Salva</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
