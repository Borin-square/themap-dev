"use client";

import {
  FW_SEGS, FW_IR, FW_OR, FW_MR, FW_SR, FW_LR, FW_GAP, FW_SEG_ANGLE, FW_PAD, FW_GDR, FW_SDR,
  FW_GRN, FW_YEL, FW_RED, FW_GRY,
  fwP, fwArc, fwTA, fwSC, fwSCl, fwGR, fwCR, fwSortedGoals,
  type FwGoalData, type FwConfigEntry, type FwData, type FwConfig,
} from "@/lib/flywheel";

interface Props {
  data: FwData;
  config: FwConfig;
  per: string;
  showAdminBox?: boolean;
  glowIdSuffix?: string;
}

/**
 * Read-only render del flywheel identico a /flywheel (strategy).
 * Nessun tooltip, nessuna interazione. Scala automaticamente al container.
 * Il glowIdSuffix serve per rendere i filter id unici quando si renderizzano piu' flywheel nella stessa pagina.
 */
export function FlywheelSVG({ data, config, per, showAdminBox = true, glowIdSuffix = "" }: Props) {
  const getCfg = (name: string): FwConfigEntry => config[name] || { mode: "STANDARD" };
  const suffix = glowIdSuffix ? `-${glowIdSuffix}` : "";
  const glowId = (n: string) => `fwg-${n}${suffix}`;

  const dirGoals = data.DIREZIONE || {};
  const dirNames = Object.keys(dirGoals);
  const dirSpacing = dirNames.length > 1 ? Math.min(85, (FW_IR * 2 - 60) / (dirNames.length - 1)) : 0;

  const admGoals = data.AMMINISTRAZIONE || {};
  const admNames = Object.keys(admGoals);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div className="fw-wrap">
        <svg viewBox="-500 -500 1000 1000" style={{ width: "100%", height: "100%" }}>
          <defs>
            {(["green", "yellow", "red", "grey"] as const).map((n) => {
              const cols = { green: FW_GRN, yellow: FW_YEL, red: FW_RED, grey: FW_GRY };
              return (
                <filter key={n} id={glowId(n)} x="-50%" y="-50%" width="200%" height="200%">
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

          <circle cx={0} cy={0} r={(FW_IR + FW_OR) / 2} fill="none" stroke="#21262d"
            strokeWidth={FW_OR - FW_IR} strokeOpacity="0.3" />

          {FW_SEGS.map((seg, idx) => {
            const a0 = idx * (FW_SEG_ANGLE + FW_GAP);
            const a1 = a0 + FW_SEG_ANGLE;
            const goals = data[seg.key] || {};
            const names = fwSortedGoals(goals);

            const lA = (a0 + a1) / 2;
            const lp = fwP(FW_IR - 28, lA);

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
                <path d={fwArc(FW_IR, FW_OR, a0, a1)} fill={seg.bg} stroke={seg.color}
                  strokeWidth="1" strokeOpacity="0.35" />
                <text x={lp.x} y={lp.y} fill={seg.color} fontSize="10" fontWeight="700"
                  textAnchor="middle" dominantBaseline="central" letterSpacing="2.5"
                  opacity="0.9" pointerEvents="none" fontFamily="var(--font)">
                  {seg.key}
                </text>
                <path d={`M${cs.x},${cs.y} A${FW_MR},${FW_MR} 0 0 1 ${ce.x},${ce.y}`}
                  fill="none" stroke="#8b949e" strokeWidth="1.5" opacity="0.35" strokeDasharray="4,3" />
                <polygon points={arrowPoints} fill="#8b949e" opacity="0.5" />
                {names.map((name, gi) => {
                  let angle: number;
                  if (names.length === 1) angle = (a0 + a1) / 2;
                  else {
                    const es = a0 + FW_PAD, ee = a1 - FW_PAD;
                    angle = es + ((ee - es) * gi) / (names.length - 1);
                  }
                  return renderGoal(seg.key, name, goals[name], angle, per, getCfg, glowId);
                })}
              </g>
            );
          })}

          <circle cx={0} cy={0} r={FW_IR} fill="none" stroke="#21262d" strokeWidth="1" opacity="0.3" />

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

                return (
                  <g key={name}>
                    <text x={gx} y={-28} fill="#c9d1d9" fontSize="8" fontWeight="500"
                      textAnchor="middle" dominantBaseline="central" opacity="0.85"
                      pointerEvents="none" fontFamily="var(--font)">{name}</text>
                    <circle cx={gx} cy={0} r={FW_GDR} fill={color} filter={`url(#${glowId(sc)})`} />
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

      {showAdminBox && admNames.length > 0 && (
        <div className="fw-admin-box" style={{ display: "block" }}>
          <div className="fw-met-header adm">AMMINISTRAZIONE</div>
          {admNames.map((name) => {
            const gObj = admGoals[name];
            const cfg = getCfg(name);
            const ratio = fwGR(gObj, per, cfg);
            const sc = fwSCl(ratio);
            const rt = ratio !== null ? (ratio * 100).toFixed(1) + "%" : "N/D";
            return (
              <div key={name}>
                <div className="fw-met-row">
                  <span className={`fw-met-dot ${sc}`} />
                  <span className="fw-met-name">{name}</span>
                  <span className={`fw-met-perf ${sc}`}>{rt}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function renderGoal(
  segKey: string,
  name: string,
  gObj: FwGoalData,
  angle: number,
  per: string,
  getCfg: (n: string) => FwConfigEntry,
  glowId: (n: string) => string,
) {
  const cfg = getCfg(name);
  const ratio = fwGR(gObj, per, cfg);
  const color = fwSC(ratio);
  const sc = fwSCl(ratio);
  const gp = fwP(FW_MR, angle);
  const llp = fwP(FW_LR, angle);
  const ta = fwTA(angle);
  const pctTxt = ratio !== null ? Math.round(ratio * 100).toString() : "\u2014";

  const subs = Object.keys(gObj.subgoals);
  const spread = Math.min(9, 24 / Math.max(subs.length, 1));

  return (
    <g key={name}>
      <text x={llp.x} y={llp.y} fill="#c9d1d9" fontSize="8.5" fontWeight="500"
        textAnchor={ta} dominantBaseline="central" opacity="0.85" pointerEvents="none"
        fontFamily="var(--font)">{name}</text>
      <circle cx={gp.x} cy={gp.y} r={FW_GDR} fill={color} filter={`url(#${glowId(sc)})`} />
      <text x={gp.x} y={gp.y} fill="#fff" fontSize="11" fontWeight="700"
        textAnchor="middle" dominantBaseline="central" pointerEvents="none"
        fontFamily="var(--font)">{pctTxt}</text>
      {subs.map((sName, si) => {
        const sA = angle + (si - (subs.length - 1) / 2) * spread;
        const sp = fwP(FW_SR, sA);
        const sCfg = getCfg(name);
        const sR = fwCR(gObj.subgoals[sName], per, sCfg.mode, sCfg.start, sCfg.limInf, sCfg.limSup);
        const sCl = fwSC(sR);
        const sSc = fwSCl(sR);
        const lx1 = gp.x + (sp.x - gp.x) * 0.45;
        const ly1 = gp.y + (sp.y - gp.y) * 0.45;
        const sPctTxt = sR !== null ? Math.round(sR * 100).toString() : "\u2014";

        return (
          <g key={sName}>
            <line x1={lx1} y1={ly1} x2={sp.x} y2={sp.y} stroke={sCl} strokeWidth="1" strokeOpacity="0.25" pointerEvents="none" />
            <circle cx={sp.x} cy={sp.y} r={FW_SDR} fill={sCl} filter={`url(#${glowId(sSc)})`} />
            <text x={sp.x} y={sp.y} fill="#fff" fontSize="8" fontWeight="700"
              textAnchor="middle" dominantBaseline="central" pointerEvents="none"
              fontFamily="var(--font)">{sPctTxt}</text>
          </g>
        );
      })}
    </g>
  );
}
