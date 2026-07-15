"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getCompany } from "@/lib/companies";

export default function DesignTestPage() {
  const params = useParams();
  const company = getCompany(params.company as string);
  const slug = params.company as string;

  const [fs, setFs] = useState(false);

  useEffect(() => {
    if (!fs) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFs(false); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [fs]);

  return (
    <div>
      <div className="ee-subnav">
        <Link href={`/${slug}/marketing`} className="ee-tab">Campaign Manager</Link>
        <Link href={`/${slug}/marketing/strategy`} className="ee-tab">Strategy</Link>
        <Link href={`/${slug}/marketing/brand-asset`} className="ee-tab">Brand Asset</Link>
        <Link href={`/${slug}/marketing/seo-cluster`} className="ee-tab">SEO Cluster</Link>
        <Link href={`/${slug}/marketing/geo-tool`} className="ee-tab">GEO Tool</Link>
        <Link href={`/${slug}/marketing/flywheel`} className="ee-tab">Flywheel</Link>
        <Link href={`/${slug}/marketing/page-generator`} className="ee-tab">Page Generator</Link>
        <span className="ee-tab active">Design Test</span>
      </div>

      <div className="mktg-page">
        <div className="mktg-head">
          <div className="mktg-title">
            {company && <span style={{ color: company.color }}>{"\u25A0"}</span>}
            {company?.name || slug} — Design Test
          </div>
          <button
            onClick={() => setFs(true)}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid var(--bd)",
              background: "var(--bg2)",
              color: "var(--fg)",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Apri fullscreen
          </button>
        </div>

        <div
          style={{
            marginTop: 12,
            border: "1px dashed var(--bd)",
            borderRadius: 8,
            minHeight: 420,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--fg3)",
            fontSize: 13,
          }}
        >
          Canvas di test — clicca &ldquo;Apri fullscreen&rdquo; per testare le animazioni
        </div>
      </div>

      {fs && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "#000",
            color: "#fff",
          }}
        >
          <button
            onClick={() => setFs(false)}
            style={{
              position: "fixed",
              top: 12,
              right: 12,
              zIndex: 10000,
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(0,0,0,0.6)",
              color: "#fff",
              fontSize: 11,
              cursor: "pointer",
              backdropFilter: "blur(6px)",
            }}
          >
            Chiudi (Esc)
          </button>

          <div id="design-canvas" style={{ position: "absolute", inset: 0 }}>
            {/* Qui dentro andranno il tunnel + cursor animation */}
          </div>
        </div>
      )}
    </div>
  );
}
