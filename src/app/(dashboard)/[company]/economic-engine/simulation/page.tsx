"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useYear } from "@/components/YearProvider";
import { getCompany } from "@/lib/companies";
import { getEeMockMetrics, initEeValues, eeFmtEuro, eeRecalc } from "@/lib/economic-engine";
import {
  runMonteCarlo, analyzeResults, buildDefaultSimConfig,
  calcCapacityDisponibile,
  SIM_VAR_META, SIM_DISTRIBUTION_KEYS,
  type SimConfig, type DistConfig, type DistType,
  type SimRunResult, type SimAnalysis,
} from "@/lib/simulation-engine";

// Legge i valori EE dal localStorage (scritti da useLocalState del Playground)
function readEeValsFromLocalStorage(slug: string, year: number): Record<string, number> {
  try {
    const key = `themap:${slug}:eeVals:y${year}`;
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as Record<string, number>;
  } catch { /* ignore */ }
  const { values } = initEeValues(getEeMockMetrics(), year);
  return values;
}

// Salva/carica SimConfig in localStorage (senza Supabase)
function loadSimConfig(slug: string, year: number, eeVals: Record<string, number>): SimConfig {
  try {
    const key = `themap:${slug}:simConfig:y${year}`;
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as SimConfig;
  } catch { /* ignore */ }
  return buildDefaultSimConfig(eeVals);
}

function saveSimConfig(slug: string, year: number, cfg: SimConfig) {
  try {
    localStorage.setItem(`themap:${slug}:simConfig:y${year}`, JSON.stringify(cfg));
  } catch { /* ignore */ }
}

// ─── TYPES ─────────────────────────────────────────────────────────────────────

type OutputKey = "vdp" | "totalCosts" | "margine" | "marginePerc" | "mrr" | "capacity";
type ConfigTab = "base" | "dist" | "constraints";

const OUTPUT_OPTIONS: { key: OutputKey; label: string }[] = [
  { key: "vdp",        label: "Valore Produzione" },
  { key: "margine",    label: "Margine Lordo" },
  { key: "totalCosts", label: "Costi Totali" },
  { key: "marginePerc",label: "Margine %" },
  { key: "mrr",        label: "MRR Run-rate" },
  { key: "capacity",   label: "Capacity Necessaria" },
];

function getOutputVal(r: SimRunResult, k: OutputKey): number {
  switch (k) {
    case "vdp":        return r.vdp;
    case "totalCosts": return r.totalCosts;
    case "margine":    return r.margine;
    case "marginePerc":return r.marginePerc;
    case "mrr":        return r.mrr;
    case "capacity":   return r.capacity.necessaria;
  }
}

function fmtOutput(v: number, k: OutputKey): string {
  if (k === "marginePerc") return v.toFixed(1) + "%";
  if (k === "capacity")    return Math.round(v).toLocaleString("it-IT") + " h";
  return eeFmtEuro(v);
}

const FEASIBILITY_COLORS = {
  FEASIBLE: "#22c55e",
  CAPACITY_STRESSED: "#f59e0b",
  NOT_FEASIBLE: "#ef4444",
} as const;

// ─── FORMATTERS ────────────────────────────────────────────────────────────────

function fmtNum(v: number, meta: typeof SIM_VAR_META[0] | undefined): string {
  if (!meta) return v.toLocaleString("it-IT");
  if (meta.isPercent) return (v * 100).toFixed(1) + "%";
  if (meta.isEuro)    return eeFmtEuro(v);
  if (meta.isInt)     return Math.round(v).toLocaleString("it-IT");
  return v.toFixed(2);
}

function fmtPct(v: number): string {
  return (v * 100).toFixed(1) + "%";
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function SimulationLabPage() {
  const params = useParams();
  const slug = params.company as string;
  const company = getCompany(slug);
  const { year } = useYear();

  // EE values: letti da localStorage (scritti dal Playground), nessuna chiamata API
  const [eeVals, setEeVals] = useState<Record<string, number>>(() => {
    const { values } = initEeValues(getEeMockMetrics(), year);
    return values;
  });

  // SimConfig: localStorage locale, nessuna chiamata API
  const [simConfig, setSimConfigRaw] = useState<SimConfig>(() =>
    buildDefaultSimConfig(undefined),
  );

  // Hydrate dal localStorage lato client (no SSR)
  useEffect(() => {
    const vals = readEeValsFromLocalStorage(slug, year);
    setEeVals(vals);
    setSimConfigRaw(loadSimConfig(slug, year, vals));
  }, [slug, year]);

  // Wrapper che salva in localStorage ad ogni cambio
  function setSimConfig(updater: React.SetStateAction<SimConfig>) {
    setSimConfigRaw((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      saveSimConfig(slug, year, next);
      return next;
    });
  }

  // Ephemeral results state
  const [results, setResults] = useState<SimRunResult[]>([]);
  const [analysis, setAnalysis] = useState<SimAnalysis | null>(null);
  const [running, setRunning] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [configTab, setConfigTab] = useState<ConfigTab>("base");
  const [xAxis, setXAxis] = useState<OutputKey>("vdp");
  const [yAxis, setYAxis] = useState<OutputKey>("margine");

  // Sync from Playground: update distribution.current from current EE values
  function syncFromPlayground() {
    setSimConfig((prev) => ({
      ...prev,
      distributions: Object.fromEntries(
        SIM_DISTRIBUTION_KEYS.map((key) => {
          const current = eeVals[key] ?? prev.distributions[key]?.current ?? 0;
          const prev2 = prev.distributions[key];
          const isFixed = !prev2 || prev2.type === "fixed";
          return [key, {
            ...(prev2 ?? {
              type: "fixed" as DistType,
              min: current, mostLikely: current, max: current,
              stddev: Math.max(current * 0.1, 0.001),
              confidence: 0.8, source: "DA DEFINIRE",
            }),
            current,
            ...(isFixed ? { min: current, mostLikely: current, max: current } : {}),
          }];
        })
      ),
    }));
  }

  function runSimulation() {
    setRunning(true);
    setSelectedIdx(null);
    setTimeout(() => {
      const res = runMonteCarlo(simConfig, eeVals);
      const an = analyzeResults(res, simConfig.margineTarget, SIM_VAR_META);
      setResults(res);
      setAnalysis(an);
      setRunning(false);
    }, 0);
  }

  const disponibile = calcCapacityDisponibile(simConfig.capacity);

  return (
    <div>
      {/* Subnav */}
      <div className="ee-subnav">
        <Link href={`/${slug}/economic-engine`} className="ee-tab">Playground</Link>
        <Link href={`/${slug}/economic-engine/forecast`} className="ee-tab">Forecast</Link>
        <Link href={`/${slug}/economic-engine/real`} className="ee-tab">Consuntivo</Link>
        <Link href={`/${slug}/economic-engine/ckm`} className="ee-tab">CKM</Link>
        <span className="ee-tab active">Simulation Lab</span>
      </div>

      {/* Header */}
      <div className="ee-head">
        <div className="ee-title">
          {company && <span style={{ color: company.color }}>■</span>}
          {" "}{company?.name || slug} — Simulation Lab
          <span style={{ marginLeft: 10, fontSize: 11, color: "var(--fg3)", fontWeight: 400 }}>
            Experimental
          </span>
        </div>
        <div className="ee-actions">
          <button className="ee-btn" onClick={syncFromPlayground} title="Aggiorna i valori base dai valori correnti del Playground">
            ↺ Sync Playground
          </button>
        </div>
      </div>

      {/* Config Panel */}
      <ConfigPanel
        configTab={configTab}
        setConfigTab={setConfigTab}
        simConfig={simConfig}
        setSimConfig={setSimConfig}
        eeVals={eeVals}
        disponibile={disponibile}
      />

      {/* Run Controls */}
      <RunControls
        simConfig={simConfig}
        setSimConfig={setSimConfig}
        running={running}
        runSimulation={runSimulation}
        resultsCount={results.length}
      />

      {/* Results */}
      {results.length > 0 && analysis && (
        <ResultsPanel
          results={results}
          analysis={analysis}
          xAxis={xAxis}
          yAxis={yAxis}
          setXAxis={setXAxis}
          setYAxis={setYAxis}
          selectedIdx={selectedIdx}
          setSelectedIdx={setSelectedIdx}
          simConfig={simConfig}
          setSimConfig={setSimConfig}
          eeVals={eeVals}
        />
      )}
    </div>
  );
}

// ─── CONFIG PANEL ─────────────────────────────────────────────────────────────

function ConfigPanel({
  configTab, setConfigTab, simConfig, setSimConfig, eeVals, disponibile,
}: {
  configTab: ConfigTab;
  setConfigTab: (t: ConfigTab) => void;
  simConfig: SimConfig;
  setSimConfig: React.Dispatch<React.SetStateAction<SimConfig>>;
  eeVals: Record<string, number>;
  disponibile: number;
}) {
  return (
    <div className="ee-section" style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", gap: 4, padding: "6px 12px", borderBottom: "1px solid var(--bd)" }}>
        {([
          { key: "base", label: "Base Scenario" },
          { key: "dist", label: "Distributions" },
          { key: "constraints", label: "Constraints & Capacity" },
        ] as { key: ConfigTab; label: string }[]).map((t) => (
          <button
            key={t.key}
            onClick={() => setConfigTab(t.key)}
            style={{
              padding: "4px 12px", fontSize: 12, borderRadius: 4, border: "1px solid var(--bd)",
              background: configTab === t.key ? "var(--accent)" : "transparent",
              color: configTab === t.key ? "#fff" : "var(--fg)",
              cursor: "pointer", fontWeight: configTab === t.key ? 600 : 400,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="ee-section-body" style={{ padding: "12px 16px" }}>
        {configTab === "base" && (
          <BaseScenarioTab eeVals={eeVals} simConfig={simConfig} />
        )}
        {configTab === "dist" && (
          <DistributionsTab simConfig={simConfig} setSimConfig={setSimConfig} />
        )}
        {configTab === "constraints" && (
          <ConstraintsTab simConfig={simConfig} setSimConfig={setSimConfig} disponibile={disponibile} />
        )}
      </div>
    </div>
  );
}

// ─── BASE SCENARIO TAB ────────────────────────────────────────────────────────

function BaseScenarioTab({ eeVals, simConfig }: { eeVals: Record<string, number>; simConfig: SimConfig }) {
  const { calc } = eeRecalc(eeVals);
  const kpis = [
    { label: "VDP",      val: eeFmtEuro(calc["VALORE DELLA PRODUZIONE"] ?? 0) },
    { label: "Costi",    val: eeFmtEuro(calc["TOTALE COSTI"] ?? 0) },
    { label: "Margine",  val: eeFmtEuro(calc["MARGINE LORDO (NO BANDI)"] ?? 0) },
    { label: "Valore Az.", val: eeFmtEuro(calc["VALORE AZIENDA"] ?? 0) },
  ];
  const disponibile = calcCapacityDisponibile(simConfig.capacity);
  const necessaria = calc["CAPACITY NECESSARIA"] ?? 0;

  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--fg3)", marginBottom: 10 }}>
        Valori correnti del Playground — base deterministico per le simulazioni.
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        {kpis.map((k) => (
          <div key={k.label} className="ee-ind" style={{ minWidth: 120 }}>
            <div className="ee-ind-label">{k.label}</div>
            <div className="ee-ind-val">{k.val}</div>
          </div>
        ))}
        <div className="ee-ind" style={{ minWidth: 140 }}>
          <div className="ee-ind-label">Capacity Necessaria</div>
          <div className="ee-ind-val">{Math.round(necessaria).toLocaleString("it-IT")} h</div>
        </div>
        <div className="ee-ind" style={{ minWidth: 140 }}>
          <div className="ee-ind-label">Capacity Disponibile (config)</div>
          <div className="ee-ind-val" style={{ color: disponibile < necessaria ? "var(--red)" : "var(--grn)" }}>
            {Math.round(disponibile).toLocaleString("it-IT")} h
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 6 }}>
        {SIM_VAR_META.filter((m) => m.role !== "OUTPUT" && m.role !== "DERIVED").map((m) => {
          const v = eeVals[m.key] ?? simConfig.distributions[m.key]?.current ?? 0;
          const distCfg = simConfig.distributions[m.key];
          const hasRange = distCfg && distCfg.type !== "fixed" && distCfg.min !== distCfg.max;
          return (
            <div key={m.key} style={{
              padding: "6px 10px", borderRadius: 4,
              background: "var(--cd, rgba(255,255,255,0.03))",
              border: "1px solid var(--bd)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "var(--fg2)" }}>{m.label}</span>
                <RoleBadge role={m.role} />
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)" }}>
                {fmtNum(v, m)}
              </div>
              {hasRange && distCfg && (
                <div style={{ fontSize: 10, color: "var(--fg3)" }}>
                  [{fmtNum(distCfg.min, m)} — {fmtNum(distCfg.max, m)}]
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    DISTRIBUTION: "#4f8cff",
    DECISION: "#a78bfa",
    FIXED: "var(--fg3)",
    DERIVED: "#22c55e",
    CONSTRAINT: "#f59e0b",
  };
  return (
    <span style={{
      fontSize: 9, padding: "1px 5px", borderRadius: 3,
      background: `${colors[role] ?? "#888"}22`,
      color: colors[role] ?? "#888",
      border: `1px solid ${colors[role] ?? "#888"}44`,
    }}>
      {role}
    </span>
  );
}

// ─── DISTRIBUTIONS TAB ────────────────────────────────────────────────────────

function DistributionsTab({
  simConfig, setSimConfig,
}: {
  simConfig: SimConfig;
  setSimConfig: React.Dispatch<React.SetStateAction<SimConfig>>;
}) {
  function updateDist(key: string, patch: Partial<DistConfig>) {
    setSimConfig((prev) => ({
      ...prev,
      distributions: {
        ...prev.distributions,
        [key]: { ...prev.distributions[key], ...patch },
      },
    }));
  }

  const distMetas = SIM_VAR_META.filter((m) => m.role === "DISTRIBUTION");

  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--fg3)", marginBottom: 10 }}>
        Configura la distribuzione di ogni variabile probabilistica. &nbsp;
        <strong>FIXED</strong> = valore deterministico. Per le distribuzioni, i parametri probabilistici
        sono sperimentali — usa "DA DEFINIRE" come source finché non hai dati storici.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 10 }}>
        {distMetas.map((m) => {
          const d = simConfig.distributions[m.key] ?? {
            type: "fixed" as DistType,
            current: 0, min: 0, mostLikely: 0, max: 0, stddev: 0, confidence: 0.8, source: "DA DEFINIRE",
          };
          return (
            <DistCard key={m.key} meta={m} cfg={d} onChange={(patch) => updateDist(m.key, patch)} />
          );
        })}
      </div>
    </div>
  );
}

function DistCard({
  meta, cfg, onChange,
}: {
  meta: typeof SIM_VAR_META[0];
  cfg: DistConfig;
  onChange: (patch: Partial<DistConfig>) => void;
}) {
  const isActive = cfg.type !== "fixed";
  const distTypes: DistType[] = ["fixed", "uniform", "triangular", "normal"];

  function numInput(label: string, field: keyof DistConfig, pct?: boolean) {
    const raw = cfg[field] as number;
    const display = pct ? parseFloat((raw * 100).toFixed(4)) : raw;
    return (
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
        <span style={{ color: "var(--fg3)", width: 65, flexShrink: 0 }}>{label}</span>
        <input
          type="number"
          style={{
            width: 80, padding: "2px 6px", borderRadius: 3, border: "1px solid var(--bd)",
            background: "var(--bg)", color: "var(--fg)", fontSize: 11,
          }}
          value={display}
          step={pct ? 0.1 : undefined}
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            if (!isNaN(n)) onChange({ [field]: pct ? n / 100 : n });
          }}
        />
        {pct && <span style={{ fontSize: 10, color: "var(--fg3)" }}>%</span>}
        {meta.isEuro && !pct && <span style={{ fontSize: 10, color: "var(--fg3)" }}>€</span>}
      </label>
    );
  }

  return (
    <div style={{
      border: `1px solid ${isActive ? "var(--accent)" : "var(--bd)"}`,
      borderRadius: 6, padding: "10px 12px",
      background: isActive ? "rgba(79,140,255,0.04)" : "var(--cd, rgba(255,255,255,0.02))",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--fg)" }}>{meta.label}</span>
        <select
          value={cfg.type}
          onChange={(e) => onChange({ type: e.target.value as DistType })}
          style={{
            fontSize: 11, padding: "2px 6px", borderRadius: 3, border: "1px solid var(--bd)",
            background: "var(--bg)", color: "var(--fg)", cursor: "pointer",
          }}
        >
          {distTypes.map((t) => (
            <option key={t} value={t}>{t === "fixed" ? "Fixed" : t.charAt(0).toUpperCase() + t.slice(1)}</option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {cfg.type === "fixed" && numInput("Valore", "current", meta.isPercent)}

        {cfg.type === "uniform" && (
          <>
            {numInput("Min", "min", meta.isPercent)}
            {numInput("Max", "max", meta.isPercent)}
          </>
        )}

        {cfg.type === "triangular" && (
          <>
            {numInput("Min", "min", meta.isPercent)}
            {numInput("Più probabile", "mostLikely", meta.isPercent)}
            {numInput("Max", "max", meta.isPercent)}
          </>
        )}

        {cfg.type === "normal" && (
          <>
            {numInput("Media (μ)", "mostLikely", meta.isPercent)}
            {numInput("Dev. std (σ)", "stddev", meta.isPercent)}
          </>
        )}

        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, marginTop: 3 }}>
          <span style={{ color: "var(--fg3)", width: 65, flexShrink: 0 }}>Confidenza</span>
          <input
            type="range" min={0} max={100} value={Math.round(cfg.confidence * 100)}
            onChange={(e) => onChange({ confidence: parseInt(e.target.value) / 100 })}
            style={{ width: 70 }}
          />
          <span style={{ color: "var(--fg3)" }}>{Math.round(cfg.confidence * 100)}%</span>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
          <span style={{ color: "var(--fg3)", width: 65, flexShrink: 0 }}>Source</span>
          <input
            type="text"
            style={{
              flex: 1, padding: "2px 6px", borderRadius: 3, border: "1px solid var(--bd)",
              background: "var(--bg)", color: "var(--fg)", fontSize: 11,
            }}
            value={cfg.source}
            onChange={(e) => onChange({ source: e.target.value })}
          />
        </label>
      </div>
    </div>
  );
}

// ─── CONSTRAINTS TAB ──────────────────────────────────────────────────────────

function ConstraintsTab({
  simConfig, setSimConfig, disponibile,
}: {
  simConfig: SimConfig;
  setSimConfig: React.Dispatch<React.SetStateAction<SimConfig>>;
  disponibile: number;
}) {
  function patch(obj: Partial<SimConfig>) {
    setSimConfig((p) => ({ ...p, ...obj }));
  }
  function patchCap(obj: Partial<SimConfig["capacity"]>) {
    setSimConfig((p) => ({ ...p, capacity: { ...p.capacity, ...obj } }));
  }
  function patchOut(obj: Partial<SimConfig["outsourcing"]>) {
    setSimConfig((p) => ({ ...p, outsourcing: { ...p.outsourcing, ...obj } }));
  }
  function patchConstr(obj: Partial<SimConfig["constraints"]>) {
    setSimConfig((p) => ({ ...p, constraints: { ...p.constraints, ...obj } }));
  }
  function patchCapConstr(obj: Partial<SimConfig["capConstraint"]>) {
    setSimConfig((p) => ({ ...p, capConstraint: { ...p.capConstraint, ...obj } }));
  }

  const sectionStyle: React.CSSProperties = {
    border: "1px solid var(--bd)", borderRadius: 6, padding: "12px 14px", marginBottom: 12,
  };
  const rowStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 10, marginBottom: 8, fontSize: 12,
  };
  const labelStyle: React.CSSProperties = { color: "var(--fg3)", width: 160, flexShrink: 0 };
  const inputStyle: React.CSSProperties = {
    width: 90, padding: "3px 7px", borderRadius: 3, border: "1px solid var(--bd)",
    background: "var(--bg)", color: "var(--fg)", fontSize: 12,
  };

  return (
    <div>
      {/* Logical Constraints */}
      <div style={sectionStyle}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: "var(--fg2)" }}>
          Vincoli Logici
        </div>
        <div style={rowStyle}>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={simConfig.constraints.enforceRecurringStock}
              onChange={(e) => patchConstr({ enforceRecurringStock: e.target.checked })}
            />
            <span style={{ fontSize: 12 }}>
              <strong>PERC. RICORRENTI + PERC. STOCK = 1</strong>
              <span style={{ color: "var(--fg3)", marginLeft: 6 }}>
                — PERC. STOCK viene derivata automaticamente (= 1 − PERC. RICORRENTI)
              </span>
            </span>
          </label>
        </div>
        <div style={rowStyle}>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={simConfig.constraints.enforceSalesCapacity}
              onChange={(e) => patchConstr({ enforceSalesCapacity: e.target.checked })}
            />
            <span style={{ fontSize: 12 }}>
              <strong>Sales Capacity</strong>
              <span style={{ color: "var(--fg3)", marginLeft: 6 }}>
                — offerte effettive = min(offerte generate, N° commerciali × capienza)
              </span>
            </span>
          </label>
        </div>
      </div>

      {/* Capacity */}
      <div style={sectionStyle}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: "var(--fg2)" }}>
          Productive Capacity
          <span style={{ fontSize: 10, color: "var(--fg3)", fontWeight: 400, marginLeft: 8 }}>
            Disponibile: {Math.round(disponibile).toLocaleString("it-IT")} h/anno
          </span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Persone operative</span>
          <input type="number" style={inputStyle} min={0} value={simConfig.capacity.numPersone}
            onChange={(e) => patchCap({ numPersone: Math.max(0, parseInt(e.target.value) || 0) })} />
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Ore teoriche / persona / anno</span>
          <input type="number" style={inputStyle} min={0} value={simConfig.capacity.oreTeoriche}
            onChange={(e) => patchCap({ oreTeoriche: Math.max(0, parseInt(e.target.value) || 0) })} />
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>% availability</span>
          <input type="number" style={inputStyle} min={0} max={100} step={5}
            value={Math.round(simConfig.capacity.percAvailability * 100)}
            onChange={(e) => patchCap({ percAvailability: Math.min(1, Math.max(0, parseInt(e.target.value) || 0) / 100) })} />
          <span style={{ fontSize: 11, color: "var(--fg3)" }}>%</span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Soglia STRESSED</span>
          <input type="number" style={inputStyle} min={0} max={100} step={5}
            value={Math.round(simConfig.capConstraint.stressThreshold * 100)}
            onChange={(e) => patchCapConstr({ stressThreshold: Math.min(1, Math.max(0, parseInt(e.target.value) || 0) / 100) })} />
          <span style={{ fontSize: 11, color: "var(--fg3)" }}>% sopra disponibile</span>
        </div>
      </div>

      {/* Outsourcing */}
      <div style={sectionStyle}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: "var(--fg2)" }}>
          Outsourcing / Overflow
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Max ore outsourcing</span>
          <input type="number" style={inputStyle} min={0} value={simConfig.outsourcing.maxHours}
            onChange={(e) => patchOut({ maxHours: Math.max(0, parseInt(e.target.value) || 0) })} />
          <span style={{ fontSize: 11, color: "var(--fg3)" }}>h/anno</span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Costo outsourcing</span>
          <input type="number" style={inputStyle} min={0} value={simConfig.outsourcing.costoOra}
            onChange={(e) => patchOut({ costoOra: Math.max(0, parseFloat(e.target.value) || 0) })} />
          <span style={{ fontSize: 11, color: "var(--fg3)" }}>€/ora</span>
        </div>
        <div style={{ fontSize: 11, color: "var(--fg3)", marginTop: 6 }}>
          Se la capacity interna non basta: usa outsourcing fino al limite → se ancora insufficiente: NOT_FEASIBLE.
          {/* TODO: decidere la relazione economica tra UNSERVED CAPACITY e fatturato perso */}
        </div>
      </div>

      {/* Margine Target */}
      <div style={sectionStyle}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: "var(--fg2)" }}>
          Target
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Margine target</span>
          <input type="number" style={inputStyle} value={simConfig.margineTarget}
            onChange={(e) => patch({ margineTarget: parseFloat(e.target.value) || 0 })} />
          <span style={{ fontSize: 11, color: "var(--fg3)" }}>€ — per P(Margine {">"} target)</span>
        </div>
      </div>
    </div>
  );
}

// ─── RUN CONTROLS ─────────────────────────────────────────────────────────────

function RunControls({
  simConfig, setSimConfig, running, runSimulation, resultsCount,
}: {
  simConfig: SimConfig;
  setSimConfig: React.Dispatch<React.SetStateAction<SimConfig>>;
  running: boolean;
  runSimulation: () => void;
  resultsCount: number;
}) {
  const RUN_OPTIONS = [1000, 10000, 50000];

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, padding: "10px 16px",
      background: "var(--cd, rgba(255,255,255,0.02))",
      border: "1px solid var(--bd)", borderRadius: 6, marginBottom: 12,
    }}>
      <div style={{ display: "flex", gap: 4 }}>
        {RUN_OPTIONS.map((n) => (
          <button
            key={n}
            onClick={() => setSimConfig((p) => ({ ...p, numRuns: n }))}
            style={{
              padding: "4px 10px", fontSize: 12, borderRadius: 4,
              border: `1px solid ${simConfig.numRuns === n ? "var(--accent)" : "var(--bd)"}`,
              background: simConfig.numRuns === n ? "var(--accent)" : "transparent",
              color: simConfig.numRuns === n ? "#fff" : "var(--fg)",
              cursor: "pointer",
            }}
          >
            {n.toLocaleString("it-IT")}
          </button>
        ))}
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--fg3)" }}>
        Seed
        <input
          type="number"
          style={{
            width: 80, padding: "3px 7px", borderRadius: 3, border: "1px solid var(--bd)",
            background: "var(--bg)", color: "var(--fg)", fontSize: 11,
          }}
          placeholder="random"
          value={simConfig.seed ?? ""}
          onChange={(e) => {
            const v = e.target.value.trim();
            setSimConfig((p) => ({ ...p, seed: v ? parseInt(v) : undefined }));
          }}
        />
      </label>

      <button
        onClick={runSimulation}
        disabled={running}
        style={{
          padding: "6px 20px", borderRadius: 5, fontSize: 13, fontWeight: 600, cursor: running ? "not-allowed" : "pointer",
          background: running ? "var(--fg3)" : "var(--accent)", color: "#fff", border: "none",
          opacity: running ? 0.6 : 1,
        }}
      >
        {running ? "Running…" : "▶ Run Simulation"}
      </button>

      {resultsCount > 0 && !running && (
        <span style={{ fontSize: 11, color: "var(--fg3)" }}>
          {resultsCount.toLocaleString("it-IT")} scenari calcolati
        </span>
      )}
    </div>
  );
}

// ─── RESULTS PANEL ─────────────────────────────────────────────────────────────

function ResultsPanel({
  results, analysis, xAxis, yAxis, setXAxis, setYAxis,
  selectedIdx, setSelectedIdx, simConfig, setSimConfig, eeVals,
}: {
  results: SimRunResult[];
  analysis: SimAnalysis;
  xAxis: OutputKey;
  yAxis: OutputKey;
  setXAxis: (k: OutputKey) => void;
  setYAxis: (k: OutputKey) => void;
  selectedIdx: number | null;
  setSelectedIdx: (i: number | null) => void;
  simConfig: SimConfig;
  setSimConfig: React.Dispatch<React.SetStateAction<SimConfig>>;
  eeVals: Record<string, number>;
}) {
  const selected = selectedIdx !== null ? results[selectedIdx] : null;
  const { calc: baseCalc } = eeRecalc(eeVals);

  return (
    <div>
      {/* Quick stats bar */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <StatBadge label="FEASIBLE" val={analysis.feasibleCount} total={results.length} color={FEASIBILITY_COLORS.FEASIBLE} />
        <StatBadge label="STRESSED" val={analysis.stressedCount} total={results.length} color={FEASIBILITY_COLORS.CAPACITY_STRESSED} />
        <StatBadge label="NOT FEASIBLE" val={analysis.notFeasibleCount} total={results.length} color={FEASIBILITY_COLORS.NOT_FEASIBLE} />
        <StatBadge label="P(Margine > 0)" val={analysis.probPositive} total={1} color="var(--accent)" isPercent />
        {simConfig.margineTarget !== 0 && (
          <StatBadge label={`P(M > ${eeFmtEuro(simConfig.margineTarget)})`} val={analysis.probAboveTarget} total={1} color="var(--grn)" isPercent />
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        {/* Scenario Cloud */}
        <ScenarioCloud
          results={results}
          xAxis={xAxis} yAxis={yAxis}
          setXAxis={setXAxis} setYAxis={setYAxis}
          selectedIdx={selectedIdx}
          setSelectedIdx={setSelectedIdx}
        />
        {/* Probability */}
        <ProbabilityPanel analysis={analysis} results={results} simConfig={simConfig} setSimConfig={setSimConfig} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <SensitivityPanel analysis={analysis} />
        <FrontierPanel analysis={analysis} simConfig={simConfig} />
      </div>

      {selected && (
        <ScenarioExplorer
          result={selected}
          idx={selectedIdx!}
          baseCalc={baseCalc}
          eeVals={eeVals}
          onClose={() => setSelectedIdx(null)}
        />
      )}
    </div>
  );
}

function StatBadge({ label, val, total, color, isPercent }: {
  label: string; val: number; total: number; color: string; isPercent?: boolean;
}) {
  return (
    <div style={{
      padding: "6px 12px", borderRadius: 5, border: "1px solid var(--bd)",
      background: "var(--cd, rgba(255,255,255,0.02))",
    }}>
      <div style={{ fontSize: 10, color: "var(--fg3)" }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color }}>
        {isPercent ? fmtPct(val) : val.toLocaleString("it-IT")}
      </div>
      {!isPercent && (
        <div style={{ fontSize: 10, color: "var(--fg3)" }}>{fmtPct(val / total)}</div>
      )}
    </div>
  );
}

// ─── SCENARIO CLOUD (Canvas scatter) ─────────────────────────────────────────

const CLOUD_W = 520;
const CLOUD_H = 320;
const PAD = { top: 20, right: 20, bottom: 50, left: 70 };
const MAX_DISPLAY = 4000;

function ScenarioCloud({
  results, xAxis, yAxis, setXAxis, setYAxis, selectedIdx, setSelectedIdx,
}: {
  results: SimRunResult[];
  xAxis: OutputKey; yAxis: OutputKey;
  setXAxis: (k: OutputKey) => void; setYAxis: (k: OutputKey) => void;
  selectedIdx: number | null;
  setSelectedIdx: (i: number | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const drawnRef = useRef<{ x: number; y: number; idx: number }[]>([]);
  const [hovered, setHovered] = useState<SimRunResult | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const { xs, ys, xMin, xMax, yMin, yMax, displayIndices } = useMemo(() => {
    const step = results.length > MAX_DISPLAY ? Math.ceil(results.length / MAX_DISPLAY) : 1;
    const displayIndices: number[] = [];
    for (let i = 0; i < results.length; i += step) displayIndices.push(i);

    const xs = displayIndices.map((i) => getOutputVal(results[i], xAxis));
    const ys = displayIndices.map((i) => getOutputVal(results[i], yAxis));
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const yMin = Math.min(...ys), yMax = Math.max(...ys);
    return { xs, ys, xMin, xMax, yMin, yMax, displayIndices };
  }, [results, xAxis, yAxis]);

  const toCanvasX = useCallback(
    (v: number) => PAD.left + ((v - xMin) / Math.max(xMax - xMin, 1)) * (CLOUD_W - PAD.left - PAD.right),
    [xMin, xMax],
  );
  const toCanvasY = useCallback(
    (v: number) => CLOUD_H - PAD.bottom - ((v - yMin) / Math.max(yMax - yMin, 1)) * (CLOUD_H - PAD.top - PAD.bottom),
    [yMin, yMax],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, CLOUD_W, CLOUD_H);

    // Background
    ctx.fillStyle = "rgba(0,0,0,0.15)";
    ctx.fillRect(PAD.left, PAD.top, CLOUD_W - PAD.left - PAD.right, CLOUD_H - PAD.top - PAD.bottom);

    // Zero lines if in range
    if (xMin < 0 && xMax > 0) {
      const zx = toCanvasX(0);
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(zx, PAD.top); ctx.lineTo(zx, CLOUD_H - PAD.bottom); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (yMin < 0 && yMax > 0) {
      const zy = toCanvasY(0);
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(PAD.left, zy); ctx.lineTo(CLOUD_W - PAD.right, zy); ctx.stroke();
      ctx.setLineDash([]);
    }

    // Axes
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD.left, PAD.top);
    ctx.lineTo(PAD.left, CLOUD_H - PAD.bottom);
    ctx.lineTo(CLOUD_W - PAD.right, CLOUD_H - PAD.bottom);
    ctx.stroke();

    // Axis labels
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "10px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(OUTPUT_OPTIONS.find((o) => o.key === xAxis)?.label ?? xAxis, CLOUD_W / 2, CLOUD_H - 6);
    ctx.save();
    ctx.translate(12, CLOUD_H / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(OUTPUT_OPTIONS.find((o) => o.key === yAxis)?.label ?? yAxis, 0, 0);
    ctx.restore();

    // Points
    const drawn: { x: number; y: number; idx: number }[] = [];
    for (let di = 0; di < displayIndices.length; di++) {
      const ri = displayIndices[di];
      const r = results[ri];
      const cx = toCanvasX(xs[di]);
      const cy = toCanvasY(ys[di]);
      const isSelected = ri === selectedIdx;
      const radius = isSelected ? 5 : 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = FEASIBILITY_COLORS[r.feasibility];
      ctx.globalAlpha = isSelected ? 1 : 0.55;
      ctx.fill();
      if (isSelected) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.lineWidth = 1;
      }
      drawn.push({ x: cx, y: cy, idx: ri });
    }
    ctx.globalAlpha = 1;
    drawnRef.current = drawn;
  }, [results, xs, ys, displayIndices, xAxis, yAxis, selectedIdx, toCanvasX, toCanvasY]);

  function findNearest(e: React.MouseEvent<HTMLCanvasElement>): number | null {
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    let best = -1, bestDist = 20 * 20; // 20px threshold
    for (const pt of drawnRef.current) {
      const d = (pt.x - mx) ** 2 + (pt.y - my) ** 2;
      if (d < bestDist) { bestDist = d; best = pt.idx; }
    }
    return best === -1 ? null : best;
  }

  function onMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const idx = findNearest(e);
    setHovered(idx !== null ? results[idx] : null);
    if (idx !== null) {
      const rect = canvasRef.current!.getBoundingClientRect();
      setTooltipPos({ x: e.clientX - rect.left + 10, y: e.clientY - rect.top - 30 });
    }
  }

  return (
    <div className="ee-section">
      <div className="ee-section-title" style={{ cursor: "default" }}>
        Scenario Cloud
        <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 400, color: "var(--fg3)" }}>
          {displayIndices.length.toLocaleString("it-IT")} punti visualizzati
          {results.length > MAX_DISPLAY ? ` (campione di ${results.length.toLocaleString("it-IT")})` : ""}
        </span>
      </div>
      <div style={{ padding: "8px 12px" }}>
        {/* Axis selectors */}
        <div style={{ display: "flex", gap: 12, marginBottom: 8, fontSize: 11 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--fg3)" }}>
            X:
            <select value={xAxis} onChange={(e) => setXAxis(e.target.value as OutputKey)}
              style={{ fontSize: 11, padding: "2px 6px", borderRadius: 3, border: "1px solid var(--bd)", background: "var(--bg)", color: "var(--fg)" }}>
              {OUTPUT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--fg3)" }}>
            Y:
            <select value={yAxis} onChange={(e) => setYAxis(e.target.value as OutputKey)}
              style={{ fontSize: 11, padding: "2px 6px", borderRadius: 3, border: "1px solid var(--bd)", background: "var(--bg)", color: "var(--fg)" }}>
              {OUTPUT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </label>
        </div>

        {/* Canvas */}
        <div style={{ position: "relative", display: "inline-block" }}>
          <canvas
            ref={canvasRef}
            width={CLOUD_W}
            height={CLOUD_H}
            style={{ cursor: "crosshair", display: "block", borderRadius: 4 }}
            onMouseMove={onMouseMove}
            onMouseLeave={() => setHovered(null)}
            onClick={(e) => {
              const idx = findNearest(e);
              setSelectedIdx(idx === selectedIdx ? null : idx);
            }}
          />
          {/* Hover tooltip */}
          {hovered && (
            <div style={{
              position: "absolute", left: tooltipPos.x, top: tooltipPos.y,
              background: "var(--bg, #1a1a2e)", border: "1px solid var(--bd)",
              borderRadius: 5, padding: "6px 10px", fontSize: 11, pointerEvents: "none",
              boxShadow: "0 4px 12px rgba(0,0,0,0.4)", zIndex: 10, minWidth: 140,
            }}>
              <div style={{ color: FEASIBILITY_COLORS[hovered.feasibility], fontWeight: 600, marginBottom: 3 }}>
                {hovered.feasibility}
              </div>
              <div>VDP: {eeFmtEuro(hovered.vdp)}</div>
              <div>Margine: {eeFmtEuro(hovered.margine)}</div>
              <div>Capacity: {Math.round(hovered.capacity.necessaria).toLocaleString("it-IT")} h</div>
              <div style={{ color: "var(--fg3)", marginTop: 3, fontSize: 10 }}>Click per dettaglio</div>
            </div>
          )}
        </div>

        {/* Legend */}
        <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 10, color: "var(--fg3)" }}>
          {(["FEASIBLE", "CAPACITY_STRESSED", "NOT_FEASIBLE"] as const).map((f) => (
            <span key={f} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: FEASIBILITY_COLORS[f], display: "inline-block" }} />
              {f === "FEASIBLE" ? "Feasible" : f === "CAPACITY_STRESSED" ? "Stressed" : "Not Feasible"}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── PROBABILITY PANEL ────────────────────────────────────────────────────────

function ProbabilityPanel({
  analysis, results, simConfig, setSimConfig,
}: {
  analysis: SimAnalysis;
  results: SimRunResult[];
  simConfig: SimConfig;
  setSimConfig: React.Dispatch<React.SetStateAction<SimConfig>>;
}) {
  const margines = results.map((r) => r.margine);
  const { p10, p25, p50, p75, p90, mean } = analysis.percentiles;

  const bins = useMemo(() => {
    if (!margines.length) return [];
    const mn = Math.min(...margines), mx = Math.max(...margines);
    const N = 30;
    const step = (mx - mn) / N || 1;
    const counts = new Array(N).fill(0);
    for (const v of margines) {
      const bi = Math.min(N - 1, Math.floor((v - mn) / step));
      counts[bi]++;
    }
    const maxCount = Math.max(...counts);
    return counts.map((c, i) => ({
      from: mn + i * step,
      to: mn + (i + 1) * step,
      count: c,
      h: maxCount > 0 ? (c / maxCount) * 100 : 0,
    }));
  }, [margines]);

  const SVG_W = 480, SVG_H = 160;
  const padL = 10, padR = 10, padT = 8, padB = 20;
  const chartW = SVG_W - padL - padR;
  const chartH = SVG_H - padT - padB;

  const xScale = (v: number): number => {
    if (!margines.length) return padL;
    const mn = Math.min(...margines), mx = Math.max(...margines);
    return padL + ((v - mn) / Math.max(mx - mn, 1)) * chartW;
  };

  const pctiles = [
    { v: p10, label: "P10" }, { v: p25, label: "P25" }, { v: p50, label: "P50", bold: true },
    { v: p75, label: "P75" }, { v: p90, label: "P90" },
  ];

  return (
    <div className="ee-section">
      <div className="ee-section-title" style={{ cursor: "default" }}>Probability — Margine Lordo</div>
      <div style={{ padding: "8px 12px" }}>
        {/* Histogram */}
        <svg width={SVG_W} height={SVG_H} style={{ overflow: "visible", display: "block" }}>
          {/* Bars */}
          {bins.map((b, i) => {
            const x = padL + (i / bins.length) * chartW;
            const bw = chartW / bins.length - 0.5;
            const bh = (b.h / 100) * chartH;
            const isPos = b.from >= 0;
            return (
              <rect key={i} x={x} y={padT + chartH - bh} width={bw} height={bh}
                fill={isPos ? "rgba(34,197,94,0.5)" : "rgba(239,68,68,0.5)"}
                stroke="none"
              />
            );
          })}
          {/* Zero line */}
          {(() => {
            if (!margines.length) return null;
            const mn = Math.min(...margines), mx = Math.max(...margines);
            if (mn >= 0 || mx <= 0) return null;
            const zx = xScale(0);
            return <line x1={zx} x2={zx} y1={padT} y2={padT + chartH} stroke="rgba(255,255,255,0.3)" strokeDasharray="3 2" />;
          })()}
          {/* Percentile lines */}
          {pctiles.map(({ v, label, bold }) => {
            const x = xScale(v);
            return (
              <g key={label}>
                <line x1={x} x2={x} y1={padT} y2={padT + chartH}
                  stroke="rgba(255,255,255,0.5)" strokeDasharray="2 2" strokeWidth={bold ? 2 : 1} />
                <text x={x} y={padT - 1} textAnchor="middle" fontSize={9} fill="rgba(255,255,255,0.6)"
                  fontWeight={bold ? 700 : 400}>{label}</text>
              </g>
            );
          })}
          {/* Target line */}
          {simConfig.margineTarget !== 0 && (
            <line x1={xScale(simConfig.margineTarget)} x2={xScale(simConfig.margineTarget)}
              y1={padT} y2={padT + chartH}
              stroke="#a78bfa" strokeWidth={1.5} strokeDasharray="3 2" />
          )}
        </svg>

        {/* Percentile table */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 4, marginTop: 8 }}>
          {[
            { l: "P10", v: p10 }, { l: "P25", v: p25 }, { l: "P50", v: p50 },
            { l: "P75", v: p75 }, { l: "P90", v: p90 }, { l: "Media", v: mean },
          ].map(({ l, v }) => (
            <div key={l} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "var(--fg3)" }}>{l}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: v >= 0 ? "var(--grn)" : "var(--red)" }}>
                {eeFmtEuro(v)}
              </div>
            </div>
          ))}
        </div>

        {/* Probabilities */}
        <div style={{ display: "flex", gap: 12, marginTop: 10, fontSize: 11 }}>
          <span>
            P(M &gt; 0) = <strong style={{ color: "var(--grn)" }}>{fmtPct(analysis.probPositive)}</strong>
          </span>
          {simConfig.margineTarget !== 0 && (
            <span>
              P(M &gt; {eeFmtEuro(simConfig.margineTarget)}) = {" "}
              <strong style={{ color: "var(--accent)" }}>{fmtPct(analysis.probAboveTarget)}</strong>
            </span>
          )}
        </div>

        {/* Target input */}
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--fg3)" }}>
          Target margine:
          <input
            type="number"
            style={{
              width: 100, padding: "2px 6px", borderRadius: 3, border: "1px solid var(--bd)",
              background: "var(--bg)", color: "var(--fg)", fontSize: 11,
            }}
            value={simConfig.margineTarget}
            onChange={(e) => setSimConfig((p) => ({ ...p, margineTarget: parseFloat(e.target.value) || 0 }))}
          />
          €
        </div>
      </div>
    </div>
  );
}

// ─── SENSITIVITY PANEL ────────────────────────────────────────────────────────

function SensitivityPanel({ analysis }: { analysis: SimAnalysis }) {
  const { sensitivity } = analysis;
  if (!sensitivity.length) return (
    <div className="ee-section">
      <div className="ee-section-title" style={{ cursor: "default" }}>Sensitivity</div>
      <div style={{ padding: "8px 12px", fontSize: 11, color: "var(--fg3)" }}>
        Nessuna variabile con distribuzione attiva. Configura almeno una variabile come Uniform/Triangular/Normal.
      </div>
    </div>
  );

  const maxAbs = Math.max(...sensitivity.map((s) => Math.abs(s.pearson)), 0.001);

  return (
    <div className="ee-section">
      <div className="ee-section-title" style={{ cursor: "default" }}>
        Sensitivity Analysis
        <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 400, color: "var(--fg3)" }}>
          Pearson su Margine Lordo — correlazione, non causalità
        </span>
      </div>
      <div style={{ padding: "8px 12px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: "4px 8px", alignItems: "center" }}>
          <div style={{ fontSize: 10, color: "var(--fg3)" }}>Driver</div>
          <div style={{ fontSize: 10, color: "var(--fg3)" }}>Effetto su Margine</div>
          <div style={{ fontSize: 10, color: "var(--fg3)" }}>r</div>

          {sensitivity.slice(0, 12).map((s) => {
            const pct = (Math.abs(s.pearson) / maxAbs) * 100;
            const isPos = s.pearson >= 0;
            return [
              <span key={`${s.key}-l`} style={{ fontSize: 11, color: "var(--fg)", whiteSpace: "nowrap" }}>
                {s.label}
              </span>,
              <div key={`${s.key}-b`} style={{ position: "relative", height: 14, background: "rgba(255,255,255,0.05)", borderRadius: 2 }}>
                <div style={{
                  position: "absolute",
                  left: isPos ? 0 : `${100 - pct}%`,
                  width: `${pct}%`,
                  height: "100%",
                  background: isPos ? "rgba(34,197,94,0.6)" : "rgba(239,68,68,0.6)",
                  borderRadius: 2,
                  transition: "width 0.3s",
                }} />
              </div>,
              <span key={`${s.key}-v`} style={{
                fontSize: 11, fontWeight: 600, textAlign: "right",
                color: isPos ? "var(--grn)" : "var(--red)",
              }}>
                {isPos ? "+" : ""}{s.pearson.toFixed(3)}
              </span>,
            ];
          })}
        </div>

        <div style={{ fontSize: 10, color: "var(--fg3)", marginTop: 8 }}>
          Spearman: {sensitivity.slice(0, 3).map((s) =>
            `${s.label} ${s.spearman > 0 ? "+" : ""}${s.spearman.toFixed(2)}`
          ).join(" · ")}
        </div>
      </div>
    </div>
  );
}

// ─── FRONTIER PANEL ────────────────────────────────────────────────────────────

function FrontierPanel({ analysis, simConfig }: { analysis: SimAnalysis; simConfig: SimConfig }) {
  const n = analysis.feasibleCount + analysis.stressedCount + analysis.notFeasibleCount;
  return (
    <div className="ee-section">
      <div className="ee-section-title" style={{ cursor: "default" }}>Business Frontier</div>
      <div style={{ padding: "8px 12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <FrontierCard label="Max VDP FEASIBLE" val={eeFmtEuro(analysis.maxFeasibleVdp)} />
        <FrontierCard label="Max Margine FEASIBLE" val={eeFmtEuro(analysis.maxFeasibleMargine)} />
        <FrontierCard
          label={`Scenari sopra target (${eeFmtEuro(simConfig.margineTarget)})`}
          val={`${Math.round(analysis.probAboveTarget * n).toLocaleString("it-IT")} (${fmtPct(analysis.probAboveTarget)})`}
        />
        <FrontierCard
          label="Constraint più frequente NOT_FEASIBLE"
          val={analysis.notFeasibleCount > 0 ? analysis.mainConstraint : "—"}
          sub={analysis.notFeasibleCount > 0 ? `${analysis.notFeasibleCount.toLocaleString("it-IT")} scenari` : "Nessuno scenario NOT_FEASIBLE"}
        />
      </div>
    </div>
  );
}

function FrontierCard({ label, val, sub }: { label: string; val: string; sub?: string }) {
  return (
    <div style={{
      padding: "8px 10px", borderRadius: 5, border: "1px solid var(--bd)",
      background: "var(--cd, rgba(255,255,255,0.02))",
    }}>
      <div style={{ fontSize: 10, color: "var(--fg3)", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--fg)" }}>{val}</div>
      {sub && <div style={{ fontSize: 10, color: "var(--fg3)" }}>{sub}</div>}
    </div>
  );
}

// ─── SCENARIO EXPLORER ────────────────────────────────────────────────────────

function ScenarioExplorer({
  result, idx, baseCalc, eeVals, onClose,
}: {
  result: SimRunResult;
  idx: number;
  baseCalc: Record<string, number>;
  eeVals: Record<string, number>;
  onClose: () => void;
}) {
  function delta(a: number, b: number): string | null {
    if (b === 0) return null;
    const d = ((a - b) / Math.abs(b)) * 100;
    return (d > 0 ? "+" : "") + d.toFixed(1) + "%";
  }

  function CompRow({ label, val, base, isEuro }: { label: string; val: number; base?: number; isEuro?: boolean }) {
    const d = base !== undefined ? delta(val, base) : null;
    const fmt = isEuro ? eeFmtEuro : (v: number) => v.toLocaleString("it-IT");
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, padding: "3px 0", borderBottom: "1px solid var(--bd)", fontSize: 11 }}>
        <span style={{ color: "var(--fg2)" }}>{label}</span>
        <span style={{ fontWeight: 600, color: "var(--fg)" }}>{fmt(val)}</span>
        {d !== null && (
          <span style={{ fontSize: 10, color: parseFloat(d) >= 0 ? "var(--grn)" : "var(--red)" }}>{d}</span>
        )}
      </div>
    );
  }

  return (
    <div className="ee-section">
      <div className="ee-section-title" style={{ cursor: "default", display: "flex", justifyContent: "space-between" }}>
        <span>Scenario Explorer — Simulazione #{idx + 1}</span>
        <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{
            fontSize: 11, padding: "2px 8px", borderRadius: 4,
            background: `${FEASIBILITY_COLORS[result.feasibility]}22`,
            color: FEASIBILITY_COLORS[result.feasibility],
            border: `1px solid ${FEASIBILITY_COLORS[result.feasibility]}44`,
          }}>
            {result.feasibility}
          </span>
          <button onClick={onClose} style={{
            background: "none", border: "none", color: "var(--fg3)", cursor: "pointer", fontSize: 16,
          }}>×</button>
        </span>
      </div>

      <div style={{ padding: "12px 16px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        {/* INPUT */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8, color: "var(--fg3)" }}>INPUT ESTRATTI</div>
          {SIM_VAR_META.filter((m) => m.role === "DISTRIBUTION").map((m) => {
            const simVal = result.inputs[m.key];
            const baseVal = eeVals[m.key];
            if (simVal === undefined) return null;
            const d = delta(simVal, baseVal ?? 0);
            return (
              <div key={m.key} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 4, padding: "2px 0", borderBottom: "1px solid var(--bd)", fontSize: 11 }}>
                <span style={{ color: "var(--fg2)" }}>{m.label}</span>
                <span style={{ fontWeight: 600 }}>{fmtNum(simVal, m)}</span>
                {d !== null && (
                  <span style={{ fontSize: 10, color: parseFloat(d) >= 0 ? "var(--grn)" : "var(--red)" }}>{d}</span>
                )}
              </div>
            );
          })}
        </div>

        {/* ECONOMIC OUTPUT */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8, color: "var(--fg3)" }}>ECONOMIC OUTPUT</div>
          <CompRow label="VDP"           val={result.vdp}        base={baseCalc["VALORE DELLA PRODUZIONE"]} isEuro />
          <CompRow label="Costi totali"  val={result.totalCosts} base={baseCalc["TOTALE COSTI"]}            isEuro />
          <CompRow label="Margine lordo" val={result.margine}    base={baseCalc["MARGINE LORDO (NO BANDI)"]} isEuro />
          <CompRow label="Margine %"     val={result.marginePerc} />
          <CompRow label="MRR run-rate"  val={result.mrr}        base={baseCalc["VALORE DELLA PRODUZIONE"]} isEuro />
          <CompRow label="Tot. vendite"  val={result.totalVendite} isEuro />
        </div>

        {/* REALITY OUTPUT */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8, color: "var(--fg3)" }}>REALITY OUTPUT</div>
          <CompRow label="Capacity necessaria"  val={result.capacity.necessaria} />
          <CompRow label="Capacity disponibile" val={result.capacity.disponibile} />
          <CompRow label="Ore interne"          val={result.capacity.internalHours} />
          <CompRow label="Ore outsourcing"      val={result.capacity.outsourcedHours} />
          <CompRow label="Ore non servite"      val={result.capacity.unservedHours} />
          <CompRow label="Costo outsourcing"    val={result.capacity.outsourcingCost} isEuro />

          <div style={{ marginTop: 10, fontSize: 11, fontWeight: 600, color: "var(--fg3)" }}>SALES CAPACITY</div>
          <CompRow label="Offerte generate"    val={result.offerteGenerate} />
          <CompRow label="Max gestibili"       val={result.maxOfferteGestibili} />
          <CompRow label="Offerte gestite"     val={result.offerteGestite} />
          <CompRow label="Opportunità perse"   val={result.offerteScartate} />
        </div>
      </div>
    </div>
  );
}
