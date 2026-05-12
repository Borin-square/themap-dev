"use client";

import { useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getCompany } from "@/lib/companies";
import { fwP, fwArc, fwTA } from "@/lib/flywheel";
import {
  getMockPeople, OG_SEGS, OG_IR, OG_OR, OG_MR, OG_SR, OG_LR,
  OG_GAP, OG_PAD, OG_LDR, OG_MDR, OG_MIN_A,
  peLvlColor, peLvlFilter, peInitials,
  type Persona,
} from "@/lib/people";

interface TipData {
  nome: string;
  funzione: string;
  team: string;
  isLeader: boolean;
}

export default function OrganizationPage() {
  const params = useParams();
  const company = getCompany(params.company as string);
  const people = getMockPeople();
  const [tip, setTip] = useState<TipData | null>(null);
  const [tipPos, setTipPos] = useState({ x: 0, y: 0 });
  const tipRef = useRef<HTMLDivElement>(null);

  const handleTipMove = useCallback((e: React.MouseEvent) => {
    let tx = e.clientX + 14, ty = e.clientY - 10;
    const el = tipRef.current;
    if (el) {
      if (tx + el.offsetWidth > window.innerWidth - 8) tx = e.clientX - el.offsetWidth - 14;
      if (ty + el.offsetHeight > window.innerHeight - 8) ty = e.clientY - el.offsetHeight - 10;
      if (ty < 8) ty = 8;
    }
    setTipPos({ x: tx, y: ty });
  }, []);

  /* Group by function */
  const byFn: Record<string, Persona[]> = {};
  people.forEach((p) => {
    const fn = (p.funzione || "ALTRO").toUpperCase();
    if (!byFn[fn]) byFn[fn] = [];
    byFn[fn].push(p);
  });

  /* Proportional segment angles */
  const segCounts = OG_SEGS.map((s) => (byFn[s.key] || []).length);
  const totPpl = segCounts.reduce((a, b) => a + b, 0);
  const avail = 360 - OG_SEGS.length * OG_GAP;
  let segAngles: number[];
  if (totPpl === 0) {
    segAngles = OG_SEGS.map(() => avail / OG_SEGS.length);
  } else {
    segAngles = segCounts.map((c) => Math.max(OG_MIN_A, (c / totPpl) * avail));
    const sum = segAngles.reduce((a, b) => a + b, 0);
    const sc = avail / sum;
    segAngles = segAngles.map((a) => a * sc);
  }

  const startAngles: number[] = [];
  let curA = 0;
  for (let i = 0; i < OG_SEGS.length; i++) {
    startAngles.push(curA);
    curA += segAngles[i] + OG_GAP;
  }

  /* DIREZIONE */
  const dirPeople = byFn["DIREZIONE"] || [];
  const dirLeader = dirPeople.find((p) => p.leader) || null;
  const dirMembers = dirPeople.filter((p) => !p.leader);

  function dotProps(p: Persona) {
    return {
      onMouseEnter: () => setTip({ nome: p.nome, funzione: p.funzione, team: p.team, isLeader: p.leader }),
      onMouseMove: handleTipMove,
      onMouseLeave: () => setTip(null),
    };
  }

  function renderDot(cx: number, cy: number, r: number, p: Persona, segColor: string) {
    const color = peLvlColor(p.livello);
    const filtId = peLvlFilter(p.funzione, p.livello);
    const showName = p.leader || r >= 20;
    const parts = p.nome.trim().split(/\s+/);
    const l1 = parts[0];
    let l2 = parts.length > 1 ? parts.slice(1).join(" ") : "";
    if (l2.length > 12) l2 = l2.substring(0, 11) + ".";
    const fs1 = r >= 28 ? 10 : r >= 22 ? 9 : 8;
    const fs2 = fs1 - 1;

    return (
      <g key={p.nome}>
        {p.leader && (
          <circle cx={cx} cy={cy} r={r + 3} fill="none" stroke="#f59e0b" strokeWidth={2.5} opacity={0.8} pointerEvents="none" />
        )}
        <circle cx={cx} cy={cy} r={r} fill={color} filter={`url(#${filtId})`}
          style={{ cursor: "pointer" }} {...dotProps(p)} />
        {showName ? (
          <>
            <text x={cx} y={cy - (l2 ? 5 : 0)} fill="#fff" fontSize={fs1} fontWeight={700}
              textAnchor="middle" dominantBaseline="central" pointerEvents="none">{l1}</text>
            {l2 && (
              <text x={cx} y={cy + fs1} fill="#fff" fontSize={fs2} fontWeight={500}
                textAnchor="middle" dominantBaseline="central" pointerEvents="none">{l2}</text>
            )}
          </>
        ) : (
          <text x={cx} y={cy} fill="#fff" fontSize={9} fontWeight={700}
            textAnchor="middle" dominantBaseline="central" pointerEvents="none">
            {peInitials(p.nome)}
          </text>
        )}
      </g>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div className="ee-subnav">
        <Link href={`/${params.company}/people`} className="ee-tab">People</Link>
        <span className="ee-tab active">Organigramma</span>
        <Link href={`/${params.company}/people/rituals`} className="ee-tab">Rituals</Link>
      </div>

      <div className="org-area">
        <div className="org-wrap">
          <svg viewBox="-500 -500 1000 1000" style={{ width: "100%", height: "100%" }}>
            <defs>
              {([
                { n: "senior", c: "#4f8cff" },
                { n: "middle", c: "#9ca3af" },
                { n: "junior", c: "#34d399" },
                { n: "dir", c: "#06b6d4" },
                { n: "amm", c: "#ec4899" },
              ]).map((lv) => (
                <filter key={lv.n} id={`og-${lv.n}`} x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
                  <feFlood floodColor={lv.c} floodOpacity="0.5" result="color" />
                  <feComposite in2="blur" operator="in" result="shadow" />
                  <feMerge>
                    <feMergeNode in="shadow" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              ))}
            </defs>

            {/* Background ring */}
            <circle cx={0} cy={0} r={(OG_IR + OG_OR) / 2} fill="none" stroke="#21262d"
              strokeWidth={OG_OR - OG_IR} strokeOpacity={0.3} />

            {/* Segments */}
            {OG_SEGS.map((seg, idx) => {
              const a0 = startAngles[idx];
              const a1 = a0 + segAngles[idx];
              const segPeople = byFn[seg.key] || [];

              /* Segment label */
              const lA = (a0 + a1) / 2;
              const lp = fwP(OG_IR - 22, lA);

              /* Arrow between segments */
              const cs = fwP(OG_MR, a1 + 2);
              const ce = fwP(OG_MR, a1 + OG_GAP - 2);
              const arA = a1 + OG_GAP - 2;
              const aP = fwP(OG_MR, arA);
              const aR = (arA * Math.PI) / 180;
              const atx = Math.cos(aR), aty = Math.sin(aR);
              const arrowPoints = `${aP.x},${aP.y} ${aP.x - atx * 10 + aty * 4.5},${aP.y - aty * 10 - atx * 4.5} ${aP.x - atx * 10 - aty * 4.5},${aP.y - aty * 10 + atx * 4.5}`;

              /* Group by team */
              const teams: Record<string, { leader: Persona | null; members: Persona[] }> = {};
              segPeople.forEach((p) => {
                const t = p.team || seg.key;
                if (!teams[t]) teams[t] = { leader: null, members: [] };
                if (p.leader) teams[t].leader = p;
                else teams[t].members.push(p);
              });
              const teamNames = Object.keys(teams);

              return (
                <g key={seg.key}>
                  {/* Arc */}
                  <path d={fwArc(OG_IR, OG_OR, a0, a1)} fill={seg.bg} stroke={seg.color}
                    strokeWidth={1} strokeOpacity={0.35} />
                  {/* Label */}
                  <text x={lp.x} y={lp.y} fill={seg.color} fontSize={13} fontWeight={700}
                    textAnchor="middle" dominantBaseline="central" letterSpacing={2.5}
                    opacity={0.9} pointerEvents="none">{seg.key}</text>
                  {/* Arrow */}
                  <path d={`M${cs.x},${cs.y} A${OG_MR},${OG_MR} 0 0 1 ${ce.x},${ce.y}`}
                    fill="none" stroke="#8b949e" strokeWidth={1.5} opacity={0.35} strokeDasharray="4,3" />
                  <polygon points={arrowPoints} fill="#8b949e" opacity={0.5} />

                  {/* Teams */}
                  {teamNames.map((tName, ti) => {
                    const team = teams[tName];
                    let angle: number;
                    if (teamNames.length === 1) angle = (a0 + a1) / 2;
                    else {
                      const es = a0 + OG_PAD, ee = a1 - OG_PAD;
                      angle = es + ((ee - es) * ti) / (teamNames.length - 1);
                    }

                    const gp = fwP(OG_MR, angle);
                    const llp = fwP(OG_LR, angle);
                    const ta = fwTA(angle);

                    const mems = team.members;
                    const spread = Math.min(10, 28 / Math.max(mems.length, 1));

                    return (
                      <g key={tName}>
                        {/* Team label */}
                        <text x={llp.x} y={llp.y} fill="#c9d1d9" fontSize={11} fontWeight={600}
                          textAnchor={ta} dominantBaseline="central" opacity={0.85}
                          pointerEvents="none">{tName}</text>

                        {/* Leader dot or placeholder */}
                        {team.leader ? renderDot(gp.x, gp.y, OG_LDR, team.leader, seg.color) : (
                          <>
                            <circle cx={gp.x} cy={gp.y} r={OG_LDR} fill={seg.color} opacity={0.15} pointerEvents="none" />
                            <text x={gp.x} y={gp.y} fill={seg.color} fontSize={9} fontWeight={600}
                              textAnchor="middle" dominantBaseline="central" pointerEvents="none" opacity={0.4}>
                              {tName.substring(0, 3).toUpperCase()}
                            </text>
                          </>
                        )}

                        {/* Member satellites */}
                        {mems.map((m, mi) => {
                          const sA = angle + (mi - (mems.length - 1) / 2) * spread;
                          const sp = fwP(OG_SR, sA);
                          const lx = gp.x + (sp.x - gp.x) * 0.45;
                          const ly = gp.y + (sp.y - gp.y) * 0.45;
                          return (
                            <g key={m.nome}>
                              <line x1={lx} y1={ly} x2={sp.x} y2={sp.y}
                                stroke={seg.color} strokeWidth={1} strokeOpacity={0.2} pointerEvents="none" />
                              {renderDot(sp.x, sp.y, OG_MDR, m, seg.color)}
                            </g>
                          );
                        })}
                      </g>
                    );
                  })}
                </g>
              );
            })}

            {/* Inner ring */}
            <circle cx={0} cy={0} r={OG_IR} fill="none" stroke="#21262d" strokeWidth={1} opacity={0.3} />

            {/* DIREZIONE center */}
            {dirPeople.length > 0 && (
              <g>
                <text x={0} y={-70} fill="#06b6d4" fontSize={9} fontWeight={700}
                  textAnchor="middle" dominantBaseline="central" letterSpacing={2.5}
                  opacity={0.9} pointerEvents="none">DIREZIONE</text>

                {dirLeader && renderDot(0, -20, 28, dirLeader, "#06b6d4")}
                {dirLeader && dirMembers.length > 0 && (() => {
                  const sp = dirMembers.length > 1
                    ? Math.min(65, (OG_IR * 1.4) / (dirMembers.length - 1))
                    : 0;
                  return dirMembers.map((p, i) => {
                    const px = (i - (dirMembers.length - 1) / 2) * sp;
                    return renderDot(px, 40, 20, p, "#06b6d4");
                  });
                })()}
                {!dirLeader && dirPeople.map((p, i) => {
                  const sp = dirPeople.length > 1
                    ? Math.min(70, (OG_IR * 1.5) / (dirPeople.length - 1))
                    : 0;
                  const px = (i - (dirPeople.length - 1) / 2) * sp;
                  return renderDot(px, 0, 22, p, "#06b6d4");
                })}
              </g>
            )}
          </svg>
        </div>
      </div>

      {/* Tooltip */}
      {tip && (
        <div ref={tipRef} className="fw-tip" style={{ left: tipPos.x, top: tipPos.y }}>
          <div className="fw-tt-name">{tip.nome}</div>
          <div style={{ fontSize: 11, color: "var(--fg2)" }}>
            {tip.funzione}{tip.team && tip.team !== tip.funzione && <> &middot; {tip.team}</>}
          </div>
          {tip.isLeader && (
            <div style={{ fontSize: 10, color: "#f59e0b", marginTop: 2 }}>{"\u2605"} Leader</div>
          )}
        </div>
      )}
    </div>
  );
}
