"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { NAV, FOOTER_NAV, getPath, flatNav } from "@/lib/nav";

export default function Topbar() {
  const pathname = usePathname();
  const [spotOpen, setSpotOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const allNav = [...NAV, ...FOOTER_NAV];
  const crumbs = getPath(allNav, pathname) || [];
  const flat = flatNav(allNav);

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
        <div className="topbar-right">
          <span className="kb-hint" onClick={() => setSpotOpen(true)}>
            Ctrl+K
          </span>
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
