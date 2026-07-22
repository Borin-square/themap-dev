"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useMemo } from "react";
import { buildNav, filterNavByFeatures, FOOTER_NAV, TYPE_GROUP_IDS, type NavItem } from "@/lib/nav";
import { fetchCompanies, getCachedCompanies, type Company } from "@/lib/companies";
import { useAuth } from "./AuthProvider";
import { getAllowedSlugs, isSuperAdmin } from "@/lib/auth";

const SB_COLL_KEY = "themap:sidebarCollapsed";

function filterNavByQuery(items: NavItem[], q: string): NavItem[] {
  if (!q.trim()) return items;
  const lower = q.trim().toLowerCase();
  const out: NavItem[] = [];
  for (const it of items) {
    const selfMatch = it.label.toLowerCase().includes(lower);
    const kids = it.children ? filterNavByQuery(it.children, q) : [];
    if (selfMatch) {
      // Manteniamo TUTTI i children dell'item che matcha (per navigare in profondità)
      out.push({ ...it });
    } else if (kids.length > 0) {
      out.push({ ...it, children: kids });
    }
  }
  return out;
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { session, logout, featureState } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [collapsedLoaded, setCollapsedLoaded] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [companies, setCompanies] = useState<Company[]>(getCachedCompanies);
  const [filterQ, setFilterQ] = useState("");

  // Carica preferenza collapsed
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SB_COLL_KEY);
      if (raw === "1") setCollapsed(true);
    } catch {}
    setCollapsedLoaded(true);
  }, []);

  useEffect(() => {
    if (!collapsedLoaded) return;
    try { localStorage.setItem(SB_COLL_KEY, collapsed ? "1" : "0"); } catch {}
  }, [collapsed, collapsedLoaded]);

  // Load companies from Supabase
  useEffect(() => {
    fetchCompanies().then(setCompanies);
  }, []);

  const NAV = useMemo(() => buildNav(companies), [companies]);

  /* Filter nav based on user access */
  const allowed = getAllowedSlugs(session);
  const isOp = allowed !== "*";
  const filteredNav = useMemo(() => {
    const nav = isOp
      ? NAV.flatMap((item) => {
          // Per gli OPERATIVO: appiattisci i gruppi-tipo e mostra solo le aziende assegnate
          if (!TYPE_GROUP_IDS.includes(item.id)) return [item];
          const kids = item.children?.filter((child) =>
            (allowed as string[]).includes(child.id.toLowerCase()),
          ) || [];
          return kids;
        })
      : NAV;
    // Apply feature flags filtering
    const filtered = filterNavByFeatures(nav, featureState);
    // Apply search filter
    return filterNavByQuery(filtered, filterQ);
  }, [NAV, isOp, allowed, featureState, filterQ]);

  // Auto-espansione dei parent quando c'è un filtro attivo (per far vedere i match)
  useEffect(() => {
    if (!filterQ.trim()) return;
    const opens: Record<string, boolean> = {};
    function walk(items: NavItem[]) {
      for (const it of items) {
        if (it.children && it.children.length > 0) {
          opens[it.id] = true;
          walk(it.children);
        }
      }
    }
    walk(filteredNav);
    setOpen((prev) => ({ ...prev, ...opens }));
  }, [filterQ, filteredNav]);

  useEffect(() => {
    setOpen((prev) => {
      const next = { ...prev };
      for (const c of companies) {
        if (pathname.startsWith(`/${c.slug}`)) {
          if (!isOp) next[`type-${c.type}`] = true;
          next[c.slug] = true;
          next[`${c.slug}-strategy`] = true;
          if (pathname.includes("/flywheel")) next[`${c.slug}-fw`] = true;
          if (pathname.includes("/economic-engine")) next[`${c.slug}-ee`] = true;
          if (pathname.includes("/people") || pathname.includes("/organization")) next[`${c.slug}-org`] = true;
          if (pathname.includes("/marketing")) next[`${c.slug}-mktg`] = true;
          if (pathname.includes("/holding-management")) next[`${c.slug}-hm`] = true;
        }
      }
      return next;
    });
  }, [pathname, companies, isOp]);

  function toggle(id: string) {
    setOpen((o) => ({ ...o, [id]: !o[id] }));
  }

  function isActive(item: NavItem): boolean {
    if (item.href && pathname === item.href) return true;
    if (item.children) return item.children.some(isActive);
    return false;
  }

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  function renderItems(items: NavItem[], depth: number) {
    return items.map((it) => {
      const hasKids = it.children && it.children.length > 0;
      const active = isActive(it);
      const isOpen = open[it.id] ?? false;

      return (
        <div key={it.id}>
          {it.href && !hasKids ? (
            <Link
              href={it.href}
              className={`ni d${depth}${active ? " act" : ""}`}
              onClick={() => {
                if (window.innerWidth <= 900) setCollapsed(true);
              }}
            >
              {it.color && (
                <span className="ni-dot" style={{ background: it.color }} />
              )}
              <span>{it.label}</span>
            </Link>
          ) : (
            <div
              className={`ni d${depth}${active ? " act" : ""}`}
              onClick={() => {
                if (hasKids) toggle(it.id);
                if (it.href && window.innerWidth <= 900) setCollapsed(true);
              }}
            >
              {it.color && (
                <span className="ni-dot" style={{ background: it.color }} />
              )}
              <span>{it.label}</span>
              {hasKids && (
                <span className={`ni-arrow${isOpen ? " open" : ""}`}>
                  &#9654;
                </span>
              )}
            </div>
          )}
          {hasKids && (
            <div className={`ni-kids${isOpen ? " open" : ""}`}>
              {renderItems(it.children!, depth + 1)}
            </div>
          )}
        </div>
      );
    });
  }

  return (
    <div id="sidebar" className={`sb${collapsed ? " coll" : ""}`}>
      <div className="sb-head">
        <button
          className="sb-toggle"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Espandi menu" : "Comprimi menu"}
          aria-label={collapsed ? "Espandi menu" : "Comprimi menu"}
        >
          {collapsed ? "☰" : "◀"}
        </button>
        <span className="sb-logo">THE MAP</span>
      </div>
      {!collapsed && (
        <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--bd)" }}>
          <div style={{ position: "relative" }}>
            <input
              type="text"
              placeholder="Filtra voci…"
              value={filterQ}
              onChange={(e) => setFilterQ(e.target.value)}
              style={{
                width: "100%",
                padding: "6px 26px 6px 10px",
                fontSize: 12,
                borderRadius: 6,
                border: "1px solid var(--bd)",
                background: "var(--bg3)",
                color: "var(--fg)",
                fontFamily: "inherit",
              }}
            />
            {filterQ && (
              <button
                onClick={() => setFilterQ("")}
                style={{
                  position: "absolute",
                  right: 6,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  color: "var(--fg3)",
                  cursor: "pointer",
                  fontSize: 14,
                  padding: "0 4px",
                  lineHeight: 1,
                }}
                aria-label="Pulisci filtro"
              >
                ×
              </button>
            )}
          </div>
        </div>
      )}
      {collapsed ? (
        <CollapsedNav companies={companies} allowed={allowed as string[] | "*"} pathname={pathname} />
      ) : (
        <div className="sb-nav">{renderItems(filteredNav, 0)}</div>
      )}
      <div className="sb-foot">
        {!collapsed && renderItems(FOOTER_NAV, 0)}
        {collapsed && (
          <>
            <Link href="/settings" className={`ni d0${pathname === "/settings" ? " act" : ""}`} title="Settings" style={{ justifyContent: "center", padding: "8px 0" }}>
              <span style={{ fontSize: 16 }}>⚙</span>
            </Link>
            {isSuperAdmin(session) && (
              <Link href="/library" className={`ni d0${pathname === "/library" ? " act" : ""}`} title="Library" style={{ justifyContent: "center", padding: "8px 0" }}>
                <span style={{ fontSize: 16 }}>◫</span>
              </Link>
            )}
          </>
        )}
        {!collapsed && isSuperAdmin(session) && renderItems([{ id: "admin", label: "Admin", href: "/admin" }], 0)}
        {collapsed && isSuperAdmin(session) && (
          <Link href="/admin" className={`ni d0${pathname === "/admin" ? " act" : ""}`} title="Admin" style={{ justifyContent: "center", padding: "8px 0" }}>
            <span style={{ fontSize: 16, color: "#f59e0b" }}>★</span>
          </Link>
        )}
        {session && !collapsed && (
          <div className="sb-user">
            <div className="sb-user-name">{session.nome || session.email}</div>
            <div className="sb-user-meta">
              <span className={`sb-user-role ${session.ruolo === "OPERATIVO" ? "op" : "admin"}`}>
                {session.ruolo === "SUPER_ADMIN" ? "SUPER ADMIN" : session.ruolo}
              </span>
              <button className="sb-logout" onClick={handleLogout}>Esci</button>
            </div>
          </div>
        )}
        {session && collapsed && (
          <button
            onClick={handleLogout}
            title="Esci"
            style={{
              width: "100%",
              padding: "10px 0",
              background: "transparent",
              border: "none",
              borderTop: "1px solid var(--bd)",
              color: "var(--fg3)",
              cursor: "pointer",
              fontSize: 14,
              fontFamily: "inherit",
            }}
            aria-label="Esci"
          >
            ⏻
          </button>
        )}
      </div>
    </div>
  );
}

function CollapsedNav({
  companies,
  allowed,
  pathname,
}: {
  companies: Company[];
  allowed: string[] | "*";
  pathname: string;
}) {
  const visible = allowed === "*"
    ? companies
    : companies.filter((c) => (allowed as string[]).map((s) => s.toLowerCase()).includes(c.slug.toLowerCase()));

  // Raggruppo per tipo (holding, operative, client)
  const groups = [
    { type: "holding" as const, label: "HLD" },
    { type: "operative" as const, label: "OPR" },
    { type: "client" as const, label: "CLI" },
  ];

  return (
    <div className="sb-nav" style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "6px 0", gap: 2 }}>
      <Link
        href="/"
        title="Home"
        className={`ni d0${pathname === "/" ? " act" : ""}`}
        style={{ width: "100%", justifyContent: "center", padding: "8px 0" }}
      >
        <span style={{ fontSize: 15 }}>⌂</span>
      </Link>

      {groups.map((g) => {
        const kids = visible.filter((c) => c.type === g.type);
        if (kids.length === 0) return null;
        return (
          <div key={g.type} style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, marginTop: 8 }}>
            <div style={{ fontSize: 8, color: "var(--fg3)", letterSpacing: 1.5, marginBottom: 2, fontWeight: 700 }}>{g.label}</div>
            {kids.map((c) => {
              const active = pathname.startsWith(`/${c.slug}`);
              return (
                <Link
                  key={c.slug}
                  href={`/${c.slug}/flywheel`}
                  title={c.name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: active ? "rgba(255,255,255,0.06)" : "transparent",
                    border: active ? `1px solid ${c.color}` : "1px solid transparent",
                    transition: "background 150ms, border-color 150ms",
                  }}
                >
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      background: c.color,
                      boxShadow: active ? `0 0 8px ${c.color}` : "none",
                    }}
                  />
                </Link>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
