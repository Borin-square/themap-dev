"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useLocalState } from "@/lib/useLocalState";
import type { GEOProject, StructuredDataResult } from "@/lib/geo/types";
import { emptyAudits } from "@/lib/geo/types";
import { getMockGEOProject } from "@/lib/geo/mock";
import { scoreColor } from "@/lib/geo/scoring";

export default function StructuredDataPage() {
  const params = useParams();
  const slug = params.company as string;

  const [project, setProject] = useLocalState<GEOProject>(
    `themap:${slug}:geoProject`, getMockGEOProject,
  );

  const [url, setUrl] = useState("");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMarkup, setShowMarkup] = useState<number | null>(null);

  const audits = project.audits ?? emptyAudits();
  const results = audits.structuredData;
  const latest = results.length > 0 ? results[results.length - 1] : null;

  async function runScan() {
    if (!url.trim()) return;
    setScanning(true);
    setError(null);
    try {
      const fullUrl = url.startsWith("http") ? url : `https://${url}`;
      const res = await fetch("/api/geo/audit-structured-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: fullUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Errore");
      const result = data as StructuredDataResult;
      setProject((p) => ({
        ...p,
        audits: { ...(p.audits ?? emptyAudits()), structuredData: [...(p.audits?.structuredData ?? []), result] },
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setScanning(false);
    }
  }

  const foundCount = latest ? latest.schemas.filter((s) => s.found).length : 0;
  const totalCount = latest ? latest.schemas.length : 0;

  return (
    <div className="geo-page">
      <div className="geo-head">
        <h1 className="geo-title">Structured Data</h1>
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

      {latest && (
        <>
          <div className="geo-kpi-grid">
            <div className="geo-kpi geo-kpi-big">
              <span className={`geo-kpi-n geo-c-${scoreColor(latest.overallScore)}`}>{latest.overallScore}</span>
              <span className="geo-kpi-l">SD Score</span>
            </div>
            <div className="geo-kpi">
              <span className="geo-kpi-n">{foundCount}/{totalCount}</span>
              <span className="geo-kpi-l">Schema Trovati</span>
            </div>
          </div>

          {/* Schema table */}
          <div className="geo-section-title">Schema.org Coverage</div>
          <div className="geo-table-wrap">
            <table className="geo-table">
              <thead>
                <tr>
                  <th>Schema</th>
                  <th>Stato</th>
                  <th>Proprieta</th>
                  <th>Mancanti</th>
                </tr>
              </thead>
              <tbody>
                {latest.schemas.map((s) => (
                  <tr key={s.type} className="geo-row">
                    <td style={{ fontWeight: 600 }}>{s.type}</td>
                    <td>
                      <span className={`geo-tag ${s.found ? "geo-tag-yes" : "geo-tag-no"}`}>
                        {s.found ? "Trovato" : "Assente"}
                      </span>
                    </td>
                    <td style={{ fontSize: 11, color: "var(--fg2)" }}>
                      {s.found ? s.properties.join(", ") : "-"}
                    </td>
                    <td style={{ fontSize: 11 }}>
                      {s.missing.length > 0 ? (
                        <span style={{ color: "var(--red)" }}>{s.missing.join(", ")}</span>
                      ) : s.found ? (
                        <span style={{ color: "var(--grn)" }}>Completo</span>
                      ) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

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

          {/* Suggested markup */}
          {latest.suggestedMarkup.length > 0 && (
            <>
              <div className="geo-section-title">
                Markup Suggerito ({latest.suggestedMarkup.length} schema)
                <button
                  className="geo-btn-small"
                  style={{ marginLeft: 8 }}
                  onClick={() => setShowMarkup(showMarkup !== null ? null : 0)}
                >
                  {showMarkup !== null ? "Chiudi" : "Mostra"}
                </button>
              </div>
              {showMarkup !== null && (
                <div className="geo-audit-markup-list">
                  {latest.suggestedMarkup.map((m, i) => (
                    <div key={i} className="geo-audit-markup-item">
                      <div className="geo-audit-markup-head">
                        <span style={{ fontWeight: 600, fontSize: 12 }}>Schema {i + 1}</span>
                        <button
                          className="geo-btn-small"
                          onClick={() => navigator.clipboard.writeText(`<script type="application/ld+json">\n${m}\n</script>`)}
                        >
                          Copia
                        </button>
                      </div>
                      <pre className="geo-audit-code">{m}</pre>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <div className="geo-audit-meta">
            Scansione: {new Date(latest.scannedAt).toLocaleString("it-IT")} | URL: {latest.url}
          </div>
        </>
      )}

      {!latest && !scanning && (
        <div className="geo-empty">
          <div className="geo-empty-title">Nessuna analisi</div>
          Inserisci l&apos;URL per analizzare i dati strutturati JSON-LD della pagina.
        </div>
      )}
    </div>
  );
}
