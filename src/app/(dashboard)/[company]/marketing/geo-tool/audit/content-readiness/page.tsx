"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useLocalState } from "@/lib/useLocalState";
import type { GEOProject, ContentReadinessResult } from "@/lib/geo/types";
import { emptyAudits } from "@/lib/geo/types";
import { getMockGEOProject } from "@/lib/geo/mock";
import { scoreColor } from "@/lib/geo/scoring";
import { AuditLogPanel } from "@/components/AuditLogPanel";

const SCORE_LABELS: Record<string, string> = {
  clarity: "Chiarezza",
  completeness: "Completezza",
  structure: "Struttura",
  specificity: "Specificita",
  proofPresence: "Prove/Dati",
  faqPresence: "FAQ",
  dataPresence: "Dati/Statistiche",
  extractability: "Estraibilita",
};

export default function ContentReadinessPage() {
  const params = useParams();
  const slug = params.company as string;

  const [project, setProject] = useLocalState<GEOProject>(
    `themap:${slug}:geoProject`, getMockGEOProject,
  );

  const [url, setUrl] = useState("");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const audits = project.audits ?? emptyAudits();
  const results = audits.contentReadiness;
  const selected = selectedId ? results.find((r) => r.id === selectedId) : results.length > 0 ? results[results.length - 1] : null;

  async function runScan() {
    if (!url.trim()) return;
    setScanning(true);
    setError(null);
    try {
      const fullUrl = url.startsWith("http") ? url : `https://${url}`;
      const res = await fetch("/api/geo/audit-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
              url: fullUrl,
              brandName: project.config.brandName,
              industry: project.config.industry,
              services: project.config.services,
            }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Errore");
      const result = data as ContentReadinessResult;
      setProject((p) => ({
        ...p,
        audits: { ...(p.audits ?? emptyAudits()), contentReadiness: [...(p.audits?.contentReadiness ?? []), result] },
      }));
      setSelectedId(result.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="geo-page">
      <div className="geo-head">
        <h1 className="geo-title">Content Readiness</h1>
      </div>

      <div className="geo-audit-input-row">
        <input
          className="geo-add-input"
          placeholder="URL della pagina da analizzare"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !scanning && runScan()}
        />
        <button className="geo-btn geo-btn-accent" disabled={scanning || !url.trim()} onClick={runScan}>
          {scanning ? "Analisi..." : "Analizza"}
        </button>
      </div>

      {error && <div className="geo-audit-error">{error}</div>}

      {/* History tabs */}
      {results.length > 1 && (
        <div className="geo-audit-history">
          {results.map((r) => (
            <button
              key={r.id}
              className={`geo-btn-small${selected?.id === r.id ? " geo-btn-active" : ""}`}
              onClick={() => setSelectedId(r.id)}
            >
              {r.title || r.url} - {new Date(r.scannedAt).toLocaleDateString("it-IT")}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <>
          {/* Overall score */}
          <div className="geo-kpi-grid">
            <div className="geo-kpi geo-kpi-big">
              <span className={`geo-kpi-n geo-c-${scoreColor(selected.overallScore)}`}>{selected.overallScore}</span>
              <span className="geo-kpi-l">Content Score</span>
            </div>
          </div>

          {/* Score bars */}
          <div className="geo-section-title">Punteggi Dettagliati</div>
          <div className="geo-audit-scores">
            {Object.entries(selected.scores).map(([key, val]) => (
              <div key={key} className="geo-audit-score-row">
                <span className="geo-audit-score-label">{SCORE_LABELS[key] || key}</span>
                <div className="geo-audit-bar-wrap">
                  <div className="geo-audit-bar" style={{ width: `${val}%`, background: `var(--${scoreColor(val)})` }} />
                </div>
                <span className={`geo-audit-score-val geo-c-${scoreColor(val)}`}>{val}</span>
              </div>
            ))}
          </div>

          {/* Missing blocks */}
          {selected.missingBlocks.length > 0 && (
            <>
              <div className="geo-section-title">Blocchi Mancanti</div>
              <div className="geo-audit-list">
                {selected.missingBlocks.map((b, i) => (
                  <div key={i} className="geo-audit-list-item">{b}</div>
                ))}
              </div>
            </>
          )}

          {/* Issues */}
          {selected.issues.length > 0 && (
            <>
              <div className="geo-section-title">Problemi Rilevati</div>
              <div className="geo-audit-issues">
                {selected.issues.map((issue, i) => (
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
          {selected.suggestions.length > 0 && (
            <>
              <div className="geo-section-title">Suggerimenti</div>
              <div className="geo-audit-list">
                {selected.suggestions.map((s, i) => (
                  <div key={i} className="geo-audit-list-item geo-audit-list-suggestion">{s}</div>
                ))}
              </div>
            </>
          )}

          <div className="geo-audit-meta">
            Scansione: {new Date(selected.scannedAt).toLocaleString("it-IT")} | Pagina: {selected.title}
          </div>

          <AuditLogPanel
            log={selected._log}
            toolName="content-readiness"
            extra={{ input: { url: selected.url, brandName: project.config.brandName }, result: selected }}
          />
        </>
      )}

      {!selected && !scanning && (
        <div className="geo-empty">
          <div className="geo-empty-title">Nessuna analisi</div>
          Inserisci l&apos;URL di una pagina per verificare se e adatta a essere citata dagli LLM.
        </div>
      )}
    </div>
  );
}
