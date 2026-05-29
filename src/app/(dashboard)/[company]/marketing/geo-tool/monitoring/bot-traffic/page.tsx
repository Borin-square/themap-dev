"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useLocalState } from "@/lib/useLocalState";
import type { GEOProject, BotTrafficCheck } from "@/lib/geo/types";
import { emptyMonitoring } from "@/lib/geo/types";
import { getMockGEOProject } from "@/lib/geo/mock";
import { scoreColor } from "@/lib/geo/scoring";

export default function BotTrafficPage() {
  const params = useParams();
  const slug = params.company as string;

  const [project, setProject] = useLocalState<GEOProject>(
    `themap:${slug}:geoProject`, getMockGEOProject,
  );

  const [url, setUrl] = useState(project.config.siteUrl || "");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const monitoring = project.monitoring ?? emptyMonitoring();
  const results = monitoring.botTraffic;
  const latest = results.length > 0 ? results[results.length - 1] : null;

  async function runCheck() {
    if (!url.trim()) return;
    setScanning(true);
    setError(null);
    try {
      const res = await fetch("/api/geo/bot-traffic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Errore");
      const result = data as BotTrafficCheck;
      setProject((p) => ({
        ...p,
        monitoring: {
          ...(p.monitoring ?? emptyMonitoring()),
          botTraffic: [...(p.monitoring?.botTraffic ?? []), result],
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
        <h1 className="geo-title">Bot Traffic</h1>
      </div>

      <div className="geo-audit-input-row">
        <input
          className="geo-add-input"
          placeholder="URL del sito da testare"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !scanning && runCheck()}
        />
        <button className="geo-btn geo-btn-accent" disabled={scanning || !url.trim()} onClick={runCheck}>
          {scanning ? "Test..." : "Testa Accesso Bot"}
        </button>
      </div>

      {error && <div className="geo-audit-error">{error}</div>}

      {latest && (
        <>
          <div className="geo-kpi-grid">
            <div className="geo-kpi geo-kpi-big">
              <span className={`geo-kpi-n geo-c-${scoreColor(latest.overallScore)}`}>{latest.overallScore}</span>
              <span className="geo-kpi-l">Accessibilita Bot</span>
            </div>
            <div className="geo-kpi">
              <span className="geo-kpi-n geo-c-grn">{latest.crawlers.filter((c) => c.accessible).length}</span>
              <span className="geo-kpi-l">Accessibili</span>
            </div>
            <div className="geo-kpi">
              <span className="geo-kpi-n geo-c-red">{latest.crawlers.filter((c) => !c.accessible).length}</span>
              <span className="geo-kpi-l">Bloccati</span>
            </div>
          </div>

          <div className="geo-section-title">Test Accesso per User-Agent</div>
          <div className="geo-table-wrap">
            <table className="geo-table">
              <thead>
                <tr>
                  <th>Crawler</th>
                  <th>Accesso</th>
                  <th>HTTP Status</th>
                  <th>Tempo Risposta</th>
                </tr>
              </thead>
              <tbody>
                {latest.crawlers.map((c) => (
                  <tr key={c.name} className="geo-row">
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td>
                      <span className={`geo-tag ${c.accessible ? "geo-tag-yes" : "geo-tag-no"}`}>
                        {c.accessible ? "OK" : "Bloccato"}
                      </span>
                    </td>
                    <td style={{ fontSize: 12 }}>{c.statusCode ?? "-"}</td>
                    <td style={{ fontSize: 12 }}>{c.responseTime ? `${c.responseTime}ms` : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

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

          {/* History */}
          {results.length > 1 && (
            <>
              <div className="geo-section-title">Storico ({results.length} test)</div>
              <div className="geo-table-wrap">
                <table className="geo-table">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Score</th>
                      <th>Accessibili</th>
                      <th>Bloccati</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...results].reverse().map((r) => (
                      <tr key={r.id} className="geo-row">
                        <td style={{ fontSize: 11 }}>{new Date(r.scannedAt).toLocaleString("it-IT")}</td>
                        <td><span className={`geo-c-${scoreColor(r.overallScore)}`} style={{ fontWeight: 700 }}>{r.overallScore}</span></td>
                        <td>{r.crawlers.filter((c) => c.accessible).length}</td>
                        <td>{r.crawlers.filter((c) => !c.accessible).length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className="geo-audit-meta">
            Test: {new Date(latest.scannedAt).toLocaleString("it-IT")} | URL: {latest.url}
          </div>
        </>
      )}

      {!latest && !scanning && (
        <div className="geo-empty">
          <div className="geo-empty-title">Nessun test</div>
          Testa se i bot AI possono accedere al tuo sito simulando i loro user-agent.
        </div>
      )}
    </div>
  );
}
