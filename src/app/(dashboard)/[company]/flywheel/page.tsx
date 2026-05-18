"use client";

import { useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getCompany } from "@/lib/companies";
import { useLocalState } from "@/lib/useLocalState";
import { dataVersion } from "@/lib/square-marketing-data";
import {
  FW_SEGS, FW_IR, FW_OR, FW_MR, FW_SR, FW_LR, FW_GAP, FW_SEG_ANGLE, FW_PAD, FW_GDR, FW_SDR,
  FW_GRN, FW_YEL, FW_RED, FW_GRY, FW_MN, FW_PER, FW_PER_LBL,
  fwP, fwArc, fwTA, fwSC, fwSCl, fwGR, fwMom, fwCR, fwDV, fwMDV, fwSMR,
  getMockDataForCompany, fwSortedGoals,
  type FwGoalData, type FwConfigEntry, type FwData, type FwConfig,
} from "@/lib/flywheel";

interface TipData {
  name: string;
  parent: string;
  owner: string;
  func: string;
  real: string;
  forecast: string;
  ratio: number | null;
  status: string;
  realM?: (number | null)[];
  fcM?: (number | null)[];
  isPct: boolean;
  isCur: boolean;
  hasSub: boolean;
  mode: string;
  start?: number | null;
  limInf?: number | null;
  limSup?: number | null;
}

export default function FlywheelOverviewPage() {
  const params = useParams();
  const company = getCompany(params.company as string);
  const slug = params.company as string;
  const mock = getMockDataForCompany(slug);
  const [per, setPer] = useState("q1");
  const [tip, setTip] = useState<TipData | null>(null);
  const [tipPos, setTipPos] = useState({ x: 0, y: 0 });
  const tipRef = useRef<HTMLDivElement>(null);

  const dv = dataVersion(slug);
  const [data] = useLocalState<FwData>(`themap:${slug}:fwData`, () => mock.data, dv);
  const [config] = useLocalState<FwConfig>(`themap:${slug}:fwConfig`, () => mock.config, dv);

  const getCfg = (name: string): FwConfigEntry =>
    config[name] || { mode: "STANDARD" };

  // Momentum
  const mom = fwMom(data, per, config);
  const momColor = fwSC(mom);
  const momTxt = mom !== null ? (mom * 100).toFixed(1) + "%" : "N/D";
  const momNorm = mom !== null ? Math.min(Math.max(mom, 0), 1) * 100 : 0;

  // Tooltip positioning
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

  // Render SVG dots for a goal within a segment
  function renderGoal(
    segKey: string, name: string, gObj: FwGoalData, angle: number, per: string,
  ) {
    const cfg = getCfg(name);
    const ratio = fwGR(gObj, per, cfg);
    const color = fwSC(ratio);
    const sc = fwSCl(ratio);
    const gp = fwP(FW_MR, angle);
    const llp = fwP(FW_LR, angle);
    const ta = fwTA(angle);
    const pctTxt = ratio !== null ? Math.round(ratio * 100).toString() : "\u2014";

    const td: TipData = {
      name, parent: "", owner: gObj.owner, func: segKey,
      real: fwDV(gObj.real, per, gObj.isPercent, gObj.isCurrency),
      forecast: fwDV(gObj.forecast, per, gObj.isPercent, gObj.isCurrency),
      ratio, status: sc,
      realM: gObj.real, fcM: gObj.forecast,
      isPct: gObj.isPercent, isCur: gObj.isCurrency,
      hasSub: Object.keys(gObj.subgoals).length > 0,
      mode: cfg.mode, start: cfg.start, limInf: cfg.limInf, limSup: cfg.limSup,
    };

    const subs = Object.keys(gObj.subgoals);
    const spread = Math.min(9, 24 / Math.max(subs.length, 1));

    return (
      <g key={name}>
        {/* Label */}
        <text x={llp.x} y={llp.y} fill="#c9d1d9" fontSize="8.5" fontWeight="500"
          textAnchor={ta} dominantBaseline="central" opacity="0.85" pointerEvents="none"
          fontFamily="var(--font)">{name}</text>
        {/* Goal dot */}
        <circle cx={gp.x} cy={gp.y} r={FW_GDR} fill={color} filter={`url(#fwg-${sc})`}
          style={{ cursor: "pointer" }}
          onMouseEnter={() => setTip(td)} onMouseMove={handleTipMove}
          onMouseLeave={() => setTip(null)} />
        <text x={gp.x} y={gp.y} fill="#fff" fontSize="11" fontWeight="700"
          textAnchor="middle" dominantBaseline="central" pointerEvents="none"
          fontFamily="var(--font)">{pctTxt}</text>
        {/* Subgoals */}
        {subs.map((sName, si) => {
          const sA = angle + (si - (subs.length - 1) / 2) * spread;
          const sp = fwP(FW_SR, sA);
          const sCfg = getCfg(name);
          const sR = fwCR(gObj.subgoals[sName], per, sCfg.mode, sCfg.start, sCfg.limInf, sCfg.limSup);
          const sCl = fwSC(sR);
          const sSc = fwSCl(sR);
          const lx1 = gp.x + (sp.x - gp.x) * 0.45;
          const ly1 = gp.y + (sp.y - gp.y) * 0.45;

          const sTd: TipData = {
            name: sName, parent: name, owner: gObj.subgoals[sName].owner, func: segKey,
            real: fwDV(gObj.subgoals[sName].real, per, gObj.subgoals[sName].isPercent, gObj.subgoals[sName].isCurrency),
            forecast: fwDV(gObj.subgoals[sName].forecast, per, gObj.subgoals[sName].isPercent, gObj.subgoals[sName].isCurrency),
            ratio: sR, status: sSc,
            realM: gObj.subgoals[sName].real, fcM: gObj.subgoals[sName].forecast,
            isPct: gObj.subgoals[sName].isPercent, isCur: gObj.subgoals[sName].isCurrency,
            hasSub: false,
            mode: sCfg.mode, start: sCfg.start, limInf: sCfg.limInf, limSup: sCfg.limSup,
          };

          return (
            <g key={sName}>
              <line x1={lx1} y1={ly1} x2={sp.x} y2={sp.y} stroke={sCl} strokeWidth="1" strokeOpacity="0.25" pointerEvents="none" />
              <circle cx={sp.x} cy={sp.y} r={FW_SDR} fill={sCl} filter={`url(#fwg-${sSc})`}
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setTip(sTd)} onMouseMove={handleTipMove}
                onMouseLeave={() => setTip(null)} />
            </g>
          );
        })}
      </g>
    );
  }

  // DIREZIONE rendering
  const dirGoals = data.DIREZIONE || {};
  const dirNames = Object.keys(dirGoals);
  const dirSpacing = dirNames.length > 1 ? Math.min(85, (FW_IR * 2 - 60) / (dirNames.length - 1)) : 0;

  // AMMINISTRAZIONE rendering
  const admGoals = data.AMMINISTRAZIONE || {};
  const admNames = Object.keys(admGoals);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Sub-nav */}
      <div className="ee-subnav">
        <span className="ee-tab active">Overview</span>
        <Link href={`/${params.company}/flywheel/setup`} className="ee-tab">Setup</Link>
        <Link href={`/${params.company}/flywheel/real`} className="ee-tab">Consuntivo</Link>
      </div>

      <div className="fw-area">
        {/* Momentum card */}
        <div className="fw-momentum">
          <div className="fw-mom-label">FLYWHEEL MOMENTUM</div>
          <div className="fw-mom-value" style={{ color: momColor }}>{momTxt}</div>
          <div className="fw-mom-period">{FW_PER_LBL[per]}</div>
          <div className="fw-mom-bar-bg">
            <div className="fw-mom-bar" style={{ width: `${momNorm}%`, background: momColor }} />
          </div>
        </div>

        {/* Controls */}
        <div className="fw-controls">
          <div className="fw-period-sel">
            {["q1", "q2", "q3", "q4", "h1", "h2", "ytd", "year"].map((p) => (
              <button key={p} className={`fw-period-btn${per === p ? " act" : ""}`}
                onClick={() => setPer(p)}>
                {p.toUpperCase()}
              </button>
            ))}
          </div>
          <select className="fw-month-sel" value={per.startsWith("m") ? per : ""}
            onChange={(e) => { if (e.target.value) setPer(e.target.value); }}>
            <option value="">Mese</option>
            {FW_MN.map((m, i) => (
              <option key={i} value={`m${i}`}>{m}</option>
            ))}
          </select>
        </div>

        {/* SVG */}
        <div className="fw-wrap">
          <svg viewBox="-500 -500 1000 1000" id="fwSvg" style={{ width: "100%", height: "100%" }}>
            <defs>
              {(["green", "yellow", "red", "grey"] as const).map((n) => {
                const cols = { green: FW_GRN, yellow: FW_YEL, red: FW_RED, grey: FW_GRY };
                return (
                  <filter key={n} id={`fwg-${n}`} x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
                    <feFlood floodColor={cols[n]} floodOpacity="0.6" result="color" />
                    <feComposite in2="blur" operator="in" result="shadow" />
                    <feMerge>
                      <feMergeNode in="shadow" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                );
              })}
            </defs>

            {/* Background ring */}
            <circle cx={0} cy={0} r={(FW_IR + FW_OR) / 2} fill="none" stroke="#21262d"
              strokeWidth={FW_OR - FW_IR} strokeOpacity="0.3" />

            {/* Segments */}
            {FW_SEGS.map((seg, idx) => {
              const a0 = idx * (FW_SEG_ANGLE + FW_GAP);
              const a1 = a0 + FW_SEG_ANGLE;
              const goals = data[seg.key] || {};
              const names = fwSortedGoals(goals);

              // Segment label
              const lA = (a0 + a1) / 2;
              const lp = fwP(FW_IR - 28, lA);

              // Directional arrow between segments
              const cs = fwP(FW_MR, a1 + 2);
              const ce = fwP(FW_MR, a1 + FW_GAP - 2.5);
              const arA = a1 + FW_GAP - 2.5;
              const aP = fwP(FW_MR, arA);
              const aR = (arA * Math.PI) / 180;
              const atx = Math.cos(aR), aty = Math.sin(aR);
              const hl = 10, hw = 4.5;
              const arrowPoints = `${aP.x},${aP.y} ${aP.x - atx * hl + aty * hw},${aP.y - aty * hl - atx * hw} ${aP.x - atx * hl - aty * hw},${aP.y - aty * hl + atx * hw}`;

              return (
                <g key={seg.key}>
                  {/* Segment arc */}
                  <path d={fwArc(FW_IR, FW_OR, a0, a1)} fill={seg.bg} stroke={seg.color}
                    strokeWidth="1" strokeOpacity="0.35" />
                  {/* Segment label */}
                  <text x={lp.x} y={lp.y} fill={seg.color} fontSize="10" fontWeight="700"
                    textAnchor="middle" dominantBaseline="central" letterSpacing="2.5"
                    opacity="0.9" pointerEvents="none" fontFamily="var(--font)">
                    {seg.key}
                  </text>
                  {/* Directional arrow */}
                  <path d={`M${cs.x},${cs.y} A${FW_MR},${FW_MR} 0 0 1 ${ce.x},${ce.y}`}
                    fill="none" stroke="#8b949e" strokeWidth="1.5" opacity="0.35" strokeDasharray="4,3" />
                  <polygon points={arrowPoints} fill="#8b949e" opacity="0.5" />
                  {/* Goals */}
                  {names.map((name, gi) => {
                    let angle: number;
                    if (names.length === 1) angle = (a0 + a1) / 2;
                    else {
                      const es = a0 + FW_PAD, ee = a1 - FW_PAD;
                      angle = es + ((ee - es) * gi) / (names.length - 1);
                    }
                    return renderGoal(seg.key, name, goals[name], angle, per);
                  })}
                </g>
              );
            })}

            {/* Inner ring border */}
            <circle cx={0} cy={0} r={FW_IR} fill="none" stroke="#21262d" strokeWidth="1" opacity="0.3" />

            {/* DIREZIONE (center) */}
            {dirNames.length > 0 && (
              <g>
                <text x={0} y={-60} fill="#f59e0b" fontSize="9" fontWeight="700"
                  textAnchor="middle" dominantBaseline="central" letterSpacing="2.5"
                  opacity="0.9" pointerEvents="none" fontFamily="var(--font)">
                  DIREZIONE
                </text>
                {dirNames.map((name, gi) => {
                  const gObj = dirGoals[name];
                  const cfg = getCfg(name);
                  const gx = (gi - (dirNames.length - 1) / 2) * dirSpacing;
                  const ratio = fwGR(gObj, per, cfg);
                  const color = fwSC(ratio);
                  const sc = fwSCl(ratio);
                  const pctTxt = ratio !== null ? Math.round(ratio * 100).toString() : "\u2014";

                  const td: TipData = {
                    name, parent: "", owner: gObj.owner, func: "DIREZIONE",
                    real: fwDV(gObj.real, per, gObj.isPercent, gObj.isCurrency),
                    forecast: fwDV(gObj.forecast, per, gObj.isPercent, gObj.isCurrency),
                    ratio, status: sc,
                    realM: gObj.real, fcM: gObj.forecast,
                    isPct: gObj.isPercent, isCur: gObj.isCurrency,
                    hasSub: Object.keys(gObj.subgoals).length > 0,
                    mode: cfg.mode, start: cfg.start, limInf: cfg.limInf, limSup: cfg.limSup,
                  };

                  return (
                    <g key={name}>
                      <text x={gx} y={-28} fill="#c9d1d9" fontSize="8" fontWeight="500"
                        textAnchor="middle" dominantBaseline="central" opacity="0.85"
                        pointerEvents="none" fontFamily="var(--font)">{name}</text>
                      <circle cx={gx} cy={0} r={FW_GDR} fill={color} filter={`url(#fwg-${sc})`}
                        style={{ cursor: "pointer" }}
                        onMouseEnter={() => setTip(td)} onMouseMove={handleTipMove}
                        onMouseLeave={() => setTip(null)} />
                      <text x={gx} y={0} fill="#fff" fontSize="11" fontWeight="700"
                        textAnchor="middle" dominantBaseline="central" pointerEvents="none"
                        fontFamily="var(--font)">{pctTxt}</text>
                    </g>
                  );
                })}
              </g>
            )}
          </svg>
        </div>

        {/* AMMINISTRAZIONE box */}
        {admNames.length > 0 && (
          <div className="fw-admin-box" style={{ display: "block" }}>
            <div className="fw-met-header adm">AMMINISTRAZIONE</div>
            {admNames.map((name) => {
              const gObj = admGoals[name];
              const cfg = getCfg(name);
              const ratio = fwGR(gObj, per, cfg);
              const sc = fwSCl(ratio);
              const rt = ratio !== null ? (ratio * 100).toFixed(1) + "%" : "N/D";
              const mi = FW_PER[per];
              return (
                <div key={name}>
                  <div className="fw-met-row">
                    <span className={`fw-met-dot ${sc}`} />
                    <span className="fw-met-name">{name}</span>
                    <span className={`fw-met-perf ${sc}`}>{rt}</span>
                  </div>
                  <div className="fw-met-vals">
                    Real: {fwDV(gObj.real, per, gObj.isPercent, gObj.isCurrency)} | FC: {fwDV(gObj.forecast, per, gObj.isPercent, gObj.isCurrency)}
                  </div>
                  <div className="fw-met-months">
                    {mi.map((m) => {
                      const mr = fwSMR(gObj.real, gObj.forecast, m, cfg.mode, cfg.start, cfg.limInf, cfg.limSup);
                      const mc = fwSCl(mr);
                      return (
                        <div key={m} className="fw-met-m">
                          <span className={`fw-met-md ${mc}`} />
                          {FW_MN[m]} {fwMDV(gObj.real, m, gObj.isPercent, gObj.isCurrency)}/{fwMDV(gObj.forecast, m, gObj.isPercent, gObj.isCurrency)}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Legend */}
        <div className="fw-legend">
          <div className="fw-leg-item"><span className="fw-leg-dot green" /> In target</div>
          <div className="fw-leg-item"><span className="fw-leg-dot yellow" /> Attenzione</div>
          <div className="fw-leg-item"><span className="fw-leg-dot red" /> Critico</div>
          <div className="fw-leg-item"><span className="fw-leg-dot grey" /> N/D</div>
        </div>
      </div>

      {/* Tooltip */}
      {tip && (
        <div ref={tipRef} className="fw-tip"
          style={{ left: tipPos.x, top: tipPos.y }}>
          {tip.parent && <div className="fw-tt-parent">{tip.parent}</div>}
          <div className="fw-tt-name">{tip.name}</div>
          {tip.owner && <div className="fw-tt-owner">Owner: {tip.owner}</div>}
          {!tip.hasSub && (
            <>
              <div className="fw-tt-row"><span>Real</span><span>{tip.real}</span></div>
              <div className="fw-tt-row"><span>Forecast</span><span>{tip.forecast}</span></div>
            </>
          )}
          <div className={`fw-tt-ratio ${tip.status}`}>
            {tip.ratio !== null ? (tip.ratio * 100).toFixed(1) + "%" : "N/D"}
          </div>
          {!tip.hasSub && tip.realM && (
            <div className="fw-tt-months">
              <div className="fw-tt-mt">Dettaglio mensile</div>
              <div className="fw-tt-grid">
                {FW_PER[per].map((m) => {
                  const mr = fwSMR(tip.realM, tip.fcM, m, tip.mode, tip.start, tip.limInf, tip.limSup);
                  const mc = fwSCl(mr);
                  return (
                    <div key={m} className="fw-tt-mi">
                      <span className={`fw-tt-md ${mc}`} />
                      <span>{FW_MN[m]} <span style={{ color: "var(--fg)" }}>
                        {fwMDV(tip.realM, m, tip.isPct, tip.isCur)} / {fwMDV(tip.fcM, m, tip.isPct, tip.isCur)}
                      </span></span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
