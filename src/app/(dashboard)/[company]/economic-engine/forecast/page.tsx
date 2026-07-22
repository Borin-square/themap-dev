"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getCompany } from "@/lib/companies";
import {
  getEeMockMetrics, initEeValues, eeRecalc, eeFmtEuro,
  eeFmtVal, eeSparkPoints, eeMarginSparkPoints,
  EE_KPI_ITEMS, EE_MONTHS, EE_SECTION_ORDER, EE_SECTION_LABELS,
  EE_SECTION_SLUGS, EE_FN_ORDER, eeGroupMetrics,
  type EeMonthlyRow,
} from "@/lib/economic-engine";
import { useLocalState } from "@/lib/useLocalState";
import { useYear } from "@/components/YearProvider";

export default function ForecastPage() {
  const params = useParams();
  const company = getCompany(params.company as string);
  const { year } = useYear();
  const slug = params.company as string;

  // Il Forecast e' il set di valori "promosso" da uno scenario del Playground.
  // Se non e' mai stato promosso nulla, l'oggetto e' vuoto e la pagina mostra lo stato "assente".
  const metrics = getEeMockMetrics();
  const { prevValues } = initEeValues(metrics, year);
  const [values, setValues] = useLocalState<Record<string, number>>(`themap:${slug}:eeForecast`, () => ({}), undefined, year);
  const hasForecast = Object.keys(values).length > 0;

  function deleteForecast() {
    if (!confirm(`Eliminare il forecast ${year}? L'operazione non e' reversibile.`)) return;
    setValues({});
  }
  const { calc, monthly } = eeRecalc(values);
  const grouped = eeGroupMetrics(metrics);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ mensile: false });

  function toggleSection(slug: string) {
    setCollapsed((p) => ({ ...p, [slug]: !p[slug] }));
  }

  return (
    <div>
      <div className="ee-subnav">
        <Link href={`/${params.company}/economic-engine`} className="ee-tab">Playground</Link>
        <span className="ee-tab active">Forecast</span>
        <Link href={`/${params.company}/economic-engine/real`} className="ee-tab">Consuntivo</Link>
        <Link href={`/${params.company}/economic-engine/ckm`} className="ee-tab">CKM</Link>
      </div>

      <div className="ee-head">
        <div className="ee-title">
          {company && <span style={{ color: company.color }}>{"\u25A0"}</span>}
          {company?.name || params.company} — Forecast {year}
        </div>
        <div className="ee-actions" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className="ee-badge" style={{ fontSize: 10, color: "var(--fg3)" }}>Sola lettura — promosso dal Playground</span>
          {hasForecast && (
            <button
              onClick={deleteForecast}
              style={{
                fontSize: 11, padding: "5px 10px", borderRadius: 4,
                border: "1px solid rgba(239,68,68,.35)", background: "rgba(239,68,68,.08)",
                color: "#ef4444", cursor: "pointer", fontWeight: 600,
              }}
              title={`Elimina forecast ${year}`}
            >Elimina forecast</button>
          )}
        </div>
      </div>

      {!hasForecast && (
        <div className="cd" style={{ padding: 40, textAlign: "center", color: "var(--fg3)" }}>
          Nessun forecast attivo per il {year}. Vai al <Link href={`/${params.company}/economic-engine`}>Playground</Link>,
          salva uno scenario e poi promuovilo cliccando <b>&rarr; Forecast</b>.
        </div>
      )}

      {hasForecast && <>

      {/* KPI row */}
      <div className="ee-kpi-row">
        {EE_KPI_ITEMS.map((it) => {
          const v = calc[it.key] ?? 0;
          const color = it.key.includes("MARGINE")
            ? v >= 0 ? "var(--grn)" : "var(--red)"
            : it.key.includes("COSTI") ? "var(--org)" : "var(--fg)";
          const spark = it.mk
            ? eeSparkPoints(monthly, it.mk, 0)
            : it.key.includes("MARGINE") ? eeMarginSparkPoints(monthly, 0) : "";
          const sparkColor = it.key.includes("COSTI") ? "#f59e0b" : it.key.includes("MARGINE") ? "#22c55e" : "#4f8cff";
          return (
            <div key={it.key} className="ee-kpi">
              <div className="ee-kpi-label">{it.label}</div>
              <div className="ee-kpi-val" style={{ color }}>{eeFmtEuro(v)}</div>
              {spark && (
                <svg className="ee-kpi-spark" width={80} height={20} viewBox="0 0 80 20">
                  <polyline points={spark} stroke={sparkColor} opacity={0.6} fill="none" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          );
        })}
      </div>

      {/* Sezioni metriche (read-only) */}
      {EE_SECTION_ORDER.map((tip) => {
        const grps = grouped[tip];
        if (!grps) return null;
        const hasItems = EE_FN_ORDER.some((fn) => grps[fn]?.length);
        if (!hasItems) return null;
        const label = EE_SECTION_LABELS[tip] || tip;
        const slug = EE_SECTION_SLUGS[tip] || "";
        const coll = collapsed[slug] ?? false;

        return (
          <div key={tip} className={`ee-section${coll ? " collapsed" : ""}`} data-tip={slug}>
            <div className="ee-section-title" onClick={() => toggleSection(slug)}>
              <span className="ee-arrow">&#9660;</span> {label}{" "}
              <span className="ee-badge">forecast</span>
            </div>
            <div className="ee-section-body">
              {EE_FN_ORDER.map((fn) => {
                const items = grps[fn];
                if (!items?.length) return null;
                return (
                  <div key={fn} className="ee-group">
                    <div className="ee-group-title">{fn}</div>
                    <div className="ee-metrics">
                      {items.map((m) => {
                        const k = m.metrica.toUpperCase();
                        const v = values[k] ?? calc[k] ?? null;
                        return (
                          <div key={m.metrica} className="ee-metric">
                            <div className="ee-metric-name">{m.metrica}</div>
                            <div className="ee-metric-ro">{eeFmtVal(v, m.metrica)}</div>
                          </div>
                        );
                      })}
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
          <FcMonthlyTable monthly={monthly} />
        </div>
      </div>

      </>}
    </div>
  );
}

function FcMonthlyTable({ monthly }: { monthly: EeMonthlyRow[] }) {
  function row(label: string, key: keyof EeMonthlyRow, isTotal?: boolean) {
    let tot = 0;
    return (
      <tr className={isTotal ? "ee-row-total" : ""}>
        <td>{label}</td>
        {monthly.map((r, i) => {
          const v = r[key]; tot += v;
          return <td key={i}>{eeFmtEuro(v)}</td>;
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
            {EE_MONTHS.map((m) => <th key={m}>{m}</th>)}
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
                <td key={i} style={{ color: mg >= 0 ? "var(--grn)" : "var(--red)" }}>
                  {eeFmtEuro(mg)}
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
