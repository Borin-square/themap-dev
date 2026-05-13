"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useMemo } from "react";
import { buildNav, FOOTER_NAV, type NavItem } from "@/lib/nav";
import { fetchCompanies, getCachedCompanies, type Company } from "@/lib/companies";
import { useAuth } from "./AuthProvider";
import { getAllowedSlugs } from "@/lib/auth";

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { session, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({ holding: true });
  const [companies, setCompanies] = useState<Company[]>(getCachedCompanies);

  // Load companies from Supabase
  useEffect(() => {
    fetchCompanies().then(setCompanies);
  }, []);

  const NAV = useMemo(() => buildNav(companies), [companies]);

  /* Filter nav based on user access */
  const allowed = getAllowedSlugs(session);
  const isOp = allowed !== "*";
  const filteredNav = isOp
    ? NAV
        .filter((item) => item.id !== "holding") // hide Holding for operativi
        .flatMap((item) => {
          if (item.id !== "operative") return [item];
          // Flatten: remove "Operative" wrapper, show allowed companies directly at root
          const kids = item.children?.filter((child) =>
            (allowed as string[]).includes(child.id.toLowerCase()),
          ) || [];
          return kids;
        })
    : NAV;

  useEffect(() => {
    setOpen((prev) => {
      const next = { ...prev };
      if (!isOp && pathname.startsWith("/holding")) next.holding = true;
      for (const c of companies) {
        if (pathname.startsWith(`/${c.slug}`)) {
          if (!isOp) next.operative = true;
          next[c.slug] = true;
          next[`${c.slug}-strategy`] = true;
          if (pathname.includes("/flywheel")) next[`${c.slug}-fw`] = true;
          if (pathname.includes("/economic-engine")) next[`${c.slug}-ee`] = true;
          if (pathname.includes("/people")) next[`${c.slug}-org`] = true;
          if (pathname.includes("/marketing")) next[`${c.slug}-mktg`] = true;
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
        <span className="sb-logo">THE MAP</span>
      </div>
      <div className="sb-nav">{renderItems(filteredNav, 0)}</div>
      <div className="sb-foot">
        {renderItems(FOOTER_NAV, 0)}
        {session && (
          <div className="sb-user">
            <div className="sb-user-name">{session.nome || session.email}</div>
            <div className="sb-user-meta">
              <span className={`sb-user-role ${session.ruolo === "ADMIN" ? "admin" : "op"}`}>
                {session.ruolo}
              </span>
              <button className="sb-logout" onClick={handleLogout}>Esci</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
