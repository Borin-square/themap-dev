"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useLocalState } from "@/lib/useLocalState";
import type { GEOProject, EntityStrengthResult } from "@/lib/geo/types";
import { emptyAudits } from "@/lib/geo/types";
import { getMockGEOProject } from "@/lib/geo/mock";
import { scoreColor } from "@/lib/geo/scoring";
import { AuditLogPanel } from "@/components/AuditLogPanel";

const SCORE_LABELS: Record<string, string> = {
  consistency: "Coerenza Brand",
  externalPresence: "Presenza Esterna",
  structuredData: "Dati Strutturati",
  citations: "Citazioni",
  reviews: "Recensioni",
  serviceClarity: "Chiarezza Servizi",
  geoClarity: "Chiarezza Geografica",
};

const ENTITY_STATUS: Record<string, { label: string; cls: string }> = {
  strong: { label: "Forte", cls: "geo-tag-yes" },
  weak: { label: "Debole", cls: "geo-tag-sent-neutro" },
  missing: { label: "Assente", cls: "geo-tag-no" },
};

const ENTITY_TYPE_LABELS: Record<string, string> = {
  brand: "Brand",
  service: "Servizio",
  location: "Localita",
  person: "Persona",
  industry: "Settore",
  client: "Cliente",
  certification: "Certificazione",
};

const CONFIDENCE_LABELS: Record<string, { label: string; cls: string }> = {
  high: { label: "Alta", cls: "geo-tag-yes" },
  medium: { label: "Media", cls: "geo-tag-sent-neutro" },
  low: { label: "Bassa", cls: "geo-tag-no" },
};

export default function EntityStrengthPage() {
  const params = useParams();
  const slug = params.company as string;

  const [project, setProject] = useLocalState<GEOProject>(
    `themap:${slug}:geoProject`, getMockGEOProject,
  );

  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cfg = project.config;
  const audits = project.audits ?? emptyAudits();
  const results = audits.entityStrength;
  const latest = results.length > 0 ? results[results.length - 1] : null;

  const canScan = cfg.brandName.trim().length > 0;

  async function runScan() {
    if (!canScan) return;
    setScanning(true);
    setError(null);
    try {
      const res = await fetch("/api/geo/audit-entity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandName: cfg.brandName,
          siteUrl: cfg.siteUrl,
          services: cfg.services,
          competitors: cfg.competitors,
          country: cfg.country,
          industry: cfg.industry,
          market: cfg.market,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Errore");
      const result = data as EntityStrengthResult;
      setProject((p) => ({
        ...p,
        audits: { ...(p.audits ?? emptyAudits()), entityStrength: [...(p.audits?.entityStrength ?? []), result] },
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
        <h1 className="geo-title">Entity Strength</h1>
        <div className="geo-head-actions">
          <button className="geo-btn geo-btn-accent" disabled={scanning || !canScan} onClick={runScan}>
            {scanning ? "Analisi..." : "Analizza Entita"}
          </button>
        </div>
      </div>

      {!canScan && (
        <div className="geo-audit-error" style={{ background: "rgba(245,158,11,.08)", borderColor: "var(--org)", color: "var(--org)" }}>
          Configura il Brand Name nel Prompt Monitor prima di eseguire l&apos;analisi.
        </div>
      )}

      {error && <div className="geo-audit-error">{error}</div>}

      {/* Config summary */}
      {canScan && (
        <div className="geo-audit-config-summary">
          <strong>{cfg.brandName}</strong>
          {cfg.siteUrl && <> | {cfg.siteUrl}</>}
          {cfg.industry && <> | {cfg.industry}</>}
          {cfg.services.length > 0 && <> | Servizi: {cfg.services.join(", ")}</>}
        </div>
      )}

      {latest && (
        <>
          {/* Overall score */}
          <div className="geo-kpi-grid">
            <div className="geo-kpi geo-kpi-big">
              <span className={`geo-kpi-n geo-c-${scoreColor(latest.overallScore)}`}>{latest.overallScore}</span>
              <span className="geo-kpi-l">Entity Score</span>
            </div>
          </div>

          {/* Score bars */}
          <div className="geo-section-title">Punteggi Dettagliati</div>
          <div className="geo-audit-scores">
            {Object.entries(latest.scores).map(([key, val]) => (
              <div key={key} className="geo-audit-score-row">
                <span className="geo-audit-score-label">{SCORE_LABELS[key] || key}</span>
                <div className="geo-audit-bar-wrap">
                  <div className="geo-audit-bar" style={{ width: `${val}%`, background: `var(--${scoreColor(val)})` }} />
                </div>
                <span className={`geo-audit-score-val geo-c-${scoreColor(val)}`}>{val}</span>
              </div>
            ))}
          </div>

          {/* Entities */}
          {latest.entities.length > 0 && (
            <>
              <div className="geo-section-title">Entita Riconosciute</div>
              <div className="geo-table-wrap">
                <table className="geo-table">
                  <thead>
                    <tr>
                      <th>Entita</th>
                      <th>Tipo</th>
                      <th>Stato</th>
                      <th>Confidenza</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latest.entities.map((e, i) => {
                      const st = ENTITY_STATUS[e.status] || { label: e.status, cls: "" };
                      const conf = CONFIDENCE_LABELS[e.confidence] || { label: e.confidence || "–", cls: "" };
                      return (
                        <tr key={i} className="geo-row">
                          <td>
                            <div style={{ fontWeight: 600 }}>{e.name}</div>
                            {e.description && <div style={{ fontSize: "0.82em", opacity: 0.7, marginTop: 2 }}>{e.description}</div>}
                          </td>
                          <td><span className="geo-tag">{ENTITY_TYPE_LABELS[e.type] || e.type}</span></td>
                          <td><span className={`geo-tag ${st.cls}`}>{st.label}</span></td>
                          <td><span className={`geo-tag ${conf.cls}`}>{conf.label}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Issues */}
          {latest.issues.length > 0 && (
            <>
              <div className="geo-section-title">Problemi Rilevati</div>
              <div className="geo-audit-issues">
                {latest.issues.map((issue, i) => (
                  <div key={i} className={`geo-audit-issue geo-audit-issue-${issue.type}`}>
                    <div className="geo-audit-issue-head">
                      <span className={`geo-tag geo-audit-tag-${issue.type}`}>
                        {issue.type === "critical" ? "Critico" : issue.type === "warning" ? "Attenzione" : "Info"}
                      </span>
                      <span className="geo-audit-issue-cat">{issue.category}</span>
                    </div>
                    <div className="geo-audit-issue-msg">{issue.message}</div>
                    {issue.fix && <div className="geo-audit-issue-fix">Fix: {issue.fix}</div>}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Suggestions */}
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
            Scansione: {new Date(latest.scannedAt).toLocaleString("it-IT")}
          </div>

          <AuditLogPanel
            log={latest._log}
            toolName="entity-strength"
            extra={{ config: cfg, result: latest }}
          />
        </>
      )}

      {!latest && !scanning && canScan && (
        <div className="geo-empty">
          <div className="geo-empty-title">Nessuna analisi</div>
          Clicca &quot;Analizza Entita&quot; per valutare la forza del brand come entita riconoscibile dagli LLM.
        </div>
      )}
    </div>
  );
}
