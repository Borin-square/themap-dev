"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { readVisits, type Visit } from "@/lib/history";

interface Favorite {
  id: string;
  href: string;
  label: string;
  sub: string | null;
  accent: string | null;
  added_at: string;
}

export default function HomePage() {
  const { session } = useAuth();
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);

  useEffect(() => {
    setVisits(readVisits(8));
    (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const res = await fetch("/api/favorites", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const j = await res.json();
        setFavorites(j.favorites || []);
      }
    })();
  }, []);

  const firstName =
    (session?.nome || "").trim().split(/\s+/)[0] ||
    session?.email?.split("@")[0] ||
    "";

  return (
    <div
      style={{
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "60px 32px",
        gap: 56,
        maxWidth: 1200,
      }}
    >
      <h1
        style={{
          fontSize: "clamp(36px, 7vw, 84px)",
          fontWeight: 500,
          letterSpacing: -2,
          color: "#fff",
          lineHeight: 1.02,
          margin: 0,
        }}
      >
        Ciao{firstName ? ` ${firstName}` : ""},
        <br />
        <span style={{ letterSpacing: -1, fontWeight: 600 }}>BENVENUTO SU THE MAP</span>
      </h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 40 }}>
        <Section title="Preferiti" empty="Nessun preferito. Clicca ☆ nella barra sopra per salvare la pagina corrente.">
          {favorites.map((f) => (
            <ShortcutLink key={f.id} href={f.href} label={f.label} sub={f.sub || undefined} accent={f.accent || undefined} />
          ))}
        </Section>

        <Section title="Ultimi visitati" empty="Nessuna cronologia ancora. Naviga tra le sezioni per popolarla.">
          {visits.map((v) => (
            <ShortcutLink key={v.href} href={v.href} label={v.label} sub={v.sub} accent={v.accent} />
          ))}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children, empty }: { title: string; children: React.ReactNode; empty: string }) {
  const isEmpty = Array.isArray(children) && children.length === 0;
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: "var(--fg3)", marginBottom: 14 }}>
        {title}
      </div>
      {isEmpty ? (
        <div style={{ fontSize: 12, color: "var(--fg3)", padding: 16, border: "1px dashed var(--bd)", borderRadius: 10 }}>
          {empty}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>
      )}
    </div>
  );
}

function ShortcutLink({ href, label, sub, accent }: { href: string; label: string; sub?: string; accent?: string }) {
  return (
    <Link
      href={href}
      style={{
        padding: "12px 16px",
        borderRadius: 10,
        border: "1px solid var(--bd)",
        background: "rgba(255,255,255,0.02)",
        color: "var(--fg)",
        textDecoration: "none",
        display: "flex",
        flexDirection: "column",
        gap: 3,
        borderLeft: `3px solid ${accent || "var(--bd)"}`,
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: -0.2 }}>{label}</span>
      {sub && <span style={{ fontSize: 11, color: "var(--fg3)" }}>{sub}</span>}
    </Link>
  );
}
