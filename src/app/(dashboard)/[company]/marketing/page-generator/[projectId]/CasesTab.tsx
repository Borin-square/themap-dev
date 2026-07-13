"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { PgCaseStudy } from "@/lib/page-generator";

async function getToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || "";
}

export function CasesTab({
  projectId, casesPageUrl, showToast,
}: {
  projectId: string;
  casesPageUrl: string | null;
  showToast: (msg: string) => void;
}) {
  const [cases, setCases] = useState<PgCaseStudy[]>([]);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [customUrl, setCustomUrl] = useState("");
  const [editing, setEditing] = useState<PgCaseStudy | "new" | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const token = await getToken();
    const res = await fetch(`/api/page-generator/case-studies?project=${projectId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const { cases } = await res.json();
      setCases(cases);
    } else {
      showToast("Errore nel caricamento casi studio");
    }
    setLoading(false);
  }, [projectId, showToast]);

  useEffect(() => { load(); }, [load]);

  async function handleScrape() {
    const url = customUrl.trim() || casesPageUrl;
    if (!url) { showToast("Nessun URL configurato"); return; }
    setScraping(true);
    const token = await getToken();
    const res = await fetch("/api/page-generator/scrape-cases", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId, url: customUrl.trim() || undefined }),
    });
    const data = await res.json();
    setScraping(false);
    if (res.ok && data.count > 0) {
      showToast(`${data.count} casi studio importati`);
      setCustomUrl("");
      await load();
    } else {
      showToast(data.error || "Nessun caso studio trovato");
    }
  }

  async function handleDelete(id: string) {
    const token = await getToken();
    const res = await fetch(`/api/page-generator/case-studies/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      setCases((c) => c.filter((x) => x.id !== id));
      setConfirmDel(null);
      showToast("Caso studio eliminato");
    }
  }

  return (
    <div className="pg-lib">
      <div className="pg-lib-head">
        <div className="pg-scrape-box">
          <input
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            placeholder={casesPageUrl || "https://tuosito.it/casi-studio/"}
          />
          <button
            className="btn-save"
            onClick={handleScrape}
            disabled={scraping || (!customUrl.trim() && !casesPageUrl)}
          >
            {scraping ? "Estrazione..." : "Scrapa da URL"}
          </button>
        </div>
        <button className="comp-add" onClick={() => setEditing("new")}>+ Caso studio</button>
      </div>

      {loading ? (
        <div className="comp-empty">Caricamento...</div>
      ) : cases.length === 0 ? (
        <div className="comp-empty">
          Nessun caso studio. Scrapa dalla pagina configurata o aggiungi manualmente.
        </div>
      ) : (
        <div className="pg-cards">
          {cases.map((c) => (
            <div key={c.id} className="pg-card">
              <div className="pg-card-head">
                <div>
                  <div className="pg-card-name">{c.title}</div>
                  {(c.client || c.sector) && (
                    <div className="pg-card-sub">
                      {c.client}{c.client && c.sector ? " \u00B7 " : ""}{c.sector}
                    </div>
                  )}
                </div>
                <div className="pg-card-actions">
                  <button className="pg-btn-small" onClick={() => setEditing(c)}>Modifica</button>
                  {confirmDel === c.id ? (
                    <span className="fws-confirm">
                      <button className="fws-confirm-yes" onClick={() => handleDelete(c.id)}>Si</button>
                      <button className="fws-confirm-no" onClick={() => setConfirmDel(null)}>No</button>
                    </span>
                  ) : (
                    <button className="comp-del" onClick={() => setConfirmDel(c.id)}>&#10005;</button>
                  )}
                </div>
              </div>
              {c.summary && <div className="pg-card-body">{c.summary}</div>}
              {c.results && <div className="pg-card-results"><strong>Risultati:</strong> {c.results}</div>}
              {c.url && (
                <div className="pg-card-links">
                  <a href={c.url} target="_blank" rel="noreferrer">Apri caso studio</a>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {editing && (
        <CaseForm
          caseStudy={editing === "new" ? null : editing}
          projectId={projectId}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
          showToast={showToast}
        />
      )}
    </div>
  );
}

function CaseForm({
  caseStudy, projectId, onClose, onSaved, showToast,
}: {
  caseStudy: PgCaseStudy | null;
  projectId: string;
  onClose: () => void;
  onSaved: () => void;
  showToast: (msg: string) => void;
}) {
  const isNew = !caseStudy;
  const [title, setTitle] = useState(caseStudy?.title ?? "");
  const [client, setClient] = useState(caseStudy?.client ?? "");
  const [sector, setSector] = useState(caseStudy?.sector ?? "");
  const [summary, setSummary] = useState(caseStudy?.summary ?? "");
  const [results, setResults] = useState(caseStudy?.results ?? "");
  const [url, setUrl] = useState(caseStudy?.url ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    const token = await getToken();
    const payload = {
      title: title.trim(), client, sector, summary, results,
      url: url.trim() || null,
    };
    const res = isNew
      ? await fetch("/api/page-generator/case-studies", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ project_id: projectId, cases: [payload] }),
        })
      : await fetch(`/api/page-generator/case-studies/${caseStudy!.id}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
    setSaving(false);
    if (res.ok) {
      showToast(isNew ? "Caso studio creato" : "Caso studio aggiornato");
      onSaved();
    } else {
      showToast("Errore nel salvataggio");
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <h3>{isNew ? "Nuovo caso studio" : "Modifica caso studio"}</h3>

        <label>Titolo *</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />

        <div className="modal-row">
          <div>
            <label>Cliente</label>
            <input value={client} onChange={(e) => setClient(e.target.value)} />
          </div>
          <div>
            <label>Settore</label>
            <input value={sector} onChange={(e) => setSector(e.target.value)} />
          </div>
        </div>

        <label>Riassunto</label>
        <textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} />

        <label>Risultati chiave</label>
        <textarea rows={3} value={results} onChange={(e) => setResults(e.target.value)} placeholder="Es. +47% lead qualificati in 6 mesi..." />

        <label>URL (opzionale)</label>
        <input value={url} onChange={(e) => setUrl(e.target.value)} />

        <div className="modal-foot">
          <button className="btn-cancel" onClick={onClose}>Annulla</button>
          <button className="btn-save" onClick={handleSave} disabled={!title.trim() || saving}>
            {saving ? "Salvataggio..." : "Salva"}
          </button>
        </div>
      </div>
    </div>
  );
}
