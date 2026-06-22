"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { useLocalState } from "@/lib/useLocalState";
import type { GEOProject } from "@/lib/geo/types";
import { emptyActions, emptyAudits } from "@/lib/geo/types";
import { getMockGEOProject } from "@/lib/geo/mock";
import {
  aiVisibilityScore, brandMentionRate, competitorMentionRate,
  citationShareOwned, avgSentimentScore,
} from "@/lib/geo/scoring";

const PRIORITY_ORDER: Record<string, number> = { alta: 0, media: 1, bassa: 2 };

const CAT_LABELS: Record<string, string> = {
  content: "Contenuto", technical: "Tecnico", source: "Fonti",
  entity: "Entita", "structured-data": "Dati Strutturati",
};

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso.slice(0, 10); }
}

function PriorityBadge({ p }: { p: string }) {
  const cls = p === "alta" ? "geo-report-badge-alta" : p === "media" ? "geo-report-badge-media" : "geo-report-badge-bassa";
  return <span className={`geo-report-badge ${cls}`}>{p}</span>;
}

export default function ExecutiveReportPage() {
  const params = useParams();
  const slug = params.company as string;

  const [project] = useLocalState<GEOProject>(
    `themap:${slug}:geoProject`, getMockGEOProject,
  );

  const cfg = project.config;
  const audits = project.audits ?? emptyAudits();
  const actions = project.actions ?? emptyActions();

  const kpis = useMemo(() => ({
    visibility: aiVisibilityScore(project),
    brandMention: brandMentionRate(project),
    competitorMention: competitorMentionRate(project),
    ownedShare: citationShareOwned(project),
    sentiment: avgSentimentScore(project),
  }), [project]);

  const auditScores = {
    crawlability: audits.crawlability.at(-1)?.score,
    contentReadiness: audits.contentReadiness.at(-1)?.overallScore,
    structuredData: audits.structuredData.at(-1)?.overallScore,
    entityStrength: audits.entityStrength.at(-1)?.overallScore,
  };

  const lastGaps = actions.contentGaps.at(-1);
  const lastSources = actions.sourceAcquisition.at(-1);
  const lastPR = actions.digitalPR.at(-1);
  const plan = actions.actionPlan;

  const topPlanItems = useMemo(() => {
    if (!plan) return [];
    return [...plan.items]
      .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9))
      .slice(0, 10);
  }, [plan]);

  const topGaps = useMemo(() => {
    return [...(lastGaps?.gaps || [])]
      .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9))
      .slice(0, 8);
  }, [lastGaps]);

  const topSources = useMemo(() => {
    return [...(lastSources?.targets || [])]
      .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9))
      .slice(0, 10);
  }, [lastSources]);

  const topPR = useMemo(() => {
    return [...(lastPR?.targets || [])]
      .sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0))
      .slice(0, 8);
  }, [lastPR]);

  const onlyBrand = !cfg.brandName.trim();

  function handlePrint() {
    if (typeof window !== "undefined") window.print();
  }

  return (
    <div className="geo-page">
      <div className="geo-report-toolbar">
        <button className="geo-report-btn geo-report-btn-ghost" onClick={handlePrint}>Esporta PDF</button>
        <button className="geo-report-btn" onClick={handlePrint}>Stampa</button>
      </div>

      <article className="geo-report">
        <header className="geo-report-cover">
          <div className="geo-report-eyebrow">GEO Executive Report</div>
          <h1 className="geo-report-title">{cfg.brandName || "Brand non configurato"}</h1>
          <div className="geo-report-sub">
            {cfg.industry || "Settore non specificato"}
            {cfg.market ? ` · ${cfg.market}` : ""}
            {cfg.country ? ` · ${cfg.country}` : ""}
          </div>
          <div className="geo-report-meta">
            <div className="geo-report-meta-i">
              <span className="geo-report-meta-l">Sito</span>
              <span className="geo-report-meta-v">{cfg.siteUrl || "—"}</span>
            </div>
            <div className="geo-report-meta-i">
              <span className="geo-report-meta-l">Data Report</span>
              <span className="geo-report-meta-v">{fmtDate(new Date().toISOString())}</span>
            </div>
            <div className="geo-report-meta-i">
              <span className="geo-report-meta-l">Action Plan</span>
              <span className="geo-report-meta-v">{plan ? fmtDate(plan.generatedAt) : "Non generato"}</span>
            </div>
            <div className="geo-report-meta-i">
              <span className="geo-report-meta-l">Competitor tracciati</span>
              <span className="geo-report-meta-v">{cfg.competitors.length}</span>
            </div>
          </div>
        </header>

        {onlyBrand && (
          <div className="geo-report-empty">
            Configura il brand in <strong>Settings</strong> e popola almeno un audit + action plan per generare un report completo.
          </div>
        )}

        {/* ── 1. KPI BRAND VISIBILITY ── */}
        <section className="geo-report-section">
          <h2 className="geo-report-h2">1. Visibilita AI</h2>
          <div className="geo-report-kpis">
            <div className="geo-report-kpi">
              <div className="geo-report-kpi-n">{kpis.visibility}</div>
              <div className="geo-report-kpi-l">AI Visibility</div>
            </div>
            <div className="geo-report-kpi">
              <div className="geo-report-kpi-n">{kpis.brandMention}%</div>
              <div className="geo-report-kpi-l">Brand Mention Rate</div>
            </div>
            <div className="geo-report-kpi">
              <div className="geo-report-kpi-n">{kpis.competitorMention}%</div>
              <div className="geo-report-kpi-l">Competitor Mention</div>
            </div>
            <div className="geo-report-kpi">
              <div className="geo-report-kpi-n">{kpis.ownedShare}%</div>
              <div className="geo-report-kpi-l">Citazioni Owned</div>
            </div>
            <div className="geo-report-kpi">
              <div className="geo-report-kpi-n">{kpis.sentiment > 0 ? "+" : ""}{kpis.sentiment.toFixed(2)}</div>
              <div className="geo-report-kpi-l">Sentiment Medio</div>
            </div>
          </div>
        </section>

        {/* ── 2. AUDIT SCORES ── */}
        <section className="geo-report-section">
          <h2 className="geo-report-h2">2. Audit Tecnico</h2>
          <div className="geo-report-kpis">
            <div className="geo-report-kpi">
              <div className="geo-report-kpi-n">{auditScores.crawlability ?? "—"}</div>
              <div className="geo-report-kpi-l">Crawlability</div>
            </div>
            <div className="geo-report-kpi">
              <div className="geo-report-kpi-n">{auditScores.contentReadiness ?? "—"}</div>
              <div className="geo-report-kpi-l">Content Readiness</div>
            </div>
            <div className="geo-report-kpi">
              <div className="geo-report-kpi-n">{auditScores.structuredData ?? "—"}</div>
              <div className="geo-report-kpi-l">Structured Data</div>
            </div>
            <div className="geo-report-kpi">
              <div className="geo-report-kpi-n">{auditScores.entityStrength ?? "—"}</div>
              <div className="geo-report-kpi-l">Entity Strength</div>
            </div>
          </div>
        </section>

        {/* ── 3. ACTION PLAN ── */}
        <section className="geo-report-section">
          <h2 className="geo-report-h2">3. Action Plan</h2>
          {!plan ? (
            <div className="geo-report-empty">Action Plan non ancora generato. Vai su Action Planner &gt; Action Plan.</div>
          ) : (
            <>
              {plan.summary && (
                <p className="geo-report-li-body" style={{ marginBottom: 12 }}>{plan.summary}</p>
              )}
              <h3 className="geo-report-h3">Top {topPlanItems.length} azioni prioritarie</h3>
              <ul className="geo-report-list">
                {topPlanItems.map((it) => (
                  <li key={it.id} className="geo-report-li">
                    <div className="geo-report-li-head">
                      <PriorityBadge p={it.priority} />
                      <span>{it.title}</span>
                    </div>
                    <div className="geo-report-li-body">{it.description}</div>
                    <div className="geo-report-li-meta">
                      <span>{CAT_LABELS[it.category] || it.category}</span>
                      <span>· Effort: {it.effort}</span>
                      <span>· Impact: {it.impact}</span>
                      <span>· Stato: {it.status}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {/* ── 4. CONTENT GAPS ── */}
        <section className="geo-report-section">
          <h2 className="geo-report-h2">4. Content Gaps</h2>
          {!lastGaps ? (
            <div className="geo-report-empty">Nessuna analisi gap disponibile.</div>
          ) : (
            <>
              <div className="geo-report-kpis">
                <div className="geo-report-kpi">
                  <div className="geo-report-kpi-n">{lastGaps.overallCoverage}%</div>
                  <div className="geo-report-kpi-l">Coverage</div>
                </div>
                <div className="geo-report-kpi">
                  <div className="geo-report-kpi-n">{lastGaps.gaps.length}</div>
                  <div className="geo-report-kpi-l">Gap totali</div>
                </div>
              </div>
              <ul className="geo-report-list">
                {topGaps.map((g, i) => (
                  <li key={i} className="geo-report-li">
                    <div className="geo-report-li-head">
                      <PriorityBadge p={g.priority} />
                      <span>{g.topic}</span>
                    </div>
                    <div className="geo-report-li-body">{g.description}</div>
                    <div className="geo-report-li-meta">
                      <span>{g.contentType}</span>
                      <span>· Impatto: {g.estimatedImpact}/100</span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {/* ── 5. SOURCE ACQUISITION ── */}
        <section className="geo-report-section">
          <h2 className="geo-report-h2">5. Fonti da Acquisire</h2>
          {!lastSources ? (
            <div className="geo-report-empty">Nessuna analisi source acquisition disponibile.</div>
          ) : (
            <>
              <div className="geo-report-kpis">
                <div className="geo-report-kpi">
                  <div className="geo-report-kpi-n">{lastSources.currentCoverage}%</div>
                  <div className="geo-report-kpi-l">Copertura Attuale</div>
                </div>
                <div className="geo-report-kpi">
                  <div className="geo-report-kpi-n">{lastSources.targets.length}</div>
                  <div className="geo-report-kpi-l">Target totali</div>
                </div>
                <div className="geo-report-kpi">
                  <div className="geo-report-kpi-n">{lastSources.llmsScanned.length}</div>
                  <div className="geo-report-kpi-l">LLM analizzati</div>
                </div>
              </div>
              <ul className="geo-report-list">
                {topSources.map((s, i) => (
                  <li key={i} className="geo-report-li">
                    <div className="geo-report-li-head">
                      <PriorityBadge p={s.priority} />
                      <span>{s.domain}</span>
                    </div>
                    <div className="geo-report-li-body">{s.actionRequired}</div>
                    <div className="geo-report-li-meta">
                      <span>{s.type}</span>
                      <span>· Stato: {s.currentStatus}</span>
                      <span>· Difficolta: {s.difficulty}/100</span>
                      {s.citedBy.length > 0 && <span>· Citato da: {s.citedBy.join(", ")}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {/* ── 6. DIGITAL PR ── */}
        <section className="geo-report-section">
          <h2 className="geo-report-h2">6. Digital PR Target</h2>
          {!lastPR ? (
            <div className="geo-report-empty">Nessuna analisi Digital PR disponibile.</div>
          ) : (
            <>
              {lastPR.summary && <p className="geo-report-li-body" style={{ marginBottom: 12 }}>{lastPR.summary}</p>}
              <ul className="geo-report-list">
                {topPR.map((t, i) => (
                  <li key={i} className="geo-report-li">
                    <div className="geo-report-li-head">
                      <span>{t.name}</span>
                    </div>
                    <div className="geo-report-li-body">{t.why}</div>
                    <div className="geo-report-li-meta">
                      <span>{t.type}</span>
                      <span>· Rilevanza: {t.relevance}/100</span>
                      <span>· Difficolta: {t.difficulty}/100</span>
                      <span>· {t.contentType}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <footer style={{ marginTop: 32, paddingTop: 16, borderTop: "1px solid var(--bd)", fontSize: 10, color: "var(--fg3)", textAlign: "center" }}>
          Report generato da GEO Tool · {fmtDate(new Date().toISOString())}
        </footer>
      </article>
    </div>
  );
}
