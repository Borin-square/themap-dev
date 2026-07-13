"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  PG_STATUS_LABELS, PG_STATUS_COLORS, PG_PAGE_TYPES,
  type PgPage, type PgPageType, type PgStatus,
} from "@/lib/page-generator";

async function getToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || "";
}

export function PagesTab({
  projectId, companySlug, showToast,
}: {
  projectId: string;
  companySlug: string;
  showToast: (msg: string) => void;
}) {
  const [pages, setPages] = useState<PgPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<PgPageType | "">("");
  const [filterStatus, setFilterStatus] = useState<PgStatus | "">("");

  const load = useCallback(async () => {
    setLoading(true);
    const token = await getToken();
    const res = await fetch(`/api/page-generator/pages?project=${projectId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const { pages } = await res.json();
      setPages(pages);
    } else {
      showToast("Errore nel caricamento pagine");
    }
    setLoading(false);
  }, [projectId, showToast]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: string) {
    const token = await getToken();
    const res = await fetch(`/api/page-generator/pages/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      setPages((p) => p.filter((x) => x.id !== id));
      setConfirmDel(null);
      showToast("Pagina eliminata");
    } else {
      showToast("Errore nell'eliminazione");
    }
  }

  const pillarOptions = pages.filter((p) => p.page_type === "pillar");
  const filtered = pages.filter((p) => {
    if (filterType && p.page_type !== filterType) return false;
    if (filterStatus && p.status !== filterStatus) return false;
    return true;
  });

  return (
    <div className="pg-pages">
      <div className="pg-pages-head">
        <div className="mktg-filters" style={{ padding: 0, border: "none" }}>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value as PgPageType | "")}>
            <option value="">Tutti i tipi</option>
            <option value="pillar">Pillar</option>
            <option value="cluster">Cluster</option>
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as PgStatus | "")}>
            <option value="">Tutti gli stati</option>
            {(Object.keys(PG_STATUS_LABELS) as PgStatus[]).map((s) => (
              <option key={s} value={s}>{PG_STATUS_LABELS[s]}</option>
            ))}
          </select>
          <span className="mktg-count">{filtered.length} pagin{filtered.length === 1 ? "a" : "e"}</span>
        </div>
        <button className="comp-add" onClick={() => setCreating(true)}>+ Pagina</button>
      </div>

      {loading ? (
        <div className="comp-empty">Caricamento...</div>
      ) : filtered.length === 0 ? (
        <div className="comp-empty">
          {pages.length === 0
            ? "Nessuna pagina. Aggiungi la prima pillar o cluster per iniziare."
            : "Nessuna pagina con i filtri selezionati."}
        </div>
      ) : (
        <div className="mktg-table-wrap">
          <table className="mktg-table">
            <thead>
              <tr>
                <th>Titolo</th>
                <th>Tipo</th>
                <th>KW principale</th>
                <th>Pillar di rif.</th>
                <th>Info gain</th>
                <th>Stato</th>
                <th>Aggiornata</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const pillar = p.parent_pillar_id
                  ? pages.find((x) => x.id === p.parent_pillar_id)
                  : null;
                return (
                  <tr key={p.id} className="mktg-row">
                    <td className="mktg-td-name">
                      <Link
                        href={`/${companySlug}/marketing/page-generator/${projectId}/${p.id}`}
                        style={{ color: "var(--acc)" }}
                      >
                        {p.title || p.kw_main || "(senza titolo)"}
                      </Link>
                    </td>
                    <td>
                      <span className={`pg-type-badge pg-type-${p.page_type}`}>
                        {p.page_type === "pillar" ? "Pillar" : "Cluster"}
                      </span>
                    </td>
                    <td>{p.kw_main || "\u2014"}</td>
                    <td>{pillar ? (pillar.title || pillar.kw_main || "\u2014") : "\u2014"}</td>
                    <td>{p.info_gain_text ? "\u2713" : "\u2014"}</td>
                    <td>
                      <span className="mk-badge" style={{ background: PG_STATUS_COLORS[p.status] }}>
                        {PG_STATUS_LABELS[p.status]}
                      </span>
                    </td>
                    <td>{new Date(p.updated_at).toLocaleDateString("it-IT")}</td>
                    <td className="mktg-td-actions">
                      {confirmDel === p.id ? (
                        <span className="fws-confirm">
                          <button className="fws-confirm-yes" onClick={() => handleDelete(p.id)}>Si</button>
                          <button className="fws-confirm-no" onClick={() => setConfirmDel(null)}>No</button>
                        </span>
                      ) : (
                        <button className="comp-del" onClick={() => setConfirmDel(p.id)} title="Elimina">&#10005;</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <CreatePageModal
          projectId={projectId}
          companySlug={companySlug}
          pillarOptions={pillarOptions}
          onCreated={() => { setCreating(false); load(); }}
          onClose={() => setCreating(false)}
          showToast={showToast}
        />
      )}
    </div>
  );
}

/* ─────────────────────────  Create Modal  ───────────────────────── */

function CreatePageModal({
  projectId, companySlug, pillarOptions, onCreated, onClose, showToast,
}: {
  projectId: string;
  companySlug: string;
  pillarOptions: PgPage[];
  onCreated: () => void;
  onClose: () => void;
  showToast: (msg: string) => void;
}) {
  const [pageType, setPageType] = useState<PgPageType>("cluster");
  const [parentPillar, setParentPillar] = useState<string>("");
  const [kwMain, setKwMain] = useState("");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const [batchMode, setBatchMode] = useState(false);
  const [batchText, setBatchText] = useState("");

  async function createOne(kw: string, ttl?: string) {
    const token = await getToken();
    const res = await fetch("/api/page-generator/pages", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: projectId,
        page: {
          page_type: pageType,
          parent_pillar_id: pageType === "cluster" && parentPillar ? parentPillar : null,
          kw_main: kw,
          title: ttl ?? "",
        },
      }),
    });
    return res.ok;
  }

  async function handleSaveSingle() {
    if (!kwMain.trim()) return;
    setSaving(true);
    const ok = await createOne(kwMain.trim(), title.trim() || undefined);
    setSaving(false);
    if (ok) {
      showToast("Pagina creata");
      onCreated();
    } else {
      showToast("Errore nella creazione");
    }
  }

  async function handleSaveBatch() {
    const kws = batchText
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (kws.length === 0) return;
    setSaving(true);
    let ok = 0;
    for (const kw of kws) {
      if (await createOne(kw)) ok++;
    }
    setSaving(false);
    if (ok > 0) {
      showToast(`${ok} pagin${ok === 1 ? "a creata" : "e create"}`);
      onCreated();
    } else {
      showToast("Errore nella creazione");
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <h3>Nuova pagina</h3>

        <div className="modal-row">
          <div>
            <label>Tipo</label>
            <select value={pageType} onChange={(e) => setPageType(e.target.value as PgPageType)}>
              {PG_PAGE_TYPES.map((t) => (
                <option key={t} value={t}>{t === "pillar" ? "Pillar" : "Cluster"}</option>
              ))}
            </select>
          </div>
          {pageType === "cluster" && (
            <div>
              <label>Pillar di riferimento</label>
              <select value={parentPillar} onChange={(e) => setParentPillar(e.target.value)}>
                <option value="">Nessuna</option>
                {pillarOptions.map((p) => (
                  <option key={p.id} value={p.id}>{p.title || p.kw_main || "(senza nome)"}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="pg-mode-toggle">
          <button className={!batchMode ? "act" : ""} onClick={() => setBatchMode(false)}>Singola</button>
          <button className={batchMode ? "act" : ""} onClick={() => setBatchMode(true)}>Batch da CSV</button>
        </div>

        {!batchMode ? (
          <>
            <label>Keyword principale *</label>
            <input value={kwMain} onChange={(e) => setKwMain(e.target.value)} placeholder="Es. topical authority" autoFocus />

            <label>Titolo (opzionale)</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titolo H1 preferito (altrimenti Claude ne genera uno)" />

            <div className="modal-foot">
              <button className="btn-cancel" onClick={onClose}>Annulla</button>
              <button className="btn-save" onClick={handleSaveSingle} disabled={!kwMain.trim() || saving}>
                {saving ? "Creazione..." : "Crea"}
              </button>
            </div>
          </>
        ) : (
          <>
            <label>Keyword (una per riga, oppure separate da virgola)</label>
            <textarea
              rows={6}
              value={batchText}
              onChange={(e) => setBatchText(e.target.value)}
              placeholder={"topical authority\nsemantic seo\npillar page vs cluster page"}
              style={{ fontFamily: "monospace", fontSize: 12 }}
            />

            <div className="modal-foot">
              <button className="btn-cancel" onClick={onClose}>Annulla</button>
              <button className="btn-save" onClick={handleSaveBatch} disabled={!batchText.trim() || saving}>
                {saving ? "Creazione..." : "Crea tutte"}
              </button>
            </div>
          </>
        )}

        <div className="pg-hint" style={{ marginTop: 8 }}>
          Le KW create potranno essere modificate e arricchite (information gain, autori, casi studio) nell&apos;editor di ogni pagina.
        </div>
      </div>
    </div>
  );
}
