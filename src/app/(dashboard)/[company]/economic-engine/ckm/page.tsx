"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getCompany } from "@/lib/companies";
import { useLocalState } from "@/lib/useLocalState";
import { useYear } from "@/components/YearProvider";
import {
  getEeMockMetrics, initEeValues, eeRecalc, eeIsPercent,
  EE_INVERTED, type EeMetric,
} from "@/lib/economic-engine";

const YEARS = [2024, 2025, 2026];

/* Calc keys shown in picker */
const CALC_KEYS = [
  "VENDITE MESE", "NUMERO VENDITE SALES", "NUMERO VENDITE MARKETING",
  "NUMERO TOTALE VENDITE", "TOTALE OFFERTE", "TRATTATIVE SCARTO",
  "VENDITA MEDIA ANNUA PER COMMERCIALE", "COSTO ACQUISIZIONE MEDIO",
  "TOTALE VENDITE", "VALORE DELLA PRODUZIONE", "TOTALE COSTI",
  "MARGINE LORDO (NO BANDI)", "VALORE AZIENDA", "CAPACITY NECESSARIA",
];

/* Build multi-year forecasts from mock data with per-year jitter */
function buildForecasts() {
  const metrics = getEeMockMetrics();
  const forecasts: Record<number, { input: Record<string, number>; calc: Record<string, number> }> = {};

  YEARS.forEach((y, yi) => {
    const tweaked: EeMetric[] = metrics.map((m) => {
      if (m.tipologia === "CALCOLATO") return m;
      const base = m.anni[2026] ?? 0;
      // Scale down for older years
      const factor = 1 - (YEARS.length - 1 - yi) * 0.12;
      return { ...m, anni: { ...m.anni, [y]: typeof base === "number" ? base * factor : base } };
    });

    const { values } = initEeValues(tweaked, y);
    const { calc } = eeRecalc(values);

    forecasts[y] = { input: { ...values }, calc };
  });

  return { forecasts, metrics };
}

/* Catalog for picker */
interface CatalogEntry { key: string; label: string; fn: string }
interface Catalog { input: Record<string, CatalogEntry[]>; calc: Record<string, CatalogEntry[]> }

function buildCatalog(metrics: EeMetric[]): Catalog {
  const groupLabels: Record<string, string> = { "DA DEFINIRE": "Leve", STIMA: "Stime", OBIETTIVO: "Obiettivi" };
  const cat: Catalog = { input: {}, calc: {} };

  metrics.forEach((m) => {
    if (m.tipologia === "CALCOLATO") return;
    const grp = groupLabels[m.tipologia] || m.tipologia;
    if (!cat.input[grp]) cat.input[grp] = [];
    cat.input[grp].push({ key: m.metrica, label: m.metrica, fn: m.funzione });
  });

  cat.calc["Risultati"] = CALC_KEYS.map((k) => ({ key: `calc::${k}`, label: k, fn: "" }));
  return cat;
}

/* Format */
const PCT_KEYS = [
  "TASSO DI CHIUSURA F. SALES", "TASSO DI CHIUSURA F. MARKETING", "CHURN RATE",
  "PERC. RICORRENTI", "PERC. STOCK", "% ORE LAVORATE", "TASSO DI TRASFERIMENTO", "COSTO VAR.",
];
const INT_KEYS = [
  "N° OFFERTE F. SALES", "N° OFFERTE FONTE MARKETING", "N° COMMERCIALI",
  "CAPIENZA SALES EXECUTIVE", "MULTIPLO", "NUMERO VENDITE SALES", "NUMERO VENDITE MARKETING",
  "NUMERO TOTALE VENDITE", "TOTALE OFFERTE", "TRATTATIVE SCARTO",
];

function ckmFmt(v: number | null, name: string): string {
  if (v === null || v === undefined || isNaN(v)) return "-";
  if (PCT_KEYS.includes(name)) return (v * 100).toFixed(1) + "%";
  if (INT_KEYS.includes(name)) return Math.round(v).toLocaleString("it-IT");
  if (Math.abs(v) >= 1e6) return "\u20AC " + (v / 1e6).toFixed(1) + "M";
  if (Math.abs(v) >= 1e3) return "\u20AC " + (v / 1e3).toFixed(0) + "K";
  return "\u20AC " + Math.round(v).toLocaleString("it-IT");
}

/* Sparkline SVG */
function Sparkline({ vals }: { vals: (number | null)[] }) {
  const pts: { i: number; v: number }[] = [];
  vals.forEach((v, i) => { if (v !== null && v !== undefined) pts.push({ i, v }); });
  if (pts.length < 2) return null;
  let mn = pts[0].v, mx = pts[0].v;
  pts.forEach((p) => { if (p.v < mn) mn = p.v; if (p.v > mx) mx = p.v; });
  const range = mx - mn || 1;
  const w = 80, h = 24, pad = 2;
  const coords = pts.map((p) => {
    const x = pad + (p.i / (YEARS.length - 1)) * (w - pad * 2);
    const y = h - pad - ((p.v - mn) / range) * (h - pad * 2);
    return `${x},${y}`;
  });
  return (
    <svg className="ckm-spark" viewBox={`0 0 ${w} ${h}`} width={w} height={h}>
      <polyline points={coords.join(" ")} fill="none" stroke="var(--accent)" strokeWidth={1.5}
        strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p) => {
        const x = pad + (p.i / (YEARS.length - 1)) * (w - pad * 2);
        const y = h - pad - ((p.v - mn) / range) * (h - pad * 2);
        return <circle key={p.i} cx={x} cy={y} r={2} fill="var(--accent)" />;
      })}
    </svg>
  );
}

export default function CkmPage() {
  const params = useParams();
  const company = getCompany(params.company as string);
  const { year } = useYear();

  const { forecasts, metrics } = useMemo(buildForecasts, []);
  const catalog = useMemo(() => buildCatalog(metrics), [metrics]);

  const slug = params.company as string;
  const [selected, setSelected] = useLocalState<string[]>(`themap:${slug}:ckmSelected`, () => [], undefined, year);
  const [pickerOpen, setPickerOpen] = useLocalState<boolean>(`themap:${slug}:ckmPickerOpen`, () => true, undefined, year);
  const [notes, setNotes] = useLocalState<Record<string, string>>(`themap:${slug}:ckmNotes`, () => ({}), undefined, year);

  function toggleMetric(key: string) {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  function removeMetric(key: string) {
    setSelected((prev) => prev.filter((k) => k !== key));
  }

  function getVal(key: string, year: number): number | null {
    const fc = forecasts[year];
    if (!fc) return null;
    const isCalc = key.startsWith("calc::");
    const name = isCalc ? key.replace("calc::", "") : key;
    if (isCalc) return fc.calc[name] ?? null;
    return fc.input[name] ?? null;
  }

  return (
    <div>
      <div className="ee-subnav">
        <Link href={`/${params.company}/economic-engine`} className="ee-tab">Playground</Link>
        <Link href={`/${params.company}/economic-engine/forecast`} className="ee-tab">Forecast</Link>
        <Link href={`/${params.company}/economic-engine/real`} className="ee-tab">Consuntivo</Link>
        <span className="ee-tab active">Cycle Key Metrics</span>
      </div>

      <div className="ckm-head">
        <div className="ckm-title">
          {company && <span style={{ color: company.color }}>{"\u25A0"}</span>}
          {" "}Cycle Key Metrics <span className="ckm-subtitle">{company?.name || params.company}</span>
        </div>
      </div>

      {/* Picker */}
      <div className="ckm-picker">
        <div className="ckm-picker-head" onClick={() => setPickerOpen(!pickerOpen)}>
          {pickerOpen ? "\u25BC" : "\u25B6"} Metriche disponibili
        </div>
        {pickerOpen && (
          <>
            {Object.entries(catalog.input).map(([grp, items]) => (
              <div key={grp} className="ckm-group">
                <div className="ckm-group-label">{grp}</div>
                <div className="ckm-chips">
                  {items.map((m) => (
                    <div key={m.key}
                      className={`ckm-chip${selected.includes(m.key) ? " act" : ""}`}
                      onClick={() => toggleMetric(m.key)}>
                      {m.label}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {Object.entries(catalog.calc).map(([grp, items]) => (
              <div key={grp} className="ckm-group">
                <div className="ckm-group-label">{grp}</div>
                <div className="ckm-chips">
                  {items.map((m) => (
                    <div key={m.key}
                      className={`ckm-chip calc${selected.includes(m.key) ? " act" : ""}`}
                      onClick={() => toggleMetric(m.key)}>
                      {m.label}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Table or empty */}
      {selected.length > 0 ? (
        <div className="ckm-table-wrap">
          <table className="ckm-table">
            <thead>
              <tr>
                <th>Metrica</th>
                {YEARS.map((y) => <th key={y}>{y}</th>)}
                <th>Trend</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {selected.map((key) => {
                const isCalc = key.startsWith("calc::");
                const metricName = isCalc ? key.replace("calc::", "") : key;
                const inverted = EE_INVERTED.includes(metricName);
                const vals = YEARS.map((y) => getVal(key, y));

                return (
                  <tr key={key}>
                    <td>
                      {metricName}
                      <span className="ckm-rm" onClick={() => removeMetric(key)} title="Rimuovi">&times;</span>
                    </td>
                    {vals.map((v, i) => {
                      const prev = i > 0 ? vals[i - 1] : null;
                      let delta: number | null = null;
                      if (v !== null && prev !== null && prev !== 0) {
                        delta = ((v - prev) / Math.abs(prev)) * 100;
                      }
                      const cls = delta !== null
                        ? (Math.abs(delta) < 0.5 ? "flat" : (delta > 0 ? (inverted ? "down" : "up") : (inverted ? "up" : "down")))
                        : null;
                      return (
                        <td key={i}>
                          <div className={`ckm-val${v === null ? " miss" : ""}`}>
                            {v !== null ? ckmFmt(v, metricName) : "-"}
                          </div>
                          {delta !== null && (
                            <div className={`ckm-delta ${cls}`}>
                              {delta > 0 ? "+" : ""}{delta.toFixed(1)}%
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td><Sparkline vals={vals} /></td>
                    <td className="ckm-note">
                      <textarea
                        className="ckm-note-input"
                        placeholder="..."
                        value={notes[key] || ""}
                        onChange={(e) => setNotes((prev) => ({ ...prev, [key]: e.target.value }))}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="ckm-empty">
          Seleziona le metriche da monitorare
          <div className="ckm-empty-hint">Clicca sulle pill sopra per aggiungere metriche alla tabella</div>
        </div>
      )}
    </div>
  );
}
