"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { getCompany } from "@/lib/companies";
import { useLocalState } from "@/lib/useLocalState";
import { supabase } from "@/lib/supabase";
import type { GEOProject, GEOPrompt, GEOScan } from "@/lib/geo/types";
import { LLM_LIST, GEO_INTENTS, GEO_FUNNELS, emptyPrompt, llmLabel } from "@/lib/geo/types";
import { getMockGEOProject } from "@/lib/geo/mock";
import { promptMentionRate, promptAvgPosition, promptSentimentAvg, enrichPromptScores, scoreColor } from "@/lib/geo/scoring";
import { DOW_LABELS, type Cadence } from "@/lib/geo/schedule";

/* ── Job/Schedule types ── */

interface ScanJob {
  id: string;
  company: string;
  prompt_id: string;
  prompt_text: string;
  llm: string;
  status: "queued" | "running" | "done" | "failed";
  source: "manual" | "scheduled";
  schedule_id: string | null;
  queued_at: string;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  result_scan: GEOScan | null;
}

interface Schedule {
  id: string;
  company: string;
  prompt_id: string;
  llm: string;
  cadence: Cadence;
  dow: number | null;
  day_of_month: number | null;
  hour: number;
  minute: number;
  enabled: boolean;
  next_run_at: string;
  last_run_at: string | null;
}

async function bearer(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || "";
}

function isToday(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const n = new Date();
  return d.getUTCFullYear() === n.getUTCFullYear() && d.getUTCMonth() === n.getUTCMonth() && d.getUTCDate() === n.getUTCDate();
}

export default function PromptMonitorPage() {
  const params = useParams();
  const company = getCompany(params.company as string);
  const slug = params.company as string;

  const [project, setProject] = useLocalState<GEOProject>(
    `themap:${slug}:geoProject`, getMockGEOProject,
  );

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [scanLlm, setScanLlm] = useState<string>("Claude");
  const [toast, setToast] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAddPrompt, setShowAddPrompt] = useState(false);
  const [newPromptText, setNewPromptText] = useState("");
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [filterIntent, setFilterIntent] = useState("");
  const [filterFunnel, setFilterFunnel] = useState("");
  const [filterScanned, setFilterScanned] = useState("");
  const [filterCluster, setFilterCluster] = useState("");
  const [viewResponse, setViewResponse] = useState<{ promptId: string; scanId: string } | null>(null);

  const [jobs, setJobs] = useState<ScanJob[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [showJobsPanel, setShowJobsPanel] = useState(false);
  const [scheduleFor, setScheduleFor] = useState<GEOPrompt | null>(null); // popover target
  const appliedJobIds = useRef<Set<string>>(new Set());

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000); }

  /* ── Initial fetch: jobs + schedules ── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await bearer();
      const [jr, sr] = await Promise.all([
        fetch(`/api/geo/scan/jobs?company=${slug}&limit=100`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/geo/schedules?company=${slug}`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (cancelled) return;
      if (jr.ok) { const j = await jr.json(); setJobs(j.rows || []); }
      if (sr.ok) { const j = await sr.json(); setSchedules(j.rows || []); }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  /* ── Realtime: jobs + schedules ── */
  useEffect(() => {
    const chJobs = supabase.channel(`geo_scan_jobs:${slug}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "geo_scan_jobs", filter: `company=eq.${slug}` }, (payload) => {
        const row = (payload.new ?? payload.old) as ScanJob | null;
        if (!row) return;
        setJobs((prev) => {
          if (payload.eventType === "DELETE") return prev.filter((x) => x.id !== row.id);
          const idx = prev.findIndex((x) => x.id === row.id);
          if (idx === -1) return [row, ...prev];
          const next = prev.slice(); next[idx] = row; return next;
        });
      }).subscribe();

    const chSchedules = supabase.channel(`geo_scan_schedules:${slug}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "geo_scan_schedules", filter: `company=eq.${slug}` }, (payload) => {
        const row = (payload.new ?? payload.old) as Schedule | null;
        if (!row) return;
        setSchedules((prev) => {
          if (payload.eventType === "DELETE") return prev.filter((x) => x.id !== row.id);
          const idx = prev.findIndex((x) => x.id === row.id);
          if (idx === -1) return [row, ...prev];
          const next = prev.slice(); next[idx] = row; return next;
        });
      }).subscribe();

    return () => { supabase.removeChannel(chJobs); supabase.removeChannel(chSchedules); };
  }, [slug]);

  /* ── Applica risultati scan al project quando i job passano a done ── */
  useEffect(() => {
    for (const j of jobs) {
      if (j.status !== "done" || !j.result_scan) continue;
      if (appliedJobIds.current.has(j.id)) continue;
      appliedJobIds.current.add(j.id);
      const scan = j.result_scan;
      setProject((prev) => ({
        ...prev,
        prompts: prev.prompts.map((p) => {
          if (p.id !== j.prompt_id) return p;
          const otherScans = p.scans.filter((s) => s.llm !== scan.llm);
          return enrichPromptScores({ ...p, scans: [...otherScans, scan] });
        }),
      }));
    }
  }, [jobs, setProject]);

  // Filter prompts
  const filtered = useMemo(() => {
    return project.prompts.filter((p) => {
      if (filterIntent && p.intent !== filterIntent) return false;
      if (filterFunnel && p.funnelStage !== filterFunnel) return false;
      if (filterScanned === "scanned" && p.scans.length === 0) return false;
      if (filterScanned === "unscanned" && p.scans.length > 0) return false;
      if (filterCluster === "__none__" && p.clusterId) return false;
      if (filterCluster && filterCluster !== "__none__" && p.clusterId !== filterCluster) return false;
      return true;
    });
  }, [project.prompts, filterIntent, filterFunnel, filterScanned, filterCluster]);

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

  // Enqueue scan(s) in background (fire-and-forget). La UI mostra lo spinner
  // via jobs realtime; quando il job passa a done, applica lo scan al project.
  async function enqueueScans(promptIds: string[]) {
    if (!project.config.brandName?.trim()) {
      showToast("Configura il brand name prima di scansionare");
      return;
    }
    const batch = promptIds
      .map((id) => project.prompts.find((p) => p.id === id))
      .filter((p): p is GEOPrompt => !!p)
      .map((p) => ({
        company: slug,
        prompt_id: p.id,
        prompt_text: p.text,
        llm: scanLlm,
        brand_name: project.config.brandName,
        competitors: project.config.competitors || [],
        site_url: project.config.siteUrl || undefined,
      }));
    if (batch.length === 0) { showToast("Nessun prompt valido"); return; }

    const token = await bearer();
    const res = await fetch("/api/geo/scan/enqueue", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(batch.length === 1 ? batch[0] : { batch }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { showToast(data.error || "Errore enqueue"); return; }
    showToast(batch.length === 1 ? `In coda: ${scanLlm}` : `In coda ${batch.length} scan ${scanLlm}`);
  }

  // Export filtered prompts + scans to CSV
  function handleExportCsv() {
    if (filtered.length === 0) { showToast("Nessun prompt da esportare"); return; }
    const headers = [
      "Prompt", "Intent", "Funnel", "Buyer Persona", "Cluster", "Valore Commerciale",
      "LLM", "Scansionato il", "Brand Menzionato", "Posizione", "Contesto Brand",
      "Sentiment", "Score", "Confidence",
      "Competitor Menzionati", "Citazioni (domini)",
      "Risposta LLM",
    ];
    const clusterName = (id?: string) => {
      if (!id) return "";
      return project.clusters.find((c) => c.id === id)?.name || "";
    };
    const rows: string[][] = [];
    for (const p of filtered) {
      if (p.scans.length === 0) {
        rows.push([
          p.text, p.intent, p.funnelStage, p.buyerPersona, clusterName(p.clusterId),
          String(p.commercialValue), "", "", "", "", "", "", "", "", "", "", "",
        ]);
        continue;
      }
      for (const s of p.scans) {
        rows.push([
          p.text, p.intent, p.funnelStage, p.buyerPersona, clusterName(p.clusterId),
          String(p.commercialValue),
          s.llm,
          new Date(s.scannedAt).toLocaleString("it-IT"),
          s.brandMentioned ? "si" : "no",
          s.brandPosition != null ? `#${s.brandPosition}` : "",
          s.brandContext || "",
          s.sentiment.label,
          String(s.sentiment.score),
          s.confidence,
          s.competitorMentions.map((c) => c.name).join(" | "),
          s.citations.map((c) => c.domain).join(" | "),
          s.rawResponse || "",
        ]);
      }
    }
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prompt-monitor-${slug}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Esportati ${rows.length} record (${filtered.length} prompt)`);
  }

  // Batch scan selected prompts (fire-and-forget, elabora in background)
  async function handleBatchScan() {
    if (selectedIds.size === 0) { showToast("Seleziona almeno un prompt"); return; }
    await enqueueScans(Array.from(selectedIds));
    setSelectedIds(new Set());
  }

  /* ── Schedule mutations ── */
  async function saveSchedule(input: Partial<Schedule> & { prompt_id: string; llm: string; cadence: Cadence; hour: number; minute: number; enabled: boolean }) {
    const token = await bearer();
    const res = await fetch("/api/geo/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ company: slug, ...input }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { showToast(j.error || "Errore schedule"); return; }
    showToast("Schedule salvata");
  }

  async function deleteSchedule(id: string) {
    const token = await bearer();
    const res = await fetch(`/api/geo/schedules?id=${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { const j = await res.json().catch(() => ({})); showToast(j.error || "Errore"); return; }
    showToast("Schedule eliminata");
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

  /* ── Job state helpers ── */
  const jobStats = useMemo(() => {
    const queued = jobs.filter((j) => j.status === "queued").length;
    const running = jobs.filter((j) => j.status === "running").length;
    const doneToday = jobs.filter((j) => j.status === "done" && isToday(j.completed_at)).length;
    const failedToday = jobs.filter((j) => j.status === "failed" && isToday(j.completed_at)).length;
    return { queued, running, doneToday, failedToday };
  }, [jobs]);

  function activeJobFor(promptId: string, llm: string): ScanJob | null {
    return jobs.find((j) => j.prompt_id === promptId && j.llm === llm && (j.status === "queued" || j.status === "running")) ?? null;
  }
  function schedulesFor(promptId: string): Schedule[] {
    return schedules.filter((s) => s.prompt_id === promptId);
  }

  // Segnala errori dei job appena falliti (una volta sola)
  const notifiedFailIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const j of jobs) {
      if (j.status !== "failed" || notifiedFailIds.current.has(j.id)) continue;
      notifiedFailIds.current.add(j.id);
      showToast(`Scan ${j.llm} fallito: ${j.error?.slice(0, 100) || "errore"}`);
    }
  }, [jobs]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="geo-page">
      {toast && <div className="fws-toast">{toast}</div>}

      <div className="geo-head">
        <div className="geo-title">
          {company && <span style={{ color: company.color }}>{"\u25A0"}</span>}
          Prompt Monitor
        </div>
        <div className="geo-head-actions">
          <button
            className="geo-btn"
            onClick={() => setShowJobsPanel((v) => !v)}
            title="Mostra pannello job"
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            {jobStats.running > 0 && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#f59e0b", animation: "pulse 1s infinite" }} />}
            <span>{jobStats.queued} in coda</span>
            <span style={{ opacity: 0.6 }}>·</span>
            <span>{jobStats.running} in corso</span>
            <span style={{ opacity: 0.6 }}>·</span>
            <span>{jobStats.doneToday} oggi{jobStats.failedToday > 0 ? ` · ${jobStats.failedToday} fail` : ""}</span>
          </button>
          <select className="geo-select" value={scanLlm} onChange={(e) => setScanLlm(e.target.value)}>
            {LLM_LIST.map((l) => <option key={l} value={l}>{llmLabel(l)}</option>)}
          </select>
          {selectedIds.size > 0 && (
            <button className="geo-btn geo-btn-accent" onClick={handleBatchScan}>
              Scan {selectedIds.size} prompt con {llmLabel(scanLlm)}
            </button>
          )}
          <button className="geo-btn" onClick={handleExportCsv} title="Esporta i prompt filtrati e le risposte LLM in CSV">
            Esporta CSV
          </button>
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
        <select value={filterCluster} onChange={(e) => setFilterCluster(e.target.value)}>
          <option value="">Tutti i cluster</option>
          <option value="__none__">Senza cluster</option>
          {project.clusters.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
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
                  activeJob={activeJobFor(p.id, scanLlm)}
                  onScan={() => enqueueScans([p.id])}
                  schedules={schedulesFor(p.id)}
                  onOpenSchedule={() => setScheduleFor(p)}
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

      {/* Schedule popover */}
      {scheduleFor && (
        <SchedulePopover
          prompt={scheduleFor}
          schedules={schedulesFor(scheduleFor.id)}
          defaultLlm={scanLlm}
          onClose={() => setScheduleFor(null)}
          onSave={saveSchedule}
          onDelete={deleteSchedule}
        />
      )}

      {/* Jobs panel */}
      {showJobsPanel && (
        <JobsPanel
          jobs={jobs.slice(0, 50)}
          prompts={project.prompts}
          onClose={() => setShowJobsPanel(false)}
        />
      )}

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
  mentionRate, avgPosition, sentimentAvg, scanLlm, activeJob, onScan, schedules, onOpenSchedule,
  onDelete, confirmingDelete, onCancelDelete, onViewResponse,
}: {
  prompt: GEOPrompt; selected: boolean; onToggleSelect: () => void;
  expanded: boolean; onToggleExpand: () => void;
  mentionRate: number; avgPosition: number | null; sentimentAvg: number;
  scanLlm: string; activeJob: ScanJob | null; onScan: () => void;
  schedules: Schedule[]; onOpenSchedule: () => void;
  onDelete: () => void; confirmingDelete: boolean; onCancelDelete: () => void;
  onViewResponse: (scanId: string) => void;
}) {
  const sentColor = sentimentAvg > 0.3 ? "grn" : sentimentAvg < -0.3 ? "red" : "org";
  const hasSchedule = schedules.length > 0;

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
              const status: "none" | "yes" | "no" = !scan ? "none" : scan.brandMentioned ? "yes" : "no";
              return (
                <LlmBadge
                  key={llm}
                  llm={llm}
                  status={status}
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
            className={`sc-scan-btn${activeJob ? " sc-scanning" : ""}`}
            onClick={onScan}
            disabled={activeJob != null}
            title={activeJob ? `In ${activeJob.status === "running" ? "esecuzione" : "coda"} · ${activeJob.llm}` : `Scan con ${scanLlm} (in background)`}
          >
            {activeJob ? (activeJob.status === "running" ? "\u25D0" : "\u23F3") : "\u25B6"}
          </button>
          <button
            className="sc-scan-btn"
            onClick={onOpenSchedule}
            title={hasSchedule ? `${schedules.length} schedule attive` : "Aggiungi schedule ricorrente"}
            style={hasSchedule ? { color: "var(--accent, #4f8cff)" } : undefined}
          >
            {"\u21BB"}
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
              <span className="geo-scan-llm">{llmLabel(s.llm)}</span>
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

function csvCell(v: string): string {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/* ── LLM Badge (mini logo) ── */
const LLM_BADGE_CONFIG: Record<string, { bg: string; glyph: string; fontSize: number }> = {
  "ChatGPT":      { bg: "#10A37F", glyph: "GPT", fontSize: 7 },
  "Claude":       { bg: "#D97757", glyph: "C",   fontSize: 11 },
  "Gemini":       { bg: "#1F6FEB", glyph: "\u2726", fontSize: 11 },
  "Perplexity":   { bg: "#20808D", glyph: "P",   fontSize: 11 },
  "AI Overviews": { bg: "#1A73E8", glyph: "AI",  fontSize: 8 },
};

function LlmBadge({ llm, status, title }: { llm: string; status: "none" | "yes" | "no"; title: string }) {
  const cfg = LLM_BADGE_CONFIG[llm] || { bg: "#666", glyph: llm.slice(0, 2), fontSize: 8 };
  return (
    <span
      className={`sc-llm-badge sc-llm-badge-${status}`}
      style={{ background: status === "none" ? "var(--bg3)" : cfg.bg, fontSize: cfg.fontSize }}
      title={title}
    >
      {cfg.glyph}
    </span>
  );
}

/* ── Schedule Popover ── */

const CADENCE_LABEL: Record<Cadence, string> = { daily: "Ogni giorno", weekly: "Settimanale", monthly: "Mensile" };

function scheduleSummary(s: Schedule): string {
  const hh = String(s.hour).padStart(2, "0");
  const mm = String(s.minute).padStart(2, "0");
  if (s.cadence === "daily") return `Ogni giorno alle ${hh}:${mm}`;
  if (s.cadence === "weekly") return `Ogni ${DOW_LABELS[s.dow ?? 1]}. alle ${hh}:${mm}`;
  return `Il ${s.day_of_month ?? 1} del mese alle ${hh}:${mm}`;
}

function SchedulePopover({
  prompt, schedules, defaultLlm, onClose, onSave, onDelete,
}: {
  prompt: GEOPrompt;
  schedules: Schedule[];
  defaultLlm: string;
  onClose: () => void;
  onSave: (input: Partial<Schedule> & { prompt_id: string; llm: string; cadence: Cadence; hour: number; minute: number; enabled: boolean }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [llm, setLlm] = useState<string>(defaultLlm);
  const [cadence, setCadence] = useState<Cadence>("weekly");
  const [dow, setDow] = useState<number>(1);
  const [dayOfMonth, setDayOfMonth] = useState<number>(1);
  const [hour, setHour] = useState<number>(9);
  const [minute, setMinute] = useState<number>(0);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    await onSave({
      prompt_id: prompt.id,
      llm,
      cadence,
      dow: cadence === "weekly" ? dow : undefined,
      day_of_month: cadence === "monthly" ? dayOfMonth : undefined,
      hour, minute, enabled: true,
    });
    setSaving(false);
    onClose();
  }

  return (
    <div className="sc-qa-overlay" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--bg)", border: "1px solid var(--bd)", borderRadius: 10, padding: 20, width: 560, maxWidth: "92vw", color: "var(--fg)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Schedule scan ricorrente</div>
            <div style={{ fontSize: 12, color: "var(--fg3)", marginTop: 4 }}>{prompt.text}</div>
          </div>
          <button className="sc-sb-close" onClick={onClose}>{"\u2715"}</button>
        </div>

        {/* Lista esistenti */}
        {schedules.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--fg3)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Attive ({schedules.length})</div>
            <div style={{ display: "grid", gap: 6 }}>
              {schedules.map((s) => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "var(--cd, var(--bg))", border: "1px solid var(--bd)", borderRadius: 6 }}>
                  <div style={{ fontSize: 12 }}>
                    <strong>{s.llm}</strong> · {scheduleSummary(s)}
                    <span style={{ marginLeft: 8, fontSize: 11, color: "var(--fg3)" }}>
                      prossimo: {new Date(s.next_run_at).toLocaleString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      {s.last_run_at && ` · ultimo: ${new Date(s.last_run_at).toLocaleDateString("it-IT")}`}
                    </span>
                  </div>
                  <button onClick={() => onDelete(s.id)} style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 13 }} title="Elimina">✕</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Form nuova */}
        <div style={{ display: "grid", gap: 10, padding: 12, background: "var(--cd, var(--bg))", border: "1px solid var(--bd)", borderRadius: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: 0.5 }}>Nuova schedule</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11, color: "var(--fg3)" }}>LLM</span>
              <select value={llm} onChange={(e) => setLlm(e.target.value)} className="geo-select">
                {LLM_LIST.map((l) => <option key={l} value={l}>{llmLabel(l)}</option>)}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11, color: "var(--fg3)" }}>Cadenza</span>
              <select value={cadence} onChange={(e) => setCadence(e.target.value as Cadence)} className="geo-select">
                {(Object.keys(CADENCE_LABEL) as Cadence[]).map((c) => <option key={c} value={c}>{CADENCE_LABEL[c]}</option>)}
              </select>
            </label>
          </div>
          {cadence === "weekly" && (
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11, color: "var(--fg3)" }}>Giorno della settimana</span>
              <div style={{ display: "flex", gap: 4 }}>
                {DOW_LABELS.map((lbl, i) => (
                  <button key={i} onClick={() => setDow(i)} style={{ flex: 1, padding: "6px 8px", border: "1px solid var(--bd)", background: dow === i ? "var(--accent, #4f8cff)" : "var(--bg)", color: dow === i ? "#fff" : "var(--fg2)", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>{lbl}</button>
                ))}
              </div>
            </label>
          )}
          {cadence === "monthly" && (
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11, color: "var(--fg3)" }}>Giorno del mese (1-28)</span>
              <input type="number" min={1} max={28} value={dayOfMonth} onChange={(e) => setDayOfMonth(Math.min(28, Math.max(1, Number(e.target.value))))} className="geo-select" style={{ width: 80 }} />
            </label>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11, color: "var(--fg3)" }}>Ora (UTC)</span>
              <input type="number" min={0} max={23} value={hour} onChange={(e) => setHour(Number(e.target.value))} className="geo-select" />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11, color: "var(--fg3)" }}>Minuto</span>
              <input type="number" min={0} max={59} value={minute} onChange={(e) => setMinute(Number(e.target.value))} className="geo-select" />
            </label>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
            <button className="geo-btn" onClick={onClose}>Annulla</button>
            <button className="geo-btn geo-btn-accent" onClick={submit} disabled={saving}>{saving ? "Salvo…" : "Aggiungi schedule"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Jobs Panel ── */

function JobsPanel({ jobs, prompts, onClose }: { jobs: ScanJob[]; prompts: GEOPrompt[]; onClose: () => void }) {
  const promptText = (id: string) => prompts.find((p) => p.id === id)?.text ?? "(prompt eliminato)";
  return (
    <div className="sc-qa-overlay" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--bg)", border: "1px solid var(--bd)", borderRadius: 10, padding: 20, width: 900, maxWidth: "94vw", maxHeight: "84vh", overflow: "auto", color: "var(--fg)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Job scan · ultimi {jobs.length}</div>
          <button className="sc-sb-close" onClick={onClose}>{"\u2715"}</button>
        </div>
        {jobs.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--fg3)", padding: 20, textAlign: "center" }}>Nessun job.</div>
        ) : (
          <div style={{ display: "grid", gap: 4 }}>
            {jobs.map((j) => {
              const color: Record<ScanJob["status"], string> = { queued: "#6b7280", running: "#f59e0b", done: "#22c55e", failed: "#ef4444" };
              const duration = j.started_at && j.completed_at ? `${Math.round((new Date(j.completed_at).getTime() - new Date(j.started_at).getTime()) / 1000)}s` : "";
              return (
                <div key={j.id} style={{ display: "grid", gridTemplateColumns: "auto auto 1fr auto auto", gap: 12, padding: "8px 12px", borderBottom: "1px solid var(--bd)", alignItems: "center", fontSize: 12 }}>
                  <span style={{ padding: "2px 8px", borderRadius: 4, background: color[j.status] + "22", color: color[j.status], fontWeight: 600, fontSize: 10, textTransform: "uppercase", minWidth: 60, textAlign: "center" }}>{j.status}</span>
                  <span style={{ color: "var(--fg3)", minWidth: 60 }}>{j.llm}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={promptText(j.prompt_id)}>{promptText(j.prompt_id)}</span>
                  <span style={{ color: "var(--fg3)", fontSize: 11 }}>{j.source === "scheduled" ? "🕐 sched" : "manuale"}{duration && ` · ${duration}`}</span>
                  <span style={{ color: "var(--fg3)", fontSize: 11 }}>{new Date(j.queued_at).toLocaleString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  {j.error && (
                    <span style={{ gridColumn: "1 / -1", color: "#ef4444", fontSize: 11, marginTop: 2, paddingLeft: 72 }}>{j.error}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

