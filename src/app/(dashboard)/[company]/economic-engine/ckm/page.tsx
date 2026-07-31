"use client";

import { useMemo, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getCompany } from "@/lib/companies";
import { useLocalState } from "@/lib/useLocalState";
import { useYear } from "@/components/YearProvider";
import { supabase } from "@/lib/supabase";
import {
  getEeMockMetrics, eeRecalc,
  EE_INVERTED, type EeMetric,
} from "@/lib/economic-engine";

// Range multi-anno mostrato in CKM: 2 anni indietro + corrente + 3 anni avanti.
// I dati per anno vengono dai forecast salvati su Supabase (app_state, key=eeForecast, year=Y).
// Anni senza forecast mostrano "-".
const YEARS = [2024, 2025, 2026, 2027, 2028, 2029];

/* Calc keys shown in picker */
const CALC_KEYS = [
  "VENDITE MESE", "NUMERO VENDITE SALES", "NUMERO VENDITE MARKETING",
  "NUMERO TOTALE VENDITE", "TOTALE OFFERTE", "TRATTATIVE SCARTO",
  "VENDITA MEDIA ANNUA PER COMMERCIALE", "COSTO ACQUISIZIONE MEDIO",
  "TOTALE VENDITE", "VALORE DELLA PRODUZIONE", "TOTALE COSTI",
  "MARGINE LORDO (NO BANDI)", "VALORE AZIENDA", "CAPACITY NECESSARIA",
];

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

async function bearer(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || "";
}

export default function CkmPage() {
  const params = useParams();
  const company = getCompany(params.company as string);
  const { year } = useYear();
  const slug = params.company as string;

  const metrics = useMemo(() => getEeMockMetrics(), []);
  const catalog = useMemo(() => buildCatalog(metrics), [metrics]);

  const [selected, setSelected] = useLocalState<string[]>(`themap:${slug}:ckmSelected`, () => [], undefined, year);
  const [pickerOpen, setPickerOpen] = useLocalState<boolean>(`themap:${slug}:ckmPickerOpen`, () => true, undefined, year);
  const [notes, setNotes] = useLocalState<Record<string, string>>(`themap:${slug}:ckmNotes`, () => ({}), undefined, year);

  // Fetch forecast per tutti gli anni da Supabase
  const [byYear, setByYear] = useState<Record<string, Record<string, number>>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await bearer();
      const res = await fetch(`/api/economic-engine/ckm?company=${slug}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (cancelled) return;
      if (res.ok) {
        const j = await res.json();
        setByYear(j.byYear || {});
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [slug]);

  // Realtime: quando cambia un forecast su un anno, aggiorna la mappa
  useEffect(() => {
    const ch = supabase.channel(`ckm_eeForecast:${slug}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "app_state", filter: `company=eq.${slug}` }, (payload) => {
        const row = (payload.new ?? payload.old) as { key?: string; year?: number; data?: unknown } | null;
        if (!row || row.key !== "eeForecast" || row.year == null) return;
        setByYear((prev) => {
          if (payload.eventType === "DELETE") {
            const next = { ...prev }; delete next[String(row.year)]; return next;
          }
          if (row.data && typeof row.data === "object") {
            return { ...prev, [String(row.year)]: row.data as Record<string, number> };
          }
          return prev;
        });
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [slug]);

  // Calcola input + calc per ogni anno con dati reali (o vuoto se manca)
  const forecasts = useMemo(() => {
    const out: Record<number, { input: Record<string, number>; calc: Record<string, number> } | null> = {};
    YEARS.forEach((y) => {
      const input = byYear[String(y)];
      if (!input) { out[y] = null; return; }
      const { calc } = eeRecalc(input);
      out[y] = { input, calc };
    });
    return out;
  }, [byYear]);

  function toggleMetric(key: string) {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  function removeMetric(key: string) {
    setSelected((prev) => prev.filter((k) => k !== key));
  }

  function getVal(key: string, y: number): number | null {
    const fc = forecasts[y];
    if (!fc) return null;
    const isCalc = key.startsWith("calc::");
    const name = isCalc ? key.replace("calc::", "") : key;
    if (isCalc) return fc.calc[name] ?? null;
    return fc.input[name] ?? null;
  }

  const hasAnyYearData = Object.values(forecasts).some((f) => f != null);

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

      {!loading && !hasAnyYearData && (
        <div style={{ padding: "12px 16px", background: "var(--cd, var(--bg))", border: "1px solid var(--bd)", borderRadius: 6, marginBottom: 16, fontSize: 12, color: "var(--fg3)" }}>
          Nessun forecast trovato per {YEARS[0]}–{YEARS[YEARS.length - 1]}. Compila un forecast dalla tab <Link href={`/${slug}/economic-engine/forecast`} style={{ color: "var(--accent)" }}>Forecast</Link> per popolare le metriche.
        </div>
      )}

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
                      // delta rispetto al PRECEDENTE anno con valore non-null (non solo i-1)
                      let prev: number | null = null;
                      for (let j = i - 1; j >= 0; j--) {
                        if (vals[j] !== null) { prev = vals[j]; break; }
                      }
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
