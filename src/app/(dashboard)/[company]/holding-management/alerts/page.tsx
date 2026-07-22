"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useYear } from "@/components/YearProvider";
import { FW_FUNCS, fwPerLabel, fwSegColor } from "@/lib/flywheel";
import { Skeleton } from "@/components/Skeleton";

interface Alert {
  operativeSlug: string;
  operativeName: string;
  operativeColor: string;
  func: string;
  goalName: string;
  subgoalName: string | null;
  isSubgoal: boolean;
  owner: string;
  ratio: number;
  realValue: string;
  forecastValue: string;
  severity: "red" | "critical";
}

const PER_OPTIONS = ["q1", "q2", "q3", "q4", "h1", "h2", "ytd", "year"] as const;

export default function AlertsPage() {
  const { year } = useYear();
  const [per, setPer] = useState<string>("ytd");
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterOp, setFilterOp] = useState<Set<string>>(new Set());
  const [filterFn, setFilterFn] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token || "";
      const res = await fetch(`/api/holding-management/alerts?year=${year}&per=${per}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (cancelled) return;
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || "Errore caricamento");
        setLoading(false);
        return;
      }
      const json = await res.json();
      setAlerts(json.alerts);
      setError(null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [year, per]);

  const operativeOptions = useMemo(() => {
    const seen = new Map<string, { slug: string; name: string; color: string }>();
    for (const a of alerts) {
      if (!seen.has(a.operativeSlug)) {
        seen.set(a.operativeSlug, { slug: a.operativeSlug, name: a.operativeName, color: a.operativeColor });
      }
    }
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [alerts]);

  const filtered = useMemo(() => {
    return alerts.filter((a) => {
      if (filterOp.size > 0 && !filterOp.has(a.operativeSlug)) return false;
      if (filterFn.size > 0 && !filterFn.has(a.func)) return false;
      return true;
    });
  }, [alerts, filterOp, filterFn]);

  const criticalCount = filtered.filter((a) => a.severity === "critical").length;
  const redCount = filtered.length - criticalCount;

  function toggle(set: Set<string>, setter: (s: Set<string>) => void, key: string) {
    const n = new Set(set);
    if (n.has(key)) n.delete(key);
    else n.add(key);
    setter(n);
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
          Alerts <span style={{ color: "var(--fg3)", fontWeight: 400 }}>· {year}</span>
        </h1>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {PER_OPTIONS.map((k) => {
            const active = per === k;
            return (
              <button
                key={k}
                onClick={() => setPer(k)}
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
                {fwPerLabel(k, year).replace(` ${year}`, "")}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 20 }}>
        <KpiCard label="TOTALE ALERT" value={String(filtered.length)} color="#ef4444" />
        <KpiCard label="CRITICI (<40%)" value={String(criticalCount)} color="#b91c1c" />
        <KpiCard label="ROSSI (40-70%)" value={String(redCount)} color="#ef4444" />
        <KpiCard label="OPERATIVE COINVOLTE" value={String(new Set(filtered.map((a) => a.operativeSlug)).size)} />
      </div>

      <div className="cd" style={{ padding: 12, marginBottom: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, color: "var(--fg3)", minWidth: 90 }}>OPERATIVA</span>
          {operativeOptions.length === 0 ? (
            <span style={{ fontSize: 12, color: "var(--fg3)" }}>—</span>
          ) : operativeOptions.map((o) => {
            const active = filterOp.has(o.slug);
            return (
              <button
                key={o.slug}
                onClick={() => toggle(filterOp, setFilterOp, o.slug)}
                style={{
                  padding: "4px 10px",
                  fontSize: 11,
                  borderRadius: 999,
                  border: `1px solid ${active ? o.color : "var(--bd)"}`,
                  background: active ? `${o.color}22` : "transparent",
                  color: active ? "var(--fg)" : "var(--fg2)",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: o.color }} />
                {o.name}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, color: "var(--fg3)", minWidth: 90 }}>FUNZIONE</span>
          {FW_FUNCS.map((fn) => {
            const active = filterFn.has(fn);
            const c = fwSegColor(fn);
            return (
              <button
                key={fn}
                onClick={() => toggle(filterFn, setFilterFn, fn)}
                style={{
                  padding: "4px 10px",
                  fontSize: 11,
                  borderRadius: 999,
                  border: `1px solid ${active ? c : "var(--bd)"}`,
                  background: active ? `${c}22` : "transparent",
                  color: active ? "var(--fg)" : "var(--fg2)",
                  cursor: "pointer",
                }}
              >
                {fn}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="cd" style={{ padding: 12, display: "grid", gridTemplateColumns: "auto 1fr auto auto auto", gap: 14, alignItems: "center", borderLeft: "4px solid #ef4444" }}>
              <Skeleton width={54} height={34} radius={6} />
              <Skeleton width="60%" height={16} />
              <Skeleton width={70} height={14} />
              <Skeleton width={70} height={14} />
              <Skeleton width={90} height={14} />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="cd" style={{ padding: 20, color: "#ef4444" }}>{error}</div>
      ) : filtered.length === 0 ? (
        <div className="cd" style={{ padding: 40, textAlign: "center", color: "var(--fg3)" }}>
          {alerts.length === 0 ? "Nessun alert rosso" : "Nessun alert con i filtri attivi"}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((a, i) => <AlertRow key={i} alert={a} />)}
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="cd" style={{ padding: 12 }}>
      <div className="lb">{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || "var(--fg)" }}>{value}</div>
    </div>
  );
}

function AlertRow({ alert }: { alert: Alert }) {
  const isCritical = alert.severity === "critical";
  const bandColor = isCritical ? "#b91c1c" : "#ef4444";
  const funcColor = fwSegColor(alert.func);
  const pct = `${Math.round(alert.ratio * 100)}%`;

  return (
    <Link
      href={`/${alert.operativeSlug}/flywheel`}
      className="cd"
      style={{
        padding: 12,
        display: "grid",
        gridTemplateColumns: "auto 1fr auto auto auto",
        gap: 14,
        alignItems: "center",
        borderLeft: `4px solid ${bandColor}`,
        color: "var(--fg)",
        textDecoration: "none",
      }}
    >
      <div style={{
        minWidth: 54,
        padding: "6px 8px",
        borderRadius: 6,
        background: `${bandColor}22`,
        color: bandColor,
        fontWeight: 800,
        fontSize: 15,
        textAlign: "center",
      }}>
        {pct}
      </div>

      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: alert.operativeColor }} />
            <span style={{ color: "var(--fg2)" }}>{alert.operativeName}</span>
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, padding: "2px 6px", borderRadius: 4, background: `${funcColor}22`, color: funcColor }}>
            {alert.func}
          </span>
          {isCritical && (
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, padding: "2px 6px", borderRadius: 4, background: "#7f1d1d55", color: "#fecaca" }}>
              CRITICO
            </span>
          )}
        </div>
        <div style={{ fontWeight: 700, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {alert.goalName}
          {alert.subgoalName && (
            <>
              <span style={{ color: "var(--fg3)", fontWeight: 400 }}> › </span>
              <span>{alert.subgoalName}</span>
            </>
          )}
        </div>
      </div>

      <div style={{ textAlign: "right", minWidth: 90 }}>
        <div style={{ fontSize: 10, color: "var(--fg3)", letterSpacing: 0.5 }}>REAL</div>
        <div style={{ fontWeight: 600, fontSize: 12 }}>{alert.realValue}</div>
      </div>

      <div style={{ textAlign: "right", minWidth: 90 }}>
        <div style={{ fontSize: 10, color: "var(--fg3)", letterSpacing: 0.5 }}>FORECAST</div>
        <div style={{ fontWeight: 600, fontSize: 12 }}>{alert.forecastValue}</div>
      </div>

      <div style={{ textAlign: "right", minWidth: 90 }}>
        <div style={{ fontSize: 10, color: "var(--fg3)", letterSpacing: 0.5 }}>OWNER</div>
        <div style={{ fontWeight: 600, fontSize: 12 }}>{alert.owner}</div>
      </div>
    </Link>
  );
}
