"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useLocalState } from "@/lib/useLocalState";
import type { GEOProject, ContentGapsResult } from "@/lib/geo/types";
import { emptyActions } from "@/lib/geo/types";
import { getMockGEOProject } from "@/lib/geo/mock";
import { scoreColor } from "@/lib/geo/scoring";

const TYPE_LABELS: Record<string, string> = {
  pagina: "Pagina", sezione: "Sezione", faq: "FAQ",
  "case-study": "Case Study", guida: "Guida", blog: "Blog",
};

const PRIORITY_CLS: Record<string, string> = {
  alta: "geo-audit-tag-critical", media: "geo-audit-tag-warning", bassa: "geo-audit-tag-info",
};

export default function ContentGapsPage() {
  const params = useParams();
  const slug = params.company as string;

  const [project, setProject] = useLocalState<GEOProject>(
    `themap:${slug}:geoProject`, getMockGEOProject,
  );

  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cfg = project.config;
  const actions = project.actions ?? emptyActions();
  const results = actions.contentGaps;
  const latest = results.length > 0 ? results[results.length - 1] : null;
  const canScan = cfg.brandName.trim().length > 0;

  // Collect scan data for the API
  const scannedPrompts = project.prompts
    .filter((p) => p.scans.length > 0)
    .map((p) => ({
      text: p.text,
      mentioned: p.scans.some((s) => s.brandMentioned),
      sentiment: p.scans[0]?.sentiment?.label || "neutro",
    }));

  async function runScan() {
    if (!canScan) return;
    setScanning(true);
    setError(null);
    try {
      const res = await fetch("/api/geo/content-gaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandName: cfg.brandName,
          siteUrl: cfg.siteUrl,
          services: cfg.services,
          competitors: cfg.competitors,
          industry: cfg.industry,
          country: cfg.country,
          market: cfg.market,
          buyerPersonas: cfg.buyerPersonas,
          problems: cfg.problems,
          scannedPrompts,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Errore");
      const result = data as ContentGapsResult;
      setProject((p) => ({
        ...p,
        actions: {
          ...(p.actions ?? emptyActions()),
          contentGaps: [...(p.actions?.contentGaps ?? []), result],
        },
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="geo-page">
      <div className="geo-head">
        <h1 className="geo-title">Content Gaps</h1>
        <div className="geo-head-actions">
          <button className="geo-btn geo-btn-accent" disabled={scanning || !canScan} onClick={runScan}>
            {scanning ? "Analisi..." : "Trova Gap"}
          </button>
        </div>
      </div>

      {!canScan && (
        <div className="geo-audit-error" style={{ background: "rgba(245,158,11,.08)", borderColor: "var(--org)", color: "var(--org)" }}>
          Configura il Brand Name nel Prompt Monitor prima di eseguire l&apos;analisi.
        </div>
      )}

      {error && <div className="geo-audit-error">{error}</div>}

      {latest && (
        <>
          <div className="geo-kpi-grid">
            <div className="geo-kpi geo-kpi-big">
              <span className={`geo-kpi-n geo-c-${scoreColor(latest.overallCoverage)}`}>{latest.overallCoverage}</span>
              <span className="geo-kpi-l">Copertura Contenuti</span>
            </div>
            <div className="geo-kpi">
              <span className="geo-kpi-n">{latest.gaps.length}</span>
              <span className="geo-kpi-l">Gap Trovati</span>
            </div>
            <div className="geo-kpi">
              <span className="geo-kpi-n geo-c-red">{latest.gaps.filter((g) => g.priority === "alta").length}</span>
              <span className="geo-kpi-l">Alta Priorita</span>
            </div>
          </div>

          <div className="geo-section-title">Gap di Contenuto</div>
          <div className="geo-audit-issues">
            {latest.gaps.map((gap, i) => (
              <div key={i} className={`geo-audit-issue geo-audit-issue-${gap.priority === "alta" ? "critical" : gap.priority === "media" ? "warning" : "info"}`}>
                <div className="geo-audit-issue-head">
                  <span className={`geo-tag ${PRIORITY_CLS[gap.priority] || ""}`}>
                    {gap.priority.charAt(0).toUpperCase() + gap.priority.slice(1)}
                  </span>
                  <span className="geo-tag">{TYPE_LABELS[gap.contentType] || gap.contentType}</span>
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--fg3)" }}>
                    Impatto: {gap.estimatedImpact}/100
                  </span>
                </div>
                <div className="geo-audit-issue-msg" style={{ fontWeight: 600 }}>{gap.topic}</div>
                <div className="geo-audit-issue-detail">{gap.description}</div>
                {gap.relatedPrompts.length > 0 && (
                  <div style={{ marginTop: 6, fontSize: 10, color: "var(--fg3)" }}>
                    Prompt correlati: {gap.relatedPrompts.join(" | ")}
                  </div>
                )}
              </div>
            ))}
          </div>

          {latest.suggestions.length > 0 && (
            <>
              <div className="geo-section-title">Suggerimenti</div>
              <div className="geo-audit-list">
                {latest.suggestions.map((s, i) => (
                  <div key={i} className="geo-audit-list-item geo-audit-list-suggestion">{s}</div>
                ))}
              </div>
            </>
          )}

          <div className="geo-audit-meta">
            Analisi: {new Date(latest.scannedAt).toLocaleString("it-IT")} | Prompt analizzati: {scannedPrompts.length}
          </div>
        </>
      )}

      {!latest && !scanning && canScan && (
        <div className="geo-empty">
          <div className="geo-empty-title">Nessuna analisi</div>
          Clicca &quot;Trova Gap&quot; per identificare i contenuti mancanti.
          {scannedPrompts.length === 0 && (
            <div style={{ marginTop: 8, fontSize: 11 }}>
              Suggerimento: esegui prima alcune scansioni nel Prompt Monitor per risultati migliori.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
