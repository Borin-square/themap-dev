"use client";

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { COMPANIES, type Company } from "@/lib/companies";

interface Strategy {
  id: string;
  holding_slug: string;
  operative_slug: string;
  title: string;
  file_url: string;
  file_path: string;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

interface OwnershipRow { holding_slug: string; operative_slug: string }

function companyBySlug(slug: string): Company | undefined {
  return COMPANIES.find((c) => c.slug === slug);
}

function fmtItDate(iso: string): string {
  const d = new Date(iso);
  const gg = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${gg}/${mm}/${yyyy}`;
}

async function bearer(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || "";
}

export default function StrategiesPage() {
  const params = useParams();
  const holdingSlug = params.company as string;

  const [items, setItems] = useState<Strategy[]>([]);
  const [operatives, setOperatives] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadOp, setUploadOp] = useState<string>(""); // operativa scelta per l'upload
  const [filterOp, setFilterOp] = useState<Set<string>>(new Set());
  const [viewer, setViewer] = useState<Strategy | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const token = await bearer();
    const [strRes, ownRes] = await Promise.all([
      fetch(`/api/holding-management/strategies?holding=${encodeURIComponent(holdingSlug)}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch(`/api/holding-management/ownership?holding=${encodeURIComponent(holdingSlug)}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);
    if (strRes.ok) {
      const j = await strRes.json();
      setItems(j.rows || []);
    }
    let ops: Company[] = [];
    if (ownRes.ok) {
      const ownJson = await ownRes.json();
      const slugs = Array.from(new Set(((ownJson.rows || []) as OwnershipRow[]).map((r) => r.operative_slug)));
      ops = slugs
        .map((s) => companyBySlug(s))
        .filter((c): c is Company => !!c)
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    setOperatives(ops);
    setLoading(false);
  }, [holdingSlug]);

  useEffect(() => { load(); }, [load]);

  async function handleUpload(file: File) {
    setError(null);
    if (!uploadOp) { setError("Seleziona prima l'operativa"); return; }
    if (file.type !== "application/pdf") { setError("Solo file PDF"); return; }
    setUploading(true);
    const token = await bearer();
    const fd = new FormData();
    fd.append("file", file);
    fd.append("holding", holdingSlug);
    fd.append("operative", uploadOp);
    fd.append("title", file.name.replace(/\.pdf$/i, ""));
    const res = await fetch("/api/holding-management/strategies", {
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
    const j = await res.json();
    setItems((prev) => [j.row, ...prev]);
  }

  async function saveTitle(id: string) {
    const title = editTitle.trim();
    if (!title) { setEditing(null); return; }
    const token = await bearer();
    const res = await fetch("/api/holding-management/strategies", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id, title }),
    });
    setEditing(null);
    if (res.ok) {
      const j = await res.json();
      setItems((prev) => prev.map((x) => x.id === id ? j.row : x));
    }
  }

  async function handleDelete(id: string) {
    const token = await bearer();
    await fetch("/api/holding-management/strategies", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id }),
    });
    setConfirmDel(null);
    setItems((prev) => prev.filter((x) => x.id !== id));
  }

  // Operative disponibili per il filtro-chip: unione di quelle della holding
  // + eventuali operative presenti negli items (robustezza).
  const operativesForFilter = useMemo(() => {
    const map = new Map<string, Company>();
    for (const op of operatives) map.set(op.slug, op);
    for (const it of items) {
      if (map.has(it.operative_slug)) continue;
      const c = companyBySlug(it.operative_slug);
      if (c) map.set(c.slug, c);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [operatives, items]);

  const filtered = useMemo(() => {
    if (filterOp.size === 0) return items;
    return items.filter((x) => filterOp.has(x.operative_slug));
  }, [items, filterOp]);

  function toggleFilter(slug: string) {
    const n = new Set(filterOp);
    if (n.has(slug)) n.delete(slug); else n.add(slug);
    setFilterOp(n);
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Strategie sviluppo</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select
            value={uploadOp}
            onChange={(e) => setUploadOp(e.target.value)}
            style={{
              fontSize: 12, padding: "6px 10px", borderRadius: 4,
              border: "1px solid var(--bd)", background: "var(--cd)", color: "var(--fg)",
            }}
          >
            <option value="">Operativa…</option>
            {operatives.map((o) => <option key={o.slug} value={o.slug}>{o.name}</option>)}
          </select>
          <button
            className="btn-save"
            onClick={() => fileInput.current?.click()}
            disabled={uploading || !uploadOp}
            title={!uploadOp ? "Seleziona prima l'operativa" : "Carica PDF"}
          >
            {uploading ? "Caricamento…" : "+ Carica PDF"}
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
      </div>

      {error && (
        <div className="cd" style={{ color: "#ef4444", marginBottom: 12, padding: 12 }}>{error}</div>
      )}

      {operativesForFilter.length > 0 && (
        <div className="cd" style={{ padding: 10, marginBottom: 16, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, color: "var(--fg3)", minWidth: 60 }}>OPERATIVA</span>
          {operativesForFilter.map((op) => {
            const active = filterOp.has(op.slug);
            return (
              <button
                key={op.slug}
                onClick={() => toggleFilter(op.slug)}
                style={{
                  padding: "4px 10px",
                  fontSize: 11,
                  borderRadius: 999,
                  border: `1px solid ${active ? op.color : "var(--bd)"}`,
                  background: active ? `${op.color}22` : "transparent",
                  color: active ? "var(--fg)" : "var(--fg2)",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: op.color }} />
                {op.name}
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="cd" style={{ color: "var(--fg3)", textAlign: "center", padding: 60 }}>Caricamento…</div>
      ) : filtered.length === 0 ? (
        <div className="cd" style={{ color: "var(--fg3)", textAlign: "center", padding: 60 }}>
          {items.length === 0
            ? (operatives.length === 0
                ? "Questa holding non ha operative collegate (imposta le quote in Ownership)."
                : "Nessuna strategia caricata. Seleziona un'operativa in alto e carica il primo PDF.")
            : "Nessuna strategia per l'operativa selezionata"}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
          {filtered.map((s) => {
            const op = companyBySlug(s.operative_slug);
            return (
              <div key={s.id} className="cd" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10, borderLeft: `4px solid ${op?.color || "var(--bd)"}` }}>
                <div
                  onClick={() => setViewer(s)}
                  style={{
                    position: "relative",
                    aspectRatio: "16 / 9",
                    background: "#fff",
                    border: "1px solid var(--bd)",
                    borderRadius: 6,
                    cursor: "pointer",
                    overflow: "hidden",
                  }}
                  title="Apri fullscreen"
                >
                  <iframe
                    src={`${s.file_url}#page=1&view=Fit&toolbar=0&navpanes=0&scrollbar=0`}
                    style={{ width: "100%", height: "100%", border: "none", pointerEvents: "none", background: "#fff" }}
                    title={s.title}
                  />
                  <div style={{ position: "absolute", inset: 0, cursor: "pointer" }} />
                </div>

                {/* Meta: operativa + data caricamento */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10, fontWeight: 700, letterSpacing: 1.2 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: op?.color || "var(--fg3)" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: op?.color || "var(--fg3)" }} />
                    {op?.name || s.operative_slug}
                  </span>
                  <span style={{ color: "var(--fg3)", fontWeight: 500, letterSpacing: 0.5 }}>
                    {fmtItDate(s.created_at)}
                  </span>
                </div>

                {editing === s.id ? (
                  <input
                    className="setting-input"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onBlur={() => saveTitle(s.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveTitle(s.id);
                      if (e.key === "Escape") setEditing(null);
                    }}
                    autoFocus
                    style={{ margin: 0 }}
                  />
                ) : (
                  <div
                    onClick={() => { setEditing(s.id); setEditTitle(s.title); }}
                    style={{ fontWeight: 600, cursor: "text", wordBreak: "break-word", fontSize: 13 }}
                    title="Clicca per rinominare"
                  >
                    {s.title}
                  </div>
                )}

                {s.uploaded_by && (
                  <div style={{ fontSize: 10, color: "var(--fg3)" }}>Caricato da {s.uploaded_by}</div>
                )}

                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: "auto" }}>
                  <button onClick={() => setViewer(s)}>Fullscreen</button>
                  {confirmDel === s.id ? (
                    <>
                      <button className="ac-del" onClick={() => handleDelete(s.id)}>Si</button>
                      <button onClick={() => setConfirmDel(null)}>No</button>
                    </>
                  ) : (
                    <button className="ac-del" onClick={() => setConfirmDel(s.id)}>Elimina</button>
                  )}
                </div>
              </div>
            );
          })}
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
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontWeight: 600 }}>{viewer.title}</div>
              {(() => {
                const op = companyBySlug(viewer.operative_slug);
                return op && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "rgba(255,255,255,0.7)" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: op.color }} />
                    {op.name} · {fmtItDate(viewer.created_at)}
                  </span>
                );
              })()}
            </div>
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
