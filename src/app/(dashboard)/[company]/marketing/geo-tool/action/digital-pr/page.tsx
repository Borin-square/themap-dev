"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useLocalState } from "@/lib/useLocalState";
import type { GEOProject, DigitalPRResult } from "@/lib/geo/types";
import { emptyActions } from "@/lib/geo/types";
import { getMockGEOProject } from "@/lib/geo/mock";
import { scoreColor } from "@/lib/geo/scoring";

const TYPE_LABELS: Record<string, string> = {
  testata: "Testata", blog: "Blog", podcast: "Podcast",
  directory: "Directory", associazione: "Associazione",
  portale: "Portale", newsletter: "Newsletter", altro: "Altro",
};

const CONTENT_LABELS: Record<string, string> = {
  "guest-post": "Guest Post", intervista: "Intervista",
  comunicato: "Comunicato", "case-study": "Case Study",
  listing: "Listing", menzione: "Menzione", partnership: "Partnership",
};

export default function DigitalPRPage() {
  const params = useParams();
  const slug = params.company as string;

  const [project, setProject] = useLocalState<GEOProject>(
    `themap:${slug}:geoProject`, getMockGEOProject,
  );

  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const cfg = project.config;
  const actions = project.actions ?? emptyActions();
  const results = actions.digitalPR ?? [];
  const latest = results.length > 0 ? results[results.length - 1] : null;
  const canScan = cfg.brandName.trim().length > 0;

  async function runScan() {
    if (!canScan) return;
    setScanning(true);
    setError(null);
    try {
      const res = await fetch("/api/geo/digital-pr", {
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
          problems: cfg.problems,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Errore");
      const result = data as DigitalPRResult;
      setProject((p) => ({
        ...p,
        actions: {
          ...(p.actions ?? emptyActions()),
          digitalPR: [...(p.actions?.digitalPR ?? []), result],
        },
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setScanning(false);
    }
  }

  const filtered = (latest?.targets || [])
    .filter((t) => !filterType || t.type === filterType);

  const types = [...new Set((latest?.targets || []).map((t) => t.type))];

  return (
    <div className="geo-page">
      <div className="geo-head">
        <h1 className="geo-title">Digital PR</h1>
        <div className="geo-head-actions">
          <button className="geo-btn geo-btn-accent" disabled={scanning || !canScan} onClick={runScan}>
            {scanning ? "Analisi..." : latest ? "Rigenera" : "Trova Opportunita"}
          </button>
        </div>
      </div>

      {!canScan && (
        <div className="geo-audit-error" style={{ background: "rgba(245,158,11,.08)", borderColor: "var(--org)", color: "var(--org)" }}>
          Configura il Brand Name nei Settings prima di eseguire l&apos;analisi.
        </div>
      )}

      {error && <div className="geo-audit-error">{error}</div>}

      {latest && (
        <>
          {/* KPIs */}
          <div className="geo-kpi-grid">
            <div className="geo-kpi geo-kpi-big">
              <span className="geo-kpi-n">{latest.targets.length}</span>
              <span className="geo-kpi-l">Opportunita</span>
            </div>
            <div className="geo-kpi">
              <span className="geo-kpi-n geo-c-grn">{latest.targets.filter((t) => t.difficulty <= 40).length}</span>
              <span className="geo-kpi-l">Facili</span>
            </div>
            <div className="geo-kpi">
              <span className="geo-kpi-n geo-c-org">{latest.targets.filter((t) => t.difficulty > 40 && t.difficulty <= 70).length}</span>
              <span className="geo-kpi-l">Medie</span>
            </div>
            <div className="geo-kpi">
              <span className="geo-kpi-n geo-c-red">{latest.targets.filter((t) => t.difficulty > 70).length}</span>
              <span className="geo-kpi-l">Difficili</span>
            </div>
          </div>

          {/* Summary */}
          {latest.summary && (
            <div className="geo-audit-config-summary">{latest.summary}</div>
          )}

          {/* Filters */}
          <div className="geo-filters">
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="">Tutti i tipi</option>
              {types.map((t) => (
                <option key={t} value={t}>{TYPE_LABELS[t] || t}</option>
              ))}
            </select>
            <span className="geo-filter-count">{filtered.length} siti</span>
          </div>

          {/* Target cards */}
          <div className="geo-audit-issues">
            {filtered.map((target, i) => {
              const expanded = expandedId === i;
              const diffColor = target.difficulty <= 40 ? "grn" : target.difficulty <= 70 ? "org" : "red";
              return (
                <div
                  key={i}
                  className="geo-audit-issue geo-audit-issue-info"
                  style={{ cursor: "pointer" }}
                  onClick={() => setExpandedId(expanded ? null : i)}
                >
                  <div className="geo-audit-issue-head">
                    <span className="geo-tag">{TYPE_LABELS[target.type] || target.type}</span>
                    <span className="geo-tag" style={{ background: "rgba(79,140,255,.1)" }}>
                      {CONTENT_LABELS[target.contentType] || target.contentType}
                    </span>
                    <span style={{ marginLeft: "auto", display: "flex", gap: 12, fontSize: 11, color: "var(--fg3)" }}>
                      <span>Rilevanza: <strong className={`geo-c-${scoreColor(target.relevance)}`}>{target.relevance}</strong></span>
                      <span>Difficolta: <strong className={`geo-c-${diffColor}`}>{target.difficulty}</strong></span>
                    </span>
                  </div>
                  <div className="geo-audit-issue-msg" style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                    {target.name}
                    <a
                      href={target.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      style={{ fontSize: 11, fontWeight: 400, color: "var(--accent)", textDecoration: "none" }}
                    >
                      {target.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                    </a>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--fg2)", marginTop: 2 }}>{target.why}</div>

                  {expanded && (
                    <div style={{ marginTop: 10, padding: "10px 0 0", borderTop: "1px solid var(--bd)" }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--fg3)", marginBottom: 4 }}>COME APPROCCIARE</div>
                      <div style={{ fontSize: 12, color: "var(--fg2)", lineHeight: 1.6 }}>{target.approach}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Suggestions */}
          {latest.suggestions.length > 0 && (
            <>
              <div className="geo-section-title">Suggerimenti Tattici</div>
              <div className="geo-audit-list">
                {latest.suggestions.map((s, i) => (
                  <div key={i} className="geo-audit-list-item geo-audit-list-suggestion">{s}</div>
                ))}
              </div>
            </>
          )}

          <div className="geo-audit-meta">
            Analisi: {new Date(latest.scannedAt).toLocaleString("it-IT")}
          </div>
        </>
      )}

      {!latest && !scanning && canScan && (
        <div className="geo-empty">
          <div className="geo-empty-title">Nessuna analisi</div>
          Clicca &quot;Trova Opportunita&quot; per identificare i siti piu rilevanti per le Digital PR del brand.
          <div style={{ marginTop: 8, fontSize: 11 }}>
            Suggerimento: compila settore, servizi e competitor nei Settings per risultati piu mirati.
          </div>
        </div>
      )}
    </div>
  );
}
