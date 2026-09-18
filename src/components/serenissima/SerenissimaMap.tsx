"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  type CompanyMap,
  type ResolvedSnapshot,
  type AggregatedRoute,
  activityLevel,
  confidenceClarity,
  expandabilityRadius,
  headcountToRadius,
  revenuePerPerson,
  routeWidth,
} from "@/lib/serenissima";
import {
  WORLD_W,
  WORLD_H,
  strategicToWorld,
  islandPath,
  generateCityBuildings,
  generateIslets,
  generateMountains,
  curvedPath,
} from "@/lib/serenissima-svg";

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

const PORTFOLIO_COLORS: Record<string, { fill: string; stroke: string }> = {
  portfolio:  { fill: "#c8a24b", stroke: "#8a6a20" },
  evaluating: { fill: "#7a94a8", stroke: "#3d5568" },
  incubating: { fill: "#b56a4a", stroke: "#7a3a1e" },
  exited:     { fill: "#8b7a6b", stroke: "#4a3e34" },
  archived:   { fill: "#6b6b6b", stroke: "#333" },
};

export default function SerenissimaMap({
  companies, snapshots, routes, selectedSlug, onSelect, view,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [transform, setTransform] = useState<Transform>(IDENTITY);
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const [hoverSlug, setHoverSlug] = useState<string | null>(null);

  // ============================================================
  // Precomputa mondi / città
  // ============================================================
  const geo = useMemo(() => {
    const items = companies.map((c) => {
      const w = strategicToWorld(c.position_x, c.position_y);
      const snap = snapshots.get(c.company_slug);
      const cityR = headcountToRadius(snap?.headcount ?? null);
      const rpp = revenuePerPerson(snap?.revenue ?? null, snap?.headcount ?? null);
      const activity = activityLevel(rpp);
      const potentialR = expandabilityRadius(c.expandability_score, cityR);
      const potentialAlpha = confidenceClarity(c.confidence_score);
      return {
        company: c,
        snap,
        wx: w.x, wy: w.y,
        cityR,
        activity,
        potentialR,
        potentialAlpha,
        buildings: generateCityBuildings(c.city_seed, w.x, w.y, cityR),
        mountains: generateMountains(c.city_seed, w.x, w.y, cityR * 1.4),
        islandPath: islandPath(c.city_seed, w.x, w.y, cityR * 1.6 + 18, 28),
      };
    });
    const exclusions = items.map((it) => ({ cx: it.wx, cy: it.wy, r: it.cityR * 1.8 + it.potentialR * 0.5 }));
    const islets = generateIslets("serenissima-v1", WORLD_W, WORLD_H, exclusions, 40);
    return { items, islets };
  }, [companies, snapshots]);

  const maxWonRevenue = useMemo(
    () => routes.reduce((m, r) => Math.max(m, r.won_revenue), 0),
    [routes]
  );

  // Route filtrate/subordinate: quando c'è selezione, mostra solo IN/OUT della selezionata.
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
      // Zoom verso il puntatore
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
    // Se l'utente clicca su una città, quello handler ferma la propagazione.
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

  // Prevent default on wheel to disable page scroll
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handler = (e: WheelEvent) => { e.preventDefault(); };
    svg.addEventListener("wheel", handler, { passive: false });
    return () => svg.removeEventListener("wheel", handler);
  }, []);

  // Auto-zoom sulla città selezionata
  useEffect(() => {
    if (!selectedSlug) return;
    const it = geo.items.find((i) => i.company.company_slug === selectedSlug);
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
  }, [selectedSlug, geo.items]);

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
          <radialGradient id="seaGradient" cx="50%" cy="45%" r="70%">
            <stop offset="0%" stopColor="#2a6b8f" />
            <stop offset="60%" stopColor="#1d4d68" />
            <stop offset="100%" stopColor="#123449" />
          </radialGradient>
          <linearGradient id="landGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#efe0bd" />
            <stop offset="100%" stopColor="#d9c393" />
          </linearGradient>
          <linearGradient id="landShadow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(80,50,0,0.28)" />
          </linearGradient>
          <pattern id="parchmentNoise" width="6" height="6" patternUnits="userSpaceOnUse">
            <rect width="6" height="6" fill="url(#landGradient)" />
            <circle cx="1" cy="2" r="0.4" fill="rgba(120,80,20,0.05)" />
            <circle cx="4" cy="5" r="0.3" fill="rgba(120,80,20,0.04)" />
          </pattern>
          <filter id="cityShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="1.2" floodColor="#000" floodOpacity="0.35" />
          </filter>
          <filter id="selectGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feFlood floodColor="#f2c14e" floodOpacity="0.9" />
            <feComposite in2="blur" operator="in" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Sea background — sempre a viewBox pieno, indipendente dal transform */}
        <rect x="0" y="0" width={WORLD_W} height={WORLD_H} fill="url(#seaGradient)" />

        <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}>
          {/* Islets decorativi */}
          {geo.islets.map((isl) => (
            <g key={`islet-${isl.seed}`} opacity={0.85}>
              <path d={islandPath(isl.seed, isl.cx, isl.cy, isl.r, 14)} fill="url(#parchmentNoise)" />
              <path d={islandPath(isl.seed, isl.cx, isl.cy, isl.r, 14)} fill="url(#landShadow)" />
            </g>
          ))}

          {/* Potential territories (dietro alle isole) */}
          {geo.items.map((it) => it.potentialR > 0 && (
            <circle
              key={`pot-${it.company.company_slug}`}
              cx={it.wx}
              cy={it.wy}
              r={it.potentialR}
              fill="#8f5a3a"
              opacity={selectedSlug === null || selectedSlug === it.company.company_slug ? it.potentialAlpha : it.potentialAlpha * 0.15}
              style={{ mixBlendMode: "multiply", transition: "opacity 400ms ease" }}
            />
          ))}

          {/* Isole delle città */}
          {geo.items.map((it) => {
            const sel = selectedSlug === it.company.company_slug;
            const dimmed = selectedSlug !== null && !sel;
            return (
              <g
                key={`island-${it.company.company_slug}`}
                opacity={dimmed ? 0.55 : 1}
                style={{ transition: "opacity 400ms ease" }}
              >
                <path d={it.islandPath} fill="url(#parchmentNoise)" />
                <path d={it.islandPath} fill="url(#landShadow)" opacity={0.6} />
                {/* Boundary tratteggiata per portfolio_status 'evaluating' */}
                {it.company.portfolio_status === "evaluating" && (
                  <path
                    d={it.islandPath}
                    fill="none"
                    stroke={PORTFOLIO_COLORS.evaluating.stroke}
                    strokeWidth={1.4}
                    strokeDasharray="4 3"
                    opacity={0.8}
                  />
                )}
              </g>
            );
          })}

          {/* Cross-sell routes */}
          {routes.map((r) => {
            const vis = routeVisibility(r);
            const src = geo.items.find((i) => i.company.company_slug === r.source_slug);
            const dst = geo.items.find((i) => i.company.company_slug === r.dest_slug);
            if (!src || !dst) return null;
            const opacity = vis === "active" ? 0.9 : vis === "muted" ? 0.18 : 0;
            const stroke = "#c1443a";
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
                  stroke={stroke}
                  strokeWidth={w}
                  strokeDasharray={isDotted ? "6 6" : undefined}
                  strokeLinecap="round"
                  markerEnd={`url(#arrow-${vis === "active" ? "a" : "m"})`}
                />
              </g>
            );
          })}
          <defs>
            <marker id="arrow-a" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 Z" fill="#c1443a" />
            </marker>
            <marker id="arrow-m" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 Z" fill="#c1443a" opacity={0.4} />
            </marker>
          </defs>

          {/* Città (buildings + mountains + emblem) */}
          {geo.items.map((it) => {
            const sel = selectedSlug === it.company.company_slug;
            const hov = hoverSlug === it.company.company_slug;
            const dimmed = selectedSlug !== null && !sel;
            const buildingAlpha = 0.85 + it.activity * 0.15;
            const pc = PORTFOLIO_COLORS[it.company.portfolio_status] || PORTFOLIO_COLORS.portfolio;
            const initial = (it.company.name || "?").trim().charAt(0).toUpperCase();
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
                {/* Mountains dietro ai building */}
                {it.mountains.map((m, i) => (
                  <path
                    key={`m-${i}`}
                    d={`M ${m.x - m.w / 2} ${m.y} L ${m.x} ${m.y - m.h} L ${m.x + m.w / 2} ${m.y} Z`}
                    fill="#a89476"
                    stroke="#6b5940"
                    strokeWidth={0.5}
                    opacity={0.85}
                  />
                ))}
                {/* Buildings */}
                <g filter="url(#cityShadow)">
                  {it.buildings.map((b, i) => {
                    const tone = 0.85 + b.tone * 0.15;
                    const wallFill = `rgb(${240 * tone}, ${228 * tone}, ${200 * tone})`;
                    const roofFill = it.company.color || "#c1443a";
                    return (
                      <g key={`b-${i}`} opacity={buildingAlpha}>
                        <rect x={b.x - b.w / 2} y={b.y - b.h / 2} width={b.w} height={b.h} fill={wallFill} stroke="#8a7250" strokeWidth={0.4} />
                        {b.roof === "gable" && (
                          <path d={`M ${b.x - b.w / 2 - 1} ${b.y - b.h / 2} L ${b.x} ${b.y - b.h / 2 - b.w * 0.55} L ${b.x + b.w / 2 + 1} ${b.y - b.h / 2} Z`} fill={roofFill} stroke="#5a2620" strokeWidth={0.4} />
                        )}
                        {b.roof === "flat" && (
                          <rect x={b.x - b.w / 2 - 1} y={b.y - b.h / 2 - 2} width={b.w + 2} height={2.5} fill={roofFill} stroke="#5a2620" strokeWidth={0.4} />
                        )}
                        {b.roof === "spire" && (
                          <>
                            <path d={`M ${b.x - b.w / 2 - 1} ${b.y - b.h / 2} L ${b.x} ${b.y - b.h / 2 - b.w * 0.8} L ${b.x + b.w / 2 + 1} ${b.y - b.h / 2} Z`} fill={roofFill} stroke="#5a2620" strokeWidth={0.4} />
                            <line x1={b.x} y1={b.y - b.h / 2 - b.w * 0.8} x2={b.x} y2={b.y - b.h / 2 - b.w * 0.8 - 4} stroke="#5a2620" strokeWidth={0.6} />
                          </>
                        )}
                      </g>
                    );
                  })}
                </g>

                {/* Emblem badge esagonale sopra la città */}
                <g transform={`translate(${it.wx} ${it.wy - it.cityR - 24})`}>
                  <path
                    d="M 0 -14 L 12 -7 L 12 7 L 0 14 L -12 7 L -12 -7 Z"
                    fill={pc.fill}
                    stroke={pc.stroke}
                    strokeWidth={1.4}
                  />
                  <text
                    x="0" y="0"
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize="12"
                    fontWeight={700}
                    fill="#fff"
                    style={{ letterSpacing: 0.5 }}
                  >{initial}</text>
                </g>

                {/* Tooltip nome su hover / selezione */}
                {(hov || sel) && (
                  <g transform={`translate(${it.wx} ${it.wy + it.cityR + 22})`}>
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
            </g>
          )}
        </g>
      </svg>

      {/* Reset button */}
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
