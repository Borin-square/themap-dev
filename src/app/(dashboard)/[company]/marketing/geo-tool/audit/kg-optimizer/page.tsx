"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useLocalState } from "@/lib/useLocalState";
import { getMockGEOProject } from "@/lib/geo/mock";
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

  /* ── Save single audit to Supabase ── */
  async function saveAudit(audit: KGAudit, fields: Partial<{ extracted: boolean; analysis: boolean; accepted: boolean; markup: boolean }>) {
    try {
      const token = await getToken();
      const body: Record<string, unknown> = { company_slug: slug, url: audit.url };
      if (fields.extracted && audit.extracted) body.extracted = audit.extracted;
      if (fields.analysis && audit.analysis) body.analysis = audit.analysis;
      if (fields.accepted) body.accepted_suggestions = audit.acceptedSuggestionIds;
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
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Errore analyze");
        return;
      }
      const analysis = data as KGAnalysis;
      const updated: KGAudit = { ...audit, analysis, acceptedSuggestionIds: [], updatedAt: new Date().toISOString() };
      setAudits((prev) => prev.map((a) => (a.id === audit.id ? updated : a)));
      await saveAudit(updated, { analysis: true, accepted: true });
      setExpandedId(audit.id);
      showToast("Analisi completata");
    } catch {
      showToast("Errore di rete");
    } finally {
      setBusyId(null);
      setBusyKind(null);
    }
  }

  /* ── Toggle suggestion accept ── */
  function toggleSuggestion(audit: KGAudit, suggestionId: string) {
    const has = audit.acceptedSuggestionIds.includes(suggestionId);
    const nextIds = has
      ? audit.acceptedSuggestionIds.filter((id) => id !== suggestionId)
      : [...audit.acceptedSuggestionIds, suggestionId];
    const updated: KGAudit = { ...audit, acceptedSuggestionIds: nextIds, updatedAt: new Date().toISOString() };
    setAudits((prev) => prev.map((a) => (a.id === audit.id ? updated : a)));
    void saveAudit(updated, { accepted: true });
  }

  /* ── Generate final markup ── */
  async function handleGenerate(audit: KGAudit) {
    if (!audit.extracted || !audit.analysis) return;
    const allSuggestions = collectAllSuggestions(audit.analysis);
    const accepted = allSuggestions.filter((s) => audit.acceptedSuggestionIds.includes(s.id));
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
                  onToggleExpand={() => setExpandedId(expandedId === a.id ? null : a.id)}
                  onAnalyze={() => handleAnalyze(a)}
                  onToggleSuggestion={(sid) => toggleSuggestion(a, sid)}
                  onGenerate={() => handleGenerate(a)}
                  onViewMarkup={() => setViewMarkup(a)}
                  onDelete={() => handleDelete(a)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

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
  audit, expanded, busy, onToggleExpand, onAnalyze, onToggleSuggestion, onGenerate, onViewMarkup, onDelete,
}: {
  audit: KGAudit;
  expanded: boolean;
  busy: "analyze" | "generate" | "delete" | null;
  onToggleExpand: () => void;
  onAnalyze: () => void;
  onToggleSuggestion: (id: string) => void;
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
        <td style={{ fontSize: 11, color: "var(--fg2)" }}>{schemaTypes}</td>
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
              title="Analizza con LLM"
            >
              {busy === "analyze" ? "..." : audit.analysis ? "Re-analizza" : "Analizza"}
            </button>
          )}
          {audit.analysis && acceptedCount > 0 && (
            <button
              className="geo-btn-small"
              onClick={onGenerate}
              disabled={busy !== null}
              title="Genera JSON-LD finale"
            >
              {busy === "generate" ? "..." : "Genera"}
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
            <AuditDetail audit={audit} onToggleSuggestion={onToggleSuggestion} />
          </td>
        </tr>
      )}
    </>
  );
}

/* ── Audit Detail (expanded) ── */

function AuditDetail({ audit, onToggleSuggestion }: { audit: KGAudit; onToggleSuggestion: (id: string) => void }) {
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
          {audit.analysis.overallNotes && (
            <div className="geo-audit-issue geo-audit-issue-info">
              <div className="geo-audit-issue-msg">{audit.analysis.overallNotes}</div>
            </div>
          )}

          {audit.analysis.schemas.map((sa) => (
            <SchemaSuggestions
              key={sa.schemaIndex}
              schemaAnalysis={sa}
              acceptedIds={audit.acceptedSuggestionIds}
              onToggle={onToggleSuggestion}
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
                    onToggle={() => onToggleSuggestion(s.id)}
                  />
                ))}
              </div>
            </div>
          )}
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

/* ── Schema Suggestions Group ── */

function SchemaSuggestions({
  schemaAnalysis, acceptedIds, onToggle,
}: {
  schemaAnalysis: KGSchemaAnalysis;
  acceptedIds: string[];
  onToggle: (id: string) => void;
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
            accepted={acceptedIds.includes(s.id)}
            onToggle={() => onToggle(s.id)}
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

function SuggestionRow({ suggestion, accepted, onToggle }: { suggestion: KGSuggestion; accepted: boolean; onToggle: () => void }) {
  const sevClass = suggestion.severity === "critical" ? "critical" : suggestion.severity === "warning" ? "warning" : "info";
  const catLabel = suggestion.category === "knowledge-graph" ? "Knowledge Graph" : suggestion.category === "rich-results" ? "Rich Results" : "Schema.org";

  return (
    <div className={`geo-audit-issue geo-audit-issue-${sevClass}`} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <div style={{ flexShrink: 0 }}>
        <button
          className="geo-btn-small"
          onClick={onToggle}
          style={{ background: accepted ? "var(--grn)" : undefined, color: accepted ? "#fff" : undefined, minWidth: 70 }}
        >
          {accepted ? "\u2713 Accettato" : "Accetta"}
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
        </div>
        <div className="geo-audit-issue-msg">{suggestion.why}</div>
        {suggestion.op !== "add-schema" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 6 }}>
            <ValueBlock label="Attuale" value={suggestion.currentValue} />
            <ValueBlock label="Proposto" value={suggestion.proposedValue} />
          </div>
        )}
        {suggestion.op === "add-schema" && (
          <ValueBlock label="JSON-LD proposto" value={suggestion.proposedValue} />
        )}
      </div>
    </div>
  );
}

function ValueBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "var(--fg2)", marginBottom: 2 }}>{label}</div>
      <pre className="geo-audit-code" style={{ margin: 0, maxHeight: 160, overflow: "auto", fontSize: 11 }}>
        {value === undefined || value === null ? "—" : typeof value === "string" ? value : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
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
