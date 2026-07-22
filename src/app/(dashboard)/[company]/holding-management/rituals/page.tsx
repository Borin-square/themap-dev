"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { COMPANIES, type Company } from "@/lib/companies";
import { Skeleton } from "@/components/Skeleton";

interface Ritual {
  id: string;
  azienda: string;
  tipologia: string;
  titolo: string;
  data: string;         // YYYY-MM-DD
  data_fine: string | null;
  ora: string | null;
  luogo: string | null;
  confermato: boolean;
  partecipanti: string | null;
  odg: string | null;
}

const MESI_FULL = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

function companyBySlug(slug: string): Company | undefined {
  return COMPANIES.find((c) => c.slug === slug);
}

function fmtItDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default function HoldingRitualsPage() {
  const [rituals, setRituals] = useState<Ritual[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterAz, setFilterAz] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<"upcoming" | "past" | "all">("upcoming");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token || "";
      const res = await fetch(`/api/rituals`, { headers: { Authorization: `Bearer ${token}` } });
      if (cancelled) return;
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || "Errore caricamento");
        setLoading(false);
        return;
      }
      const json = await res.json();
      setRituals(json.rows || []);
      setError(null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const aziendeInUse = useMemo(() => {
    const seen = new Set<string>();
    for (const r of rituals) seen.add(r.azienda);
    return Array.from(seen)
      .map((s) => companyBySlug(s))
      .filter((c): c is Company => !!c)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rituals]);

  const today = new Date().toISOString().slice(0, 10);
  const filtered = useMemo(() => {
    return rituals
      .filter((r) => {
        if (filterAz.size > 0 && !filterAz.has(r.azienda)) return false;
        if (tab === "upcoming") return (r.data_fine || r.data) >= today;
        if (tab === "past") return (r.data_fine || r.data) < today;
        return true;
      })
      .sort((a, b) => {
        // upcoming: asc; past: desc; all: asc
        if (tab === "past") return b.data.localeCompare(a.data);
        return a.data.localeCompare(b.data);
      });
  }, [rituals, filterAz, tab, today]);

  // Group by year-month
  const grouped = useMemo(() => {
    const map = new Map<string, Ritual[]>();
    for (const r of filtered) {
      const key = r.data.slice(0, 7); // YYYY-MM
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries());
  }, [filtered]);

  function toggleAz(slug: string) {
    const n = new Set(filterAz);
    if (n.has(slug)) n.delete(slug);
    else n.add(slug);
    setFilterAz(n);
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Rituals</h1>
        <div style={{ display: "flex", gap: 4 }}>
          {(["upcoming", "past", "all"] as const).map((t) => {
            const active = tab === t;
            const label = t === "upcoming" ? "Prossimi" : t === "past" ? "Passati" : "Tutti";
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: "5px 12px",
                  fontSize: 11,
                  borderRadius: 4,
                  border: "1px solid var(--bd)",
                  background: active ? "var(--fg)" : "transparent",
                  color: active ? "var(--bg)" : "var(--fg2)",
                  cursor: "pointer",
                  fontWeight: active ? 700 : 500,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {aziendeInUse.length > 0 && (
        <div className="cd" style={{ padding: 10, marginBottom: 16, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, color: "var(--fg3)", minWidth: 60 }}>AZIENDA</span>
          {aziendeInUse.map((az) => {
            const active = filterAz.has(az.slug);
            return (
              <button
                key={az.slug}
                onClick={() => toggleAz(az.slug)}
                style={{
                  padding: "4px 10px",
                  fontSize: 11,
                  borderRadius: 999,
                  border: `1px solid ${active ? az.color : "var(--bd)"}`,
                  background: active ? `${az.color}22` : "transparent",
                  color: active ? "var(--fg)" : "var(--fg2)",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: az.color }} />
                {az.name}
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {Array.from({ length: 2 }).map((_, k) => (
            <div key={k}>
              <Skeleton width={180} height={12} style={{ marginBottom: 10 }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="cd" style={{ padding: 12, display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 14, alignItems: "center" }}>
                    <Skeleton width={88} height={44} radius={6} />
                    <Skeleton width="60%" height={16} />
                    <Skeleton width={20} height={20} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="cd" style={{ padding: 20, color: "#ef4444" }}>{error}</div>
      ) : filtered.length === 0 ? (
        <div className="cd" style={{ padding: 40, textAlign: "center", color: "var(--fg3)" }}>
          {rituals.length === 0 ? "Nessun ritual salvato. Creane nella tab Organization → Rituals di una operativa." : "Nessun ritual con i filtri attivi"}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {grouped.map(([ym, items]) => {
            const [y, m] = ym.split("-");
            const label = `${MESI_FULL[parseInt(m) - 1]} ${y}`;
            return (
              <div key={ym}>
                <div style={{ fontSize: 12, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 10, fontWeight: 700 }}>
                  {label} · {items.length} eventi
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {items.map((r) => <RitualCard key={r.id} r={r} />)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RitualCard({ r }: { r: Ritual }) {
  const az = companyBySlug(r.azienda);
  const color = az?.color || "var(--fg3)";
  const isPast = (r.data_fine || r.data) < new Date().toISOString().slice(0, 10);

  return (
    <Link
      href={`/${r.azienda}/people/rituals`}
      className="cd"
      style={{
        padding: 12,
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        gap: 14,
        alignItems: "center",
        borderLeft: `4px solid ${color}`,
        color: "var(--fg)",
        textDecoration: "none",
        opacity: isPast ? 0.65 : 1,
      }}
    >
      <div style={{
        minWidth: 88,
        padding: "6px 10px",
        borderRadius: 6,
        background: "rgba(255,255,255,0.04)",
        textAlign: "center",
      }}>
        <div style={{ fontSize: 10, color: "var(--fg3)", letterSpacing: 0.5 }}>{r.ora || "—"}</div>
        <div style={{ fontWeight: 700, fontSize: 13 }}>
          {fmtItDate(r.data)}
          {r.data_fine && r.data_fine !== r.data && <> → {fmtItDate(r.data_fine)}</>}
        </div>
      </div>

      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 2 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
            <span style={{ color: "var(--fg2)" }}>{az?.name || r.azienda}</span>
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, padding: "2px 6px", borderRadius: 4, background: `${color}22`, color }}>
            {r.tipologia}
          </span>
          {!r.confermato && (
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, padding: "2px 6px", borderRadius: 4, background: "rgba(234, 179, 8, 0.15)", color: "#eab308" }}>
              DA CONFERMARE
            </span>
          )}
        </div>
        <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {r.titolo}
        </div>
        <div style={{ fontSize: 11, color: "var(--fg3)", marginTop: 2 }}>
          {r.luogo && <>📍 {r.luogo}</>}
          {r.luogo && r.partecipanti && <> · </>}
          {r.partecipanti && <>👥 {r.partecipanti}</>}
        </div>
      </div>

      <div style={{ fontSize: 18, color: "var(--fg3)" }}>›</div>
    </Link>
  );
}
