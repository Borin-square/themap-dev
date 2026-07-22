"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

interface Presentation {
  id: string;
  company_slug: string;
  title: string;
  file_url: string;
  file_path: string;
  created_at: string;
  updated_at: string;
}

async function getToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || "";
}

export default function VisionPage() {
  const params = useParams();
  const slug = params.company as string;

  const [items, setItems] = useState<Presentation[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [viewer, setViewer] = useState<Presentation | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const token = await getToken();
    const res = await fetch(`/api/holding-management/presentations?company=${encodeURIComponent(slug)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setItems(await res.json());
    setLoading(false);
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  async function handleUpload(file: File) {
    setError(null);
    if (file.type !== "application/pdf") { setError("Solo file PDF"); return; }
    setUploading(true);
    const token = await getToken();
    const fd = new FormData();
    fd.append("file", file);
    fd.append("company", slug);
    fd.append("title", file.name.replace(/\.pdf$/i, ""));
    const res = await fetch("/api/holding-management/presentations", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    setUploading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Upload fallito");
      return;
    }
    await load();
  }

  async function saveTitle(id: string) {
    const title = editTitle.trim();
    if (!title) { setEditing(null); return; }
    const token = await getToken();
    await fetch("/api/holding-management/presentations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id, title }),
    });
    setEditing(null);
    await load();
  }

  async function handleDelete(id: string) {
    const token = await getToken();
    await fetch("/api/holding-management/presentations", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id }),
    });
    setConfirmDel(null);
    await load();
  }

  function startEdit(p: Presentation) {
    setEditing(p.id);
    setEditTitle(p.title);
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Vision</h1>
        <button
          className="btn-save"
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
        >
          {uploading ? "Caricamento..." : "+ Carica PDF"}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleUpload(f);
            e.target.value = "";
          }}
        />
      </div>

      {error && (
        <div className="cd" style={{ color: "#ef4444", marginBottom: 12, padding: 12 }}>{error}</div>
      )}

      {loading ? (
        <div className="cd" style={{ color: "var(--fg3)", textAlign: "center", padding: 60 }}>
          Caricamento...
        </div>
      ) : items.length === 0 ? (
        <div className="cd" style={{ color: "var(--fg3)", textAlign: "center", padding: 60 }}>
          Nessuna presentazione. Carica il primo PDF per iniziare.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
          {items.map((p) => (
            <div key={p.id} className="cd" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              <div
                onClick={() => setViewer(p)}
                style={{
                  height: 140,
                  background: "var(--bg2)",
                  border: "1px solid var(--bd)",
                  borderRadius: 6,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  color: "var(--fg3)",
                  fontSize: 12,
                }}
                title="Apri fullscreen"
              >
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 34, opacity: 0.4 }}>{"\uD83D\uDCC4"}</div>
                  <div style={{ marginTop: 4 }}>Apri</div>
                </div>
              </div>

              {editing === p.id ? (
                <input
                  className="setting-input"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={() => saveTitle(p.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveTitle(p.id);
                    if (e.key === "Escape") setEditing(null);
                  }}
                  autoFocus
                  style={{ margin: 0 }}
                />
              ) : (
                <div
                  onClick={() => startEdit(p)}
                  style={{ fontWeight: 600, cursor: "text", wordBreak: "break-word" }}
                  title="Clicca per rinominare"
                >
                  {p.title}
                </div>
              )}

              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: "auto" }}>
                <button onClick={() => setViewer(p)}>Fullscreen</button>
                {confirmDel === p.id ? (
                  <>
                    <button className="ac-del" onClick={() => handleDelete(p.id)}>Si</button>
                    <button onClick={() => setConfirmDel(null)}>No</button>
                  </>
                ) : (
                  <button className="ac-del" onClick={() => setConfirmDel(p.id)}>Elimina</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {viewer && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setViewer(null); }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            zIndex: 100,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", color: "#fff" }}>
            <div style={{ fontWeight: 600 }}>{viewer.title}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <a
                href={viewer.file_url}
                target="_blank"
                rel="noreferrer"
                style={{ color: "#fff", background: "rgba(255,255,255,0.15)", padding: "6px 12px", borderRadius: 6, textDecoration: "none", fontSize: 13 }}
              >
                Apri in tab
              </a>
              <button
                onClick={() => setViewer(null)}
                style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "none", padding: "6px 12px", borderRadius: 6, cursor: "pointer" }}
              >
                Chiudi
              </button>
            </div>
          </div>
          <iframe
            src={`${viewer.file_url}#toolbar=1&view=FitH`}
            style={{ flex: 1, border: "none", background: "#fff" }}
            title={viewer.title}
          />
        </div>
      )}
    </div>
  );
}
