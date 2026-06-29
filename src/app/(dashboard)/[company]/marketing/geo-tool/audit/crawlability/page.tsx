"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useLocalState } from "@/lib/useLocalState";
import type { GEOProject, CrawlabilityResult } from "@/lib/geo/types";
import { emptyAudits, AI_CRAWLER_INFO, AI_CRAWLERS_CRITICAL } from "@/lib/geo/types";
import { getMockGEOProject } from "@/lib/geo/mock";
import { scoreColor } from "@/lib/geo/scoring";

export default function CrawlabilityPage() {
  const params = useParams();
  const slug = params.company as string;

  const [project, setProject] = useLocalState<GEOProject>(
    `themap:${slug}:geoProject`, getMockGEOProject,
  );

  const [url, setUrl] = useState(project.config.siteUrl || "");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audits = project.audits ?? emptyAudits();
  const results = audits.crawlability;
  const latest = results.length > 0 ? results[results.length - 1] : null;

  async function runScan() {
    if (!url.trim()) return;
    setScanning(true);
    setError(null);
    try {
      const res = await fetch("/api/geo/audit-crawlability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteUrl: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Errore");
      const result = data as CrawlabilityResult;
      setProject((p) => ({
        ...p,
        audits: { ...(p.audits ?? emptyAudits()), crawlability: [...(p.audits?.crawlability ?? []), result] },
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
        <h1 className="geo-title">AI Crawlability</h1>
      </div>

      <div className="geo-audit-input-row">
        <input
          className="geo-add-input"
          placeholder="URL del sito (es. https://example.com)"
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
          {/* Score */}
          <div className="geo-kpi-grid">
            <div className="geo-kpi geo-kpi-big">
              <span className={`geo-kpi-n geo-c-${scoreColor(latest.score)}`}>{latest.score}</span>
              <span className="geo-kpi-l">Crawlability Score</span>
            </div>
            <div className="geo-kpi">
              <span className="geo-kpi-n">{latest.crawlers.filter((c) => c.status === "allowed").length}/{latest.crawlers.length}</span>
              <span className="geo-kpi-l">Crawler Ammessi</span>
            </div>
            <div className="geo-kpi">
              <span className={`geo-kpi-n ${latest.sitemap.found ? "geo-c-grn" : "geo-c-red"}`}>
                {latest.sitemap.found ? "Si" : "No"}
              </span>
              <span className="geo-kpi-l">Sitemap</span>
            </div>
            {latest.sitemap.entries != null && (
              <div className="geo-kpi">
                <span className="geo-kpi-n">{latest.sitemap.entries}</span>
                <span className="geo-kpi-l">URL in Sitemap</span>
              </div>
            )}
          </div>

          {/* Crawler table */}
          <div className="geo-section-title">Stato Crawler AI</div>
          <div className="geo-table-wrap">
            <table className="geo-table">
              <thead>
                <tr>
                  <th>Crawler</th>
                  <th>Provider / Uso</th>
                  <th>Stato</th>
                  <th>Regola</th>
                </tr>
              </thead>
              <tbody>
                {latest.crawlers.map((c) => {
                  const info = AI_CRAWLER_INFO[c.name];
                  const isCritical = AI_CRAWLERS_CRITICAL.has(c.name);
                  return (
                    <tr key={c.name} className="geo-row">
                      <td style={{ fontWeight: 600 }}>
                        {c.name}
                        {isCritical && (
                          <span title="Crawler critico per visibilità AI" style={{ marginLeft: 6, fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "rgba(239,68,68,.14)", color: "#ef4444", fontWeight: 700 }}>
                            CRITICO
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: 11, color: "var(--fg2)" }}>
                        {info ? (
                          <>
                            <strong style={{ color: "var(--fg)" }}>{info.provider}</strong>
                            <span style={{ color: "var(--fg3)" }}> — {info.purpose}</span>
                          </>
                        ) : "-"}
                      </td>
                      <td>
                        <span className={`geo-tag ${c.status === "allowed" ? "geo-tag-yes" : c.status === "blocked" ? "geo-tag-no" : ""}`}>
                          {c.status === "allowed" ? "Ammesso" : c.status === "blocked" ? "Bloccato" : "Sconosciuto"}
                        </span>
                      </td>
                      <td style={{ fontSize: 11, color: "var(--fg3)" }}>{c.rule || "-"}</td>
                    </tr>
                  );
                })}
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
                    {issue.detail && <div className="geo-audit-issue-detail">{issue.detail}</div>}
                    {issue.fix && <div className="geo-audit-issue-fix">Fix: {issue.fix}</div>}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* robots.txt preview */}
          {latest.robotsTxt && (
            <>
              <div className="geo-section-title">robots.txt</div>
              <pre className="geo-audit-code">{latest.robotsTxt}</pre>
            </>
          )}

          <div className="geo-audit-meta">
            Scansione: {new Date(latest.scannedAt).toLocaleString("it-IT")} | URL: {latest.url}
          </div>
        </>
      )}

      {!latest && !scanning && (
        <div className="geo-empty">
          <div className="geo-empty-title">Nessuna scansione</div>
          Inserisci l&apos;URL del tuo sito per verificare l&apos;accessibilita ai crawler AI.
        </div>
      )}
    </div>
  );
}
