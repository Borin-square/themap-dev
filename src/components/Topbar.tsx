"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { buildNav, FOOTER_NAV, getPath, flatNav } from "@/lib/nav";
import { fetchCompanies, getCachedCompanies, type Company } from "@/lib/companies";
import { supabase } from "@/lib/supabase";
import { pushVisit } from "@/lib/history";
import { useYear, YEARS } from "./YearProvider";

export default function Topbar() {
  const pathname = usePathname();
  const [spotOpen, setSpotOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [companies, setCompanies] = useState<Company[]>(getCachedCompanies);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favBusy, setFavBusy] = useState(false);

  useEffect(() => { fetchCompanies().then(setCompanies); }, []);

  const NAV = useMemo(() => buildNav(companies), [companies]);
  const allNav = [...NAV, ...FOOTER_NAV];
  const crumbs = getPath(allNav, pathname) || [];
  const flat = flatNav(allNav);

  const currentLabel = crumbs.length > 0 ? crumbs[crumbs.length - 1].label : "";
  const currentSub = crumbs.length > 1 ? crumbs.slice(0, -1).map((c) => c.label).join(" / ") : undefined;
  const currentAccent = crumbs.find((c) => c.color)?.color;

  // Track ultimo visitato in localStorage
  useEffect(() => {
    if (!pathname || pathname === "/" || !currentLabel) return;
    pushVisit({ href: pathname, label: currentLabel, sub: currentSub, accent: currentAccent });
  }, [pathname, currentLabel, currentSub, currentAccent]);

  // Verifica se pagina è già tra i preferiti
  const checkFavorite = useCallback(async () => {
    if (!pathname || pathname === "/") { setIsFavorite(false); return; }
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    const res = await fetch("/api/favorites", { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return;
    const j = await res.json();
    const favs = (j.favorites || []) as { href: string }[];
    setIsFavorite(favs.some((f) => f.href === pathname));
  }, [pathname]);

  useEffect(() => { checkFavorite(); }, [checkFavorite]);

  async function toggleFavorite() {
    if (!pathname || !currentLabel || favBusy) return;
    setFavBusy(true);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) { setFavBusy(false); return; }
    if (isFavorite) {
      await fetch(`/api/favorites?href=${encodeURIComponent(pathname)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setIsFavorite(false);
    } else {
      await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ href: pathname, label: currentLabel, sub: currentSub, accent: currentAccent }),
      });
      setIsFavorite(true);
    }
    setFavBusy(false);
  }

  const filtered = query.trim()
    ? flat.filter(
        (it) =>
          it.label.toLowerCase().includes(query.toLowerCase()) ||
          it.path.toLowerCase().includes(query.toLowerCase())
      )
    : flat;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setSpotOpen((o) => !o);
      }
      if (e.key === "Escape") setSpotOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (spotOpen) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [spotOpen]);

  return (
    <>
      <div className="topbar">
        <div className="bc">
          {crumbs.map((c, i) => (
            <span key={c.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {i > 0 && <span className="bc-sep">/</span>}
              {c.href ? (
                <Link href={c.href} className="bc-i">
                  {c.label}
                </Link>
              ) : (
                <span className="bc-i">{c.label}</span>
              )}
            </span>
          ))}
        </div>
        <div className="topbar-right" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <YearChip />
          {pathname && pathname !== "/" && currentLabel && (
            <button
              onClick={toggleFavorite}
              disabled={favBusy}
              title={isFavorite ? "Rimuovi dai preferiti" : "Salva tra i preferiti"}
              style={{
                background: "transparent",
                border: "none",
                cursor: favBusy ? "wait" : "pointer",
                fontSize: 15,
                color: isFavorite ? "#eab308" : "var(--fg3)",
                padding: "2px 6px",
                lineHeight: 1,
                opacity: favBusy ? 0.5 : 1,
              }}
              aria-label={isFavorite ? "Preferito attivo" : "Aggiungi ai preferiti"}
            >
              {isFavorite ? "★" : "☆"}
            </button>
          )}
          <button
            onClick={() => setSpotOpen(true)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 12px",
              minWidth: 220,
              background: "var(--bg2)",
              border: "1px solid var(--bd)",
              borderRadius: 6,
              color: "var(--fg3)",
              cursor: "pointer",
              fontSize: 12,
              fontFamily: "inherit",
              textAlign: "left",
            }}
            title="Cerca (Ctrl+K)"
          >
            <span style={{ fontSize: 13, lineHeight: 1 }}>⌕</span>
            <span style={{ flex: 1 }}>Cerca…</span>
            <span style={{ fontSize: 10, background: "rgba(255,255,255,0.05)", padding: "2px 6px", borderRadius: 3, color: "var(--fg3)", letterSpacing: 0.5 }}>⌘K</span>
          </button>
        </div>
      </div>

      {spotOpen && (
        <div
          className="spot-bg vis"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSpotOpen(false);
          }}
        >
          <div className="spot">
            <input
              ref={inputRef}
              placeholder="Cerca pagina..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="spot-results">
              {filtered.length ? (
                filtered.map((it) => (
                  <Link
                    key={it.id}
                    href={it.href}
                    className="sp-it"
                    onClick={() => setSpotOpen(false)}
                  >
                    {it.label}
                    <small>{it.path}</small>
                  </Link>
                ))
              ) : (
                <div className="sp-it" style={{ color: "var(--fg3)" }}>
                  Nessun risultato
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function YearChip() {
  const { year, setYear } = useYear();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 10px",
          background: "var(--bg2)",
          border: "1px solid var(--bd)",
          borderRadius: 6,
          color: "var(--fg)",
          cursor: "pointer",
          fontSize: 12,
          fontFamily: "inherit",
          fontVariantNumeric: "tabular-nums",
          fontWeight: 600,
        }}
        title="Cambia anno"
      >
        <span style={{ fontSize: 9, color: "var(--fg3)", letterSpacing: 1.5, textTransform: "uppercase" }}>Anno</span>
        {year}
        <span style={{ fontSize: 8, color: "var(--fg3)" }}>▾</span>
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 6,
            background: "var(--bg2)",
            border: "1px solid var(--bd)",
            borderRadius: 6,
            padding: 4,
            minWidth: 80,
            zIndex: 100,
            boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
          }}
        >
          {YEARS.map((y) => (
            <button
              key={y}
              onClick={() => { setYear(y); setOpen(false); }}
              style={{
                display: "block",
                width: "100%",
                padding: "6px 10px",
                background: y === year ? "rgba(255,255,255,0.06)" : "transparent",
                border: "none",
                color: y === year ? "var(--fg)" : "var(--fg2)",
                cursor: "pointer",
                fontSize: 12,
                fontFamily: "inherit",
                fontVariantNumeric: "tabular-nums",
                textAlign: "left",
                borderRadius: 4,
                fontWeight: y === year ? 700 : 500,
              }}
            >
              {y}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
