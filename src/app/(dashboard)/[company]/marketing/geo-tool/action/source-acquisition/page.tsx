"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useLocalState } from "@/lib/useLocalState";
import type { GEOProject, SourceAcquisitionResult } from "@/lib/geo/types";
import { emptyActions, GEO_SOURCE_LABELS } from "@/lib/geo/types";
import { getMockGEOProject } from "@/lib/geo/mock";
import { scoreColor } from "@/lib/geo/scoring";

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  "non-presente": { label: "Non presente", cls: "geo-tag-no" },
  "presente-debole": { label: "Debole", cls: "geo-tag-sent-neutro" },
  "presente-forte": { label: "Forte", cls: "geo-tag-yes" },
};

const LLM_COLORS: Record<string, string> = {
  ChatGPT: "#10a37f",
  Claude: "#d97706",
  Gemini: "#4285f4",
};

export default function SourceAcquisitionPage() {
  const params = useParams();
  const slug = params.company as string;

  const [project, setProject] = useLocalState<GEOProject>(
    `themap:${slug}:geoProject`, getMockGEOProject,
  );

  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cfg = project.config;
  const actions = project.actions ?? emptyActions();
  const results = actions.sourceAcquisition;
  const latest = results.length > 0 ? results[results.length - 1] : null;
  const canScan = cfg.brandName.trim().length > 0;

  // Collect existing citations from scans
  const existingCitations = project.prompts
    .flatMap((p) => p.scans.flatMap((s) => s.citations))
    .reduce<{ domain: string; type: string; brandMentioned: boolean }[]>((acc, c) => {
      if (!acc.find((a) => a.domain === c.domain)) {
        acc.push({ domain: c.domain, type: c.type, brandMentioned: c.brandMentioned });
      }
      return acc;
    }, []);

  async function runScan() {
    if (!canScan) return;
    setScanning(true);
    setError(null);
    try {
      const res = await fetch("/api/geo/source-acquisition", {
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
          existingCitations,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Errore");
      const result = data as SourceAcquisitionResult;
      setProject((p) => ({
        ...p,
        actions: {
          ...(p.actions ?? emptyActions()),
          sourceAcquisition: [...(p.actions?.sourceAcquisition ?? []), result],
        },
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setScanning(false);
    }
  }

  const llmsScanned = latest?.llmsScanned ?? [];
  const fromExisting = latest?.fromExistingScans ?? 0;

  return (
    <div className="geo-page">
      <div className="geo-head">
        <h1 className="geo-title">Source Acquisition</h1>
        <div className="geo-head-actions">
          <button className="geo-btn geo-btn-accent" disabled={scanning || !canScan} onClick={runScan}>
            {scanning ? "Scansione LLM..." : "Analizza Fonti"}
          </button>
        </div>
      </div>

      {!canScan && (
        <div className="geo-audit-error" style={{ background: "rgba(245,158,11,.08)", borderColor: "var(--org)", color: "var(--org)" }}>
          Configura il Brand Name nel Prompt Monitor prima di eseguire l&apos;analisi.
        </div>
      )}

      {error && <div className="geo-audit-error">{error}</div>}

      {scanning && (
        <div className="geo-empty">
          <div className="geo-empty-title">Interrogo gli LLM...</div>
          Sto chiedendo a ChatGPT, Claude e Gemini informazioni sulle fonti del tuo settore. Questo può richiedere fino a 2 minuti.
        </div>
      )}

      {latest && !scanning && (
        <>
          {/* LLM badges + meta */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: "var(--fg3)", marginRight: 4 }}>LLM consultati:</span>
            {llmsScanned.map((llm) => (
              <span key={llm} style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600,
                background: `${LLM_COLORS[llm] || "#666"}18`, color: LLM_COLORS[llm] || "#666",
                border: `1px solid ${LLM_COLORS[llm] || "#666"}30`,
              }}>
                {llm}
              </span>
            ))}
            {fromExisting > 0 && (
              <span style={{ fontSize: 11, color: "var(--fg3)" }}>
                + {fromExisting} citazioni dagli scan
              </span>
            )}
          </div>

          <div className="geo-kpi-grid">
            <div className="geo-kpi geo-kpi-big">
              <span className={`geo-kpi-n geo-c-${scoreColor(latest.currentCoverage)}`}>{latest.currentCoverage}</span>
              <span className="geo-kpi-l">Copertura Fonti</span>
            </div>
            <div className="geo-kpi">
              <span className="geo-kpi-n">{latest.targets.length}</span>
              <span className="geo-kpi-l">Fonti Identificate</span>
            </div>
            <div className="geo-kpi">
              <span className="geo-kpi-n geo-c-green">{latest.targets.filter((t) => t.brandFoundBy && t.brandFoundBy.length > 0).length}</span>
              <span className="geo-kpi-l">Brand Trovato</span>
            </div>
            <div className="geo-kpi">
              <span className="geo-kpi-n geo-c-red">{latest.targets.filter((t) => t.currentStatus === "non-presente" && t.priority === "alta").length}</span>
              <span className="geo-kpi-l">Gap Critici</span>
            </div>
          </div>

          <div className="geo-section-title">Fonti Target</div>
          <div className="geo-table-wrap">
            <table className="geo-table">
              <thead>
                <tr>
                  <th>Fonte</th>
                  <th>Tipo</th>
                  <th>Citato da</th>
                  <th>Stato</th>
                  <th>Priorità</th>
                  <th>Difficoltà</th>
                  <th>Azione</th>
                </tr>
              </thead>
              <tbody>
                {latest.targets.map((t, i) => {
                  const st = STATUS_LABELS[t.currentStatus] || { label: t.currentStatus, cls: "" };
                  const citedBy = t.citedBy || [];
                  const brandFoundBy = t.brandFoundBy || [];
                  return (
                    <tr key={i} className="geo-row">
                      <td>
                        <div style={{ fontWeight: 600 }}>{t.domain}</div>
                        {t.evidence && (
                          <div style={{ fontSize: 10, color: "var(--fg3)", marginTop: 2, lineHeight: 1.3, maxWidth: 220 }}>
                            {t.evidence}
                          </div>
                        )}
                      </td>
                      <td><span className="geo-tag">{GEO_SOURCE_LABELS[t.type] || t.type}</span></td>
                      <td>
                        <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                          {citedBy.length > 0 ? citedBy.map((llm) => (
                            <span key={llm} style={{
                              display: "inline-block", padding: "1px 5px", borderRadius: 3,
                              fontSize: 10, fontWeight: 600,
                              background: `${LLM_COLORS[llm] || "#666"}18`,
                              color: LLM_COLORS[llm] || "#666",
                            }}>
                              {llm}
                            </span>
                          )) : (
                            <span style={{ fontSize: 10, color: "var(--fg3)" }}>scan</span>
                          )}
                        </div>
                        {brandFoundBy.length > 0 && (
                          <div style={{ fontSize: 9, color: "var(--green)", marginTop: 2 }}>
                            Brand trovato da {brandFoundBy.join(", ")}
                          </div>
                        )}
                      </td>
                      <td><span className={`geo-tag ${st.cls}`}>{st.label}</span></td>
                      <td>
                        <span className={`geo-tag ${t.priority === "alta" ? "geo-audit-tag-critical" : t.priority === "media" ? "geo-audit-tag-warning" : "geo-audit-tag-info"}`}>
                          {t.priority.charAt(0).toUpperCase() + t.priority.slice(1)}
                        </span>
                      </td>
                      <td>
                        <span className={`geo-c-${scoreColor(100 - t.difficulty)}`} style={{ fontWeight: 600, fontSize: 12 }}>
                          {t.difficulty}/100
                        </span>
                      </td>
                      <td style={{ fontSize: 11, color: "var(--fg2)", maxWidth: 250 }}>{t.actionRequired}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
            Analisi: {new Date(latest.scannedAt).toLocaleString("it-IT")} | LLM: {llmsScanned.join(", ")} | Citazioni scan: {fromExisting}
          </div>
        </>
      )}

      {!latest && !scanning && canScan && (
        <div className="geo-empty">
          <div className="geo-empty-title">Nessuna analisi</div>
          Clicca &quot;Analizza Fonti&quot; per interrogare gli LLM e scoprire dove il brand dovrebbe essere presente.
        </div>
      )}
    </div>
  );
}
