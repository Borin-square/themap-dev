"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useYear } from "@/components/YearProvider";
import { ownershipAt, type OwnershipRow } from "@/lib/holding-ownership";
import { SkeletonGrid } from "@/components/Skeleton";

interface OperativeStats {
  slug: string;
  name: string;
  color: string;
  momentum: number | null;
  revenueForecast: number | null;
  costsForecast: number | null;
  marginForecast: number | null;
  hasFlywheel: boolean;
  hasEconomicEngine: boolean;
}

interface Totals {
  revenueForecast: number;
  costsForecast: number;
  marginForecast: number;
  avgMomentum: number | null;
  countOperatives: number;
  countWithFlywheel: number;
  countWithEE: number;
}

const fmtEuro = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const fmtPct = (n: number | null) => (n == null ? "—" : `${(n * 100).toFixed(0)}%`);

function momColor(m: number | null) {
  if (m == null) return "var(--fg3)";
  if (m >= 0.9) return "#22c55e";
  if (m >= 0.7) return "#f59e0b";
  return "#ef4444";
}

const TODAY_ISO = () => new Date().toISOString().slice(0, 10);

export default function OverviewPage() {
  const params = useParams();
  const holdingSlug = params.company as string;
  const { year } = useYear();
  const [operatives, setOperatives] = useState<OperativeStats[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ownership, setOwnership] = useState<OwnershipRow[]>([]);
  const [weighted, setWeighted] = useState(false);

  async function loadOwnership() {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token || "";
    const res = await fetch(`/api/holding-management/ownership?holding=${holdingSlug}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const json = await res.json();
      setOwnership(json.rows || []);
    }
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token || "";
      const res = await fetch(`/api/holding-management/overview?year=${year}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || "Errore caricamento");
        setLoading(false);
        return;
      }
      const json = await res.json();
      setOperatives(json.operatives);
      setTotals(json.totals);
      setLoading(false);
    })();
    loadOwnership();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, holdingSlug]);

  const today = TODAY_ISO();
  const ownershipByOp = useMemo(() => {
    const map: Record<string, number> = {};
    for (const o of operatives) map[o.slug] = ownershipAt(ownership, holdingSlug, o.slug, today);
    return map;
  }, [ownership, operatives, holdingSlug, today]);

  const weightedTotals = useMemo(() => {
    if (!totals || operatives.length === 0) return null;
    let rev = 0, cost = 0, mar = 0;
    for (const o of operatives) {
      const w = (ownershipByOp[o.slug] ?? 100) / 100;
      if (o.revenueForecast != null) rev += o.revenueForecast * w;
      if (o.costsForecast != null) cost += o.costsForecast * w;
      if (o.marginForecast != null) mar += o.marginForecast * w;
    }
    return { revenueForecast: rev, costsForecast: cost, marginForecast: mar };
  }, [operatives, ownershipByOp, totals]);

  if (loading) {
    return (
      <div>
        <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Overview</h1>
        <SkeletonGrid count={4} minWidth={200} height={80} />
        <div style={{ marginTop: 24 }}>
          <SkeletonGrid count={3} minWidth={280} height={140} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Overview</h1>
        <div className="cd" style={{ padding: 20, color: "#ef4444" }}>{error}</div>
      </div>
    );
  }

  const noOps = !totals || totals.countOperatives === 0;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 20 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Overview <span style={{ color: "var(--fg3)", fontWeight: 400 }}>· {year}</span></h1>
        <div style={{ fontSize: 12, color: "var(--fg3)" }}>
          {totals?.countOperatives ?? 0} operative · {totals?.countWithFlywheel ?? 0} con flywheel · {totals?.countWithEE ?? 0} con economic engine
        </div>
      </div>

      {noOps ? (
        <div className="cd" style={{ padding: 40, textAlign: "center", color: "var(--fg3)" }}>
          Nessuna azienda di tipo <b>Operative</b>. Aggiungine dalla tab Settings → Aziende impostando <i>Tipo = Operative</i>.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <div style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 11 }}>
              <button
                onClick={() => setWeighted(false)}
                style={{
                  padding: "5px 10px",
                  borderRadius: 4,
                  border: "1px solid var(--bd)",
                  background: !weighted ? "var(--fg)" : "transparent",
                  color: !weighted ? "var(--bg)" : "var(--fg2)",
                  cursor: "pointer",
                  fontWeight: !weighted ? 700 : 500,
                  fontSize: 11,
                }}
              >
                Consolidato 100%
              </button>
              <button
                onClick={() => setWeighted(true)}
                style={{
                  padding: "5px 10px",
                  borderRadius: 4,
                  border: "1px solid var(--bd)",
                  background: weighted ? "var(--fg)" : "transparent",
                  color: weighted ? "var(--bg)" : "var(--fg2)",
                  cursor: "pointer",
                  fontWeight: weighted ? 700 : 500,
                  fontSize: 11,
                }}
              >
                Quota holding
              </button>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }}>
            <KpiCard label="MOMENTUM MEDIO" value={fmtPct(totals!.avgMomentum)} color={momColor(totals!.avgMomentum)} />
            <KpiCard label="FATTURATO FORECAST" value={fmtEuro(weighted && weightedTotals ? weightedTotals.revenueForecast : totals!.revenueForecast)} />
            <KpiCard label="COSTI FORECAST" value={fmtEuro(weighted && weightedTotals ? weightedTotals.costsForecast : totals!.costsForecast)} />
            <KpiCard
              label="MARGINE LORDO"
              value={fmtEuro(weighted && weightedTotals ? weightedTotals.marginForecast : totals!.marginForecast)}
              color={(weighted && weightedTotals ? weightedTotals.marginForecast : totals!.marginForecast) >= 0 ? "#22c55e" : "#ef4444"}
            />
          </div>

          <OperativesChart operatives={operatives} weighted={weighted} ownershipByOp={ownershipByOp} />

          <OwnershipManager
            holdingSlug={holdingSlug}
            operatives={operatives}
            ownershipByOp={ownershipByOp}
            onSaved={loadOwnership}
          />

          <div style={{ fontSize: 12, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
            Dettaglio per operative
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
            {operatives.map((o) => (
              <div key={o.slug} className="cd" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, borderLeft: `3px solid ${o.color}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="ni-dot" style={{ background: o.color, width: 10, height: 10 }} />
                  <span style={{ fontWeight: 700 }}>{o.name}</span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
                  <StatRow label="Momentum" value={fmtPct(o.momentum)} color={momColor(o.momentum)} />
                  <StatRow label="Fatturato" value={fmtEuro(o.revenueForecast)} />
                  <StatRow label="Costi" value={fmtEuro(o.costsForecast)} />
                  <StatRow
                    label="Margine"
                    value={fmtEuro(o.marginForecast)}
                    color={o.marginForecast == null ? undefined : o.marginForecast >= 0 ? "#22c55e" : "#ef4444"}
                  />
                </div>

                <div style={{ display: "flex", gap: 6, marginTop: "auto", fontSize: 12 }}>
                  <Link href={`/${o.slug}/flywheel`} style={{ color: o.hasFlywheel ? "var(--fg)" : "var(--fg3)" }}>
                    Flywheel {o.hasFlywheel ? "→" : "○"}
                  </Link>
                  <span style={{ color: "var(--fg3)" }}>·</span>
                  <Link href={`/${o.slug}/economic-engine`} style={{ color: o.hasEconomicEngine ? "var(--fg)" : "var(--fg3)" }}>
                    Economic Engine {o.hasEconomicEngine ? "→" : "○"}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function KpiCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="cd" style={{ padding: 14 }}>
      <div className="lb">{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || "var(--fg)" }}>{value}</div>
    </div>
  );
}

function StatRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ color: "var(--fg3)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontWeight: 600, color: color || "var(--fg)" }}>{value}</div>
    </div>
  );
}

function OperativesChart({
  operatives,
  weighted,
  ownershipByOp,
}: {
  operatives: OperativeStats[];
  weighted: boolean;
  ownershipByOp: Record<string, number>;
}) {
  const rows = operatives.map((o) => {
    const w = weighted ? (ownershipByOp[o.slug] ?? 100) / 100 : 1;
    return {
      slug: o.slug,
      name: o.name,
      color: o.color,
      revenue: o.revenueForecast != null ? o.revenueForecast * w : null,
      costs: o.costsForecast != null ? o.costsForecast * w : null,
      margin: o.marginForecast != null ? o.marginForecast * w : null,
    };
  });

  const maxAbs = Math.max(
    1,
    ...rows.flatMap((r) => [
      typeof r.revenue === "number" ? Math.abs(r.revenue) : 0,
      typeof r.costs === "number" ? Math.abs(r.costs) : 0,
      typeof r.margin === "number" ? Math.abs(r.margin) : 0,
    ]),
  );

  const W = 800;
  const rowH = 44;
  const H = rows.length * rowH + 20;
  const labelW = 160;
  const barsX = labelW + 8;
  const barsW = W - barsX - 8;

  return (
    <div className="cd" style={{ padding: 16, marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 12, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: 0.5 }}>
          KPI per operativa {weighted ? "(Quota holding)" : "(Consolidato)"}
        </div>
        <div style={{ display: "flex", gap: 12, fontSize: 11, color: "var(--fg2)" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: "#4f8cff" }} /> Fatturato
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: "#f59e0b" }} /> Costi
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: "#22c55e" }} /> Margine
          </span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H }}>
        {rows.map((r, i) => {
          const y = 10 + i * rowH;
          const groupBarH = 10;
          const gap = 2;
          const barsGroupH = groupBarH * 3 + gap * 2;
          const startY = y + (rowH - barsGroupH) / 2;
          const scale = (v: number | null) => (typeof v === "number" ? (Math.abs(v) / maxAbs) * barsW : 0);
          const marginColor = r.margin != null && r.margin < 0 ? "#ef4444" : "#22c55e";
          const fmt = (v: number | null) => (v == null ? "—" : v.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }));
          return (
            <g key={r.slug}>
              {/* Label */}
              <rect x={0} y={y + 6} width={4} height={rowH - 12} fill={r.color} rx={2} />
              <text x={12} y={y + rowH / 2} fontSize={12} fontWeight={700} fill="var(--fg)" dominantBaseline="central">
                {r.name}
              </text>
              {/* Bars */}
              {(["revenue", "costs", "margin"] as const).map((m, mi) => {
                const v = r[m];
                const w = scale(v);
                const by = startY + mi * (groupBarH + gap);
                const color = m === "revenue" ? "#4f8cff" : m === "costs" ? "#f59e0b" : marginColor;
                return (
                  <g key={m}>
                    <rect x={barsX} y={by} width={w} height={groupBarH} fill={color} opacity={v == null ? 0.15 : 0.85} rx={2}>
                      <title>{`${m}: ${fmt(v)}`}</title>
                    </rect>
                    <text x={barsX + w + 6} y={by + groupBarH / 2} fontSize={10} fill="var(--fg2)" dominantBaseline="central">
                      {fmt(v)}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function OwnershipManager({
  holdingSlug,
  operatives,
  ownershipByOp,
  onSaved,
}: {
  holdingSlug: string;
  operatives: OperativeStats[];
  ownershipByOp: Record<string, number>;
  onSaved: () => Promise<void> | void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, { percent: string; validFrom: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  function draftFor(slug: string) {
    return drafts[slug] || {
      percent: String(ownershipByOp[slug] ?? 100),
      validFrom: new Date().toISOString().slice(0, 10),
    };
  }

  function setDraft(slug: string, patch: Partial<{ percent: string; validFrom: string }>) {
    setDrafts((d) => ({ ...d, [slug]: { ...draftFor(slug), ...patch } }));
  }

  async function save(operativeSlug: string) {
    const d = draftFor(operativeSlug);
    const percent = parseFloat(d.percent.replace(",", "."));
    if (Number.isNaN(percent) || percent < 0 || percent > 100) {
      setMsg("Percentuale non valida (0-100)");
      return;
    }
    setSaving(operativeSlug);
    setMsg(null);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token || "";
    const res = await fetch(`/api/holding-management/ownership`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        holding_slug: holdingSlug,
        operative_slug: operativeSlug,
        percent,
        valid_from: d.validFrom,
      }),
    });
    setSaving(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setMsg(j.error || "Errore salvataggio");
      return;
    }
    setDrafts((d) => { const n = { ...d }; delete n[operativeSlug]; return n; });
    await onSaved();
  }

  return (
    <div className="cd" style={{ padding: 14, marginBottom: 20 }}>
      <button
        onClick={() => setExpanded((e) => !e)}
        style={{
          all: "unset",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
        }}
      >
        <div style={{ fontSize: 12, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: 0.5 }}>
          Quote holding sulle operative
        </div>
        <span style={{ fontSize: 11, color: "var(--fg3)" }}>{expanded ? "Chiudi ▲" : "Modifica ▼"}</span>
      </button>

      {expanded && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {msg && <div style={{ color: "#ef4444", fontSize: 12 }}>{msg}</div>}
          {operatives.length === 0 ? (
            <div style={{ color: "var(--fg3)", fontSize: 12 }}>Nessuna operativa</div>
          ) : (
            operatives.map((o) => {
              const d = draftFor(o.slug);
              const current = ownershipByOp[o.slug] ?? 100;
              const dirty = Number(d.percent.replace(",", ".")) !== current || d.validFrom !== new Date().toISOString().slice(0, 10);
              return (
                <div
                  key={o.slug}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto auto",
                    gap: 10,
                    alignItems: "center",
                    padding: "8px 10px",
                    borderRadius: 6,
                    borderLeft: `3px solid ${o.color}`,
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <span className="ni-dot" style={{ background: o.color, width: 10, height: 10, flexShrink: 0 }} />
                    <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.name}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      value={d.percent}
                      onChange={(e) => setDraft(o.slug, { percent: e.target.value })}
                      style={{
                        width: 74,
                        padding: "4px 6px",
                        fontSize: 13,
                        fontWeight: 700,
                        textAlign: "right",
                        borderRadius: 4,
                        border: "1px solid var(--bd)",
                        background: "transparent",
                        color: "var(--fg)",
                      }}
                    />
                    <span style={{ fontSize: 13, color: "var(--fg3)" }}>%</span>
                  </div>
                  <input
                    type="date"
                    value={d.validFrom}
                    onChange={(e) => setDraft(o.slug, { validFrom: e.target.value })}
                    style={{
                      padding: "4px 6px",
                      fontSize: 12,
                      borderRadius: 4,
                      border: "1px solid var(--bd)",
                      background: "transparent",
                      color: "var(--fg)",
                      colorScheme: "dark",
                    }}
                    title="Data di decorrenza"
                  />
                  <button
                    onClick={() => save(o.slug)}
                    disabled={!dirty || saving === o.slug}
                    style={{
                      padding: "5px 10px",
                      fontSize: 11,
                      borderRadius: 4,
                      border: "1px solid var(--bd)",
                      background: dirty ? "var(--fg)" : "transparent",
                      color: dirty ? "var(--bg)" : "var(--fg3)",
                      cursor: dirty ? "pointer" : "not-allowed",
                      fontWeight: 600,
                    }}
                  >
                    {saving === o.slug ? "…" : "Salva"}
                  </button>
                </div>
              );
            })
          )}
          <div style={{ fontSize: 11, color: "var(--fg3)", marginTop: 4 }}>
            Le variazioni sono storicizzate per <i>Data di decorrenza</i>. Se non c&apos;è nessuna riga per un&apos;operativa, si assume 100%.
          </div>
        </div>
      )}
    </div>
  );
}
