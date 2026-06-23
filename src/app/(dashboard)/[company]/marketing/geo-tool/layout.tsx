"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";

const GEO_NAV = [
  { href: "", label: "Dashboard", icon: "\u25A0" },
  { href: "/report", label: "Executive Report", icon: "\u2316" },
  { href: "/settings", label: "Settings", icon: "\u2699" },
  { section: "BRAND REPORT" },
  { href: "/brand-report/prompt-monitor", label: "Prompt Monitor", icon: "\u25B6" },
  { href: "/brand-report/citation-monitor", label: "Citation Monitor", icon: "\u2693" },
  { href: "/brand-report/competitor-tracker", label: "Competitor Tracker", icon: "\u2694" },
  { href: "/brand-report/sentiment", label: "Sentiment", icon: "\u2665" },
  { section: "PROMPT RESEARCH" },
  { href: "/prompt-research/generator", label: "Prompt Generator", icon: "\u2728" },
  { href: "/prompt-research/clusters", label: "Intent Clusters", icon: "\u25C6" },
  { href: "/prompt-research/scorer", label: "Opportunity Scorer", icon: "\u2605" },
  { section: "GEO AUDIT" },
  { href: "/audit/crawlability", label: "AI Crawlability", icon: "\u2699" },
  { href: "/audit/content-readiness", label: "Content Readiness", icon: "\u2637" },
  { href: "/audit/structured-data", label: "Structured Data", icon: "\u2630" },
  { href: "/audit/kg-optimizer", label: "KG Optimizer", icon: "\u26ED" },
  { href: "/audit/entity-strength", label: "Entity Strength", icon: "\u2726" },
  { section: "ACTION PLANNER" },
  { href: "/action/content-gaps", label: "Content Gaps", icon: "\u25CB" },
  { href: "/action/source-acquisition", label: "Source Acquisition", icon: "\u2192" },
  { href: "/action/digital-pr", label: "Digital PR", icon: "\u260E" },
  { href: "/action/plan", label: "Action Plan", icon: "\u2611" },
  { section: "MONITORING" },
  { href: "/monitoring/bot-traffic", label: "Bot Traffic", icon: "\u2302" },
  { href: "/monitoring/ai-referral", label: "AI Referral", icon: "\u2197" },
] as const;

export default function GEOToolLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const slug = params.company as string;
  const base = `/${slug}/marketing/geo-tool`;

  return (
    <div>
      <div className="ee-subnav">
        <Link href={`/${slug}/marketing`} className="ee-tab">Campaign Manager</Link>
        <Link href={`/${slug}/marketing/strategy`} className="ee-tab">Strategy</Link>
        <Link href={`/${slug}/marketing/brand-asset`} className="ee-tab">Brand Asset</Link>
        <Link href={`/${slug}/marketing/seo-cluster`} className="ee-tab">SEO Cluster</Link>
        <span className="ee-tab active">GEO Tool</span>
        <Link href={`/${slug}/marketing/flywheel`} className="ee-tab">Flywheel</Link>
      </div>

      <div className="geo-suite">
        <nav className="geo-nav">
          {GEO_NAV.map((item, i) => {
            if ("section" in item) {
              return <div key={i} className="geo-nav-section">{item.section}</div>;
            }
            const full = base + item.href;
            const active = item.href === ""
              ? pathname === base || pathname === base + "/"
              : pathname.startsWith(full);
            return (
              <Link key={i} href={full} className={`geo-nav-item${active ? " geo-nav-active" : ""}`}>
                <span className="geo-nav-icon">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <main className="geo-main">
          {children}
        </main>
      </div>
    </div>
  );
}
