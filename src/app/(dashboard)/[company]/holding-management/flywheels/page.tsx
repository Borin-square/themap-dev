"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useYear } from "@/components/YearProvider";
import { FlywheelSVG } from "@/components/FlywheelSVG";
import { fwPerLabel, fwSC, type FwData, type FwConfig } from "@/lib/flywheel";
import { SkeletonGrid } from "@/components/Skeleton";

interface OperativeFlywheel {
  slug: string;
  name: string;
  color: string;
  momentum: number | null;
  funcRatios: Record<string, number | null>;
  goalCount: number;
  hasFlywheel: boolean;
  fwData: FwData | null;
  fwConfig: FwConfig | null;
}

const PER_OPTIONS = ["q1", "q2", "q3", "q4", "h1", "h2", "ytd", "year"] as const;
const fmtPct = (n: number | null) => (n == null ? "—" : `${(n * 100).toFixed(0)}%`);

export default function FlywheelsPage() {
  const { year } = useYear();
  const [per, setPer] = useState<string>("ytd");
  const [operatives, setOperatives] = useState<OperativeFlywheel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token || "";
      const res = await fetch(`/api/holding-management/flywheels?year=${year}&per=${per}`, {
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
      setOperatives(json.operatives);
      setError(null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [year, per]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
          Flywheels <span style={{ color: "var(--fg3)", fontWeight: 400 }}>· {year}</span>
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

      {loading ? (
        <SkeletonGrid count={3} minWidth={300} height={340} />
      ) : error ? (
        <div className="cd" style={{ padding: 20, color: "#ef4444" }}>{error}</div>
      ) : operatives.length === 0 ? (
        <div className="cd" style={{ padding: 40, textAlign: "center", color: "var(--fg3)" }}>
          Nessuna azienda di tipo <b>Operative</b>.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(460px, 1fr))", gap: 20 }}>
          {operatives.map((o) => (
            <FlywheelCard key={o.slug} op={o} per={per} />
          ))}
        </div>
      )}
    </div>
  );
}

function FlywheelCard({ op, per }: { op: OperativeFlywheel; per: string }) {
  return (
    <Link
      href={`/${op.slug}/flywheel`}
      className="cd"
      style={{
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        borderLeft: `3px solid ${op.color}`,
        color: "var(--fg)",
        textDecoration: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span className="ni-dot" style={{ background: op.color, width: 10, height: 10, flexShrink: 0 }} />
          <span style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{op.name}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, color: "var(--fg3)" }}>{op.goalCount} goal</span>
          <span style={{ fontWeight: 700, color: fwSC(op.momentum), fontSize: 15 }}>{fmtPct(op.momentum)}</span>
        </div>
      </div>

      {op.hasFlywheel && op.fwData && op.fwConfig ? (
        <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1" }}>
          <FlywheelSVG
            data={op.fwData}
            config={op.fwConfig}
            per={per}
            showAdminBox={true}
            glowIdSuffix={op.slug}
          />
        </div>
      ) : (
        <div style={{ padding: 60, textAlign: "center", color: "var(--fg3)", fontSize: 12, border: "1px dashed var(--bd)", borderRadius: 6 }}>
          Flywheel non configurato
        </div>
      )}
    </Link>
  );
}
