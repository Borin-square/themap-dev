"use client";

import { useState, useCallback } from "react";
import { useLocalState } from "@/lib/useLocalState";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getCompany } from "@/lib/companies";
import {
  getEeMockMetrics, getEeYear, initEeValues, eeGroupMetrics, eeRecalc,
  eeCheckConstraints, eeFmtVal, eeFmtEuro, eeFmtInput, eeParseInput,
  eeIsPercent, eeGetDelta, eeSparkPoints, eeMarginSparkPoints,
  EE_SECTION_ORDER, EE_SECTION_LABELS, EE_SECTION_SLUGS, EE_FN_ORDER,
  EE_INVERTED, EE_AUTO_CALC, EE_KPI_ITEMS, EE_KPI_DEPS, EE_MONTHS,
  type EeMetric, type EeMonthlyRow, type EeScenario, type EeNote,
} from "@/lib/economic-engine";

export default function EconomicEnginePage() {
  const params = useParams();
  const company = getCompany(params.company as string);
  const year = getEeYear();

  const [metrics] = useState(() => getEeMockMetrics());
  const [{ values, origValues, prevValues }] = useState(() =>
    initEeValues(getEeMockMetrics(), year),
  );
  const slug = params.company as string;
  const [vals, setVals] = useLocalState(`themap:${slug}:eeVals`, () => values);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ mensile: true });
  const [filterFn, setFilterFn] = useState<string | null>(null);
  const [drillKpi, setDrillKpi] = useState<string | null>(null);
  const [scenarios, setScenarios] = useLocalState<EeScenario[]>(`themap:${slug}:eeScenarios`, () => []);
  const [scOpen, setScOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [scName, setScName] = useState("");
  const [scDesc, setScDesc] = useState("");
  const [notesOpen, setNotesOpen] = useState<number | null>(null);
  const [noteForm, setNoteForm] = useState({ titolo: "", contenuto: "" });

  const { calc, monthly } = eeRecalc(vals);
  const warnings = eeCheckConstraints(vals);
  const grouped = eeGroupMetrics(metrics);

  const isModified = useCallback(
    (k: string) => vals[k] !== origValues[k],
    [vals, origValues],
  );

  const dirtyCount = Object.keys(origValues).filter(
    (k) => vals[k] !== origValues[k],
  ).length;

  function onMetricChange(key: string, raw: string) {
    const v = eeParseInput(raw, key);
    setVals((p) => ({ ...p, [key]: v }));
  }

  function toggleSection(slug: string) {
    setCollapsed((p) => ({ ...p, [slug]: !p[slug] }));
  }

  function toggleFilter(fn: string | null) {
    setFilterFn((p) => (p === fn ? null : fn));
  }

  function toggleKpiDrill(key: string) {
    setDrillKpi((p) => (p === key ? null : key));
  }

  // Scenari
  function saveScenario() {
    const nome = scName.trim();
    if (!nome) return;
    setScenarios((p) => [
      ...p,
      {
        id: Date.now(),
        nome,
        descrizione: scDesc.trim(),
        anno: year,
        data: new Date().toLocaleDateString("it-IT"),
        values: { ...vals },
      },
    ]);
    setSaveOpen(false);
    setScName("");
    setScDesc("");
  }

  function loadScenario(sc: EeScenario) {
    setVals({ ...sc.values });
    setScOpen(false);
  }

  function deleteScenario(id: number) {
    setScenarios((p) => p.filter((s) => s.id !== id));
    if (notesOpen === id) setNotesOpen(null);
  }

  function addNote(scId: number) {
    if (!noteForm.titolo.trim()) return;
    const note: EeNote = {
      id: crypto.randomUUID(),
      titolo: noteForm.titolo.trim(),
      contenuto: noteForm.contenuto.trim(),
      data: new Date().toLocaleDateString("it-IT"),
    };
    setScenarios((p) =>
      p.map((s) => s.id === scId ? { ...s, notes: [...(s.notes || []), note] } : s),
    );
    setNoteForm({ titolo: "", contenuto: "" });
  }

  function deleteNote(scId: number, noteId: string) {
    setScenarios((p) =>
      p.map((s) => s.id === scId ? { ...s, notes: (s.notes || []).filter((n) => n.id !== noteId) } : s),
    );
  }

  function updateNote(scId: number, noteId: string, field: "titolo" | "contenuto", value: string) {
    setScenarios((p) =>
      p.map((s) => s.id === scId
        ? { ...s, notes: (s.notes || []).map((n) => n.id === noteId ? { ...n, [field]: value } : n) }
        : s
      ),
    );
  }

  // Funzioni uniche nei dati
  const fns = EE_FN_ORDER.filter((fn) =>
    metrics.some((m) => m.funzione === fn && m.funzione !== "DIREZIONE"),
  );

  const drillDeps = drillKpi ? EE_KPI_DEPS[drillKpi] || [] : [];

  return (
    <div>
      <div className="ee-subnav">
        <span className="ee-tab active">Playground</span>
        <Link href={`/${params.company}/economic-engine/forecast`} className="ee-tab">Forecast</Link>
        <Link href={`/${params.company}/economic-engine/real`} className="ee-tab">Consuntivo</Link>
        <Link href={`/${params.company}/economic-engine/ckm`} className="ee-tab">CKM</Link>
      </div>

      {/* Header */}
      <div className="ee-head">
        <div className="ee-title">
          {company && <span style={{ color: company.color }}>{"\u25A0"}</span>}
          {company?.name || params.company} — Economic Engine
        </div>
        <div className="ee-actions">
          {dirtyCount > 0 && (
            <span className="ee-dirty-badge">
              {dirtyCount} modific{dirtyCount === 1 ? "a" : "he"} non salvat{dirtyCount === 1 ? "a" : "e"}
            </span>
          )}
          <button className={`ee-btn ee-btn-save${dirtyCount > 0 ? " ee-dirty-pulse" : ""}`} onClick={() => setSaveOpen(true)}>
            Salva scenario
          </button>
          <div className="ee-dropdown">
            <button className="ee-btn" onClick={() => setScOpen(!scOpen)}>
              Scenari &#9662;
            </button>
            {scOpen && (
              <div className="ee-dropdown-menu vis">
                {scenarios.length === 0 ? (
                  <div className="ee-dropdown-empty">Nessuno scenario salvato</div>
                ) : (
                  <div className="ee-scenari-list">
                    {scenarios.map((sc) => (
                      <div key={sc.id} className="ee-sc-item">
                        <div className="ee-sc-name" onClick={() => loadScenario(sc)}>{sc.nome}</div>
                        {sc.descrizione && <div className="ee-sc-desc">{sc.descrizione}</div>}
                        <span className="ee-sc-date">{sc.data}</span>
                        <span className="ee-sc-notes-btn" onClick={(e) => { e.stopPropagation(); setNotesOpen(notesOpen === sc.id ? null : sc.id); }}>
                          Note {sc.notes?.length ? `(${sc.notes.length})` : ""}
                        </span>
                        <span className="ee-sc-del" onClick={() => deleteScenario(sc.id)}>&times;</span>
                        {notesOpen === sc.id && (
                          <div className="ee-notes-panel" onClick={(e) => e.stopPropagation()}>
                            <div className="ee-notes-list">
                              {(sc.notes || []).map((n) => (
                                <div key={n.id} className="ee-note-item">
                                  <input
                                    className="ee-note-title"
                                    value={n.titolo}
                                    onChange={(e) => updateNote(sc.id, n.id, "titolo", e.target.value)}
                                    placeholder="Titolo"
                                  />
                                  <textarea
                                    className="ee-note-content"
                                    value={n.contenuto}
                                    onChange={(e) => updateNote(sc.id, n.id, "contenuto", e.target.value)}
                                    placeholder="Contenuto nota..."
                                  />
                                  <div className="ee-note-foot">
                                    <span className="ee-note-date">{n.data}</span>
                                    <span className="ee-sc-del" onClick={() => deleteNote(sc.id, n.id)}>&times;</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div className="ee-note-add">
                              <input
                                className="ee-note-title"
                                value={noteForm.titolo}
                                onChange={(e) => setNoteForm({ ...noteForm, titolo: e.target.value })}
                                placeholder="Titolo nuova nota"
                                onKeyDown={(e) => { if (e.key === "Enter") addNote(sc.id); }}
                              />
                              <textarea
                                className="ee-note-content"
                                value={noteForm.contenuto}
                                onChange={(e) => setNoteForm({ ...noteForm, contenuto: e.target.value })}
                                placeholder="Contenuto..."
                              />
                              <button className="ee-btn ee-btn-primary" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => addNote(sc.id)}>
                                + Aggiungi nota
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* KPI sticky bar */}
      <div className="ee-sticky-bar">
        <div className="ee-section" data-tip="risultati">
          <div className="ee-section-title" style={{ cursor: "default" }}>Risultati</div>
          <div className="ee-kpi-row">
            {EE_KPI_ITEMS.map((it) => {
              const v = calc[it.key] ?? 0;
              const color = it.key.includes("MARGINE")
                ? v >= 0 ? "var(--grn)" : "var(--red)"
                : it.key.includes("COSTI") ? "var(--org)" : "var(--fg)";
              const active = drillKpi === it.key;
              const spark = it.mk
                ? eeSparkPoints(monthly, it.mk, 0)
                : it.key.includes("MARGINE")
                  ? eeMarginSparkPoints(monthly, 0)
                  : "";
              const sparkColor = it.key.includes("COSTI") ? "#f59e0b" : it.key.includes("MARGINE") ? "#22c55e" : "#4f8cff";
              return (
                <div
                  key={it.key}
                  className={`ee-kpi${active ? " ee-kpi-active" : ""}`}
                  onClick={() => toggleKpiDrill(it.key)}
                >
                  <div className="ee-kpi-label">{it.label}</div>
                  <div className="ee-kpi-val" style={{ color }}>{eeFmtEuro(v)}</div>
                  {it.key === "VALORE AZIENDA" && (
                    <div className="ee-kpi-sub">Multiplo: {vals["MULTIPLO"] || 0}x</div>
                  )}
                  {spark && (
                    <svg className="ee-kpi-spark" width={80} height={20} viewBox="0 0 80 20">
                      <polyline points={spark} stroke={sparkColor} opacity={0.6} fill="none" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="ee-filter-bar">
        <span className={`ee-filter-btn${!filterFn ? " act" : ""}`} onClick={() => toggleFilter(null)}>Tutte</span>
        {fns.map((fn) => (
          <span
            key={fn}
            className={`ee-filter-btn${filterFn === fn ? " act" : ""}`}
            onClick={() => toggleFilter(fn)}
          >
            {fn}
          </span>
        ))}
      </div>

      {/* Metric sections */}
      {EE_SECTION_ORDER.map((tip) => {
        const grps = grouped[tip];
        if (!grps) return null;
        const hasItems = EE_FN_ORDER.some((fn) => grps[fn]?.length);
        if (!hasItems) return null;
        const isRo = tip === "CALCOLATO";
        const label = EE_SECTION_LABELS[tip] || tip;
        const slug = EE_SECTION_SLUGS[tip] || "";
        const coll = collapsed[slug] ?? false;

        return (
          <div key={tip} className={`ee-section${coll ? " collapsed" : ""}`} data-tip={slug}>
            <div className="ee-section-title" onClick={() => toggleSection(slug)}>
              <span className="ee-arrow">&#9660;</span> {label}{" "}
              <span className="ee-badge">{isRo ? "sola lettura" : "editabile"}</span>
            </div>
            <div className="ee-section-body">
              {EE_FN_ORDER.map((fn) => {
                const items = grps[fn];
                if (!items?.length) return null;
                const hidden = filterFn && filterFn !== fn;
                return (
                  <div key={fn} className="ee-group" style={hidden ? { display: "none" } : undefined}>
                    <div className="ee-group-title">{fn}</div>
                    <div className="ee-metrics">
                      {items.map((m) => (
                        <MetricCard
                          key={m.metrica}
                          m={m}
                          isRo={isRo}
                          vals={vals}
                          calc={calc}
                          prevValues={prevValues}
                          isModified={isModified(m.metrica.toUpperCase())}
                          warning={warnings[m.metrica.toUpperCase()]}
                          isDrill={drillDeps.includes(m.metrica.toUpperCase())}
                          onChange={onMetricChange}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Monthly table */}
      <div className={`ee-section${collapsed.mensile ? " collapsed" : ""}`} data-tip="mensile">
        <div className="ee-section-title" onClick={() => toggleSection("mensile")}>
          <span className="ee-arrow">&#9660;</span> Dettaglio Mensile {year}
        </div>
        <div className="ee-section-body">
          <MonthlyTable monthly={monthly} startM={0} />
        </div>
      </div>

      {/* Indicatori */}
      <Indicatori calc={calc} monthly={monthly} vals={vals} year={year} />

      {/* Save inline panel */}
      {saveOpen && (
        <div className="ee-save-inline">
          <input
            className="ee-save-input"
            placeholder="Nome scenario"
            value={scName}
            onChange={(e) => setScName(e.target.value)}
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") saveScenario(); if (e.key === "Escape") { setSaveOpen(false); setScName(""); setScDesc(""); } }}
          />
          <input
            className="ee-save-input ee-save-desc"
            placeholder="Descrizione (opzionale)"
            value={scDesc}
            onChange={(e) => setScDesc(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") saveScenario(); if (e.key === "Escape") { setSaveOpen(false); setScName(""); setScDesc(""); } }}
          />
          <button className="ee-btn ee-btn-primary" onClick={saveScenario}>Salva</button>
          <button className="ee-btn" onClick={() => { setSaveOpen(false); setScName(""); setScDesc(""); }}>&times;</button>
        </div>
      )}
    </div>
  );
}

/* ── METRIC CARD ── */

function MetricCard({
  m, isRo, vals, calc, prevValues, isModified, warning, isDrill, onChange,
}: {
  m: EeMetric;
  isRo: boolean;
  vals: Record<string, number>;
  calc: Record<string, number>;
  prevValues: Record<string, number | null>;
  isModified: boolean;
  warning?: string;
  isDrill: boolean;
  onChange: (key: string, raw: string) => void;
}) {
  const k = m.metrica.toUpperCase();
  const isAutoCalc = EE_AUTO_CALC.includes(k);
  const isInverted = EE_INVERTED.includes(k);

  const cur = vals[k] ?? calc[k] ?? null;
  const prev = prevValues[k] ?? null;
  const delta = eeGetDelta(cur, prev);

  const outBench =
    m.benchMax !== null && m.benchMax !== undefined && cur !== null
      ? cur > m.benchMax
      : m.benchMin !== null && m.benchMin !== undefined && cur !== null
        ? cur < m.benchMin
        : false;

  let cls = "ee-metric";
  if (isModified) cls += " ee-modified";
  if (outBench) cls += " ee-out-bench";
  if (warning) cls += " ee-constraint-warn";
  if (isDrill) cls += " ee-drilldown";

  return (
    <div className={cls} data-k={k}>
      <div className="ee-metric-name">
        {m.metrica}
        {delta !== null && (
          <DeltaBadge delta={delta} inverted={isInverted} />
        )}
      </div>

      {isRo || isAutoCalc ? (
        <div className="ee-metric-ro">{eeFmtVal(calc[k], m.metrica)}</div>
      ) : (
        <>
          <input
            className="ee-metric-val"
            defaultValue={eeFmtInput(vals[k], m.metrica)}
            onBlur={(e) => onChange(k, e.target.value)}
          />
          {eeIsPercent(m.metrica) && (
            <span style={{ color: "var(--fg3)", fontSize: 10, marginLeft: -4 }}>%</span>
          )}
        </>
      )}

      {warning && <div className="ee-warn-icon" title={warning}>{"\u26A0"}</div>}

      {(m.descrizione || m.descCalcolo) && (
        <div
          className="ee-metric-info"
          title={[m.descrizione, m.descCalcolo].filter(Boolean).join("\n")}
        >
          ?
        </div>
      )}

      {prev !== null && (
        <div className="ee-prev-hint">{year - 1}: {eeFmtVal(prev, m.metrica)}</div>
      )}
    </div>
  );
}

const year = new Date().getFullYear();

function DeltaBadge({ delta, inverted }: { delta: number; inverted: boolean }) {
  const good = inverted ? delta < 0 : delta > 0;
  const bad = inverted ? delta > 0 : delta < 0;
  const cls = good ? "ee-delta-up" : bad ? "ee-delta-down" : "ee-delta-flat";
  return (
    <span className={`ee-delta ${cls}`}>
      {delta > 0 ? "+" : ""}
      {delta.toFixed(1)}%
    </span>
  );
}

/* ── MONTHLY TABLE ── */

function MonthlyTable({ monthly, startM }: { monthly: EeMonthlyRow[]; startM: number }) {
  function row(label: string, key: keyof EeMonthlyRow, isTotal?: boolean) {
    let tot = 0;
    return (
      <tr className={isTotal ? "ee-row-total" : ""}>
        <td>{label}</td>
        {monthly.map((r, i) => {
          const v = r[key];
          tot += v;
          return (
            <td key={i} className={i < startM ? "ee-inactive" : ""}>
              {i < startM ? "\u2014" : eeFmtEuro(v)}
            </td>
          );
        })}
        <td><b>{eeFmtEuro(tot)}</b></td>
      </tr>
    );
  }

  let mTot = 0;

  return (
    <div className="ee-table-wrap">
      <table className="ee-table">
        <thead>
          <tr>
            <th></th>
            {EE_MONTHS.map((m, i) => (
              <th key={m} className={i < startM ? "ee-inactive" : ""}>{m}</th>
            ))}
            <th>TOTALE</th>
          </tr>
        </thead>
        <tbody>
          <tr className="ee-row-group"><td colSpan={14}>RICAVI</td></tr>
          {row("Ricorrenti", "ricRic")}
          {row("Stock", "ricStock")}
          {row("Totale", "ricTot", true)}
          <tr className="ee-row-group"><td colSpan={14}>COSTI</td></tr>
          {row("Fissi", "costiFissi")}
          {row("Operativi", "costiOp")}
          {row("Acquisizione", "costiAcq")}
          {row("Variabili", "costiVar")}
          {row("Totale", "costiTot", true)}
          <tr className="ee-row-margin">
            <td>MARGINE</td>
            {monthly.map((r, i) => {
              const mg = r.ricTot - r.costiTot;
              mTot += mg;
              return (
                <td key={i} className={i < startM ? "ee-inactive" : ""} style={{ color: i < startM ? undefined : mg >= 0 ? "var(--grn)" : "var(--red)" }}>
                  {i < startM ? "\u2014" : eeFmtEuro(mg)}
                </td>
              );
            })}
            <td style={{ color: mTot >= 0 ? "var(--grn)" : "var(--red)" }}>{eeFmtEuro(mTot)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ── INDICATORI ── */

function Indicatori({
  calc, monthly, vals, year,
}: {
  calc: Record<string, number>;
  monthly: EeMonthlyRow[];
  vals: Record<string, number>;
  year: number;
}) {
  const vdp = calc["VALORE DELLA PRODUZIONE"] || 0;
  const costi = calc["TOTALE COSTI"] || 0;
  const margine = vdp - costi;
  const margPerc = vdp > 0 ? (margine / vdp) * 100 : 0;
  const ricRicAnno = monthly.length === 12 ? monthly[11].ricRic * 12 : 0;

  const items = [
    { label: "MARGINE %", val: margPerc.toFixed(1) + "%", color: margPerc >= 0 ? "var(--grn)" : "var(--red)" },
    { label: "FATTURATO RICORRENTE", val: eeFmtEuro(ricRicAnno), color: "var(--accent)", sub: vdp > 0 ? Math.round((ricRicAnno / vdp) * 100) + "% del VdP" : undefined },
    { label: "CAPACITY NECESSARIA", val: Math.round(calc["CAPACITY NECESSARIA"] || 0).toLocaleString("it-IT") + " h", color: "var(--fg)" },
    { label: "VALORE AZIENDA", val: eeFmtEuro(calc["VALORE AZIENDA"]), color: "var(--accent)", sub: `Multiplo: ${vals["MULTIPLO"] || 0}x` },
  ];

  return (
    <div className="ee-section" data-tip="indicatori">
      <div className="ee-section-title" style={{ cursor: "default" }}>Indicatori Chiave</div>
      <div className="ee-ind-row">
        {items.map((it) => (
          <div key={it.label} className="ee-ind">
            <div className="ee-ind-label">{it.label}</div>
            <div className="ee-ind-val" style={{ color: it.color }}>{it.val}</div>
            {it.sub && <div className="ee-ind-sub">{it.sub}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
