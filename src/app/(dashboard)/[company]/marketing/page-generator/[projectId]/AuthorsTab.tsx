"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { PgAuthor } from "@/lib/page-generator";

async function getToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || "";
}

export function AuthorsTab({
  projectId, authorsPageUrl, showToast,
}: {
  projectId: string;
  authorsPageUrl: string | null;
  showToast: (msg: string) => void;
}) {
  const [authors, setAuthors] = useState<PgAuthor[]>([]);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [customUrl, setCustomUrl] = useState("");
  const [editing, setEditing] = useState<PgAuthor | "new" | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const token = await getToken();
    const res = await fetch(`/api/page-generator/authors?project=${projectId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const { authors } = await res.json();
      setAuthors(authors);
    } else {
      showToast("Errore nel caricamento autori");
    }
    setLoading(false);
  }, [projectId, showToast]);

  useEffect(() => { load(); }, [load]);

  async function handleScrape() {
    const url = customUrl.trim() || authorsPageUrl;
    if (!url) { showToast("Nessun URL configurato"); return; }
    setScraping(true);
    const token = await getToken();
    const res = await fetch("/api/page-generator/scrape-authors", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId, url: customUrl.trim() || undefined }),
    });
    const data = await res.json();
    setScraping(false);
    if (res.ok && data.count > 0) {
      showToast(`${data.count} autori importati`);
      setCustomUrl("");
      await load();
    } else {
      showToast(data.error || "Nessun autore trovato");
    }
  }

  async function handleDelete(id: string) {
    const token = await getToken();
    const res = await fetch(`/api/page-generator/authors/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      setAuthors((a) => a.filter((x) => x.id !== id));
      setConfirmDel(null);
      showToast("Autore eliminato");
    }
  }

  return (
    <div className="pg-lib">
      <div className="pg-lib-head">
        <div className="pg-scrape-box">
          <input
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            placeholder={authorsPageUrl || "https://tuosito.it/il-team/"}
          />
          <button
            className="btn-save"
            onClick={handleScrape}
            disabled={scraping || (!customUrl.trim() && !authorsPageUrl)}
          >
            {scraping ? "Estrazione..." : "Scrapa da URL"}
          </button>
        </div>
        <button className="comp-add" onClick={() => setEditing("new")}>+ Autore</button>
      </div>

      {loading ? (
        <div className="comp-empty">Caricamento...</div>
      ) : authors.length === 0 ? (
        <div className="comp-empty">
          Nessun autore. Scrapa dalla pagina configurata o aggiungi manualmente.
        </div>
      ) : (
        <div className="pg-cards">
          {authors.map((a) => (
            <div key={a.id} className="pg-card">
              <div className="pg-card-head">
                {a.photo_url && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={a.photo_url} alt={a.name} className="pg-avatar" />
                )}
                <div>
                  <div className="pg-card-name">{a.name}</div>
                  {a.role && <div className="pg-card-sub">{a.role}</div>}
                </div>
                <div className="pg-card-actions">
                  <button className="pg-btn-small" onClick={() => setEditing(a)}>Modifica</button>
                  {confirmDel === a.id ? (
                    <span className="fws-confirm">
                      <button className="fws-confirm-yes" onClick={() => handleDelete(a.id)}>Si</button>
                      <button className="fws-confirm-no" onClick={() => setConfirmDel(null)}>No</button>
                    </span>
                  ) : (
                    <button className="comp-del" onClick={() => setConfirmDel(a.id)}>&#10005;</button>
                  )}
                </div>
              </div>
              {a.bio && <div className="pg-card-body">{a.bio}</div>}
              {(a.linkedin_url || a.same_as.length > 0) && (
                <div className="pg-card-links">
                  {a.linkedin_url && <a href={a.linkedin_url} target="_blank" rel="noreferrer">LinkedIn</a>}
                  {a.same_as.map((u, i) => (
                    <a key={i} href={u} target="_blank" rel="noreferrer">{new URL(u).hostname}</a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {editing && (
        <AuthorForm
          author={editing === "new" ? null : editing}
          projectId={projectId}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
          showToast={showToast}
        />
      )}
    </div>
  );
}

function AuthorForm({
  author, projectId, onClose, onSaved, showToast,
}: {
  author: PgAuthor | null;
  projectId: string;
  onClose: () => void;
  onSaved: () => void;
  showToast: (msg: string) => void;
}) {
  const isNew = !author;
  const [name, setName] = useState(author?.name ?? "");
  const [role, setRole] = useState(author?.role ?? "");
  const [bio, setBio] = useState(author?.bio ?? "");
  const [photoUrl, setPhotoUrl] = useState(author?.photo_url ?? "");
  const [linkedin, setLinkedin] = useState(author?.linkedin_url ?? "");
  const [sameAs, setSameAs] = useState((author?.same_as ?? []).join("\n"));
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    const token = await getToken();
    const payload = {
      name: name.trim(),
      role, bio,
      photo_url: photoUrl.trim() || null,
      linkedin_url: linkedin.trim() || null,
      same_as: sameAs.split("\n").map((s) => s.trim()).filter(Boolean),
    };
    const res = isNew
      ? await fetch("/api/page-generator/authors", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ project_id: projectId, authors: [payload] }),
        })
      : await fetch(`/api/page-generator/authors/${author!.id}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
    setSaving(false);
    if (res.ok) {
      showToast(isNew ? "Autore creato" : "Autore aggiornato");
      onSaved();
    } else {
      showToast("Errore nel salvataggio");
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <h3>{isNew ? "Nuovo autore" : "Modifica autore"}</h3>

        <label>Nome *</label>
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />

        <label>Ruolo</label>
        <input value={role} onChange={(e) => setRole(e.target.value)} />

        <label>Bio</label>
        <textarea rows={4} value={bio} onChange={(e) => setBio(e.target.value)} />

        <label>Foto (URL)</label>
        <input value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} />

        <label>LinkedIn</label>
        <input value={linkedin} onChange={(e) => setLinkedin(e.target.value)} />

        <label>Altri URL profilo (sameAs, uno per riga)</label>
        <textarea rows={3} value={sameAs} onChange={(e) => setSameAs(e.target.value)} />

        <div className="modal-foot">
          <button className="btn-cancel" onClick={onClose}>Annulla</button>
          <button className="btn-save" onClick={handleSave} disabled={!name.trim() || saving}>
            {saving ? "Salvataggio..." : "Salva"}
          </button>
        </div>
      </div>
    </div>
  );
}
