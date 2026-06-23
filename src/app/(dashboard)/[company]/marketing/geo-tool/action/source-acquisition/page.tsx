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
  const [selectedLLM, setSelectedLLM] = useState<string>("Gemini");

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
          llms: [selectedLLM],
        }),
      });
      const text = await res.text();
      let data: unknown;
      try { data = JSON.parse(text); }
      catch { throw new Error(`Risposta non-JSON dal server (HTTP ${res.status}). Probabile timeout: riprova fra qualche secondo.`); }
      if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
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
          <select
            className="geo-select"
            value={selectedLLM}
            onChange={(e) => setSelectedLLM(e.target.value)}
            disabled={scanning}
            title="LLM da interrogare per la discovery"
          >
            <option value="Gemini">Gemini (veloce)</option>
            <option value="Claude">Claude</option>
            <option value="ChatGPT">ChatGPT</option>
          </select>
          <button className="geo-btn geo-btn-accent" disabled={scanning || !canScan} onClick={runScan}>
            {scanning ? "Scansione LLM..." : latest ? "Nuova scansione" : "Analizza Fonti"}
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
          <div className="geo-empty-title">Interrogo {selectedLLM}...</div>
          {selectedLLM === "Gemini" && "Gemini fa una ricerca live su Google e ritorna le fonti rilevanti per il tuo settore. Solitamente 20-40s."}
          {selectedLLM === "Claude" && "Claude fa una web search e ritorna le fonti. Solitamente 30-60s."}
          {selectedLLM === "ChatGPT" && "ChatGPT fa una web search e ritorna le fonti. Solitamente 20-40s."}
        </div>
      )}

      {latest && !scanning && (
        <>
          {/* Meta: data scan + LLM + retry warning */}
          {(() => {
            const scannedAtTs = latest.scannedAt ? new Date(latest.scannedAt).getTime() : 0;
            const ageMs = scannedAtTs ? Date.now() - scannedAtTs : 0;
            const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
            const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
            const ageLabel = ageDays >= 1 ? `${ageDays} ${ageDays === 1 ? "giorno" : "giorni"} fa` : ageHours >= 1 ? `${ageHours} ${ageHours === 1 ? "ora" : "ore"} fa` : "pochi minuti fa";
            const isStale = ageDays >= 7;
            const noLLMs = llmsScanned.length === 0;
            return (
              <div style={{
                display: "flex", gap: 12, alignItems: "center", marginBottom: 16, flexWrap: "wrap",
                padding: "10px 14px", background: noLLMs ? "rgba(220,38,38,.08)" : isStale ? "rgba(245,158,11,.08)" : "var(--bg2)",
                border: `1px solid ${noLLMs ? "var(--red)" : isStale ? "var(--org)" : "var(--bd)"}`,
                borderRadius: 8, fontSize: 11,
              }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flex: 1, flexWrap: "wrap" }}>
                  <span style={{ color: "var(--fg3)" }}>Scansionato:</span>
                  <span style={{ fontWeight: 600, color: "var(--fg)" }}>
                    {latest.scannedAt ? new Date(latest.scannedAt).toLocaleString("it-IT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                  </span>
                  <span style={{ color: isStale ? "var(--org)" : "var(--fg3)" }}>({ageLabel})</span>
                  <span style={{ color: "var(--fg3)", marginLeft: 8 }}>·</span>
                  <span style={{ color: "var(--fg3)" }}>LLM consultati:</span>
                  {llmsScanned.length > 0 ? (
                    llmsScanned.map((llm) => (
                      <span key={llm} style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600,
                        background: `${LLM_COLORS[llm] || "#666"}18`, color: LLM_COLORS[llm] || "#666",
                        border: `1px solid ${LLM_COLORS[llm] || "#666"}30`,
                      }}>
                        {llm}
                      </span>
                    ))
                  ) : (
                    <span style={{ color: "var(--red)", fontWeight: 600 }}>Nessuno — risultato basato su citazioni esistenti / fallback</span>
                  )}
                  {fromExisting > 0 && (
                    <span style={{ color: "var(--fg3)" }}>
                      + {fromExisting} citazioni dagli scan
                    </span>
                  )}
                </div>
                {(noLLMs || isStale) && (
                  <button
                    className="geo-btn geo-btn-accent"
                    disabled={scanning || !canScan}
                    onClick={runScan}
                    style={{ fontSize: 11, padding: "5px 10px" }}
                  >
                    Riprova con {selectedLLM}
                  </button>
                )}
              </div>
            );
          })()}

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
