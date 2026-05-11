"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NAV, FOOTER_NAV, type NavItem } from "@/lib/nav";

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({ holding: true });

  function toggle(id: string) {
    setOpen((o) => ({ ...o, [id]: !o[id] }));
  }

  function isActive(item: NavItem): boolean {
    if (item.href && pathname === item.href) return true;
    if (item.children) return item.children.some(isActive);
    return false;
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
        <button className="sb-toggle" onClick={() => setCollapsed(!collapsed)}>
          &#9776;
        </button>
        <span className="sb-logo">THE MAP</span>
      </div>
      <div className="sb-nav">{renderItems(NAV, 0)}</div>
      <div className="sb-foot">{renderItems(FOOTER_NAV, 0)}</div>
    </div>
  );
}
