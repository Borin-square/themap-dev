// === TYPES ===

export interface FwSubgoalData {
  owner: string;
  isPercent: boolean;
  isCurrency: boolean;
  decimals?: number;
  real: (number | null)[];
  forecast: (number | null)[];
}

export interface FwGoalData extends FwSubgoalData {
  _order?: number;
  subgoals: Record<string, FwSubgoalData>;
}

export type FwData = Record<string, Record<string, FwGoalData>>;

export interface FwConfigEntry {
  mode: "STANDARD" | "POSITIVO" | "LIMITI" | "PARTENZA" | "INVERSO";
  start?: number | null;
  limInf?: number | null;
  limSup?: number | null;
}

export type FwConfig = Record<string, FwConfigEntry>;

export interface FwSegment {
  key: string;
  color: string;
  bg: string;
}

// === CONSTANTS ===

export const FW_SEGS: FwSegment[] = [
  { key: "MARKETING", color: "#4f8cff", bg: "rgba(79,140,255,.10)" },
  { key: "SALES", color: "#ff6b35", bg: "rgba(255,107,53,.10)" },
  { key: "OPERATION", color: "#2ecc71", bg: "rgba(46,204,113,.10)" },
];

export const FW_FUNCS = ["MARKETING", "SALES", "OPERATION", "DIREZIONE", "AMMINISTRAZIONE"];
export const FW_MODES: FwConfigEntry["mode"][] = ["STANDARD", "POSITIVO", "LIMITI", "PARTENZA", "INVERSO"];

export const FW_IR = 195, FW_OR = 270, FW_MR = 232, FW_SR = 315, FW_LR = 350;
export const FW_GAP = 10, FW_SEG_ANGLE = (360 - 30) / 3, FW_PAD = 14;
export const FW_GDR = 16, FW_SDR = 10;

export const FW_GRN = "#22c55e", FW_YEL = "#eab308", FW_RED = "#ef4444", FW_GRY = "#4b5563";

export const FW_MN = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

const ytd: number[] = [];
for (let i = 0; i <= new Date().getMonth(); i++) ytd.push(i);

export const FW_PER: Record<string, number[]> = {
  q1: [0, 1, 2], q2: [3, 4, 5], q3: [6, 7, 8], q4: [9, 10, 11],
  h1: [0, 1, 2, 3, 4, 5], h2: [6, 7, 8, 9, 10, 11],
  ytd, year: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  m0: [0], m1: [1], m2: [2], m3: [3], m4: [4], m5: [5],
  m6: [6], m7: [7], m8: [8], m9: [9], m10: [10], m11: [11],
};

export const FW_PER_LBL: Record<string, string> = {
  q1: "Q1 2026", q2: "Q2 2026", q3: "Q3 2026", q4: "Q4 2026",
  h1: "H1 2026", h2: "H2 2026", ytd: "YTD 2026", year: "ANNO 2026",
  m0: "Gennaio", m1: "Febbraio", m2: "Marzo", m3: "Aprile", m4: "Maggio", m5: "Giugno",
  m6: "Luglio", m7: "Agosto", m8: "Settembre", m9: "Ottobre", m10: "Novembre", m11: "Dicembre",
};

/** Label del periodo con l'anno selezionato (rimpiazza "2026" nei preset annuali). */
export function fwPerLabel(per: string, year: number): string {
  const base = FW_PER_LBL[per] ?? per;
  if (year === 2026) return base;
  return base.replace("2026", String(year));
}

/** Get goal keys sorted by _order (fallback: insertion order) */
export function fwSortedGoals(goals: Record<string, FwGoalData>): string[] {
  const keys = Object.keys(goals);
  const hasOrder = keys.some((k) => goals[k]._order != null);
  if (!hasOrder) return keys;
  return keys.sort((a, b) => (goals[a]._order ?? 999) - (goals[b]._order ?? 999));
}

// === SVG HELPERS ===

export function fwP(r: number, d: number) {
  const a = (d * Math.PI) / 180;
  return { x: r * Math.sin(a), y: -r * Math.cos(a) };
}

export function fwArc(ri: number, ro: number, a1: number, a2: number) {
  const s1 = fwP(ro, a1), e1 = fwP(ro, a2), s2 = fwP(ri, a2), e2 = fwP(ri, a1);
  const la = a2 - a1 > 180 ? 1 : 0;
  return `M${s1.x},${s1.y} A${ro},${ro} 0 ${la} 1 ${e1.x},${e1.y} L${s2.x},${s2.y} A${ri},${ri} 0 ${la} 0 ${e2.x},${e2.y} Z`;
}

export function fwTA(d: number): "start" | "end" | "middle" {
  const a = ((d % 360) + 360) % 360;
  if (a > 8 && a < 172) return "start";
  if (a > 188 && a < 352) return "end";
  return "middle";
}

export function fwSegColor(fn: string): string {
  for (const s of FW_SEGS) if (s.key === fn) return s.color;
  if (fn === "DIREZIONE") return "#f59e0b";
  return "#8b949e";
}

// === CALCULATION LOGIC ===

function sumPeriod(months: (number | null)[] | undefined, idx: number[]): { sum: number; count: number } {
  if (!months) return { sum: 0, count: 0 };
  let sum = 0, count = 0;
  for (const i of idx) {
    const v = months[i];
    if (v !== null && v !== undefined && !isNaN(v)) { sum += v; count++; }
  }
  return { sum, count };
}

export function fwCR(
  item: FwSubgoalData | undefined,
  per: string,
  mode: string,
  start?: number | null,
  limInf?: number | null,
  limSup?: number | null,
): number | null {
  if (!item) return null;
  const idx = FW_PER[per];

  if (mode === "LIMITI") {
    const { sum, count } = sumPeriod(item.real, idx);
    if (count === 0) return null;
    const avg = sum / count;
    if (limInf != null && limSup != null) {
      if (limInf <= limSup) {
        if (avg >= limSup) return 1.0;
        if (avg >= limInf) return 0.85;
        return 0.5;
      } else {
        if (avg <= limSup) return 1.0;
        if (avg <= limInf) return 0.85;
        return 0.5;
      }
    }
    return null;
  }

  if (mode === "POSITIVO") {
    const { sum, count } = sumPeriod(item.real, idx);
    if (count === 0) return null;
    return sum >= 0 ? 1.0 : 0.5;
  }

  if (mode === "PARTENZA" && start != null) {
    const r = sumPeriod(item.real, idx);
    const f = sumPeriod(item.forecast, idx);
    if (r.count === 0 || f.count === 0) return null;
    const gap = start - f.sum / f.count;
    if (gap === 0) return null;
    return (start - r.sum / r.count) / gap;
  }

  if (mode === "INVERSO") {
    const r = sumPeriod(item.real, idx);
    const f = sumPeriod(item.forecast, idx);
    if (!r.count || r.sum === 0) return null;
    return f.sum / r.sum;
  }

  // STANDARD
  const r = sumPeriod(item.real, idx);
  const f = sumPeriod(item.forecast, idx);
  if (!r.count || f.sum === 0) return null;
  return r.sum / f.sum;
}

export function fwGR(gObj: FwGoalData, per: string, cfg: FwConfigEntry): number | null {
  const subs = Object.keys(gObj.subgoals);

  if (subs.length === 0) {
    return fwCR(gObj, per, cfg.mode, cfg.start, cfg.limInf, cfg.limSup);
  }

  if (cfg.mode === "STANDARD" || cfg.mode === "INVERSO") {
    const idx = FW_PER[per];
    let rS = 0, fS = 0, hR = false;
    for (const sn of subs) {
      const sub = gObj.subgoals[sn];
      if (!sub?.real || !sub?.forecast) continue;
      for (const i of idx) {
        const rv = sub.real[i], fv = sub.forecast[i];
        if (rv !== null && rv !== undefined && !isNaN(rv)) { rS += rv; hR = true; }
        if (fv !== null && fv !== undefined && !isNaN(fv)) fS += fv;
      }
    }
    if (!hR) return null;
    if (cfg.mode === "INVERSO") return rS === 0 ? null : fS / rS;
    return fS === 0 ? null : rS / fS;
  }

  if (cfg.mode === "POSITIVO") {
    const idx = FW_PER[per];
    let rS = 0, hR = false;
    for (const sn of subs) {
      const sub = gObj.subgoals[sn];
      if (!sub?.real) continue;
      for (const i of idx) {
        const rv = sub.real[i];
        if (rv !== null && rv !== undefined && !isNaN(rv)) { rS += rv; hR = true; }
      }
    }
    if (!hR) return null;
    return rS >= 0 ? 1.0 : 0.5;
  }

  // LIMITI, PARTENZA — average sub ratios
  let s = 0, c = 0;
  for (const sn of subs) {
    const r = fwCR(gObj.subgoals[sn], per, cfg.mode, cfg.start, cfg.limInf, cfg.limSup);
    if (r !== null) { s += r; c++; }
  }
  return c > 0 ? s / c : null;
}

export function fwMom(data: FwData, per: string, config: FwConfig): number | null {
  let tR = 0, tF = 0, hW = false, fbR = 0, fbC = 0;
  for (const seg of FW_SEGS) {
    const goals = data[seg.key] || {};
    for (const name of Object.keys(goals)) {
      const gObj = goals[name];
      const cfg = config[name] || { mode: "STANDARD" };
      const idx = FW_PER[per];
      if (cfg.mode === "STANDARD" || cfg.mode === "INVERSO") {
        const subs = Object.keys(gObj.subgoals);
        const src = subs.length > 0
          ? subs.map((s) => gObj.subgoals[s])
          : gObj.real && gObj.forecast ? [gObj as FwSubgoalData] : [];
        let rS = 0, fS = 0, hR = false;
        for (const s of src) {
          if (!s.real || !s.forecast) continue;
          for (const i of idx) {
            const rv = s.real[i], fv = s.forecast[i];
            if (rv !== null && rv !== undefined && !isNaN(rv)) { rS += rv; hR = true; }
            if (fv !== null && fv !== undefined && !isNaN(fv)) fS += fv;
          }
        }
        if (hR && fS !== 0) {
          if (cfg.mode === "INVERSO") { tR += fS; tF += rS; }
          else { tR += rS; tF += fS; }
          hW = true;
        }
      } else {
        const ratio = fwGR(gObj, per, cfg);
        if (ratio !== null) { fbR += ratio; fbC++; }
      }
    }
  }
  if (!hW && fbC === 0) return null;
  if (!hW) return fbR / fbC;
  if (fbC === 0) return tR / tF;
  return (tR / tF + fbR / fbC) / 2;
}

export function fwSMR(
  real: (number | null)[] | undefined,
  fc: (number | null)[] | undefined,
  idx: number,
  mode: string,
  start?: number | null,
  limInf?: number | null,
  limSup?: number | null,
): number | null {
  if (mode === "LIMITI") {
    if (!real) return null;
    const v = real[idx];
    if (v === null || v === undefined || isNaN(v)) return null;
    if (limInf != null && limSup != null) {
      if (limInf <= limSup) { if (v >= limSup) return 1; if (v >= limInf) return 0.85; return 0.5; }
      else { if (v <= limSup) return 1; if (v <= limInf) return 0.85; return 0.5; }
    }
    return null;
  }
  if (mode === "POSITIVO") {
    if (!real) return null;
    const v = real[idx];
    if (v === null || v === undefined || isNaN(v)) return null;
    return v > 0 ? 1 : v === 0 ? 0.85 : 0.5;
  }
  if (mode === "PARTENZA" && start != null) {
    if (!real || !fc) return null;
    const r = real[idx], f = fc[idx];
    if (r === null || r === undefined || isNaN(r)) return null;
    if (f === null || f === undefined || isNaN(f)) return null;
    const gap = start - f;
    if (gap === 0) return null;
    return (start - r) / gap;
  }
  if (mode === "INVERSO") {
    if (!real || !fc) return null;
    const r = real[idx], f = fc[idx];
    if (r === null || r === undefined || isNaN(r) || r === 0) return null;
    if (f === null || f === undefined || isNaN(f)) return null;
    return f / r;
  }
  // STANDARD
  if (!real || !fc) return null;
  const r = real[idx], f = fc[idx];
  if (r === null || r === undefined || isNaN(r)) return null;
  if (f === null || f === undefined || isNaN(f) || f === 0) return null;
  return r / f;
}

// === DISPLAY HELPERS ===

export function fwSC(r: number | null): string {
  if (r === null) return FW_GRY;
  if (r >= 1) return FW_GRN;
  if (r >= 0.7) return FW_YEL;
  return FW_RED;
}

export function fwSCl(r: number | null): "green" | "yellow" | "red" | "grey" {
  if (r === null) return "grey";
  if (r >= 1) return "green";
  if (r >= 0.7) return "yellow";
  return "red";
}

function fmtNum(n: number, dec: number): string {
  return n.toLocaleString("it-IT", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

export function fwDV(months: (number | null)[] | undefined, per: string, isPct: boolean, isCur: boolean, decimals?: number): string {
  if (!months) return "N/D";
  const idx = FW_PER[per];
  let s = 0, c = 0;
  for (const i of idx) {
    const v = months[i];
    if (v !== null && v !== undefined && !isNaN(v)) { s += v; c++; }
  }
  if (c === 0) return "N/D";
  if (isPct) return fmtNum((s / c) * 100, decimals ?? 1) + "%";
  if (isCur) return "\u20AC " + fmtNum(s, decimals ?? 0);
  return fmtNum(s, decimals ?? 1);
}

export function fwMDV(months: (number | null)[] | undefined, idx: number, isPct: boolean, isCur: boolean, decimals?: number): string {
  if (!months) return "N/D";
  const v = months[idx];
  if (v === null || v === undefined || isNaN(v)) return "N/D";
  if (isPct) return fmtNum(v * 100, decimals ?? 1) + "%";
  if (isCur) return "\u20AC " + fmtNum(v, decimals ?? 0);
  return fmtNum(v, decimals ?? 1);
}

// === MOCK DATA ===

import { getSquareFwData } from "./square-marketing-data";

export function getMockDataForCompany(slug: string): { data: FwData; config: FwConfig } {
  if (slug === "square-marketing") return getSquareFwData();
  return getMockData();
}

export function getMockData(): { data: FwData; config: FwConfig } {
  const data: FwData = {
    MARKETING: {
      "Lead Generation": {
        owner: "Marco", isPercent: false, isCurrency: false,
        real: [142, 158, 163, 171, 168, null, null, null, null, null, null, null],
        forecast: [150, 155, 160, 165, 170, 175, 180, 185, 190, 195, 200, 205],
        subgoals: {
          Social: { owner: "", isPercent: false, isCurrency: false, real: [58, 65, 62, 70, 66, null, null, null, null, null, null, null], forecast: [60, 62, 64, 66, 68, 70, 72, 74, 76, 78, 80, 82] },
          "Google Ads": { owner: "", isPercent: false, isCurrency: false, real: [52, 55, 58, 56, 60, null, null, null, null, null, null, null], forecast: [50, 52, 54, 56, 58, 60, 62, 64, 66, 68, 70, 72] },
          Content: { owner: "", isPercent: false, isCurrency: false, real: [32, 38, 43, 45, 42, null, null, null, null, null, null, null], forecast: [40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51] },
        },
      },
      "Brand Awareness": {
        owner: "Sara", isPercent: true, isCurrency: false,
        real: [0.18, 0.19, 0.21, 0.20, 0.22, null, null, null, null, null, null, null],
        forecast: [0.20, 0.20, 0.21, 0.22, 0.22, 0.23, 0.24, 0.24, 0.25, 0.25, 0.26, 0.27],
        subgoals: {},
      },
    },
    SALES: {
      Fatturato: {
        owner: "Luca", isPercent: false, isCurrency: true,
        real: [48500, 51200, 53800, 49900, 55000, null, null, null, null, null, null, null],
        forecast: [50000, 51500, 53000, 54500, 56000, 57500, 59000, 60500, 62000, 63500, 65000, 66500],
        subgoals: {
          "New Business": { owner: "Luca", isPercent: false, isCurrency: true, real: [32000, 34000, 36000, 33000, 37000, null, null, null, null, null, null, null], forecast: [33000, 34000, 35000, 36000, 37000, 38000, 39000, 40000, 41000, 42000, 43000, 44000] },
          Upsell: { owner: "Luca", isPercent: false, isCurrency: true, real: [16500, 17200, 17800, 16900, 18000, null, null, null, null, null, null, null], forecast: [17000, 17500, 18000, 18500, 19000, 19500, 20000, 20500, 21000, 21500, 22000, 22500] },
        },
      },
      "Conversion Rate": {
        owner: "Luca", isPercent: true, isCurrency: false,
        real: [0.28, 0.31, 0.30, 0.32, 0.29, null, null, null, null, null, null, null],
        forecast: [0.30, 0.30, 0.31, 0.31, 0.32, 0.32, 0.33, 0.33, 0.34, 0.34, 0.35, 0.35],
        subgoals: {},
      },
    },
    OPERATION: {
      "On-time Delivery": {
        owner: "Elena", isPercent: true, isCurrency: false,
        real: [0.92, 0.94, 0.91, 0.95, 0.93, null, null, null, null, null, null, null],
        forecast: [0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95],
        subgoals: {},
      },
      "Customer NPS": {
        owner: "Elena", isPercent: false, isCurrency: false,
        real: [72, 74, 71, 75, 73, null, null, null, null, null, null, null],
        forecast: [75, 75, 76, 76, 77, 77, 78, 78, 79, 79, 80, 80],
        subgoals: {},
      },
    },
    DIREZIONE: {
      EBITDA: {
        owner: "Nicholas", isPercent: false, isCurrency: true,
        real: [5200, 6100, 5800, 4900, 6500, null, null, null, null, null, null, null],
        forecast: [5000, 5500, 6000, 6500, 7000, 7500, 8000, 8500, 9000, 9500, 10000, 10500],
        subgoals: {},
      },
      "Cash Flow": {
        owner: "Nicholas", isPercent: false, isCurrency: true,
        real: [3200, 4100, 2800, -1200, 5500, null, null, null, null, null, null, null],
        forecast: [3000, 3500, 4000, 4500, 5000, 5500, 6000, 6500, 7000, 7500, 8000, 8500],
        subgoals: {},
      },
    },
    AMMINISTRAZIONE: {
      DSO: {
        owner: "", isPercent: false, isCurrency: false,
        real: [45, 42, 48, 40, 43, null, null, null, null, null, null, null],
        forecast: [40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40],
        subgoals: {},
      },
      "Costi Fissi": {
        owner: "", isPercent: false, isCurrency: true,
        real: [33000, 33200, 33500, 33000, 33800, null, null, null, null, null, null, null],
        forecast: [33000, 33000, 33000, 33000, 33000, 33000, 33000, 33000, 33000, 33000, 33000, 33000],
        subgoals: {},
      },
    },
  };

  const config: FwConfig = {
    "Lead Generation": { mode: "STANDARD" },
    "Brand Awareness": { mode: "STANDARD" },
    Fatturato: { mode: "STANDARD" },
    "Conversion Rate": { mode: "STANDARD" },
    "On-time Delivery": { mode: "STANDARD" },
    "Customer NPS": { mode: "LIMITI", limInf: 60, limSup: 80 },
    EBITDA: { mode: "STANDARD" },
    "Cash Flow": { mode: "POSITIVO" },
    DSO: { mode: "INVERSO" },
    "Costi Fissi": { mode: "INVERSO" },
  };

  return { data, config };
}
