"use client";

import { useState, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getCompany } from "@/lib/companies";
import { useLocalState } from "@/lib/useLocalState";
import {
  type SCProject, type SemanticCluster, type SCGap, type SCAction,
  type SCStrength, type SCDensity, type SCOpportunity, type SCGapType, type SCGapSeverity, type SCActionStatus,
  SC_STRENGTH_LABELS, SC_DENSITY_LABELS, SC_OPPORTUNITY_LABELS,
  SC_GAP_LABELS, SC_GAP_SEV_LABELS, SC_ACTION_STATUS_LABELS,
  SC_STRENGTHS, SC_DENSITIES, SC_OPPORTUNITIES, SC_GAP_TYPES, SC_GAP_SEVERITIES, SC_ACTION_STATUSES,
  SC_ACTION_TYPES, SC_PRIORITIES, SC_EFFORTS, LLM_LIST,
  emptyCluster, emptyGap, emptyAction,
  mentionProbability, llmMentionCount, avgMentionRate, avgShortlistProb, totalGaps, pendingActions,
  getMockSCProject, generateQueries,
} from "@/lib/semantic-cluster";

export default function SemanticClusterPage() {
  const params = useParams();
  const company = getCompany(params.company as string);
  const slug = params.company as string;

  const [project, setProject] = useLocalState<SCProject>(
    `themap:${slug}:semanticCluster`, getMockSCProject,
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<string>("mentionRate");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [scanningId, setScanningId] = useState<string | null>(null);
  const [scanLlm, setScanLlm] = useState<string>("Claude");

  const selected = useMemo(
    () => (selectedId ? project.clusters.find((c) => c.id === selectedId) || null : null),
    [project.clusters, selectedId],
  );

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000); }

  function handleAddCluster() {
    const c = emptyCluster();
    setProject((p) => ({ ...p, clusters: [...p.clusters, c] }));
    setSelectedId(c.id);
    showToast("Cluster aggiunto");
  }

  function handleDeleteCluster(id: string) {
    setProject((p) => ({ ...p, clusters: p.clusters.filter((c) => c.id !== id) }));
    if (selectedId === id) setSelectedId(null);
    setConfirmDel(null);
    showToast("Cluster eliminato");
  }

  function updateCluster(id: string, patch: Partial<SemanticCluster>) {
    setProject((p) => ({
      ...p,
      clusters: p.clusters.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  }

  function updateConfig(patch: Partial<SCProject["config"]>) {
    setProject((p) => ({ ...p, config: { ...p.config, ...patch } }));
  }

  async function handleScan(clusterId: string) {
    const cluster = project.clusters.find((c) => c.id === clusterId);
    if (!cluster) return;
    if (!project.config.brandName?.trim()) {
      showToast("Inserisci il nome del brand in Config prima di scansionare.");
      return;
    }
    setScanningId(clusterId);
    try {
      const res = await fetch("/api/semantic-cluster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cluster, config: project.config, llm: scanLlm }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || "Errore scan"); return; }

      // Update the cluster's LLM mention for the selected LLM
      const llmIdx = cluster.llmMentions.findIndex((m) => m.llm === scanLlm);
      if (llmIdx === -1) return;
      const newMentions = [...cluster.llmMentions];
      newMentions[llmIdx] = {
        ...newMentions[llmIdx],
        mentioned: data.mentioned,
        position: data.position,
        confidence: data.confidence,
        reasoning: data.reasoning,
        coMentions: data.coMentions,
        scanQueries: data.queries,
        scanResponses: data.rawResponses,
        scannedAt: new Date().toISOString(),
      };
      updateCluster(clusterId, {
        llmMentions: newMentions,
        mentionRate: data.mentionRate,
        shortlistProb: data.shortlistProb,
      });
      showToast(`Scan completato: ${data.mentioned ? `menzionato (pos. ${data.position || "?"})` : "non menzionato"}`);
    } catch {
      showToast("Errore di rete durante lo scan.");
    } finally {
      setScanningId(null);
    }
  }

  // Sorted clusters
  const sorted = useMemo(() => {
    return [...project.clusters].sort((a, b) => {
      let va: number | string = 0, vb: number | string = 0;
      switch (sortCol) {
        case "name": va = a.name; vb = b.name; break;
        case "strength": va = SC_STRENGTHS.indexOf(a.strength); vb = SC_STRENGTHS.indexOf(b.strength); break;
        case "mentionRate": va = a.mentionRate; vb = b.mentionRate; break;
        case "shortlistProb": va = a.shortlistProb; vb = b.shortlistProb; break;
        case "competitorDensity": va = SC_DENSITIES.indexOf(a.competitorDensity); vb = SC_DENSITIES.indexOf(b.competitorDensity); break;
        case "opportunity": va = SC_OPPORTUNITIES.indexOf(a.opportunity); vb = SC_OPPORTUNITIES.indexOf(b.opportunity); break;
        case "gaps": va = a.gaps.length; vb = b.gaps.length; break;
        case "llm": va = llmMentionCount(a); vb = llmMentionCount(b); break;
      }
      if (typeof va === "string") return va.localeCompare(vb as string) * sortDir;
      return ((va as number) - (vb as number)) * sortDir;
    });
  }, [project.clusters, sortCol, sortDir]);

  function handleSort(col: string) {
    if (sortCol === col) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortCol(col); setSortDir(-1); }
  }

  // KPIs
  const kpi = useMemo(() => ({
    clusters: project.clusters.length,
    avgMention: avgMentionRate(project.clusters),
    avgShortlist: avgShortlistProb(project.clusters),
    gaps: totalGaps(project.clusters),
    pending: pendingActions(project.clusters),
  }), [project.clusters]);

  return (
    <div>
      <div className="ee-subnav">
        <Link href={`/${slug}/marketing`} className="ee-tab">Campaign Manager</Link>
        <Link href={`/${slug}/marketing/strategy`} className="ee-tab">Strategy</Link>
        <Link href={`/${slug}/marketing/brand-asset`} className="ee-tab">Brand Asset</Link>
        <Link href={`/${slug}/marketing/seo-cluster`} className="ee-tab">SEO Cluster</Link>
        <span className="ee-tab active">Semantic Cluster</span>
        <Link href={`/${slug}/marketing/flywheel`} className="ee-tab">Flywheel</Link>
      </div>

      {toast && <div className="fws-toast">{toast}</div>}

      <div className="sc-page">
        {/* Header */}
        <div className="sc-head">
          <div className="sc-title">
            {company && <span style={{ color: company.color }}>{"\u25A0"}</span>}
            {company?.name || slug} — Semantic Cluster Intelligence
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select
              className="sc-llm-select"
              value={scanLlm}
              onChange={(e) => setScanLlm(e.target.value)}
              title="LLM da scansionare"
            >
              {LLM_LIST.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
            <button
              className={`mk-import-btn${showConfig ? " sc-config-active" : ""}`}
              onClick={() => setShowConfig(!showConfig)}
            >
              {showConfig ? "Chiudi Config" : "Config"}
            </button>
            <button className="comp-add" onClick={handleAddCluster}>+ Cluster</button>
          </div>
        </div>

        {/* Config Panel */}
        {showConfig && (
          <ConfigPanel config={project.config} onUpdate={updateConfig} />
        )}

        {/* KPI Bar */}
        <div className="sc-kpi-bar">
          <div className="sc-kpi"><span className="sc-kpi-n">{kpi.clusters}</span><span className="sc-kpi-l">Cluster</span></div>
          <div className="sc-kpi"><span className="sc-kpi-n">{kpi.avgMention}%</span><span className="sc-kpi-l">Mention Rate avg</span></div>
          <div className="sc-kpi"><span className="sc-kpi-n">{kpi.avgShortlist}%</span><span className="sc-kpi-l">Shortlist Prob avg</span></div>
          <div className="sc-kpi sc-kpi-warn"><span className="sc-kpi-n">{kpi.gaps}</span><span className="sc-kpi-l">Retrieval Gaps</span></div>
          <div className="sc-kpi"><span className="sc-kpi-n">{kpi.pending}</span><span className="sc-kpi-l">Azioni pendenti</span></div>
        </div>

        {/* Main: Table + Sidebar */}
        <div className="sc-main">
          <div className={`sc-canvas${selected ? " sc-canvas-narrow" : ""}`}>
            {sorted.length === 0 ? (
              <div className="comp-empty">
                Nessun cluster semantico. Aggiungine uno per iniziare l'analisi.
              </div>
            ) : (
              <div className="sc-table-wrap">
                <table className="sc-table">
                  <thead>
                    <tr>
                      <SortTh col="name" current={sortCol} dir={sortDir} onSort={handleSort}>Cluster</SortTh>
                      <SortTh col="strength" current={sortCol} dir={sortDir} onSort={handleSort}>Forza</SortTh>
                      <SortTh col="mentionRate" current={sortCol} dir={sortDir} onSort={handleSort}>Mention Rate</SortTh>
                      <SortTh col="shortlistProb" current={sortCol} dir={sortDir} onSort={handleSort}>Shortlist %</SortTh>
                      <SortTh col="llm" current={sortCol} dir={sortDir} onSort={handleSort}>LLM</SortTh>
                      <SortTh col="competitorDensity" current={sortCol} dir={sortDir} onSort={handleSort}>Competitor</SortTh>
                      <SortTh col="opportunity" current={sortCol} dir={sortDir} onSort={handleSort}>Opportunita</SortTh>
                      <SortTh col="gaps" current={sortCol} dir={sortDir} onSort={handleSort}>Gaps</SortTh>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((c) => (
                      <tr
                        key={c.id}
                        className={`sc-row${selectedId === c.id ? " sc-row-sel" : ""}`}
                        onClick={() => setSelectedId(c.id === selectedId ? null : c.id)}
                      >
                        <td className="sc-td-name">
                          <div className="sc-td-name-main">{c.name}</div>
                          {!selected && <div className="sc-td-desc">{c.description}</div>}
                        </td>
                        <td><span className={`sc-badge sc-str-${c.strength}`}>{SC_STRENGTH_LABELS[c.strength]}</span></td>
                        <td className="sc-td-num">
                          <div className="sc-bar-wrap">
                            <div className="sc-bar" style={{ width: `${c.mentionRate}%`, background: mentionColor(c.mentionRate) }} />
                          </div>
                          <span>{c.mentionRate}%</span>
                        </td>
                        <td className="sc-td-num">
                          <div className="sc-bar-wrap">
                            <div className="sc-bar" style={{ width: `${c.shortlistProb}%`, background: mentionColor(c.shortlistProb) }} />
                          </div>
                          <span>{c.shortlistProb}%</span>
                        </td>
                        <td>
                          <div className="sc-llm-dots">
                            {c.llmMentions.map((m) => (
                              <span
                                key={m.llm}
                                className={`sc-llm-dot${m.mentioned ? " sc-llm-yes" : ""}`}
                                title={`${m.llm}: ${m.mentioned ? `#${m.position || "?"}` : "non menzionato"}`}
                              />
                            ))}
                          </div>
                          <span className="sc-llm-count">{llmMentionCount(c)}/{LLM_LIST.length}</span>
                        </td>
                        <td><span className={`sc-badge sc-den-${c.competitorDensity}`}>{SC_DENSITY_LABELS[c.competitorDensity]}</span></td>
                        <td><span className={`sc-badge sc-opp-${c.opportunity}`}>{SC_OPPORTUNITY_LABELS[c.opportunity]}</span></td>
                        <td className="sc-td-num">
                          {c.gaps.length > 0 && (
                            <span className="sc-gap-count">{c.gaps.length}</span>
                          )}
                        </td>
                        <td className="sc-td-actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            className={`sc-scan-btn${scanningId === c.id ? " sc-scanning" : ""}`}
                            onClick={() => handleScan(c.id)}
                            disabled={scanningId !== null}
                            title={`Scan con ${scanLlm}`}
                          >
                            {scanningId === c.id ? "..." : "\u25B6"}
                          </button>
                          {confirmDel === c.id ? (
                            <span className="fws-confirm">
                              <button className="fws-confirm-yes" onClick={() => handleDeleteCluster(c.id)}>Si</button>
                              <button className="fws-confirm-no" onClick={() => setConfirmDel(null)}>No</button>
                            </span>
                          ) : (
                            <button className="comp-del" onClick={() => setConfirmDel(c.id)} title="Elimina">{"\u2715"}</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Sidebar */}
          {selected && (
            <div className="sc-sidebar">
              <div className="sc-sb-head">
                <span className="sc-sb-type">Cluster Detail</span>
                <button className="sc-sb-close" onClick={() => setSelectedId(null)}>{"\u2715"}</button>
              </div>
              <ClusterSidebar
                cluster={selected}
                onUpdate={(patch) => updateCluster(selected.id, patch)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Helpers ── */

function mentionColor(pct: number): string {
  if (pct >= 50) return "var(--grn)";
  if (pct >= 25) return "var(--org)";
  return "var(--red)";
}

function SortTh({ col, current, dir, onSort, children }: {
  col: string; current: string; dir: 1 | -1;
  onSort: (col: string) => void; children: React.ReactNode;
}) {
  return (
    <th onClick={() => onSort(col)} style={{ cursor: "pointer" }}>
      {children} {current === col ? (dir === 1 ? "\u25B2" : "\u25BC") : ""}
    </th>
  );
}

/* ══════════════════════════════════════════
   CONFIG PANEL
   ══════════════════════════════════════════ */

function ConfigPanel({ config, onUpdate }: {
  config: SCProject["config"];
  onUpdate: (patch: Partial<SCProject["config"]>) => void;
}) {
  return (
    <div className="sc-config">
      <div className="sc-config-grid">
        <div className="sc-config-section sc-config-brand">
          <div className="sc-config-label">Brand Name</div>
          <input
            value={config.brandName}
            onChange={(e) => onUpdate({ brandName: e.target.value })}
            placeholder="es: Square Marketing"
            className="sc-brand-input"
          />
        </div>
        <div className="sc-config-section">
          <div className="sc-config-label">Shortlist Size</div>
          <select
            value={config.shortlistSize || 5}
            onChange={(e) => onUpdate({ shortlistSize: Number(e.target.value) })}
            className="sc-brand-input"
          >
            <option value={3}>3 aziende</option>
            <option value={5}>5 aziende</option>
            <option value={10}>10 aziende</option>
            <option value={15}>15 aziende</option>
            <option value={20}>20 aziende</option>
          </select>
        </div>
        <ChipSection
          label="Buyer Personas"
          items={config.buyerPersonas}
          onChange={(v) => onUpdate({ buyerPersonas: v })}
          placeholder="es: CEO PMI"
        />
        <ChipSection
          label="Intent"
          items={config.intents}
          onChange={(v) => onUpdate({ intents: v })}
          placeholder="es: Adottare AI"
        />
        <ChipSection
          label="Cognitive Angles"
          items={config.cognitiveAngles}
          onChange={(v) => onUpdate({ cognitiveAngles: v })}
          placeholder="es: Performance"
        />
        <ChipSection
          label="Semantic Associations"
          items={config.semanticAssociations}
          onChange={(v) => onUpdate({ semanticAssociations: v })}
          placeholder="es: AI-native"
        />
        <ChipSection
          label="Competitor"
          items={config.competitors}
          onChange={(v) => onUpdate({ competitors: v })}
          placeholder="es: HubSpot"
        />
        <div className="sc-config-geo">
          <div className="sc-config-label">Geography / Market</div>
          <div className="sc-config-geo-fields">
            <input value={config.geography.area} onChange={(e) => onUpdate({ geography: { ...config.geography, area: e.target.value } })} placeholder="Area" />
            <input value={config.geography.lingua} onChange={(e) => onUpdate({ geography: { ...config.geography, lingua: e.target.value } })} placeholder="Lingua" />
            <input value={config.geography.industry} onChange={(e) => onUpdate({ geography: { ...config.geography, industry: e.target.value } })} placeholder="Industry" />
            <input value={config.geography.mercato} onChange={(e) => onUpdate({ geography: { ...config.geography, mercato: e.target.value } })} placeholder="Mercato" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ChipSection({ label, items, onChange, placeholder }: {
  label: string; items: string[]; onChange: (items: string[]) => void; placeholder: string;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const v = draft.trim();
    if (v && !items.includes(v)) { onChange([...items, v]); setDraft(""); }
  }

  return (
    <div className="sc-config-section">
      <div className="sc-config-label">{label}</div>
      <div className="sc-chips">
        {items.map((item) => (
          <span key={item} className="sc-chip">
            {item}
            <button onClick={() => onChange(items.filter((i) => i !== item))}>{"\u2715"}</button>
          </span>
        ))}
        <input
          className="sc-chip-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder}
        />
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   CLUSTER SIDEBAR
   ══════════════════════════════════════════ */

function ClusterSidebar({ cluster: c, onUpdate }: {
  cluster: SemanticCluster;
  onUpdate: (patch: Partial<SemanticCluster>) => void;
}) {
  const [tab, setTab] = useState<"overview" | "llm" | "gaps" | "actions">("overview");
  const mp = mentionProbability(c);

  return (
    <div className="sc-sb-body">
      {/* Mention Probability */}
      <div className="sc-mp-card">
        <div className="sc-mp-label">Mention Probability</div>
        <div className="sc-mp-value">{mp}%</div>
        <div className="sc-mp-factors">
          <Factor label="Semantic Rel." value={c.semanticRelevance} />
          <span className="sc-mp-op">{"\u00D7"}</span>
          <Factor label="Proof Density" value={c.proofDensity} />
          <span className="sc-mp-op">{"\u00D7"}</span>
          <Factor label="Narrative" value={c.narrativeCompression} />
          <span className="sc-mp-op">{"\u00D7"}</span>
          <Factor label="Authority" value={c.distributedAuthority} />
          <span className="sc-mp-op">{"\u00D7"}</span>
          <Factor label="Context" value={c.contextCompatibility} />
        </div>
      </div>

      {/* Tabs */}
      <div className="sc-sb-tabs">
        <button className={tab === "overview" ? "act" : ""} onClick={() => setTab("overview")}>Overview</button>
        <button className={tab === "llm" ? "act" : ""} onClick={() => setTab("llm")}>LLM ({llmMentionCount(c)}/{LLM_LIST.length})</button>
        <button className={tab === "gaps" ? "act" : ""} onClick={() => setTab("gaps")}>Gaps ({c.gaps.length})</button>
        <button className={tab === "actions" ? "act" : ""} onClick={() => setTab("actions")}>Azioni ({c.actions.length})</button>
      </div>

      {tab === "overview" && (
        <OverviewTab cluster={c} onUpdate={onUpdate} />
      )}
      {tab === "llm" && (
        <LLMTab cluster={c} onUpdate={onUpdate} />
      )}
      {tab === "gaps" && (
        <GapsTab gaps={c.gaps} onChange={(gaps) => onUpdate({ gaps })} />
      )}
      {tab === "actions" && (
        <ActionsTab actions={c.actions} onChange={(actions) => onUpdate({ actions })} />
      )}
    </div>
  );
}

function Factor({ label, value }: { label: string; value: number }) {
  const color = value >= 0.7 ? "var(--grn)" : value >= 0.4 ? "var(--org)" : "var(--red)";
  return (
    <div className="sc-mp-factor">
      <div className="sc-mp-factor-bar">
        <div style={{ width: `${value * 100}%`, background: color }} />
      </div>
      <span className="sc-mp-factor-val" style={{ color }}>{(value * 100).toFixed(0)}%</span>
      <span className="sc-mp-factor-label">{label}</span>
    </div>
  );
}

/* ── Overview Tab ── */

function OverviewTab({ cluster: c, onUpdate }: {
  cluster: SemanticCluster;
  onUpdate: (patch: Partial<SemanticCluster>) => void;
}) {
  return (
    <div className="sc-sb-form">
      <label>Nome cluster</label>
      <input value={c.name} onChange={(e) => onUpdate({ name: e.target.value })} />

      <label>Descrizione</label>
      <textarea value={c.description} onChange={(e) => onUpdate({ description: e.target.value })} rows={3} />

      <div className="sc-sb-row">
        <div>
          <label>Forza</label>
          <select value={c.strength} onChange={(e) => onUpdate({ strength: e.target.value as SCStrength })}>
            {SC_STRENGTHS.map((s) => <option key={s} value={s}>{SC_STRENGTH_LABELS[s]}</option>)}
          </select>
        </div>
        <div>
          <label>Opportunita</label>
          <select value={c.opportunity} onChange={(e) => onUpdate({ opportunity: e.target.value as SCOpportunity })}>
            {SC_OPPORTUNITIES.map((o) => <option key={o} value={o}>{SC_OPPORTUNITY_LABELS[o]}</option>)}
          </select>
        </div>
      </div>

      <div className="sc-sb-row">
        <div>
          <label>Mention Rate %</label>
          <input type="number" min={0} max={100} value={c.mentionRate} onChange={(e) => onUpdate({ mentionRate: Number(e.target.value) })} />
        </div>
        <div>
          <label>Shortlist Prob %</label>
          <input type="number" min={0} max={100} value={c.shortlistProb} onChange={(e) => onUpdate({ shortlistProb: Number(e.target.value) })} />
        </div>
      </div>

      <div className="sc-sb-row">
        <div>
          <label>Competitor Density</label>
          <select value={c.competitorDensity} onChange={(e) => onUpdate({ competitorDensity: e.target.value as SCDensity })}>
            {SC_DENSITIES.map((d) => <option key={d} value={d}>{SC_DENSITY_LABELS[d]}</option>)}
          </select>
        </div>
      </div>

      <div className="sc-sb-section-title">Mention Probability Factors (0-1)</div>
      <div className="sc-sb-row">
        <div>
          <label>Semantic Relevance</label>
          <input type="number" min={0} max={1} step={0.01} value={c.semanticRelevance} onChange={(e) => onUpdate({ semanticRelevance: Number(e.target.value) })} />
        </div>
        <div>
          <label>Proof Density</label>
          <input type="number" min={0} max={1} step={0.01} value={c.proofDensity} onChange={(e) => onUpdate({ proofDensity: Number(e.target.value) })} />
        </div>
      </div>
      <div className="sc-sb-row">
        <div>
          <label>Narrative Compression</label>
          <input type="number" min={0} max={1} step={0.01} value={c.narrativeCompression} onChange={(e) => onUpdate({ narrativeCompression: Number(e.target.value) })} />
        </div>
        <div>
          <label>Distributed Authority</label>
          <input type="number" min={0} max={1} step={0.01} value={c.distributedAuthority} onChange={(e) => onUpdate({ distributedAuthority: Number(e.target.value) })} />
        </div>
      </div>
      <div className="sc-sb-row">
        <div>
          <label>Context Compatibility</label>
          <input type="number" min={0} max={1} step={0.01} value={c.contextCompatibility} onChange={(e) => onUpdate({ contextCompatibility: Number(e.target.value) })} />
        </div>
      </div>

      <label>Termini associati</label>
      <textarea
        value={c.associatedTerms.join(", ")}
        onChange={(e) => onUpdate({ associatedTerms: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })}
        rows={2}
        placeholder="Separa con virgola"
      />
    </div>
  );
}

/* ── LLM Tab ── */

function LLMTab({ cluster: c, onUpdate }: {
  cluster: SemanticCluster;
  onUpdate: (patch: Partial<SemanticCluster>) => void;
}) {
  const [expandedQA, setExpandedQA] = useState<string | null>(null);
  const [openResponse, setOpenResponse] = useState<number | null>(null);

  function updateMention(idx: number, patch: Partial<SemanticCluster["llmMentions"][0]>) {
    const next = [...c.llmMentions];
    next[idx] = { ...next[idx], ...patch };
    onUpdate({ llmMentions: next });
  }

  return (
    <div className="sc-llm-list">
      {c.llmMentions.map((m, i) => (
        <div key={m.llm} className={`sc-llm-card${m.mentioned ? " sc-llm-mentioned" : ""}`}>
          <div className="sc-llm-card-head">
            <span className="sc-llm-name">{m.llm}</span>
            <label className="sc-llm-toggle">
              <input
                type="checkbox"
                checked={m.mentioned}
                onChange={(e) => updateMention(i, { mentioned: e.target.checked })}
              />
              <span>{m.mentioned ? "Menzionato" : "Non menzionato"}</span>
            </label>
          </div>
          {m.mentioned && (
            <div className="sc-llm-card-detail">
              <div className="sc-sb-row">
                <div>
                  <label>Posizione</label>
                  <input type="number" min={1} value={m.position || ""} onChange={(e) => updateMention(i, { position: e.target.value ? Number(e.target.value) : undefined })} />
                </div>
                <div>
                  <label>Confidence</label>
                  <select value={m.confidence} onChange={(e) => updateMention(i, { confidence: e.target.value as "low" | "medium" | "high" })}>
                    <option value="low">Bassa</option>
                    <option value="medium">Media</option>
                    <option value="high">Alta</option>
                  </select>
                </div>
              </div>
            </div>
          )}
          <label>Reasoning</label>
          <textarea value={m.reasoning} onChange={(e) => updateMention(i, { reasoning: e.target.value })} rows={2} />
          {m.coMentions.length > 0 && (
            <div className="sc-llm-co">
              <span className="sc-llm-co-label">Co-menzioni:</span>
              {m.coMentions.map((cm) => <span key={cm} className="sc-chip sc-chip-small">{cm}</span>)}
            </div>
          )}
          <input
            value={m.coMentions.join(", ")}
            onChange={(e) => updateMention(i, { coMentions: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })}
            placeholder="Co-menzioni (separa con virgola)"
            style={{ marginTop: 4 }}
          />
          {/* Scan Q&A */}
          {m.scanQueries && m.scanQueries.length > 0 && (
            <div className="sc-qa-section">
              <button
                className="sc-qa-toggle"
                onClick={() => setExpandedQA(expandedQA === m.llm ? null : m.llm)}
              >
                {expandedQA === m.llm ? "\u25BC" : "\u25B6"} Query & Risposte ({m.scanQueries.length})
                {m.scannedAt && <span className="sc-qa-date">{new Date(m.scannedAt).toLocaleDateString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>}
              </button>
              {expandedQA === m.llm && (
                <div className="sc-qa-list">
                  {m.scanQueries.map((q, qi) => (
                    <div key={qi} className="sc-qa-item">
                      <div
                        className="sc-qa-query"
                        onClick={() => setOpenResponse(openResponse === qi ? null : qi)}
                      >
                        <span className="sc-qa-num">{qi + 1}</span>
                        <span className="sc-qa-q">{q}</span>
                        <span className="sc-qa-arrow">{openResponse === qi ? "\u25BC" : "\u25B6"}</span>
                      </div>
                      {openResponse === qi && m.scanResponses?.[qi] && (
                        <div className="sc-qa-response">{m.scanResponses[qi]}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Gaps Tab ── */

function GapsTab({ gaps, onChange }: {
  gaps: SCGap[];
  onChange: (gaps: SCGap[]) => void;
}) {
  function addGap() {
    onChange([...gaps, emptyGap()]);
  }

  function updateGap(idx: number, patch: Partial<SCGap>) {
    const next = [...gaps];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  }

  function removeGap(idx: number) {
    onChange(gaps.filter((_, i) => i !== idx));
  }

  return (
    <div className="sc-gaps-list">
      {gaps.map((g, i) => (
        <div key={g.id} className={`sc-gap-card sc-gap-${g.severity}`}>
          <div className="sc-gap-card-head">
            <select value={g.type} onChange={(e) => updateGap(i, { type: e.target.value as SCGapType })}>
              {SC_GAP_TYPES.map((t) => <option key={t} value={t}>{SC_GAP_LABELS[t]}</option>)}
            </select>
            <select value={g.severity} onChange={(e) => updateGap(i, { severity: e.target.value as SCGapSeverity })}>
              {SC_GAP_SEVERITIES.map((s) => <option key={s} value={s}>{SC_GAP_SEV_LABELS[s]}</option>)}
            </select>
            <button className="comp-del" onClick={() => removeGap(i)}>{"\u2715"}</button>
          </div>
          <input value={g.description} onChange={(e) => updateGap(i, { description: e.target.value })} placeholder="Descrizione gap" />
          <textarea value={g.detail} onChange={(e) => updateGap(i, { detail: e.target.value })} rows={2} placeholder="Dettaglio e impatto" />
        </div>
      ))}
      <button className="sc-add-btn" onClick={addGap}>+ Gap</button>
    </div>
  );
}

/* ── Actions Tab ── */

function ActionsTab({ actions, onChange }: {
  actions: SCAction[];
  onChange: (actions: SCAction[]) => void;
}) {
  function addAction() {
    onChange([...actions, emptyAction()]);
  }

  function updateAction(idx: number, patch: Partial<SCAction>) {
    const next = [...actions];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  }

  function removeAction(idx: number) {
    onChange(actions.filter((_, i) => i !== idx));
  }

  return (
    <div className="sc-actions-list">
      {actions.map((a, i) => (
        <div key={a.id} className={`sc-action-card sc-action-${a.status}`}>
          <div className="sc-action-card-head">
            <select value={a.type} onChange={(e) => updateAction(i, { type: e.target.value })}>
              {SC_ACTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select
              className={`sc-action-status sc-ast-${a.status}`}
              value={a.status}
              onChange={(e) => updateAction(i, { status: e.target.value as SCActionStatus })}
            >
              {SC_ACTION_STATUSES.map((s) => <option key={s} value={s}>{SC_ACTION_STATUS_LABELS[s]}</option>)}
            </select>
            <button className="comp-del" onClick={() => removeAction(i)}>{"\u2715"}</button>
          </div>
          <textarea value={a.description} onChange={(e) => updateAction(i, { description: e.target.value })} rows={2} placeholder="Descrizione azione" />
          <div className="sc-action-meta">
            <div>
              <label>Priorita</label>
              <select value={a.priority} onChange={(e) => updateAction(i, { priority: e.target.value as typeof a.priority })}>
                {SC_PRIORITIES.map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label>Effort</label>
              <select value={a.effort} onChange={(e) => updateAction(i, { effort: e.target.value as typeof a.effort })}>
                {SC_EFFORTS.map((e2) => <option key={e2} value={e2}>{e2.charAt(0).toUpperCase() + e2.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label>Impact</label>
              <select value={a.impact} onChange={(e) => updateAction(i, { impact: e.target.value as typeof a.impact })}>
                {SC_EFFORTS.map((e2) => <option key={e2} value={e2}>{e2.charAt(0).toUpperCase() + e2.slice(1)}</option>)}
              </select>
            </div>
          </div>
        </div>
      ))}
      <button className="sc-add-btn" onClick={addAction}>+ Azione</button>
    </div>
  );
}
