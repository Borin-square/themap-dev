"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useLocalState } from "@/lib/useLocalState";
import type { GEOProject } from "@/lib/geo/types";
import { emptyActions, emptyAudits } from "@/lib/geo/types";
import { getMockGEOProject } from "@/lib/geo/mock";
import {
  aiVisibilityScore, brandMentionRate, competitorMentionRate,
  citationShareOwned, avgSentimentScore,
} from "@/lib/geo/scoring";

type ReportMode = "simple" | "tech";

function statusOf(n: number | undefined): { label: string; color: string; dot: string } {
  if (n == null) return { label: "Non misurato", color: "#94a3b8", dot: "○" };
  if (n >= 70) return { label: "Buono", color: "#22c55e", dot: "●" };
  if (n >= 40) return { label: "Da migliorare", color: "#f59e0b", dot: "●" };
  return { label: "Critico", color: "#ef4444", dot: "●" };
}

function simplifyTitle(s: string): string {
  return s.replace(/^(Add|Implementa|Aggiungi|Crea|Costruisci|Pubblica)\s+/i, (m) => m.charAt(0).toUpperCase() + m.slice(1).toLowerCase());
}

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
  const [mode, setMode] = useState<ReportMode>("simple");

  function handlePrint() {
    if (typeof window !== "undefined") window.print();
  }

  const macroStatuses = [
    { label: "Visibilita sulle AI", n: kpis.visibility, hint: "Quanto il brand viene citato dagli assistenti come ChatGPT, Gemini, Claude." },
    { label: "Contenuti del sito", n: auditScores.contentReadiness, hint: "Quanto i contenuti del sito sono pronti per essere citati dalle AI." },
    { label: "Identita del brand", n: auditScores.entityStrength, hint: "Quanto il brand e' riconoscibile come entita' autorevole." },
    { label: "Accessibilita per i bot", n: auditScores.crawlability, hint: "Se i bot delle AI riescono a leggere il sito." },
    { label: "Targhette informative", n: auditScores.structuredData, hint: "Se il sito ha i dati strutturati che aiutano le AI a capirlo." },
    { label: "Presenza su fonti esterne", n: lastSources?.currentCoverage, hint: "Quanto il brand e' presente su directory, recensioni, media." },
  ];

  return (
    <div className="geo-page">
      <div className="geo-report-toolbar">
        <div style={{ display: "flex", gap: 4, marginRight: "auto", border: "1px solid var(--bd)", borderRadius: 6, padding: 2 }}>
          <button
            className={`geo-report-btn ${mode === "simple" ? "" : "geo-report-btn-ghost"}`}
            style={{ padding: "5px 12px", fontSize: 11, border: "none" }}
            onClick={() => setMode("simple")}
          >Versione semplice</button>
          <button
            className={`geo-report-btn ${mode === "tech" ? "" : "geo-report-btn-ghost"}`}
            style={{ padding: "5px 12px", fontSize: 11, border: "none" }}
            onClick={() => setMode("tech")}
          >Versione tecnica</button>
        </div>
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

        {mode === "simple" && (
          <>
            {/* ── A. IN UNA FRASE ── */}
            <section className="geo-report-section">
              <h2 className="geo-report-h2">In sintesi</h2>
              <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--fg)" }}>
                Su {kpis.brandMention === 0 ? "0" : kpis.brandMention} domande su 100 fatte a ChatGPT, Gemini e Claude, il brand <strong>{cfg.brandName || "—"}</strong> viene citato.
                {kpis.competitorMention > kpis.brandMention && ` I competitor sono citati piu' spesso (${kpis.competitorMention}%).`}
                {plan && ` Sono state identificate ${plan.items.length} azioni concrete da fare per migliorare la presenza sulle AI.`}
              </p>
            </section>

            {/* ── B. SEMAFORO MACRO INDICATORI ── */}
            <section className="geo-report-section">
              <h2 className="geo-report-h2">Come stai messo</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                {macroStatuses.map((m, i) => {
                  const st = statusOf(m.n);
                  return (
                    <div key={i} className="geo-report-li" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
                        <span style={{ color: st.color, fontSize: 16, lineHeight: 1 }}>{st.dot}</span>
                        <span>{m.label}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--fg3)" }}>{m.hint}</div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: st.color, marginTop: 2 }}>
                        {st.label}{m.n != null ? ` (${m.n}/100)` : ""}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* ── C. COSA FUNZIONA / DA MIGLIORARE ── */}
            <section className="geo-report-section">
              <h2 className="geo-report-h2">Cosa funziona e cosa migliorare</h2>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <h3 className="geo-report-h3" style={{ color: "#22c55e" }}>Cosa funziona</h3>
                  <ul className="geo-report-list">
                    {macroStatuses.filter((m) => m.n != null && m.n >= 70).map((m, i) => (
                      <li key={i} className="geo-report-li">
                        <div className="geo-report-li-head">{m.label}</div>
                      </li>
                    ))}
                    {macroStatuses.filter((m) => m.n != null && m.n >= 70).length === 0 && (
                      <div className="geo-report-empty">Nessun indicatore in zona verde al momento.</div>
                    )}
                  </ul>
                </div>
                <div>
                  <h3 className="geo-report-h3" style={{ color: "#ef4444" }}>Da migliorare</h3>
                  <ul className="geo-report-list">
                    {macroStatuses.filter((m) => m.n != null && m.n < 40).map((m, i) => (
                      <li key={i} className="geo-report-li">
                        <div className="geo-report-li-head">{m.label}</div>
                      </li>
                    ))}
                    {macroStatuses.filter((m) => m.n != null && m.n < 40).length === 0 && (
                      <div className="geo-report-empty">Nessun indicatore in zona critica.</div>
                    )}
                  </ul>
                </div>
              </div>
            </section>

            {/* ── D. LE MOSSE PRINCIPALI ── */}
            <section className="geo-report-section">
              <h2 className="geo-report-h2">Le {Math.min(topPlanItems.length, 5)} mosse principali</h2>
              {!plan ? (
                <div className="geo-report-empty">Genera prima il piano d&apos;azione per vedere le mosse consigliate.</div>
              ) : (
                <ol style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 10, margin: 0 }}>
                  {topPlanItems.slice(0, 5).map((it) => (
                    <li key={it.id} style={{ fontSize: 13, lineHeight: 1.5 }}>
                      <strong>{simplifyTitle(it.title)}</strong>
                      <div style={{ fontSize: 12, color: "var(--fg2)", marginTop: 2 }}>{it.description}</div>
                      <div style={{ fontSize: 10, color: "var(--fg3)", marginTop: 4, textTransform: "uppercase", letterSpacing: ".5px" }}>
                        Priorita: {it.priority} · Difficolta: {it.effort} · Impatto previsto: {it.impact}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {/* ── E. PROSSIMI PASSI ── */}
            <section className="geo-report-section">
              <h2 className="geo-report-h2">Cosa fare ora</h2>
              <ul style={{ paddingLeft: 20, fontSize: 13, lineHeight: 1.7, color: "var(--fg)" }}>
                {plan && plan.items.some((i) => i.priority === "alta") && (
                  <li>Iniziare dalle <strong>azioni ad alta priorita&apos;</strong> ({plan.items.filter((i) => i.priority === "alta").length} totali) — quelle elencate sopra sono le piu&apos; importanti.</li>
                )}
                {(auditScores.contentReadiness ?? 100) < 60 && (
                  <li>Migliorare i contenuti del sito perche&apos; risultano poco adatti a essere citati dalle AI.</li>
                )}
                {(auditScores.entityStrength ?? 100) < 60 && (
                  <li>Rafforzare l&apos;identita&apos; del brand online (Wikipedia, directory, profili pubblici).</li>
                )}
                {kpis.competitorMention > kpis.brandMention && (
                  <li>I competitor sono piu&apos; presenti del brand — rivedere il posizionamento e la presenza su fonti esterne.</li>
                )}
                {!plan && <li>Generare prima l&apos;action plan per ricevere indicazioni personalizzate.</li>}
              </ul>
            </section>
          </>
        )}

        {mode === "tech" && (
          <>
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

          </>
        )}

        <footer style={{ marginTop: 32, paddingTop: 16, borderTop: "1px solid var(--bd)", fontSize: 10, color: "var(--fg3)", textAlign: "center" }}>
          Report generato da GEO Tool · {fmtDate(new Date().toISOString())}
        </footer>
      </article>
    </div>
  );
}
