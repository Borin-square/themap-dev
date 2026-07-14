"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { PgMedia, PgMediaType } from "@/lib/page-generator";
import { PG_MEDIA_TYPES } from "@/lib/page-generator";

async function getToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || "";
}

export function MediaPanel({
  pageId, companySlug, kwContext, showToast,
}: {
  pageId: string;
  companySlug: string;
  kwContext: string;
  showToast: (msg: string) => void;
}) {
  const [media, setMedia] = useState<PgMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [addingLink, setAddingLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkType, setLinkType] = useState<PgMediaType>("image");
  const [linkCaption, setLinkCaption] = useState("");
  const [autoAlt, setAutoAlt] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  const [exampleModalOpen, setExampleModalOpen] = useState(false);
  const [exampleLoading, setExampleLoading] = useState(false);
  const [exampleItems, setExampleItems] = useState<Array<{ src: string; alt: string; caption: string; width: string | null; height: string | null; sourceUrl: string }>>([]);
  const [exampleSources, setExampleSources] = useState<Array<{ url: string; ok: boolean; error: string | null; count: number }>>([]);
  const [importing, setImporting] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const token = await getToken();
    const res = await fetch(`/api/page-generator/media?page=${pageId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const { media } = await res.json();
      setMedia(media);
    }
    setLoading(false);
  }, [pageId]);

  useEffect(() => { load(); }, [load]);

  async function handleUpload(file: File) {
    setUploading(true);
    const token = await getToken();
    // 1. Upload al bucket
    const fd = new FormData();
    fd.append("file", file);
    fd.append("company", companySlug);
    const upRes = await fetch("/api/upload", { method: "POST", body: fd });
    if (!upRes.ok) {
      setUploading(false);
      showToast("Errore upload");
      return;
    }
    const { url, name } = await upRes.json();
    // 2. Crea media record
    const mediaType: PgMediaType = file.type.startsWith("video") ? "video" : "image";
    const res = await fetch("/api/page-generator/media", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        page_id: pageId,
        url,
        media_type: mediaType,
        caption: name,
        auto_alt: autoAlt,
        kw_context: kwContext,
      }),
    });
    setUploading(false);
    if (res.ok) {
      showToast("Media aggiunto");
      await load();
    } else {
      showToast("Errore salvataggio media");
    }
  }

  async function handleAddLink() {
    if (!linkUrl.trim()) return;
    setUploading(true);
    const token = await getToken();
    const res = await fetch("/api/page-generator/media", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        page_id: pageId,
        url: linkUrl.trim(),
        media_type: linkType,
        caption: linkCaption,
        auto_alt: autoAlt,
        kw_context: kwContext,
      }),
    });
    setUploading(false);
    if (res.ok) {
      setLinkUrl("");
      setLinkCaption("");
      setAddingLink(false);
      showToast("Media aggiunto");
      await load();
    } else {
      showToast("Errore salvataggio media");
    }
  }

  async function handleDelete(id: string) {
    const token = await getToken();
    const res = await fetch(`/api/page-generator/media/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      setMedia((m) => m.filter((x) => x.id !== id));
      showToast("Media eliminato");
    }
  }

  async function handleOpenExamples() {
    setExampleModalOpen(true);
    setExampleLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/page-generator/pages/${pageId}/example-media`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) { showToast(json.error || "Errore caricamento esempi"); return; }
      setExampleItems(json.items || []);
      setExampleSources(json.sources || []);
    } finally {
      setExampleLoading(false);
    }
  }

  async function handleImportExample(src: string, alt: string, caption: string) {
    if (importing.has(src)) return;
    setImporting((s) => new Set(s).add(src));
    try {
      const token = await getToken();
      const res = await fetch("/api/page-generator/media", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          page_id: pageId,
          url: src,
          media_type: "image",
          caption,
          alt_text: alt,
          auto_alt: autoAlt && !alt,
          kw_context: kwContext,
        }),
      });
      if (res.ok) {
        showToast("Immagine importata");
        await load();
      } else {
        showToast("Errore import");
      }
    } finally {
      setImporting((s) => {
        const n = new Set(s);
        n.delete(src);
        return n;
      });
    }
  }

  async function handleUpdateAlt(id: string, alt_text: string) {
    const token = await getToken();
    await fetch(`/api/page-generator/media/${id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ alt_text }),
    });
    setMedia((m) => m.map((x) => x.id === id ? { ...x, alt_text } : x));
  }

  return (
    <div className="pg-media-panel">
      <div className="pg-media-head">
        <h4>Media</h4>
        <div style={{ display: "flex", gap: 6 }}>
          <label className="pg-btn-small" style={{ cursor: "pointer" }}>
            {uploading ? "Upload..." : "Upload file"}
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
                if (fileRef.current) fileRef.current.value = "";
              }}
            />
          </label>
          <button className="pg-btn-small" onClick={() => setAddingLink((v) => !v)}>
            Link Drive
          </button>
          <button
            className="pg-btn-small"
            onClick={handleOpenExamples}
            title="Estrae le immagini dalle URL indicate in 'Esempi di design' della pagina"
          >
            Importa da esempi
          </button>
        </div>
      </div>

      <label className="pg-auto-alt">
        <input type="checkbox" checked={autoAlt} onChange={(e) => setAutoAlt(e.target.checked)} />
        Genera alt text automaticamente
      </label>

      {addingLink && (
        <div className="pg-add-link">
          <input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://drive.google.com/... o qualsiasi URL pubblico"
          />
          <select value={linkType} onChange={(e) => setLinkType(e.target.value as PgMediaType)}>
            {PG_MEDIA_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input
            value={linkCaption}
            onChange={(e) => setLinkCaption(e.target.value)}
            placeholder="Didascalia (opzionale)"
          />
          <button className="btn-save" onClick={handleAddLink} disabled={!linkUrl.trim() || uploading}>
            Aggiungi
          </button>
        </div>
      )}

      {loading ? (
        <div className="pg-hint">Caricamento...</div>
      ) : media.length === 0 ? (
        <div className="pg-hint" style={{ fontStyle: "italic" }}>
          Nessun media. Aggiungi immagini/video con upload o link Drive.
        </div>
      ) : (
        <div className="pg-media-list">
          {media.map((m) => (
            <div key={m.id} className="pg-media-item">
              {m.media_type === "image" ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={m.url} alt={m.alt_text} className="pg-media-thumb" />
              ) : (
                <div className="pg-media-thumb pg-media-placeholder">{m.media_type}</div>
              )}
              <div className="pg-media-info">
                <input
                  className="pg-media-alt"
                  value={m.alt_text}
                  onChange={(e) => setMedia((prev) => prev.map((x) => x.id === m.id ? { ...x, alt_text: e.target.value } : x))}
                  onBlur={(e) => handleUpdateAlt(m.id, e.target.value)}
                  placeholder="Alt text..."
                />
                {m.caption && <div className="pg-media-caption">{m.caption}</div>}
                <a href={m.url} target="_blank" rel="noreferrer" className="pg-media-url">Apri</a>
              </div>
              <button className="comp-del" onClick={() => handleDelete(m.id)}>&#10005;</button>
            </div>
          ))}
        </div>
      )}

      {exampleModalOpen && (
        <div className="pg-prompt-modal" role="dialog" aria-modal="true" onClick={() => setExampleModalOpen(false)}>
          <div className="pg-prompt-modal-body" onClick={(e) => e.stopPropagation()}>
            <div className="pg-prompt-modal-head">
              <div>
                <strong>Immagini dalle pagine esempio</strong>
                <span style={{ fontSize: 11, color: "var(--fg3)", marginLeft: 8 }}>
                  {exampleSources.length > 0 && `${exampleSources.filter((s) => s.ok).length}/${exampleSources.length} URL · ${exampleItems.length} immagini uniche`}
                </span>
              </div>
              <button className="pg-btn-small" onClick={() => setExampleModalOpen(false)}>Chiudi</button>
            </div>
            <div className="pg-prompt-modal-section">
              {exampleLoading ? (
                <div className="pg-hint">Caricamento immagini...</div>
              ) : exampleItems.length === 0 ? (
                <div className="pg-hint" style={{ fontStyle: "italic" }}>
                  {exampleSources.length === 0
                    ? "Nessuna URL negli 'Esempi di design' della pagina. Aggiungine dal pannello di sinistra."
                    : "Nessuna immagine trovata nelle URL indicate."}
                  {exampleSources.some((s) => !s.ok) && (
                    <div style={{ marginTop: 8, fontSize: 11 }}>
                      Errori: {exampleSources.filter((s) => !s.ok).map((s) => `${s.url}: ${s.error}`).join(" · ")}
                    </div>
                  )}
                </div>
              ) : (
                <div className="pg-example-grid">
                  {exampleItems.map((img) => (
                    <div key={img.src} className="pg-example-item">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.src} alt={img.alt} className="pg-example-thumb" />
                      <div className="pg-example-info">
                        <div className="pg-example-alt" title={img.alt}>{img.alt || <em>(nessun alt)</em>}</div>
                        {img.caption && <div className="pg-example-caption">{img.caption}</div>}
                        <div className="pg-example-source" title={img.sourceUrl}>
                          da {new URL(img.sourceUrl).pathname || "/"}
                        </div>
                        <button
                          className="pg-btn-small"
                          onClick={() => handleImportExample(img.src, img.alt, img.caption)}
                          disabled={importing.has(img.src)}
                        >
                          {importing.has(img.src) ? "..." : "Importa"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
