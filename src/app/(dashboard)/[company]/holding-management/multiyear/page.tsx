"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ownershipAt, type OwnershipRow } from "@/lib/holding-ownership";
import { Skeleton } from "@/components/Skeleton";

interface OpMeta { slug: string; name: string; color: string; }
interface OpYearRow {
  slug: string;
  revenue: number | null;
  costs: number | null;
  margin: number | null;
  momentum: number | null;
}
interface YearBlock { year: number; operatives: OpYearRow[]; }

type Metric = "revenue" | "costs" | "margin" | "momentum";

const METRIC_LABEL: Record<Metric, string> = {
  revenue: "Fatturato",
  costs: "Costi",
  margin: "Margine",
  momentum: "Momentum",
};

const fmtEuro = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const fmtPct = (n: number | null) => (n == null ? "—" : `${(n * 100).toFixed(0)}%`);

export default function MultiyearPage() {
  const params = useParams();
  const holdingSlug = params.company as string;
  const [operatives, setOperatives] = useState<OpMeta[]>([]);
  const [years, setYears] = useState<YearBlock[]>([]);
  const [ownership, setOwnership] = useState<OwnershipRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weighted, setWeighted] = useState(false);
  const [metric, setMetric] = useState<Metric>("revenue");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token || "";
      const [myRes, ownRes] = await Promise.all([
        fetch(`/api/holding-management/multiyear`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/holding-management/ownership?holding=${holdingSlug}`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (cancelled) return;
      if (!myRes.ok) {
        const j = await myRes.json().catch(() => ({}));
        setError(j.error || "Errore caricamento multiyear");
        setLoading(false);
        return;
      }
      const myJson = await myRes.json();
      setOperatives(myJson.operatives);
      setYears(myJson.years);
      if (ownRes.ok) {
        const oj = await ownRes.json();
        setOwnership(oj.rows || []);
      }
      setError(null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [holdingSlug]);

  // Weight helper: for each year, use ownership valid at mid-year (30/06)
  function weightForYear(operativeSlug: string, year: number): number {
    if (!weighted) return 1;
    const midYear = `${year}-06-30`;
    return ownershipAt(ownership, holdingSlug, operativeSlug, midYear) / 100;
  }

  const rows = useMemo(() => {
    return years.map((yb) => {
      const opRows = yb.operatives.map((o) => {
        const w = weightForYear(o.slug, yb.year);
        return {
          slug: o.slug,
          revenue: o.revenue != null ? o.revenue * w : null,
          costs: o.costs != null ? o.costs * w : null,
          margin: o.margin != null ? o.margin * w : null,
          momentum: o.momentum, // momentum non pesato (è una %)
        };
      });
      const totals = {
        revenue: sumOr(opRows.map((o) => o.revenue)),
        costs: sumOr(opRows.map((o) => o.costs)),
        margin: sumOr(opRows.map((o) => o.margin)),
        momentum: avgOr(opRows.map((o) => o.momentum)),
      };
      return { year: yb.year, operatives: opRows, totals };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [years, ownership, weighted, holdingSlug]);

  // Stacked chart data: per year, segmenti per operativa (colore azienda).
  const chartData = useMemo(() => {
    return rows.map((r) => {
      const segments = operatives.map((o) => {
        const op = r.operatives.find((x) => x.slug === o.slug);
        const v = op ? op[metric] : null;
        return { slug: o.slug, name: o.name, color: o.color, value: v };
      });
      return {
        year: r.year,
        segments,
        total: r.totals[metric],
      };
    });
  }, [rows, metric, operatives]);

  const { maxVal, minVal } = useMemo(() => {
    // Per stacked (metriche economiche): scale sui totali (positivi + negativi sommati per anno)
    // Per momentum: scale sui singoli valori
    if (metric === "momentum") {
      const vs = chartData.map((c) => c.total).filter((v): v is number => typeof v === "number");
      return { maxVal: vs.length ? Math.max(...vs, 0) : 0, minVal: vs.length ? Math.min(...vs, 0) : 0 };
    }
    let posMax = 0, negMin = 0;
    for (const c of chartData) {
      let pos = 0, neg = 0;
      for (const s of c.segments) {
        if (typeof s.value !== "number") continue;
        if (s.value >= 0) pos += s.value; else neg += s.value;
      }
      if (pos > posMax) posMax = pos;
      if (neg < negMin) negMin = neg;
    }
    return { maxVal: posMax, minVal: negMin };
  }, [chartData, metric]);

  const fmt = (v: number | null) => (metric === "momentum" ? fmtPct(v) : fmtEuro(v));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Multiyear</h1>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 4 }}>
            {(Object.keys(METRIC_LABEL) as Metric[]).map((k) => {
              const active = metric === k;
              return (
                <button
                  key={k}
                  onClick={() => setMetric(k)}
                  style={{
                    padding: "5px 10px",
                    fontSize: 11,
                    borderRadius: 4,
                    border: "1px solid var(--bd)",
                    background: active ? "var(--fg)" : "transparent",
                    color: active ? "var(--bg)" : "var(--fg2)",
                    cursor: "pointer",
                    fontWeight: active ? 700 : 500,
                  }}
                >
                  {METRIC_LABEL[k]}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <button
              onClick={() => setWeighted(false)}
              style={btnStyle(!weighted)}
              disabled={metric === "momentum"}
              title={metric === "momentum" ? "Momentum non è pesato" : ""}
            >
              Consolidato 100%
            </button>
            <button
              onClick={() => setWeighted(true)}
              style={btnStyle(weighted)}
              disabled={metric === "momentum"}
              title={metric === "momentum" ? "Momentum non è pesato" : ""}
            >
              Quota holding
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div className="cd" style={{ padding: 16 }}>
            <Skeleton width={200} height={12} style={{ marginBottom: 12 }} />
            <Skeleton width="100%" height={220} radius={6} />
          </div>
          <div className="cd" style={{ padding: 12 }}>
            <Skeleton width="100%" height={200} radius={6} />
          </div>
        </div>
      ) : error ? (
        <div className="cd" style={{ padding: 20, color: "#ef4444" }}>{error}</div>
      ) : operatives.length === 0 ? (
        <div className="cd" style={{ padding: 40, textAlign: "center", color: "var(--fg3)" }}>Nessuna operativa</div>
      ) : (
        <>
          {/* Chart */}
          <div className="cd" style={{ padding: 16, marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 10 }}>
              <div style={{ fontSize: 12, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: 0.5 }}>
                {METRIC_LABEL[metric]} {metric !== "momentum" && (weighted ? "(Quota holding)" : "(Consolidato)")}
              </div>
              {metric !== "momentum" && (
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {operatives.map((o) => (
                    <div key={o.slug} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--fg2)" }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: o.color }} />
                      {o.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <BarChart data={chartData} maxVal={maxVal} minVal={minVal} metric={metric} />
          </div>

          {/* Table */}
          <div className="cd" style={{ padding: 0, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                  <th style={thStyle("left")}>Operativa</th>
                  {rows.map((r) => (
                    <th key={r.year} style={thStyle("right")}>{r.year}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {operatives.map((o) => (
                  <tr key={o.slug} style={{ borderTop: "1px solid var(--bd)" }}>
                    <td style={{ padding: 10, display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="ni-dot" style={{ background: o.color, width: 10, height: 10 }} />
                      <span style={{ fontWeight: 600 }}>{o.name}</span>
                      {weighted && metric !== "momentum" && (
                        <span style={{ fontSize: 10, color: "var(--fg3)", marginLeft: "auto" }}>
                          {/* show quota valid mid-current-year */}
                          {ownershipAt(ownership, holdingSlug, o.slug, `${new Date().getFullYear()}-06-30`).toFixed(1)}%
                        </span>
                      )}
                    </td>
                    {rows.map((r) => {
                      const opRow = r.operatives.find((x) => x.slug === o.slug);
                      const v = opRow ? opRow[metric] : null;
                      return (
                        <td key={r.year} style={{ padding: 10, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {fmt(v)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr style={{ borderTop: "2px solid var(--bd)", background: "rgba(255,255,255,0.04)" }}>
                  <td style={{ padding: 10, fontWeight: 700, letterSpacing: 0.5 }}>TOTALE</td>
                  {rows.map((r) => (
                    <td key={r.year} style={{ padding: 10, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                      {fmt(r.totals[metric])}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {weighted && (
            <div style={{ marginTop: 10, fontSize: 11, color: "var(--fg3)" }}>
              Valori pesati per la quota di possesso valida al 30/06 di ogni anno. Momentum resta al 100% (è metrica dell&apos;operativa).
            </div>
          )}
        </>
      )}
    </div>
  );
}

function btnStyle(active: boolean): React.CSSProperties {
  return {
    padding: "5px 10px",
    fontSize: 11,
    borderRadius: 4,
    border: "1px solid var(--bd)",
    background: active ? "var(--fg)" : "transparent",
    color: active ? "var(--bg)" : "var(--fg2)",
    cursor: "pointer",
    fontWeight: active ? 700 : 500,
  };
}

function thStyle(align: "left" | "right"): React.CSSProperties {
  return {
    padding: 10,
    textAlign: align,
    fontSize: 10,
    fontWeight: 700,
    color: "var(--fg3)",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  };
}

function sumOr(xs: (number | null)[]): number | null {
  const vs = xs.filter((v): v is number => typeof v === "number");
  if (vs.length === 0) return null;
  return vs.reduce((s, v) => s + v, 0);
}

function avgOr(xs: (number | null)[]): number | null {
  const vs = xs.filter((v): v is number => typeof v === "number");
  if (vs.length === 0) return null;
  return vs.reduce((s, v) => s + v, 0) / vs.length;
}

interface ChartSegment { slug: string; name: string; color: string; value: number | null; }
interface ChartBar { year: number; segments: ChartSegment[]; total: number | null; }

function BarChart({
  data,
  maxVal,
  minVal,
  metric,
}: {
  data: ChartBar[];
  maxVal: number;
  minVal: number;
  metric: Metric;
}) {
  const W = 800;
  const H = 240;
  const padL = 16, padR = 16, padT = 16, padB = 32;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const range = maxVal - minVal || 1;
  const zeroY = padT + chartH * (maxVal / range);

  const barW = (chartW / data.length) * 0.6;
  const barGap = chartW / data.length;

  const fmtTotal = (v: number | null) =>
    v == null
      ? "—"
      : metric === "momentum"
        ? `${Math.round(v * 100)}%`
        : v.toLocaleString("it-IT", { maximumFractionDigits: 0 });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 280 }}>
      {/* Zero line */}
      <line x1={padL} y1={zeroY} x2={W - padR} y2={zeroY} stroke="var(--bd)" strokeWidth={1} />

      {data.map((d, i) => {
        const cx = padL + (i + 0.5) * barGap;

        if (metric === "momentum") {
          // Single-value bar colorata dal ratio
          const v = d.total ?? 0;
          const hFrac = Math.abs(v) / range;
          const h = chartH * hFrac;
          const y = v < 0 ? zeroY : zeroY - h;
          const color = v >= 0.9 ? "#22c55e" : v >= 0.7 ? "#eab308" : "#ef4444";
          return (
            <g key={d.year}>
              <rect x={cx - barW / 2} y={y} width={barW} height={h} fill={color} opacity={d.total == null ? 0.15 : 0.85} rx={2} />
              {d.total != null && (
                <text x={cx} y={y - 4} fontSize={10} fontWeight={700} fill="var(--fg)" textAnchor="middle">{fmtTotal(d.total)}</text>
              )}
              <text x={cx} y={H - padB + 18} fontSize={11} fill="var(--fg3)" textAnchor="middle" fontWeight={600}>{d.year}</text>
            </g>
          );
        }

        // Stacked bars — segmenti per operativa con colore azienda
        let posY = zeroY;   // cresce verso l'alto
        let negY = zeroY;   // cresce verso il basso
        const segEls: React.ReactElement[] = [];
        for (const s of d.segments) {
          if (typeof s.value !== "number" || s.value === 0) continue;
          const h = (Math.abs(s.value) / range) * chartH;
          if (s.value >= 0) {
            posY -= h;
            segEls.push(
              <rect key={s.slug} x={cx - barW / 2} y={posY} width={barW} height={h} fill={s.color} opacity={0.9} rx={1}>
                <title>{`${s.name}: ${fmtTotal(s.value)}`}</title>
              </rect>,
            );
          } else {
            segEls.push(
              <rect key={s.slug} x={cx - barW / 2} y={negY} width={barW} height={h} fill={s.color} opacity={0.9} rx={1}>
                <title>{`${s.name}: ${fmtTotal(s.value)}`}</title>
              </rect>,
            );
            negY += h;
          }
        }

        const topY = Math.min(posY, zeroY);
        return (
          <g key={d.year}>
            {segEls}
            {d.total != null && (
              <text x={cx} y={topY - 4} fontSize={10} fontWeight={700} fill="var(--fg)" textAnchor="middle">
                {fmtTotal(d.total)}
              </text>
            )}
            <text x={cx} y={H - padB + 18} fontSize={11} fill="var(--fg3)" textAnchor="middle" fontWeight={600}>{d.year}</text>
          </g>
        );
      })}
    </svg>
  );
}
