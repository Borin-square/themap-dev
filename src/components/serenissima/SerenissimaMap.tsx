"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  type CompanyMap,
  type ResolvedSnapshot,
  type AggregatedRoute,
  type PortfolioStatus,
  confidenceClarity,
  expandabilityRadius,
  headcountToRadius,
  effectiveRenderCoords,
  routeWidth,
} from "@/lib/serenissima";
import { WORLD_W, WORLD_H, curvedPath } from "@/lib/serenissima-svg";

interface Props {
  companies: CompanyMap[];
  snapshots: Map<string, ResolvedSnapshot>;
  routes: AggregatedRoute[];
  selectedSlug: string | null;
  onSelect: (slug: string | null) => void;
  view: "world" | "strategic";
}

interface Transform { x: number; y: number; k: number }
const IDENTITY: Transform = { x: 0, y: 0, k: 1 };

// Path degli asset. L'utente può salvare la base map come .webp/.png/.svg —
// il renderer tenta gli formati in ordine e usa il primo disponibile.
const BASE_MAP_CANDIDATES = [
  "/serenissima/base-map.webp",
  "/serenissima/base-map.avif",
  "/serenissima/base-map.png",
  "/serenissima/base-map.jpg",
  "/serenissima/base-map.svg",
];
const cityAssetUrl = (variant: string) => `/serenissima/cities/${variant}.svg`;

const PORTFOLIO_COLORS: Record<PortfolioStatus, { fill: string; stroke: string }> = {
  portfolio:  { fill: "#c8a24b", stroke: "#8a6a20" },
  evaluating: { fill: "#7a94a8", stroke: "#3d5568" },
  incubating: { fill: "#b56a4a", stroke: "#7a3a1e" },
  exited:     { fill: "#8b7a6b", stroke: "#4a3e34" },
  archived:   { fill: "#6b6b6b", stroke: "#333" },
};

/** Traduzione coord normalizzata (0..1) → coord world (viewport dell'illustration). */
function normToWorld(nx: number, ny: number): { x: number; y: number } {
  return { x: nx * WORLD_W, y: ny * WORLD_H };
}

export default function SerenissimaMap({
  companies, snapshots, routes, selectedSlug, onSelect, view,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [transform, setTransform] = useState<Transform>(IDENTITY);
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const [hoverSlug, setHoverSlug] = useState<string | null>(null);
  const [baseMapUrl, setBaseMapUrl] = useState<string>(BASE_MAP_CANDIDATES[BASE_MAP_CANDIDATES.length - 1]);

  // Prova i candidati in ordine e sceglie il primo disponibile
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const url of BASE_MAP_CANDIDATES) {
        try {
          const res = await fetch(url, { method: "HEAD" });
          if (res.ok) {
            if (!cancelled) setBaseMapUrl(url);
            return;
          }
        } catch { /* try next */ }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ============================================================
  // Precomputa coord città + territori
  // ============================================================
  const geo = useMemo(() => {
    return companies.map((c) => {
      const coords = effectiveRenderCoords(c);
      const w = normToWorld(coords.x, coords.y);
      const snap = snapshots.get(c.company_slug);
      const cityR = headcountToRadius(snap?.headcount ?? null);
      const potentialR = expandabilityRadius(c.expandability_score, cityR);
      const potentialAlpha = confidenceClarity(c.confidence_score);
      const variant = c.asset_variant || c.portfolio_status;
      return {
        company: c,
        snap,
        wx: w.x,
        wy: w.y,
        cityR,
        potentialR,
        potentialAlpha,
        assetUrl: cityAssetUrl(variant),
      };
    });
  }, [companies, snapshots]);

  const maxWonRevenue = useMemo(
    () => routes.reduce((m, r) => Math.max(m, r.won_revenue), 0),
    [routes]
  );

  const routeVisibility = useCallback((r: AggregatedRoute): "hidden" | "active" | "muted" => {
    if (!selectedSlug) return "muted";
    if (r.source_slug === selectedSlug || r.dest_slug === selectedSlug) return "active";
    return "hidden";
  }, [selectedSlug]);

  // ============================================================
  // PAN / ZOOM
  // ============================================================
  const wheelHandler = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const delta = -e.deltaY;
    const scaleFactor = Math.exp(delta * 0.0015);
    setTransform((t) => {
      const newK = Math.max(0.4, Math.min(6, t.k * scaleFactor));
      const kk = newK / t.k;
      return {
        k: newK,
        x: mx - (mx - t.x) * kk,
        y: my - (my - t.y) * kk,
      };
    });
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const target = e.target as SVGElement;
    if (target.closest("[data-city]")) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, tx: transform.x, ty: transform.y };
  }, [transform.x, transform.y]);

  const onPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    setTransform((t) => ({ ...t, x: dragRef.current!.tx + dx, y: dragRef.current!.ty + dy }));
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (dragRef.current) {
      try { (e.target as Element).releasePointerCapture(e.pointerId); } catch {}
      dragRef.current = null;
    }
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handler = (e: WheelEvent) => { e.preventDefault(); };
    svg.addEventListener("wheel", handler, { passive: false });
    return () => svg.removeEventListener("wheel", handler);
  }, []);

  useEffect(() => {
    if (!selectedSlug) return;
    const it = geo.find((i) => i.company.company_slug === selectedSlug);
    if (!it) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const targetK = 2.0;
    setTransform({
      k: targetK,
      x: rect.width / 2 - it.wx * targetK,
      y: rect.height / 2 - it.wy * targetK,
    });
  }, [selectedSlug, geo]);

  const resetView = useCallback(() => setTransform(IDENTITY), []);

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#0d1117" }}>
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={`0 0 ${WORLD_W} ${WORLD_H}`}
        preserveAspectRatio="xMidYMid slice"
        onWheel={wheelHandler}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ cursor: dragRef.current ? "grabbing" : "grab", userSelect: "none", touchAction: "none" }}
        role="application"
        aria-label="Mappa dell'ecosistema Serenissima"
      >
        <defs>
          <filter id="selectGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feFlood floodColor="#f2c14e" floodOpacity="0.95" />
            <feComposite in2="blur" operator="in" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="fog" cx="50%" cy="50%" r="50%">
            <stop offset="60%" stopColor="rgba(13,17,23,0)" />
            <stop offset="100%" stopColor="rgba(13,17,23,0.55)" />
          </radialGradient>
          <marker id="arrow-a" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 Z" fill="#c1443a" />
          </marker>
          <marker id="arrow-m" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 Z" fill="#c1443a" opacity="0.4" />
          </marker>
        </defs>

        {/* Fallback sea colour under base map (visibile solo se asset ha alpha) */}
        <rect x="0" y="0" width={WORLD_W} height={WORLD_H} fill="#1d4d68" />

        <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}>
          {/* Base map illustrata (asset replaceable) */}
          <image
            href={baseMapUrl}
            x="0" y="0"
            width={WORLD_W} height={WORLD_H}
            preserveAspectRatio="xMidYMid slice"
          />

          {/* Fog on unselected areas quando c'è selezione */}
          {selectedSlug && (
            <rect x="0" y="0" width={WORLD_W} height={WORLD_H} fill="url(#fog)" pointerEvents="none" />
          )}

          {/* Potential territories */}
          {geo.map((it) => it.potentialR > 0 && (
            <circle
              key={`pot-${it.company.company_slug}`}
              cx={it.wx}
              cy={it.wy}
              r={it.potentialR}
              fill="#8f5a3a"
              opacity={selectedSlug === null || selectedSlug === it.company.company_slug ? it.potentialAlpha : it.potentialAlpha * 0.15}
              style={{ mixBlendMode: "multiply", transition: "opacity 400ms ease" }}
              pointerEvents="none"
            />
          ))}

          {/* Cross-sell routes */}
          {routes.map((r) => {
            const vis = routeVisibility(r);
            const src = geo.find((i) => i.company.company_slug === r.source_slug);
            const dst = geo.find((i) => i.company.company_slug === r.dest_slug);
            if (!src || !dst) return null;
            const opacity = vis === "active" ? 0.9 : vis === "muted" ? 0.18 : 0;
            const w = routeWidth(r.won_revenue, maxWonRevenue);
            const isDotted = r.won_revenue <= 0 && r.open_pipeline > 0;
            return (
              <g
                key={`route-${r.source_slug}-${r.dest_slug}`}
                opacity={opacity}
                style={{ transition: "opacity 400ms ease", pointerEvents: vis === "active" ? "auto" : "none" }}
              >
                <path
                  d={curvedPath(src.wx, src.wy, dst.wx, dst.wy, 0.22)}
                  fill="none"
                  stroke="#c1443a"
                  strokeWidth={w}
                  strokeDasharray={isDotted ? "6 6" : undefined}
                  strokeLinecap="round"
                  markerEnd={`url(#arrow-${vis === "active" ? "a" : "m"})`}
                />
              </g>
            );
          })}

          {/* Città come asset illustrati + emblem procedurale */}
          {geo.map((it) => {
            const sel = selectedSlug === it.company.company_slug;
            const hov = hoverSlug === it.company.company_slug;
            const dimmed = selectedSlug !== null && !sel;
            const pc = PORTFOLIO_COLORS[it.company.portfolio_status] || PORTFOLIO_COLORS.portfolio;
            const initial = (it.company.name || "?").trim().charAt(0).toUpperCase();
            // Dimensione asset proporzionale al headcount (footprint).
            const assetSize = Math.max(80, it.cityR * 3.2);
            return (
              <g
                key={`city-${it.company.company_slug}`}
                data-city={it.company.company_slug}
                onClick={(e) => { e.stopPropagation(); onSelect(sel ? null : it.company.company_slug); }}
                onPointerEnter={() => setHoverSlug(it.company.company_slug)}
                onPointerLeave={() => setHoverSlug((h) => h === it.company.company_slug ? null : h)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(sel ? null : it.company.company_slug); } }}
                tabIndex={0}
                role="button"
                aria-label={`${it.company.name}${it.snap?.headcount ? ` — ${it.snap.headcount} persone` : ""}`}
                style={{ cursor: "pointer", outline: "none", opacity: dimmed ? 0.5 : 1, transition: "opacity 400ms ease" }}
                filter={sel ? "url(#selectGlow)" : undefined}
              >
                {/* Asset illustrato della città */}
                <image
                  href={it.assetUrl}
                  x={it.wx - assetSize / 2}
                  y={it.wy - assetSize / 2}
                  width={assetSize}
                  height={assetSize}
                  preserveAspectRatio="xMidYMid meet"
                  pointerEvents="none"
                />

                {/* Hitbox invisibile per interazione affidabile */}
                <circle cx={it.wx} cy={it.wy} r={assetSize / 2.5} fill="transparent" />

                {/* Emblem badge esagonale */}
                <g transform={`translate(${it.wx} ${it.wy - assetSize / 2 - 16})`}>
                  <path
                    d="M 0 -14 L 12 -7 L 12 7 L 0 14 L -12 7 L -12 -7 Z"
                    fill={pc.fill}
                    stroke={pc.stroke}
                    strokeWidth={1.4}
                  />
                  <text x="0" y="0" textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight={700} fill="#fff" style={{ letterSpacing: 0.5 }}>{initial}</text>
                </g>

                {(hov || sel) && (
                  <g transform={`translate(${it.wx} ${it.wy + assetSize / 2 + 16})`} pointerEvents="none">
                    <rect x={-60} y={-10} width={120} height={20} rx={4} fill="rgba(20,15,10,0.85)" />
                    <text x="0" y="0" textAnchor="middle" dominantBaseline="central" fontSize="10" fill="#f4e8d0" fontWeight={600} style={{ letterSpacing: 0.5 }}>
                      {it.company.name.toUpperCase()}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Strategic axes overlay */}
          {view === "strategic" && (
            <g pointerEvents="none">
              <line x1={WORLD_W / 2} y1={40} x2={WORLD_W / 2} y2={WORLD_H - 40} stroke="#f2c14e" strokeWidth={1} strokeDasharray="4 6" opacity={0.6} />
              <line x1={40} y1={WORLD_H / 2} x2={WORLD_W - 40} y2={WORLD_H / 2} stroke="#f2c14e" strokeWidth={1} strokeDasharray="4 6" opacity={0.6} />
              <text x={WORLD_W - 60} y={WORLD_H / 2 - 10} fontSize={14} fill="#f2c14e" textAnchor="end" fontWeight={600} style={{ letterSpacing: 3 }}>PRODOTTI →</text>
              <text x={60} y={WORLD_H / 2 - 10} fontSize={14} fill="#f2c14e" fontWeight={600} style={{ letterSpacing: 3 }}>← SERVIZI</text>
              <text x={WORLD_W / 2 + 12} y={60} fontSize={14} fill="#f2c14e" fontWeight={600} style={{ letterSpacing: 3 }}>↑ COMMUNITY</text>
              <text x={WORLD_W / 2 + 12} y={WORLD_H - 46} fontSize={14} fill="#f2c14e" fontWeight={600} style={{ letterSpacing: 3 }}>↓ B2B</text>
              {/* Punto strategico "reale" per ogni azienda (visibile solo in Strategica) */}
              {companies.map((c) => {
                const w = normToWorld(c.strategic_x, c.strategic_y);
                return (
                  <g key={`sp-${c.company_slug}`}>
                    <circle cx={w.x} cy={w.y} r={5} fill="#f2c14e" opacity={0.9} />
                    <text x={w.x + 8} y={w.y - 6} fontSize={10} fill="#f2c14e" fontWeight={600}>{c.name}</text>
                  </g>
                );
              })}
            </g>
          )}
        </g>
      </svg>

      <button
        onClick={resetView}
        style={{
          position: "absolute", bottom: 16, right: 16,
          padding: "6px 12px", background: "rgba(20,15,10,0.85)", color: "#f4e8d0",
          border: "1px solid rgba(242,193,78,0.5)", borderRadius: 6, cursor: "pointer",
          fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 600,
        }}
        aria-label="Reset vista mappa"
      >Reset</button>
    </div>
  );
}
