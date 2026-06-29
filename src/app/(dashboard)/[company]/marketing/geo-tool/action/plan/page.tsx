"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useLocalState } from "@/lib/useLocalState";
import type { GEOProject, ActionPlanResult, ActionItem, AuditIssue } from "@/lib/geo/types";
import { emptyActions, emptyAudits } from "@/lib/geo/types";
import { getMockGEOProject } from "@/lib/geo/mock";

const CAT_LABELS: Record<string, string> = {
  content: "Contenuto", technical: "Tecnico", source: "Fonti",
  entity: "Entita", "structured-data": "Dati Strutturati",
};

const CAT_COLORS: Record<string, string> = {
  content: "rgba(79,140,255,.12)", technical: "rgba(139,92,246,.12)",
  source: "rgba(245,158,11,.12)", entity: "rgba(34,197,94,.12)",
  "structured-data": "rgba(236,72,153,.12)",
};

const PRIORITY_ORDER: Record<string, number> = { alta: 0, media: 1, bassa: 2 };

export default function ActionPlanPage() {
  const params = useParams();
  const slug = params.company as string;

  const [project, setProject] = useLocalState<GEOProject>(
    `themap:${slug}:geoProject`, getMockGEOProject,
  );

  const [scanning, setScanning] = useState(false);
  const [scanStartedAt, setScanStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [filterCat, setFilterCat] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  useEffect(() => {
    if (!scanning || !scanStartedAt) return;
    const id = setInterval(() => setElapsed(Math.round((Date.now() - scanStartedAt) / 1000)), 500);
    return () => clearInterval(id);
  }, [scanning, scanStartedAt]);

  const progressStep =
    elapsed < 10 ? "Raccolgo dati audit e gaps…" :
    elapsed < 30 ? "Analizzo priorità e impatto…" :
    elapsed < 60 ? "Genero il piano d'azione…" :
    elapsed < 90 ? "Strutturo le azioni per categoria…" :
    "Ultimi ritocchi…";

  const cfg = project.config;
  const actions = project.actions ?? emptyActions();
  const audits = project.audits ?? emptyAudits();
  const plan = actions.actionPlan;
  const canScan = cfg.brandName.trim().length > 0;

  // Collect all audit issues
  const allIssues: AuditIssue[] = [
    ...audits.crawlability.flatMap((r) => r.issues),
    ...audits.contentReadiness.flatMap((r) => r.issues),
    ...audits.structuredData.flatMap((r) => r.issues),
    ...audits.entityStrength.flatMap((r) => r.issues),
  ];

  // Latest audit scores
  const auditScores = {
    crawlability: audits.crawlability.at(-1)?.score,
    contentReadiness: audits.contentReadiness.at(-1)?.overallScore,
    structuredData: audits.structuredData.at(-1)?.overallScore,
    entityStrength: audits.entityStrength.at(-1)?.overallScore,
  };

  const contentGaps = (actions.contentGaps.at(-1)?.gaps || []).map((g) => ({
    topic: g.topic, priority: g.priority,
  }));

  const sourceTargets = (actions.sourceAcquisition.at(-1)?.targets || []).map((t) => ({
    domain: t.domain, priority: t.priority, actionRequired: t.actionRequired,
  }));

  async function generatePlan() {
    if (!canScan) return;
    setScanning(true);
    setScanStartedAt(Date.now());
    setElapsed(0);
    setError(null);
    try {
      const res = await fetch("/api/geo/action-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandName: cfg.brandName,
          siteUrl: cfg.siteUrl,
          industry: cfg.industry,
          country: cfg.country,
          market: cfg.market,
          services: cfg.services,
          problems: cfg.problems,
          auditIssues: allIssues,
          contentGaps,
          sourceTargets,
          auditScores,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Errore");
      const result = data as ActionPlanResult;
      setProject((p) => ({
        ...p,
        actions: { ...(p.actions ?? emptyActions()), actionPlan: result },
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setScanning(false);
      setScanStartedAt(null);
    }
  }

  function updateItemStatus(itemId: string, status: ActionItem["status"]) {
    if (!plan) return;
    setProject((p) => ({
      ...p,
      actions: {
        ...(p.actions ?? emptyActions()),
        actionPlan: {
          ...plan,
          items: plan.items.map((it) => it.id === itemId ? { ...it, status } : it),
        },
      },
    }));
  }

  const filteredItems = (plan?.items || [])
    .filter((it) => !filterCat || it.category === filterCat)
    .filter((it) => !filterStatus || it.status === filterStatus)
    .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9));

  const completed = plan?.items.filter((i) => i.status === "completato").length || 0;
  const total = plan?.items.length || 0;

  return (
    <div className="geo-page">
      <div className="geo-head">
        <h1 className="geo-title">Action Plan</h1>
        <div className="geo-head-actions">
          <button className="geo-btn geo-btn-accent" disabled={scanning || !canScan} onClick={generatePlan}>
            {scanning ? "Generazione..." : plan ? "Rigenera Piano" : "Genera Piano"}
          </button>
        </div>
      </div>

      {!canScan && (
        <div className="geo-audit-error" style={{ background: "rgba(245,158,11,.08)", borderColor: "var(--org)", color: "var(--org)" }}>
          Configura il Brand Name nel Prompt Monitor.
        </div>
      )}

      {scanning && (
        <div className="geo-audit-config-summary" style={{ display: "flex", alignItems: "center", gap: 12, padding: 14 }}>
          <span className="geo-spinner" />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>{progressStep}</div>
            <div style={{ fontSize: 11, color: "var(--fg3)" }}>
              {elapsed}s trascorsi — l'analisi può richiedere fino a ~2 minuti
            </div>
          </div>
        </div>
      )}

      {error && !scanning && <div className="geo-audit-error">{error}</div>}

      {plan && (
        <>
          {/* Progress */}
          <div className="geo-kpi-grid">
            <div className="geo-kpi geo-kpi-big">
              <span className="geo-kpi-n">{completed}/{total}</span>
              <span className="geo-kpi-l">Completate</span>
            </div>
            <div className="geo-kpi">
              <span className="geo-kpi-n geo-c-red">{plan.items.filter((i) => i.priority === "alta" && i.status !== "completato").length}</span>
              <span className="geo-kpi-l">Urgenti</span>
            </div>
            <div className="geo-kpi">
              <span className="geo-kpi-n geo-c-org">{plan.items.filter((i) => i.status === "in-corso").length}</span>
              <span className="geo-kpi-l">In Corso</span>
            </div>
          </div>

          {plan.summary && (
            <div className="geo-audit-config-summary">{plan.summary}</div>
          )}

          {/* Filters */}
          <div className="geo-filters">
            <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
              <option value="">Tutte le categorie</option>
              {Object.entries(CAT_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">Tutti gli stati</option>
              <option value="da-fare">Da fare</option>
              <option value="in-corso">In corso</option>
              <option value="completato">Completato</option>
            </select>
            <span className="geo-filter-count">{filteredItems.length} azioni</span>
          </div>

          {/* Action items */}
          <div className="geo-action-items">
            {filteredItems.map((item) => (
              <div key={item.id} className={`geo-action-item ${item.status === "completato" ? "geo-action-done" : ""}`}>
                <div className="geo-action-item-head">
                  <span className="geo-tag" style={{ background: CAT_COLORS[item.category], color: "var(--fg)" }}>
                    {CAT_LABELS[item.category] || item.category}
                  </span>
                  <span className={`geo-tag ${item.priority === "alta" ? "geo-audit-tag-critical" : item.priority === "media" ? "geo-audit-tag-warning" : "geo-audit-tag-info"}`}>
                    {item.priority.charAt(0).toUpperCase() + item.priority.slice(1)}
                  </span>
                  <span style={{ fontSize: 10, color: "var(--fg3)" }}>
                    Effort: {item.effort} | Impact: {item.impact}
                  </span>
                  <select
                    className="geo-select-sm"
                    style={{ marginLeft: "auto" }}
                    value={item.status}
                    onChange={(e) => updateItemStatus(item.id, e.target.value as ActionItem["status"])}
                  >
                    <option value="da-fare">Da fare</option>
                    <option value="in-corso">In corso</option>
                    <option value="completato">Completato</option>
                  </select>
                </div>
                <div className="geo-action-item-title">{item.title}</div>
                <div className="geo-action-item-desc">{item.description}</div>
              </div>
            ))}
          </div>

          <div className="geo-audit-meta">
            Piano generato: {new Date(plan.generatedAt).toLocaleString("it-IT")}
          </div>
        </>
      )}

      {!plan && !scanning && canScan && (
        <div className="geo-empty">
          <div className="geo-empty-title">Nessun piano</div>
          Genera un piano d&apos;azione basato su audit, content gaps e source acquisition.
          {allIssues.length === 0 && contentGaps.length === 0 && (
            <div style={{ marginTop: 8, fontSize: 11 }}>
              Suggerimento: esegui prima gli audit e l&apos;analisi content gaps per un piano piu completo.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
