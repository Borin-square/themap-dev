"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useLocalState } from "@/lib/useLocalState";
import { getMockGEOProject } from "@/lib/geo/mock";
import { AuditLogPanel } from "@/components/AuditLogPanel";
import type {
  GEOProject,
  KGAudit,
  KGAnalysis,
  KGExtractedUrl,
  KGSuggestion,
  KGSchemaAnalysis,
} from "@/lib/geo/types";

const MAX_URLS = 10;

async function getToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || "";
}

interface DbRow {
  id: string;
  url: string;
  extracted_blocks: KGExtractedUrl["blocks"] | null;
  extracted_at: string | null;
  analysis: KGAnalysis | null;
  accepted_suggestions: string[] | null;
  skipped_suggestions: string[] | null;
  suggestion_overrides: Record<string, unknown> | null;
  final_markup: string | null;
  updated_at: string;
}

function rowToAudit(row: DbRow): KGAudit {
  const extracted: KGExtractedUrl | undefined = row.extracted_at
    ? {
        url: row.url,
        status: (row.extracted_blocks?.length ?? 0) > 0 ? "ok" : "no-jsonld",
        blocks: row.extracted_blocks ?? [],
        extractedAt: row.extracted_at,
      }
    : undefined;
  return {
    id: row.id,
    url: row.url,
    extracted,
    analysis: row.analysis ?? undefined,
    acceptedSuggestionIds: row.accepted_suggestions ?? [],
    skippedSuggestionIds: row.skipped_suggestions ?? [],
    suggestionOverrides: row.suggestion_overrides ?? {},
    finalMarkup: row.final_markup ?? undefined,
    updatedAt: row.updated_at,
  };
}

export default function KGOptimizerPage() {
  const params = useParams();
  const slug = params.company as string;

  const [project] = useLocalState<GEOProject>(`themap:${slug}:geoProject`, getMockGEOProject);
  const config = project.config;

  const [audits, setAudits] = useState<KGAudit[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [urlsInput, setUrlsInput] = useState("");
  const [showInput, setShowInput] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyKind, setBusyKind] = useState<"analyze" | "generate" | "delete" | null>(null);
  const [busyElapsed, setBusyElapsed] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [viewMarkup, setViewMarkup] = useState<KGAudit | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  /* ── Load audits from Supabase ── */
  const loadAudits = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(`/api/geo/kg?company=${slug}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const list = (data.audits as DbRow[]).map(rowToAudit);
      setAudits(list);
    } catch {
      // silently fail — page works without persistence
    } finally {
      setLoaded(true);
    }
  }, [slug]);

  useEffect(() => { loadAudits(); }, [loadAudits]);

  // Timer per mostrare quanto dura l'operazione in corso
  useEffect(() => {
    if (!busyId) { setBusyElapsed(0); return; }
    const start = Date.now();
    setBusyElapsed(0);
    const i = setInterval(() => setBusyElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(i);
  }, [busyId]);

  /* ── Save single audit to Supabase ── */
  async function saveAudit(audit: KGAudit, fields: Partial<{ extracted: boolean; analysis: boolean; accepted: boolean; skipped: boolean; overrides: boolean; markup: boolean }>) {
    try {
      const token = await getToken();
      const body: Record<string, unknown> = { company_slug: slug, url: audit.url };
      if (fields.extracted && audit.extracted) body.extracted = audit.extracted;
      if (fields.analysis && audit.analysis) body.analysis = audit.analysis;
      if (fields.accepted) body.accepted_suggestions = audit.acceptedSuggestionIds;
      if (fields.skipped) body.skipped_suggestions = audit.skippedSuggestionIds;
      if (fields.overrides) body.suggestion_overrides = audit.suggestionOverrides;
      if (fields.markup) body.final_markup = audit.finalMarkup ?? "";
      const res = await fetch("/api/geo/kg", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(`Salvataggio fallito: ${err.error ?? res.status}`);
        return null;
      }
      const data = await res.json();
      return data.audit?.id as string | undefined;
    } catch {
      showToast("Errore di rete nel salvataggio");
      return null;
    }
  }

  /* ── Extract ── */
  async function handleExtract() {
    const lines = urlsInput
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      showToast("Inserisci almeno un URL");
      return;
    }
    if (lines.length > MAX_URLS) {
      showToast(`Max ${MAX_URLS} URL per batch`);
      return;
    }
    setExtracting(true);
    try {
      const res = await fetch("/api/geo/kg/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: lines }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Errore extract");
        return;
      }
      const results = data.results as KGExtractedUrl[];

      // Merge with existing audits (by URL) — preserve analysis/accepted if same URL
      const next = [...audits];
      const newlyExtracted: KGAudit[] = [];
      for (const r of results) {
        const existingIdx = next.findIndex((a) => a.url === r.url);
        if (existingIdx >= 0) {
          const merged: KGAudit = {
            ...next[existingIdx],
            extracted: r,
            // se la struttura dei blocchi cambia, l'analisi precedente potrebbe non essere piu' coerente — la teniamo ma flagghiamo
            updatedAt: new Date().toISOString(),
          };
          next[existingIdx] = merged;
          newlyExtracted.push(merged);
        } else {
          const created: KGAudit = {
            id: crypto.randomUUID(),
            url: r.url,
            extracted: r,
            acceptedSuggestionIds: [],
            skippedSuggestionIds: [],
            suggestionOverrides: {},
            updatedAt: new Date().toISOString(),
          };
          next.push(created);
          newlyExtracted.push(created);
        }
      }
      setAudits(next);
      setUrlsInput("");
      setShowInput(false);

      // Persist each
      for (const a of newlyExtracted) {
        const newId = await saveAudit(a, { extracted: true });
        if (newId && newId !== a.id) {
          // replace local id with DB id
          setAudits((prev) => prev.map((p) => (p.url === a.url ? { ...p, id: newId } : p)));
        }
      }
      showToast(`Estratti ${results.length} URL`);
    } catch {
      showToast("Errore di rete");
    } finally {
      setExtracting(false);
    }
  }

  /* ── Analyze ── */
  async function handleAnalyze(audit: KGAudit) {
    if (!audit.extracted) return;
    if (!config.brandName?.trim()) {
      showToast("Configura il brand name in Settings prima di analizzare");
      return;
    }
    setBusyId(audit.id);
    setBusyKind("analyze");
    try {
      const res = await fetch("/api/geo/kg/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: audit.url,
          blocks: audit.extracted.blocks,
          brandName: config.brandName,
          siteUrl: config.siteUrl,
          industry: config.industry,
          services: config.services,
          country: config.country,
          competitors: config.competitors,
        }),
      });
      // Vercel/edge timeout puo' restituire HTML 504/502 — gestiamo il caso
      const text = await res.text();
      let data: unknown;
      try { data = JSON.parse(text); }
      catch { data = { error: `Risposta non-JSON dal server (HTTP ${res.status}). Probabile timeout della funzione.` }; }
      if (!res.ok) {
        const err = (data as { error?: string }).error || `HTTP ${res.status}`;
        showToast(`Analyze: ${err}`);
        return;
      }
      const analysis = data as KGAnalysis;
      const updated: KGAudit = {
        ...audit,
        analysis,
        acceptedSuggestionIds: [],
        skippedSuggestionIds: [],
        suggestionOverrides: {},
        updatedAt: new Date().toISOString(),
      };
      setAudits((prev) => prev.map((a) => (a.id === audit.id ? updated : a)));
      await saveAudit(updated, { analysis: true, accepted: true, skipped: true, overrides: true });
      setExpandedId(audit.id);
      showToast("Analisi completata");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore di rete";
      showToast(`Errore di rete: ${msg}`);
    } finally {
      setBusyId(null);
      setBusyKind(null);
    }
  }

  /* ── Imposta stato di un suggerimento (accepted | skipped | pending) ── */
  function setSuggestionStatus(audit: KGAudit, suggestionId: string, status: "accepted" | "skipped" | "pending") {
    const accepted = audit.acceptedSuggestionIds.filter((id) => id !== suggestionId);
    const skipped = audit.skippedSuggestionIds.filter((id) => id !== suggestionId);
    if (status === "accepted") accepted.push(suggestionId);
    if (status === "skipped") skipped.push(suggestionId);
    const updated: KGAudit = {
      ...audit,
      acceptedSuggestionIds: accepted,
      skippedSuggestionIds: skipped,
      updatedAt: new Date().toISOString(),
    };
    setAudits((prev) => prev.map((a) => (a.id === audit.id ? updated : a)));
    void saveAudit(updated, { accepted: true, skipped: true });
  }

  /* ── Salva un override del proposedValue ── */
  function updateOverride(audit: KGAudit, suggestionId: string, newValue: unknown) {
    const next = { ...audit.suggestionOverrides, [suggestionId]: newValue };
    const updated: KGAudit = { ...audit, suggestionOverrides: next, updatedAt: new Date().toISOString() };
    setAudits((prev) => prev.map((a) => (a.id === audit.id ? updated : a)));
    void saveAudit(updated, { overrides: true });
  }

  /* ── Rimuovi un override (torna al proposto LLM) ── */
  function clearOverride(audit: KGAudit, suggestionId: string) {
    const next = { ...audit.suggestionOverrides };
    delete next[suggestionId];
    const updated: KGAudit = { ...audit, suggestionOverrides: next, updatedAt: new Date().toISOString() };
    setAudits((prev) => prev.map((a) => (a.id === audit.id ? updated : a)));
    void saveAudit(updated, { overrides: true });
  }

  /* ── Generate final markup ── */
  async function handleGenerate(audit: KGAudit) {
    if (!audit.extracted || !audit.analysis) return;
    const allSuggestions = collectAllSuggestions(audit.analysis);
    const accepted = allSuggestions
      .filter((s) => audit.acceptedSuggestionIds.includes(s.id))
      .map((s) =>
        Object.prototype.hasOwnProperty.call(audit.suggestionOverrides, s.id)
          ? { ...s, proposedValue: audit.suggestionOverrides[s.id] }
          : s,
      );
    if (accepted.length === 0) {
      showToast("Accetta almeno un suggerimento prima di generare");
      return;
    }
    setBusyId(audit.id);
    setBusyKind("generate");
    try {
      const res = await fetch("/api/geo/kg/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocks: audit.extracted.blocks, acceptedSuggestions: accepted }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Errore generate");
        return;
      }
      const updated: KGAudit = { ...audit, finalMarkup: data.finalMarkup, updatedAt: new Date().toISOString() };
      setAudits((prev) => prev.map((a) => (a.id === audit.id ? updated : a)));
      await saveAudit(updated, { markup: true });
      setViewMarkup(updated);
    } catch {
      showToast("Errore di rete");
    } finally {
      setBusyId(null);
      setBusyKind(null);
    }
  }

  /* ── Delete audit ── */
  async function handleDelete(audit: KGAudit) {
    setBusyId(audit.id);
    setBusyKind("delete");
    try {
      const token = await getToken();
      await fetch(`/api/geo/kg?id=${audit.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setAudits((prev) => prev.filter((a) => a.id !== audit.id));
      if (expandedId === audit.id) setExpandedId(null);
      showToast("Eliminato");
    } finally {
      setBusyId(null);
      setBusyKind(null);
    }
  }

  return (
    <div className="geo-page">
      {toast && <div className="fws-toast">{toast}</div>}

      <div className="geo-head">
        <h1 className="geo-title">Knowledge Graph Optimizer</h1>
        <div className="geo-head-actions">
          <button className="geo-btn geo-btn-accent" onClick={() => setShowInput((v) => !v)}>
            {showInput ? "Chiudi" : "+ URL"}
          </button>
        </div>
      </div>

      <div style={{ fontSize: 12, color: "var(--fg2)", marginTop: -8, marginBottom: 12 }}>
        Estrai JSON-LD da una o piu' pagine, analizza con LLM (validita' schema.org + Google Rich Results + ottimizzazione Knowledge Graph), accetta i suggerimenti e genera il markup finale pronto da incollare.
      </div>

      <div className="geo-page-box">
        {showInput && (
          <div className="geo-section-card" style={{ padding: 12, marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: "var(--fg2)", marginBottom: 6 }}>
              Incolla fino a {MAX_URLS} URL, uno per riga
            </div>
            <textarea
              className="geo-add-input"
              rows={5}
              placeholder="https://example.com/pagina-1&#10;https://example.com/pagina-2"
              value={urlsInput}
              onChange={(e) => setUrlsInput(e.target.value)}
              style={{ width: "100%", fontFamily: "monospace", fontSize: 12 }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button
                className="geo-btn geo-btn-accent"
                disabled={extracting || !urlsInput.trim()}
                onClick={handleExtract}
              >
                {extracting ? "Estrazione..." : "Estrai dati strutturati"}
              </button>
              <button className="geo-btn" onClick={() => { setUrlsInput(""); setShowInput(false); }}>
                Annulla
              </button>
            </div>
          </div>
        )}

        {!loaded && <div className="geo-empty">Caricamento...</div>}

        {loaded && audits.length === 0 && !showInput && (
          <div className="geo-empty">
            <div className="geo-empty-title">Nessun audit</div>
            Clicca <strong>+ URL</strong> per iniziare. Puoi caricare fino a {MAX_URLS} URL alla volta.
          </div>
        )}

        {audits.length > 0 && (
          <div className="geo-table-wrap">
            <table className="geo-table">
              <thead>
                <tr>
                  <th>URL</th>
                  <th>Stato</th>
                  <th>Blocchi JSON-LD</th>
                  <th>Schema trovati</th>
                  <th>Analisi</th>
                  <th>Suggerimenti accettati</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {audits.map((a) => (
                  <AuditRow
                    key={a.id}
                    audit={a}
                    expanded={expandedId === a.id}
                    busy={busyId === a.id ? busyKind : null}
                    busyElapsed={busyId === a.id ? busyElapsed : 0}
                    onToggleExpand={() => setExpandedId(expandedId === a.id ? null : a.id)}
                    onAnalyze={() => handleAnalyze(a)}
                    onSetStatus={(sid, status) => setSuggestionStatus(a, sid, status)}
                    onUpdateOverride={(sid, value) => updateOverride(a, sid, value)}
                    onClearOverride={(sid) => clearOverride(a, sid)}
                    onGenerate={() => handleGenerate(a)}
                    onViewMarkup={() => setViewMarkup(a)}
                    onDelete={() => handleDelete(a)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {viewMarkup?.finalMarkup && (
        <MarkupModal
          audit={viewMarkup}
          onClose={() => setViewMarkup(null)}
          onCopy={() => {
            navigator.clipboard.writeText(viewMarkup.finalMarkup!);
            showToast("Copiato!");
          }}
        />
      )}
    </div>
  );
}

/* ── helpers ── */

function collectAllSuggestions(analysis: KGAnalysis): KGSuggestion[] {
  const list: KGSuggestion[] = [];
  for (const s of analysis.schemas) list.push(...s.suggestions);
  list.push(...analysis.newSchemas);
  return list;
}

function statusBadge(status?: string): { label: string; cls: string } {
  if (status === "ok") return { label: "OK", cls: "geo-tag-yes" };
  if (status === "no-jsonld") return { label: "0 JSON-LD", cls: "geo-tag-no" };
  if (status === "fetch-error") return { label: "Errore", cls: "geo-tag-no" };
  return { label: "—", cls: "" };
}

/* ── Audit Row ── */

function AuditRow({
  audit, expanded, busy, busyElapsed, onToggleExpand, onAnalyze, onSetStatus, onUpdateOverride, onClearOverride, onGenerate, onViewMarkup, onDelete,
}: {
  audit: KGAudit;
  expanded: boolean;
  busy: "analyze" | "generate" | "delete" | null;
  busyElapsed: number;
  onToggleExpand: () => void;
  onAnalyze: () => void;
  onSetStatus: (id: string, status: "accepted" | "skipped" | "pending") => void;
  onUpdateOverride: (id: string, value: unknown) => void;
  onClearOverride: (id: string) => void;
  onGenerate: () => void;
  onViewMarkup: () => void;
  onDelete: () => void;
}) {
  const ex = audit.extracted;
  const badge = statusBadge(ex?.status);
  const schemaTypes = ex?.blocks.map((b) => b.schemaType).join(", ") || "—";
  const allSug = audit.analysis ? collectAllSuggestions(audit.analysis) : [];
  const acceptedCount = allSug.filter((s) => audit.acceptedSuggestionIds.includes(s.id)).length;

  return (
    <>
      <tr className={`geo-row${expanded ? " geo-row-expanded" : ""}`}>
        <td className="geo-td-prompt" onClick={onToggleExpand} style={{ cursor: "pointer", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={audit.url}>
          {audit.url}
        </td>
        <td>
          <span className={`geo-tag ${badge.cls}`}>{badge.label}</span>
          {ex?.jsRenderedHint && (
            <span className="geo-tag geo-tag-no" title="La pagina sembra essere JS-app: il JSON-LD potrebbe essere iniettato lato client e non rilevabile">JS</span>
          )}
        </td>
        <td className="geo-td-num">{ex?.blocks.length ?? 0}</td>
        <td className="geo-td-schemas" title={schemaTypes}>{schemaTypes}</td>
        <td>
          {audit.analysis ? (
            <span className="geo-tag geo-tag-yes">{allSug.length} suggest.</span>
          ) : (
            <span className="geo-na">—</span>
          )}
        </td>
        <td className="geo-td-num">
          {audit.analysis ? `${acceptedCount}/${allSug.length}` : <span className="geo-na">—</span>}
        </td>
        <td className="geo-td-actions" onClick={(e) => e.stopPropagation()}>
          {ex?.status === "ok" && (
            <button
              className="geo-btn-small"
              onClick={onAnalyze}
              disabled={busy !== null}
              title="Analizza con LLM (Claude Haiku)"
            >
              {busy === "analyze" ? `Analisi... ${busyElapsed}s` : audit.analysis ? "Re-analizza" : "Analizza"}
            </button>
          )}
          {audit.analysis && acceptedCount > 0 && (
            <button
              className="geo-btn-small"
              onClick={onGenerate}
              disabled={busy !== null}
              title="Genera JSON-LD finale"
            >
              {busy === "generate" ? `Generazione... ${busyElapsed}s` : "Genera"}
            </button>
          )}
          {audit.finalMarkup && (
            <button className="geo-btn-small" onClick={onViewMarkup} title="Vedi markup generato">
              Markup
            </button>
          )}
          <button className="comp-del" onClick={onDelete} disabled={busy !== null} title="Elimina">{"\u2715"}</button>
        </td>
      </tr>
      {expanded && (
        <tr className="geo-row-detail">
          <td colSpan={7}>
            <AuditDetail
              audit={audit}
              onSetStatus={onSetStatus}
              onUpdateOverride={onUpdateOverride}
              onClearOverride={onClearOverride}
            />
          </td>
        </tr>
      )}
    </>
  );
}

/* ── Audit Detail (expanded) ── */

function AuditDetail({ audit, onSetStatus, onUpdateOverride, onClearOverride }: {
  audit: KGAudit;
  onSetStatus: (id: string, status: "accepted" | "skipped" | "pending") => void;
  onUpdateOverride: (id: string, value: unknown) => void;
  onClearOverride: (id: string) => void;
}) {
  const ex = audit.extracted;

  if (!ex) return <div className="geo-detail-empty">Nessuna estrazione.</div>;

  if (ex.status === "fetch-error") {
    return (
      <div style={{ padding: 16 }}>
        <div className="geo-audit-issue geo-audit-issue-critical">
          <div className="geo-audit-issue-msg">Errore di fetch: {ex.error || `HTTP ${ex.httpStatus}`}</div>
          <div className="geo-audit-issue-fix">
            Possibili cause: sito offline, blocco WAF (Cloudflare/Akamai), redirect a login. Prova con un altro URL o controlla il sito.
          </div>
        </div>
      </div>
    );
  }

  if (ex.status === "no-jsonld") {
    return (
      <div style={{ padding: 16 }}>
        <div className="geo-audit-issue geo-audit-issue-warning">
          <div className="geo-audit-issue-msg">Nessun blocco JSON-LD trovato nella pagina.</div>
          {ex.jsRenderedHint ? (
            <div className="geo-audit-issue-fix">
              La pagina sembra un&apos;app JavaScript (Next.js / SPA): il JSON-LD potrebbe essere iniettato lato client e non visibile a un fetch HTML standard. Questo tool non supporta rendering JS.
            </div>
          ) : (
            <div className="geo-audit-issue-fix">
              Aggiungi almeno uno schema Organization + WebSite nella pagina come <code>&lt;script type=&quot;application/ld+json&quot;&gt;</code> nel <code>&lt;head&gt;</code>.
            </div>
          )}
          {ex.hasMicrodata && (
            <div className="geo-audit-issue-fix">Nota: trovati attributi <code>itemscope</code> (microdata) — meglio migrare a JSON-LD.</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Blocchi estratti */}
      <div>
        <div className="geo-section-title" style={{ marginTop: 0 }}>JSON-LD estratto ({ex.blocks.length} blocchi)</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {ex.blocks.map((b) => (
            <BlockView key={b.index} index={b.index} schemaType={b.schemaType} parsed={b.parsed} />
          ))}
        </div>
      </div>

      {/* Analisi */}
      {!audit.analysis && (
        <div style={{ fontSize: 12, color: "var(--fg2)" }}>
          Premi <strong>Analizza</strong> per ricevere suggerimenti puntuali dall&apos;LLM.
        </div>
      )}

      {audit.analysis && (
        <>
          <AnalysisSummary audit={audit} />

          {audit.analysis.schemas.map((sa) => (
            <SchemaSuggestions
              key={sa.schemaIndex}
              schemaAnalysis={sa}
              audit={audit}
              onSetStatus={onSetStatus}
              onUpdateOverride={onUpdateOverride}
              onClearOverride={onClearOverride}
            />
          ))}

          {audit.analysis.newSchemas.length > 0 && (
            <div>
              <div className="geo-section-title">Nuovi schemi proposti</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {audit.analysis.newSchemas.map((s) => (
                  <SuggestionRow
                    key={s.id}
                    suggestion={s}
                    accepted={audit.acceptedSuggestionIds.includes(s.id)}
                    skipped={audit.skippedSuggestionIds.includes(s.id)}
                    override={Object.prototype.hasOwnProperty.call(audit.suggestionOverrides, s.id) ? audit.suggestionOverrides[s.id] : undefined}
                    hasOverride={Object.prototype.hasOwnProperty.call(audit.suggestionOverrides, s.id)}
                    onSetStatus={(status) => onSetStatus(s.id, status)}
                    onUpdateOverride={(v) => onUpdateOverride(s.id, v)}
                    onClearOverride={() => onClearOverride(s.id)}
                  />
                ))}
              </div>
            </div>
          )}

          <AuditLogPanel
            log={audit.analysis._log}
            toolName="kg-optimizer"
            extra={{ url: audit.url, analysis: audit.analysis }}
          />
        </>
      )}
    </div>
  );
}

/* ── Block View ── */

function BlockView({ index, schemaType, parsed }: { index: number; schemaType: string; parsed: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="geo-section-card" style={{ padding: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 12 }}>#{index} {schemaType}</span>
        <button className="geo-btn-small" onClick={() => setOpen((v) => !v)}>
          {open ? "Nascondi" : "Mostra JSON"}
        </button>
      </div>
      {open && (
        <pre className="geo-audit-code" style={{ marginTop: 8, maxHeight: 280, overflow: "auto" }}>
          {JSON.stringify(parsed, null, 2)}
        </pre>
      )}
    </div>
  );
}

/* ── Analysis Summary ── */

function AnalysisSummary({ audit }: { audit: KGAudit }) {
  const analysis = audit.analysis;
  if (!analysis) return null;
  const all = collectAllSuggestions(analysis);
  const accepted = all.filter((s) => audit.acceptedSuggestionIds.includes(s.id));
  const skipped = all.filter((s) => audit.skippedSuggestionIds.includes(s.id));
  const pending = all.length - accepted.length - skipped.length;

  const byCat = {
    "knowledge-graph": all.filter((s) => s.category === "knowledge-graph"),
    "rich-results": all.filter((s) => s.category === "rich-results"),
    "schema-org": all.filter((s) => s.category === "schema-org"),
  };
  const bySev = {
    critical: all.filter((s) => s.severity === "critical").length,
    warning: all.filter((s) => s.severity === "warning").length,
    info: all.filter((s) => s.severity === "info").length,
  };
  const newSchemas = analysis.newSchemas.length;
  const decided = accepted.length + skipped.length;
  const pct = all.length > 0 ? Math.round((decided / all.length) * 100) : 0;

  return (
    <div className="geo-summary-card">
      <div className="geo-summary-row">
        <div className="geo-summary-stat">
          <span className="geo-summary-n">{all.length}</span>
          <span className="geo-summary-l">Suggerimenti totali</span>
        </div>
        <div className="geo-summary-stat">
          <span className="geo-summary-n" style={{ color: accepted.length > 0 ? "var(--grn)" : "var(--fg)" }}>
            {accepted.length}
          </span>
          <span className="geo-summary-l">Accettati</span>
        </div>
        <div className="geo-summary-stat">
          <span className="geo-summary-n" style={{ color: skipped.length > 0 ? "var(--fg3)" : "var(--fg)" }}>
            {skipped.length}
          </span>
          <span className="geo-summary-l">Saltati</span>
        </div>
        <div className="geo-summary-stat">
          <span className="geo-summary-n" style={{ color: pending > 0 ? "var(--org)" : "var(--fg)" }}>
            {pending}<span style={{ fontSize: 14, color: "var(--fg3)", fontWeight: 500 }}> ({pct}% decisi)</span>
          </span>
          <span className="geo-summary-l">Da decidere</span>
        </div>
        <div className="geo-summary-divider" />
        <div className="geo-summary-stat">
          <span className="geo-summary-n">{byCat["knowledge-graph"].length}</span>
          <span className="geo-summary-l">Knowledge Graph</span>
        </div>
        <div className="geo-summary-stat">
          <span className="geo-summary-n">{byCat["rich-results"].length}</span>
          <span className="geo-summary-l">Rich Results</span>
        </div>
        <div className="geo-summary-stat">
          <span className="geo-summary-n">{byCat["schema-org"].length}</span>
          <span className="geo-summary-l">Schema.org</span>
        </div>
        {newSchemas > 0 && (
          <>
            <div className="geo-summary-divider" />
            <div className="geo-summary-stat">
              <span className="geo-summary-n" style={{ color: "var(--accent)" }}>{newSchemas}</span>
              <span className="geo-summary-l">Nuovi schemi proposti</span>
            </div>
          </>
        )}
      </div>

      <div className="geo-summary-chips">
        {bySev.critical > 0 && (
          <span className="geo-summary-chip geo-summary-chip-crit">● {bySev.critical} critici</span>
        )}
        {bySev.warning > 0 && (
          <span className="geo-summary-chip geo-summary-chip-warn">● {bySev.warning} attenzione</span>
        )}
        {bySev.info > 0 && (
          <span className="geo-summary-chip geo-summary-chip-info">● {bySev.info} info</span>
        )}
        <span className="geo-summary-chip">
          Analizzato {new Date(analysis.analyzedAt).toLocaleString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>

      {analysis.overallNotes && (
        <div className="geo-summary-notes">
          <strong>Sintesi LLM:</strong> {analysis.overallNotes}
        </div>
      )}
    </div>
  );
}

/* ── Schema Suggestions Group ── */

function SchemaSuggestions({
  schemaAnalysis, audit, onSetStatus, onUpdateOverride, onClearOverride,
}: {
  schemaAnalysis: KGSchemaAnalysis;
  audit: KGAudit;
  onSetStatus: (id: string, status: "accepted" | "skipped" | "pending") => void;
  onUpdateOverride: (id: string, value: unknown) => void;
  onClearOverride: (id: string) => void;
}) {
  const sorted = useMemo(() => sortBySeverity(schemaAnalysis.suggestions), [schemaAnalysis.suggestions]);
  if (sorted.length === 0) return null;

  return (
    <div>
      <div className="geo-section-title">
        Schema #{schemaAnalysis.schemaIndex} {schemaAnalysis.schemaType}
      </div>
      {schemaAnalysis.summary && (
        <div style={{ fontSize: 12, color: "var(--fg2)", marginBottom: 8 }}>{schemaAnalysis.summary}</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sorted.map((s) => (
          <SuggestionRow
            key={s.id}
            suggestion={s}
            accepted={audit.acceptedSuggestionIds.includes(s.id)}
            skipped={audit.skippedSuggestionIds.includes(s.id)}
            override={Object.prototype.hasOwnProperty.call(audit.suggestionOverrides, s.id) ? audit.suggestionOverrides[s.id] : undefined}
            hasOverride={Object.prototype.hasOwnProperty.call(audit.suggestionOverrides, s.id)}
            onSetStatus={(status) => onSetStatus(s.id, status)}
            onUpdateOverride={(v) => onUpdateOverride(s.id, v)}
            onClearOverride={() => onClearOverride(s.id)}
          />
        ))}
      </div>
    </div>
  );
}

function sortBySeverity(list: KGSuggestion[]): KGSuggestion[] {
  const sevWeight: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  const catWeight: Record<string, number> = { "knowledge-graph": 0, "rich-results": 1, "schema-org": 2 };
  return [...list].sort((a, b) => {
    const cw = (catWeight[a.category] ?? 9) - (catWeight[b.category] ?? 9);
    if (cw !== 0) return cw;
    return (sevWeight[a.severity] ?? 9) - (sevWeight[b.severity] ?? 9);
  });
}

/* ── Single suggestion row ── */

function SuggestionRow({
  suggestion, accepted, skipped, override, hasOverride, onSetStatus, onUpdateOverride, onClearOverride,
}: {
  suggestion: KGSuggestion;
  accepted: boolean;
  skipped: boolean;
  override: unknown;
  hasOverride: boolean;
  onSetStatus: (status: "accepted" | "skipped" | "pending") => void;
  onUpdateOverride: (value: unknown) => void;
  onClearOverride: () => void;
}) {
  const sevClass = suggestion.severity === "critical" ? "critical" : suggestion.severity === "warning" ? "warning" : "info";
  const catLabel = suggestion.category === "knowledge-graph" ? "Knowledge Graph" : suggestion.category === "rich-results" ? "Rich Results" : "Schema.org";

  const effectiveProposed = hasOverride ? override : suggestion.proposedValue;

  return (
    <div
      className={`geo-audit-issue geo-audit-issue-${sevClass}`}
      style={{
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
        minWidth: 0,
        opacity: skipped ? 0.5 : 1,
        filter: skipped ? "grayscale(0.6)" : undefined,
      }}
    >
      <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 4, minWidth: 80 }}>
        <button
          className="geo-btn-small"
          onClick={() => onSetStatus(accepted ? "pending" : "accepted")}
          style={{
            background: accepted ? "var(--grn)" : undefined,
            color: accepted ? "#fff" : undefined,
            width: "100%",
          }}
          title={accepted ? "Rimuovi accettazione" : "Accetta questo suggerimento"}
        >
          {accepted ? "\u2713 Accettato" : "Accetta"}
        </button>
        <button
          className="geo-btn-small"
          onClick={() => onSetStatus(skipped ? "pending" : "skipped")}
          style={{
            background: skipped ? "var(--fg3)" : undefined,
            color: skipped ? "#fff" : undefined,
            width: "100%",
          }}
          title={skipped ? "Annulla skip" : "Salta questo suggerimento"}
        >
          {skipped ? "\u2717 Saltato" : "Salta"}
        </button>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="geo-audit-issue-head">
          <span className={`geo-tag geo-audit-tag-${sevClass}`}>{suggestion.severity}</span>
          <span className="geo-audit-issue-cat">{catLabel}</span>
          {suggestion.op === "add-schema" && suggestion.targetSchemaType && (
            <span className="geo-tag">Nuovo: {suggestion.targetSchemaType}</span>
          )}
          {suggestion.fieldPath && <span className="geo-tag">{suggestion.fieldPath}</span>}
          {hasOverride && <span className="geo-tag" style={{ background: "var(--accent)", color: "#fff", border: "none" }}>Modificato</span>}
        </div>
        <div className="geo-audit-issue-msg">{suggestion.why}</div>
        {suggestion.op !== "add-schema" && (
          <div className="geo-kg-diff">
            <ValueBlock label="Attuale" value={suggestion.currentValue} />
            <EditableValueBlock
              label="Proposto"
              value={effectiveProposed}
              hasOverride={hasOverride}
              onSave={onUpdateOverride}
              onReset={onClearOverride}
            />
          </div>
        )}
        {suggestion.op === "add-schema" && (
          <EditableValueBlock
            label="JSON-LD proposto"
            value={effectiveProposed}
            hasOverride={hasOverride}
            onSave={onUpdateOverride}
            onReset={onClearOverride}
          />
        )}
      </div>
    </div>
  );
}

function ValueBlock({ label, value }: { label: string; value: unknown }) {
  const text = value === undefined || value === null
    ? "—"
    : typeof value === "string"
      ? value
      : JSON.stringify(value, null, 2);
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10, color: "var(--fg2)", marginBottom: 2 }}>{label}</div>
      <pre
        className="geo-audit-code"
        style={{
          margin: 0,
          maxHeight: 200,
          overflow: "auto",
          fontSize: 11,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {text}
      </pre>
    </div>
  );
}

function EditableValueBlock({
  label, value, hasOverride, onSave, onReset,
}: {
  label: string;
  value: unknown;
  hasOverride: boolean;
  onSave: (value: unknown) => void;
  onReset: () => void;
}) {
  const initialText = useMemo(() => valueToText(value), [value]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialText);
  const [parseError, setParseError] = useState<string | null>(null);

  function startEdit() {
    setDraft(initialText);
    setParseError(null);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setDraft(initialText);
    setParseError(null);
  }

  function save() {
    const parsed = parseDraft(draft);
    if (parsed.error) {
      setParseError(parsed.error);
      return;
    }
    onSave(parsed.value);
    setEditing(false);
    setParseError(null);
  }

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10, color: "var(--fg2)", marginBottom: 2, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span>{label}</span>
        <span style={{ color: "var(--grn)", fontSize: 9 }}>● PROPOSTO</span>
        {hasOverride && <span style={{ color: "var(--accent)", fontSize: 9 }}>(modificato)</span>}
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          {!editing && (
            <>
              <button className="geo-btn-small" onClick={startEdit} style={{ fontSize: 10, padding: "2px 6px" }}>Modifica</button>
              {hasOverride && (
                <button className="geo-btn-small" onClick={onReset} style={{ fontSize: 10, padding: "2px 6px" }} title="Ripristina proposto LLM">Reset</button>
              )}
            </>
          )}
          {editing && (
            <>
              <button className="geo-btn-small" onClick={save} style={{ fontSize: 10, padding: "2px 6px", background: "var(--grn)", color: "#fff" }}>Salva</button>
              <button className="geo-btn-small" onClick={cancel} style={{ fontSize: 10, padding: "2px 6px" }}>Annulla</button>
            </>
          )}
        </div>
      </div>
      {!editing && (
        <pre
          className="geo-audit-code"
          style={{
            margin: 0,
            maxHeight: 200,
            overflow: "auto",
            fontSize: 11,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            borderLeft: "2px solid var(--grn)",
          }}
        >
          {initialText}
        </pre>
      )}
      {editing && (
        <div>
          <textarea
            value={draft}
            onChange={(e) => { setDraft(e.target.value); if (parseError) setParseError(null); }}
            spellCheck={false}
            style={{
              width: "100%",
              minHeight: 100,
              maxHeight: 320,
              fontFamily: "monospace",
              fontSize: 11,
              padding: 8,
              background: "var(--bg)",
              border: "1px solid var(--accent)",
              borderRadius: 4,
              color: "var(--fg)",
              boxSizing: "border-box",
              resize: "vertical",
            }}
          />
          {parseError && (
            <div style={{ fontSize: 10, color: "var(--red)", marginTop: 4 }}>
              {parseError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function valueToText(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function parseDraft(text: string): { value: unknown; error?: string } {
  const trimmed = text.trim();
  if (trimmed === "") return { value: null };
  // Se inizia con { [ " o digit -> prova JSON
  if (/^[{[\d"]|^(true|false|null)$/.test(trimmed)) {
    try {
      return { value: JSON.parse(trimmed) };
    } catch (e) {
      return { value: text, error: `JSON non valido: ${e instanceof Error ? e.message : "errore parsing"}. Salva comunque come stringa? Modifica il testo e riprova.` };
    }
  }
  // Altrimenti string
  return { value: text };
}

/* ── Markup modal ── */

function MarkupModal({ audit, onClose, onCopy }: { audit: KGAudit; onClose: () => void; onCopy: () => void }) {
  return (
    <div className="sc-qa-overlay" onClick={onClose}>
      <div className="sc-qa-panel" onClick={(e) => e.stopPropagation()}>
        <div className="sc-qa-panel-head">
          <span>JSON-LD finale</span>
          <span className="sc-qa-date" style={{ maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{audit.url}</span>
          <button className="sc-sb-close" onClick={onClose}>{"\u2715"}</button>
        </div>
        <div className="sc-qa-panel-body" style={{ padding: 16 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <button className="geo-btn geo-btn-accent" onClick={onCopy}>Copia tutto</button>
            <span style={{ fontSize: 11, color: "var(--fg2)", alignSelf: "center" }}>
              Incolla nel <code>&lt;head&gt;</code> della pagina, sostituendo gli script JSON-LD esistenti.
            </span>
          </div>
          <pre className="geo-audit-code" style={{ maxHeight: 500, overflow: "auto" }}>
            {audit.finalMarkup}
          </pre>
        </div>
      </div>
    </div>
  );
}
