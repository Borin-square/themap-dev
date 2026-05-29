"use client";

import { useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { getCompany } from "@/lib/companies";
import { useLocalState } from "@/lib/useLocalState";
import type { GEOProject, GEOPrompt, GEOScan } from "@/lib/geo/types";
import { LLM_LIST, GEO_INTENTS, GEO_FUNNELS, emptyPrompt } from "@/lib/geo/types";
import { getMockGEOProject } from "@/lib/geo/mock";
import { promptMentionRate, promptAvgPosition, promptSentimentAvg, enrichPromptScores, scoreColor } from "@/lib/geo/scoring";

export default function PromptMonitorPage() {
  const params = useParams();
  const company = getCompany(params.company as string);
  const slug = params.company as string;

  const [project, setProject] = useLocalState<GEOProject>(
    `themap:${slug}:geoProject`, getMockGEOProject,
  );

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [scanLlm, setScanLlm] = useState<string>("Claude");
  const [scanningId, setScanningId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAddPrompt, setShowAddPrompt] = useState(false);
  const [newPromptText, setNewPromptText] = useState("");
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [filterIntent, setFilterIntent] = useState("");
  const [filterFunnel, setFilterFunnel] = useState("");
  const [filterScanned, setFilterScanned] = useState("");
  const [viewResponse, setViewResponse] = useState<{ promptId: string; scanId: string } | null>(null);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000); }

  // Filter prompts
  const filtered = useMemo(() => {
    return project.prompts.filter((p) => {
      if (filterIntent && p.intent !== filterIntent) return false;
      if (filterFunnel && p.funnelStage !== filterFunnel) return false;
      if (filterScanned === "scanned" && p.scans.length === 0) return false;
      if (filterScanned === "unscanned" && p.scans.length > 0) return false;
      return true;
    });
  }, [project.prompts, filterIntent, filterFunnel, filterScanned]);

  // Toggle selection
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((p) => p.id)));
  }

  // Add prompt
  function handleAddPrompt() {
    if (!newPromptText.trim()) return;
    const p = emptyPrompt(newPromptText.trim(), "manual");
    setProject((prev) => ({ ...prev, prompts: [...prev.prompts, enrichPromptScores(p)] }));
    setNewPromptText("");
    setShowAddPrompt(false);
    showToast("Prompt aggiunto");
  }

  // Delete prompt
  function handleDelete(id: string) {
    setProject((prev) => ({ ...prev, prompts: prev.prompts.filter((p) => p.id !== id) }));
    setConfirmDel(null);
    showToast("Prompt eliminato");
  }

  // Scan single prompt with selected LLM
  async function handleScan(promptId: string) {
    const prompt = project.prompts.find((p) => p.id === promptId);
    if (!prompt) return;
    if (!project.config.brandName?.trim()) {
      showToast("Configura il brand name prima di scansionare");
      return;
    }
    setScanningId(promptId);
    try {
      const res = await fetch("/api/geo/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.text,
          llm: scanLlm,
          brandName: project.config.brandName,
          competitors: project.config.competitors,
          siteUrl: project.config.siteUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || "Errore scan"); return; }

      // Replace existing scan for same LLM or add new
      const scan = data as GEOScan;
      setProject((prev) => ({
        ...prev,
        prompts: prev.prompts.map((p) => {
          if (p.id !== promptId) return p;
          const otherScans = p.scans.filter((s) => s.llm !== scanLlm);
          const updated = { ...p, scans: [...otherScans, scan] };
          return enrichPromptScores(updated);
        }),
      }));
      showToast(`Scan ${scanLlm}: ${scan.brandMentioned ? `menzionato (pos. ${scan.brandPosition || "?"})` : "non menzionato"}`);
    } catch {
      showToast("Errore di rete");
    } finally {
      setScanningId(null);
    }
  }

  // Batch scan selected prompts
  async function handleBatchScan() {
    if (selectedIds.size === 0) { showToast("Seleziona almeno un prompt"); return; }
    if (!project.config.brandName?.trim()) { showToast("Configura il brand name"); return; }

    for (const id of selectedIds) {
      await handleScan(id);
    }
    showToast(`Batch scan completato: ${selectedIds.size} prompt`);
  }

  // Find the response overlay data
  const responseData = useMemo(() => {
    if (!viewResponse) return null;
    const prompt = project.prompts.find((p) => p.id === viewResponse.promptId);
    if (!prompt) return null;
    const scan = prompt.scans.find((s) => s.id === viewResponse.scanId);
    if (!scan) return null;
    return { prompt, scan };
  }, [viewResponse, project.prompts]);

  return (
    <div className="geo-page">
      {toast && <div className="fws-toast">{toast}</div>}

      <div className="geo-head">
        <div className="geo-title">
          {company && <span style={{ color: company.color }}>{"\u25A0"}</span>}
          Prompt Monitor
        </div>
        <div className="geo-head-actions">
          <select className="geo-select" value={scanLlm} onChange={(e) => setScanLlm(e.target.value)}>
            {LLM_LIST.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          {selectedIds.size > 0 && (
            <button className="geo-btn geo-btn-accent" onClick={handleBatchScan} disabled={scanningId !== null}>
              Scan {selectedIds.size} prompt con {scanLlm}
            </button>
          )}
          <button className="geo-btn geo-btn-accent" onClick={() => setShowAddPrompt(true)}>+ Prompt</button>
        </div>
      </div>

      {/* Add Prompt Inline */}
      {showAddPrompt && (
        <div className="geo-add-row">
          <input
            className="geo-add-input"
            value={newPromptText}
            onChange={(e) => setNewPromptText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAddPrompt(); }}
            placeholder="Scrivi il prompt da monitorare..."
            autoFocus
          />
          <button className="geo-btn geo-btn-accent" onClick={handleAddPrompt}>Aggiungi</button>
          <button className="geo-btn" onClick={() => setShowAddPrompt(false)}>Annulla</button>
        </div>
      )}

      {/* Filters */}
      <div className="geo-filters">
        <select value={filterIntent} onChange={(e) => setFilterIntent(e.target.value)}>
          <option value="">Tutti gli intent</option>
          {GEO_INTENTS.map((i) => <option key={i} value={i}>{i.charAt(0).toUpperCase() + i.slice(1)}</option>)}
        </select>
        <select value={filterFunnel} onChange={(e) => setFilterFunnel(e.target.value)}>
          <option value="">Tutto il funnel</option>
          {GEO_FUNNELS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <select value={filterScanned} onChange={(e) => setFilterScanned(e.target.value)}>
          <option value="">Tutti</option>
          <option value="scanned">Scansionati</option>
          <option value="unscanned">Non scansionati</option>
        </select>
        <span className="geo-filter-count">{filtered.length} prompt</span>
      </div>

      {/* Prompt Table */}
      <div className="geo-table-wrap">
        <table className="geo-table">
          <thead>
            <tr>
              <th style={{ width: 32 }}>
                <input type="checkbox" checked={selectedIds.size === filtered.length && filtered.length > 0} onChange={selectAll} />
              </th>
              <th>Prompt</th>
              <th>Intent</th>
              <th>Funnel</th>
              <th>Valore</th>
              <th>Mention</th>
              <th>Pos. media</th>
              <th>LLM</th>
              <th>Sentiment</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const mr = promptMentionRate(p);
              const pos = promptAvgPosition(p);
              const sent = promptSentimentAvg(p);
              const isExpanded = expandedId === p.id;
              return (
                <PromptRow
                  key={p.id}
                  prompt={p}
                  selected={selectedIds.has(p.id)}
                  onToggleSelect={() => toggleSelect(p.id)}
                  expanded={isExpanded}
                  onToggleExpand={() => setExpandedId(isExpanded ? null : p.id)}
                  mentionRate={mr}
                  avgPosition={pos}
                  sentimentAvg={sent}
                  scanLlm={scanLlm}
                  scanning={scanningId === p.id}
                  onScan={() => handleScan(p.id)}
                  scanDisabled={scanningId !== null}
                  onDelete={() => confirmDel === p.id ? handleDelete(p.id) : setConfirmDel(p.id)}
                  confirmingDelete={confirmDel === p.id}
                  onCancelDelete={() => setConfirmDel(null)}
                  onViewResponse={(scanId) => setViewResponse({ promptId: p.id, scanId })}
                />
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="geo-empty">Nessun prompt. Aggiungine uno o usa il Prompt Generator.</div>
        )}
      </div>

      {/* Response Overlay */}
      {responseData && (
        <div className="sc-qa-overlay" onClick={() => setViewResponse(null)}>
          <div className="sc-qa-panel" onClick={(e) => e.stopPropagation()}>
            <div className="sc-qa-panel-head">
              <span>{responseData.scan.llm} — Risposta</span>
              <span className="sc-qa-date">
                {new Date(responseData.scan.scannedAt).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
              <button className="sc-sb-close" onClick={() => setViewResponse(null)}>{"\u2715"}</button>
            </div>
            <div className="sc-qa-panel-body">
              <div className="sc-qa-item">
                <div className="sc-qa-query">
                  <span className="sc-qa-q"><strong>Prompt:</strong> {responseData.prompt.text}</span>
                </div>
                <div className="sc-qa-response">{responseData.scan.rawResponse}</div>
              </div>
              {responseData.scan.reasoning && (
                <div style={{ padding: "12px 16px", fontSize: 12, color: "var(--fg2)" }}>
                  <strong>Analisi:</strong> {responseData.scan.reasoning}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Prompt Row ── */

function PromptRow({ prompt: p, selected, onToggleSelect, expanded, onToggleExpand,
  mentionRate, avgPosition, sentimentAvg, scanLlm, scanning, onScan, scanDisabled,
  onDelete, confirmingDelete, onCancelDelete, onViewResponse,
}: {
  prompt: GEOPrompt; selected: boolean; onToggleSelect: () => void;
  expanded: boolean; onToggleExpand: () => void;
  mentionRate: number; avgPosition: number | null; sentimentAvg: number;
  scanLlm: string; scanning: boolean; onScan: () => void; scanDisabled: boolean;
  onDelete: () => void; confirmingDelete: boolean; onCancelDelete: () => void;
  onViewResponse: (scanId: string) => void;
}) {
  const sentColor = sentimentAvg > 0.3 ? "grn" : sentimentAvg < -0.3 ? "red" : "org";

  return (
    <>
      <tr className={`geo-row${expanded ? " geo-row-expanded" : ""}`}>
        <td onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={selected} onChange={onToggleSelect} />
        </td>
        <td className="geo-td-prompt" onClick={onToggleExpand}>
          <span className="geo-prompt-text">{p.text}</span>
          {p.source === "generated" && <span className="geo-tag geo-tag-gen">AI</span>}
        </td>
        <td><span className={`geo-tag geo-tag-${p.intent}`}>{p.intent}</span></td>
        <td><span className="geo-tag">{p.funnelStage}</span></td>
        <td className="geo-td-num">{p.commercialValue}</td>
        <td className="geo-td-num">
          {p.scans.length > 0 ? (
            <>
              <div className="sc-bar-wrap">
                <div className="sc-bar" style={{ width: `${mentionRate}%`, background: `var(--${scoreColor(mentionRate)})` }} />
              </div>
              <span>{mentionRate}%</span>
            </>
          ) : <span className="geo-na">—</span>}
        </td>
        <td className="geo-td-num">
          {avgPosition != null ? <span>#{avgPosition}</span> : <span className="geo-na">—</span>}
        </td>
        <td>
          <div className="sc-llm-dots">
            {LLM_LIST.map((llm) => {
              const scan = p.scans.find((s) => s.llm === llm);
              return (
                <span
                  key={llm}
                  className={`sc-llm-dot${scan ? (scan.brandMentioned ? " sc-llm-yes" : " geo-llm-no") : ""}`}
                  title={scan ? `${llm}: ${scan.brandMentioned ? `#${scan.brandPosition || "?"}` : "non menzionato"}` : `${llm}: non scansionato`}
                />
              );
            })}
          </div>
        </td>
        <td className="geo-td-num">
          {p.scans.length > 0 ? (
            <span className={`geo-sent geo-c-${sentColor}`}>
              {sentimentAvg > 0 ? "+" : ""}{sentimentAvg.toFixed(1)}
            </span>
          ) : <span className="geo-na">—</span>}
        </td>
        <td className="geo-td-actions" onClick={(e) => e.stopPropagation()}>
          <button
            className={`sc-scan-btn${scanning ? " sc-scanning" : ""}`}
            onClick={onScan}
            disabled={scanDisabled}
            title={`Scan con ${scanLlm}`}
          >
            {scanning ? "..." : "\u25B6"}
          </button>
          {confirmingDelete ? (
            <span className="fws-confirm">
              <button className="fws-confirm-yes" onClick={onDelete}>Si</button>
              <button className="fws-confirm-no" onClick={onCancelDelete}>No</button>
            </span>
          ) : (
            <button className="comp-del" onClick={onDelete} title="Elimina">{"\u2715"}</button>
          )}
        </td>
      </tr>
      {/* Expanded detail */}
      {expanded && (
        <tr className="geo-row-detail">
          <td colSpan={10}>
            <PromptDetail prompt={p} onViewResponse={onViewResponse} />
          </td>
        </tr>
      )}
    </>
  );
}

/* ── Prompt Detail (expanded) ── */

function PromptDetail({ prompt: p, onViewResponse }: {
  prompt: GEOPrompt;
  onViewResponse: (scanId: string) => void;
}) {
  if (p.scans.length === 0) {
    return <div className="geo-detail-empty">Nessuno scan ancora. Seleziona un LLM e premi ▶.</div>;
  }

  return (
    <div className="geo-detail">
      <div className="geo-detail-scans">
        {p.scans.map((s) => (
          <div key={s.id} className={`geo-scan-card${s.brandMentioned ? " geo-scan-yes" : " geo-scan-no"}`}>
            <div className="geo-scan-head">
              <span className="geo-scan-llm">{s.llm}</span>
              <span className={`geo-scan-badge${s.brandMentioned ? " geo-scan-mentioned" : ""}`}>
                {s.brandMentioned ? `Menzionato #${s.brandPosition || "?"}` : "Non menzionato"}
              </span>
              <span className="geo-scan-date">
                {new Date(s.scannedAt).toLocaleDateString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
              </span>
              <button className="geo-btn-small" onClick={() => onViewResponse(s.id)}>Risposta</button>
            </div>
            {s.brandContext && (
              <blockquote className="geo-scan-context">{s.brandContext}</blockquote>
            )}
            <div className="geo-scan-meta">
              <span>Sentiment: <strong className={`geo-c-${s.sentiment.score > 0.3 ? "grn" : s.sentiment.score < -0.3 ? "red" : "org"}`}>{s.sentiment.label}</strong></span>
              <span>Confidence: <strong>{s.confidence}</strong></span>
              {s.competitorMentions.length > 0 && (
                <span>Competitor: {s.competitorMentions.map((c) => c.name).join(", ")}</span>
              )}
              {s.citations.length > 0 && (
                <span>Citazioni: {s.citations.length}</span>
              )}
            </div>
            {s.brandAttributes.length > 0 && (
              <div className="geo-scan-attrs">
                {s.brandAttributes.map((a, i) => <span key={i} className="sc-chip sc-chip-small">{a}</span>)}
              </div>
            )}
            {s.reasoning && (
              <div className="geo-scan-reasoning">{s.reasoning}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

