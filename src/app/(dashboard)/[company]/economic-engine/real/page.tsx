"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getCompany } from "@/lib/companies";
import { useLocalState } from "@/lib/useLocalState";
import { useYear } from "@/components/YearProvider";
import {
  eeRecalc, eeFmtEuro,
  eeGetDelta, EE_KPI_ITEMS, EE_MONTHS,
  type EeMonthlyRow,
} from "@/lib/economic-engine";

interface RealRow {
  ricRic: number; ricStock: number; ricTot: number;
  costiOp: number; costiVar: number; costiAcq: number; costiFissi: number; costiTot: number;
}

function emptyRow(): RealRow {
  return { ricRic: 0, ricStock: 0, ricTot: 0, costiOp: 0, costiVar: 0, costiAcq: 0, costiFissi: 0, costiTot: 0 };
}

const ROWS: { label: string; key: keyof RealRow; group: "ricavi" | "costi" }[] = [
  { label: "Ric. Ricorrenti", key: "ricRic", group: "ricavi" },
  { label: "Ric. Stock", key: "ricStock", group: "ricavi" },
  { label: "Costi Fissi", key: "costiFissi", group: "costi" },
  { label: "Costi Operativi", key: "costiOp", group: "costi" },
  { label: "Costi Acquisizione", key: "costiAcq", group: "costi" },
  { label: "Costi Variabili", key: "costiVar", group: "costi" },
];

export default function ConsuntivoPage() {
  const params = useParams();
  const company = getCompany(params.company as string);
  const { year } = useYear();
  const slug = params.company as string;

  // Forecast di riferimento: quello promosso dal Playground (eeForecast).
  const [fcValues] = useLocalState<Record<string, number>>(`themap:${slug}:eeForecast`, () => ({}), undefined, year);
  const { calc: fcCalc, monthly: fcMonthly } = eeRecalc(fcValues);

  // Real data — first 5 months mock (only 2026), rest empty
  const [realData, setRealData] = useLocalState<RealRow[]>(`themap:${slug}:eeReal`, () => {
    const rows: RealRow[] = [];
    for (let i = 0; i < 12; i++) {
      if (i < 5) {
        // Simula dati reali con scostamento dal forecast
        const fc = fcMonthly[i];
        const jitter = () => 0.9 + Math.random() * 0.2;
        rows.push({
          ricRic: Math.round(fc.ricRic * jitter()),
          ricStock: Math.round(fc.ricStock * jitter()),
          ricTot: 0,
          costiOp: Math.round(fc.costiOp * jitter()),
          costiVar: Math.round(fc.costiVar * jitter()),
          costiAcq: Math.round(fc.costiAcq * jitter()),
          costiFissi: Math.round(fc.costiFissi * jitter()),
          costiTot: 0,
        });
        // Ricalcola totali
        rows[i].ricTot = rows[i].ricRic + rows[i].ricStock;
        rows[i].costiTot = rows[i].costiOp + rows[i].costiVar + rows[i].costiAcq + rows[i].costiFissi;
      } else {
        rows.push(emptyRow());
      }
    }
    return rows;
  }, undefined, year);

  const [editing, setEditing] = useState<{ row: number; key: keyof RealRow } | null>(null);

  function updateCell(month: number, key: keyof RealRow, value: number) {
    setRealData((prev) => {
      const next = [...prev];
      const r = { ...next[month], [key]: value };
      r.ricTot = r.ricRic + r.ricStock;
      r.costiTot = r.costiOp + r.costiVar + r.costiAcq + r.costiFissi;
      next[month] = r;
      return next;
    });
  }

  // Totali reali vs forecast
  const realTotRic = realData.reduce((s, r) => s + r.ricTot, 0);
  const realTotCosti = realData.reduce((s, r) => s + r.costiTot, 0);
  const realMargine = realTotRic - realTotCosti;
  const fcTotRic = fcMonthly.reduce((s, r) => s + r.ricTot, 0);
  const fcTotCosti = fcMonthly.reduce((s, r) => s + r.costiTot, 0);
  const fcMargine = fcTotRic - fcTotCosti;

  return (
    <div>
      <div className="ee-subnav">
        <Link href={`/${params.company}/economic-engine`} className="ee-tab">Playground</Link>
        <Link href={`/${params.company}/economic-engine/forecast`} className="ee-tab">Forecast</Link>
        <span className="ee-tab active">Consuntivo</span>
        <Link href={`/${params.company}/economic-engine/ckm`} className="ee-tab">CKM</Link>
      </div>

      <div className="ee-head">
        <div className="ee-title">
          {company && <span style={{ color: company.color }}>{"\u25A0"}</span>}
          {company?.name || params.company} — Consuntivo {year}
        </div>
      </div>

      {/* KPI: Real vs Forecast */}
      <div className="ee-kpi-row" style={{ marginBottom: 20 }}>
        <KpiCompare label="RICAVI REALI" real={realTotRic} forecast={fcTotRic} />
        <KpiCompare label="COSTI REALI" real={realTotCosti} forecast={fcTotCosti} invert />
        <KpiCompare label="MARGINE REALE" real={realMargine} forecast={fcMargine} />
      </div>

      {/* Tabella consuntivo */}
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
            {ROWS.filter((r) => r.group === "ricavi").map((def) => (
              <RealRow
                key={def.key}
                label={def.label}
                field={def.key}
                realData={realData}
                fcMonthly={fcMonthly}
                editing={editing}
                setEditing={setEditing}
                updateCell={updateCell}
              />
            ))}
            <TotalRow label="Totale Ricavi" realData={realData} field="ricTot" fcMonthly={fcMonthly} />

            <tr className="ee-row-group"><td colSpan={14}>COSTI</td></tr>
            {ROWS.filter((r) => r.group === "costi").map((def) => (
              <RealRow
                key={def.key}
                label={def.label}
                field={def.key}
                realData={realData}
                fcMonthly={fcMonthly}
                editing={editing}
                setEditing={setEditing}
                updateCell={updateCell}
              />
            ))}
            <TotalRow label="Totale Costi" realData={realData} field="costiTot" fcMonthly={fcMonthly} />

            {/* Margine */}
            <tr className="ee-row-margin">
              <td>MARGINE</td>
              {realData.map((r, i) => {
                const mg = r.ricTot - r.costiTot;
                const fcMg = fcMonthly[i].ricTot - fcMonthly[i].costiTot;
                const delta = fcMg !== 0 ? ((mg - fcMg) / Math.abs(fcMg)) * 100 : null;
                return (
                  <td key={i}>
                    <span style={{ color: mg >= 0 ? "var(--grn)" : "var(--red)" }}>{eeFmtEuro(mg)}</span>
                    {delta !== null && mg !== 0 && (
                      <span className={`ee-cell-delta ${delta >= 0 ? "ee-delta-up" : "ee-delta-down"}`}>
                        {delta > 0 ? "+" : ""}{delta.toFixed(0)}%
                      </span>
                    )}
                  </td>
                );
              })}
              <td style={{ color: realMargine >= 0 ? "var(--grn)" : "var(--red)" }}>
                <b>{eeFmtEuro(realMargine)}</b>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 11, color: "var(--fg3)", marginTop: 12 }}>
        Clicca su una cella per modificare. I badge mostrano la varianza vs forecast.
      </div>
    </div>
  );
}

/* ── KPI Compare card ── */

function KpiCompare({
  label, real, forecast, invert,
}: {
  label: string; real: number; forecast: number; invert?: boolean;
}) {
  const delta = forecast !== 0 ? ((real - forecast) / Math.abs(forecast)) * 100 : null;
  const good = delta !== null ? (invert ? delta <= 0 : delta >= 0) : true;
  return (
    <div className="ee-kpi">
      <div className="ee-kpi-label">{label}</div>
      <div className="ee-kpi-val" style={{ color: good ? "var(--grn)" : "var(--red)" }}>
        {eeFmtEuro(real)}
      </div>
      <div className="ee-kpi-sub">
        Forecast: {eeFmtEuro(forecast)}
        {delta !== null && (
          <span className={`ee-delta ${good ? "ee-delta-up" : "ee-delta-down"}`} style={{ marginLeft: 6 }}>
            {delta > 0 ? "+" : ""}{delta.toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}

/* ── Editable row ── */

function RealRow({
  label, field, realData, fcMonthly, editing, setEditing, updateCell,
}: {
  label: string;
  field: keyof RealRow;
  realData: RealRow[];
  fcMonthly: EeMonthlyRow[];
  editing: { row: number; key: keyof RealRow } | null;
  setEditing: (e: { row: number; key: keyof RealRow } | null) => void;
  updateCell: (month: number, key: keyof RealRow, value: number) => void;
}) {
  let tot = 0;
  let fcTot = 0;
  return (
    <tr>
      <td>{label}</td>
      {realData.map((r, i) => {
        const v = r[field];
        tot += v;
        const fcV = fcMonthly[i][field as keyof EeMonthlyRow] as number;
        fcTot += fcV;
        const isEd = editing?.row === i && editing?.key === field;
        const delta = fcV !== 0 && v !== 0 ? ((v - fcV) / Math.abs(fcV)) * 100 : null;
        const isCost = field.startsWith("costi");
        const good = delta !== null ? (isCost ? delta <= 0 : delta >= 0) : true;

        return (
          <td key={i} className="ee-cell-editable" onClick={() => !isEd && setEditing({ row: i, key: field })}>
            {isEd ? (
              <input
                className="ee-cell-input"
                type="number"
                defaultValue={v || ""}
                autoFocus
                onBlur={(e) => {
                  updateCell(i, field, Number(e.target.value) || 0);
                  setEditing(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    updateCell(i, field, Number((e.target as HTMLInputElement).value) || 0);
                    setEditing(null);
                  }
                  if (e.key === "Escape") setEditing(null);
                }}
              />
            ) : (
              <>
                <span>{v > 0 ? eeFmtEuro(v) : "\u2014"}</span>
                {delta !== null && v !== 0 && (
                  <span className={`ee-cell-delta ${good ? "ee-delta-up" : "ee-delta-down"}`}>
                    {delta > 0 ? "+" : ""}{delta.toFixed(0)}%
                  </span>
                )}
              </>
            )}
          </td>
        );
      })}
      <td><b>{eeFmtEuro(tot)}</b></td>
    </tr>
  );
}

/* ── Total row (non-editable) ── */

function TotalRow({
  label, realData, field, fcMonthly,
}: {
  label: string;
  realData: RealRow[];
  field: keyof RealRow;
  fcMonthly: EeMonthlyRow[];
}) {
  let tot = 0;
  return (
    <tr className="ee-row-total">
      <td>{label}</td>
      {realData.map((r, i) => {
        const v = r[field]; tot += v;
        return <td key={i}>{v > 0 ? eeFmtEuro(v) : "\u2014"}</td>;
      })}
      <td><b>{eeFmtEuro(tot)}</b></td>
    </tr>
  );
}
