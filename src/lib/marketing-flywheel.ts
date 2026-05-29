import type { FwSegment, FwData, FwConfig } from "./flywheel";

// === MARKETING FLYWHEEL SEGMENTS ===

export const MFW_SEGS: FwSegment[] = [
  { key: "ATTRACT", color: "#f59e0b", bg: "rgba(245,158,11,.10)" },
  { key: "ENGAGE", color: "#8b5cf6", bg: "rgba(139,92,246,.10)" },
  { key: "DELIGHT", color: "#06b6d4", bg: "rgba(6,182,212,.10)" },
];

export const MFW_FUNCS = ["ATTRACT", "ENGAGE", "DELIGHT", "OBIETTIVI"];

export function mfwSegColor(fn: string): string {
  for (const s of MFW_SEGS) if (s.key === fn) return s.color;
  if (fn === "OBIETTIVI") return "#f59e0b";
  return "#8b949e";
}

// === MOCK DATA ===

export function getMfwMockData(): { data: FwData; config: FwConfig } {
  const data: FwData = {
    ATTRACT: {
      "Web Traffic": {
        owner: "Marco", isPercent: false, isCurrency: false,
        real: [12400, 13100, 14200, 13800, 15100, null, null, null, null, null, null, null],
        forecast: [12000, 13000, 14000, 15000, 16000, 17000, 18000, 19000, 20000, 21000, 22000, 23000],
        subgoals: {
          Organic: { owner: "", isPercent: false, isCurrency: false, real: [7200, 7800, 8500, 8200, 9100, null, null, null, null, null, null, null], forecast: [7000, 7500, 8000, 8500, 9000, 9500, 10000, 10500, 11000, 11500, 12000, 12500] },
          Paid: { owner: "", isPercent: false, isCurrency: false, real: [5200, 5300, 5700, 5600, 6000, null, null, null, null, null, null, null], forecast: [5000, 5500, 6000, 6500, 7000, 7500, 8000, 8500, 9000, 9500, 10000, 10500] },
        },
      },
      "Content Published": {
        owner: "Sara", isPercent: false, isCurrency: false,
        real: [12, 14, 11, 15, 13, null, null, null, null, null, null, null],
        forecast: [12, 12, 14, 14, 14, 16, 16, 12, 16, 16, 16, 14],
        subgoals: {},
      },
    },
    ENGAGE: {
      MQL: {
        owner: "Marco", isPercent: false, isCurrency: false,
        real: [85, 92, 88, 95, 91, null, null, null, null, null, null, null],
        forecast: [80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 130, 135],
        subgoals: {
          "Email Nurturing": { owner: "", isPercent: false, isCurrency: false, real: [35, 38, 36, 40, 37, null, null, null, null, null, null, null], forecast: [32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54] },
          "Social Lead": { owner: "", isPercent: false, isCurrency: false, real: [28, 30, 29, 32, 31, null, null, null, null, null, null, null], forecast: [26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48] },
          "Inbound Form": { owner: "", isPercent: false, isCurrency: false, real: [22, 24, 23, 23, 23, null, null, null, null, null, null, null], forecast: [22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33] },
        },
      },
      "Email Open Rate": {
        owner: "Sara", isPercent: true, isCurrency: false,
        real: [0.24, 0.26, 0.25, 0.27, 0.26, null, null, null, null, null, null, null],
        forecast: [0.25, 0.25, 0.26, 0.26, 0.27, 0.27, 0.28, 0.28, 0.29, 0.29, 0.30, 0.30],
        subgoals: {},
      },
    },
    DELIGHT: {
      NPS: {
        owner: "Elena", isPercent: false, isCurrency: false,
        real: [68, 72, 70, 74, 71, null, null, null, null, null, null, null],
        forecast: [70, 70, 72, 72, 74, 74, 76, 76, 78, 78, 80, 80],
        subgoals: {},
      },
      "Retention Rate": {
        owner: "Elena", isPercent: true, isCurrency: false,
        real: [0.88, 0.90, 0.89, 0.91, 0.90, null, null, null, null, null, null, null],
        forecast: [0.90, 0.90, 0.91, 0.91, 0.92, 0.92, 0.93, 0.93, 0.94, 0.94, 0.95, 0.95],
        subgoals: {},
      },
      Referral: {
        owner: "Luca", isPercent: false, isCurrency: false,
        real: [18, 22, 20, 25, 21, null, null, null, null, null, null, null],
        forecast: [20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42],
        subgoals: {},
      },
    },
    OBIETTIVI: {
      "Revenue da Marketing": {
        owner: "Marco", isPercent: false, isCurrency: true,
        real: [28000, 31000, 33000, 29500, 35000, null, null, null, null, null, null, null],
        forecast: [30000, 32000, 34000, 36000, 38000, 40000, 42000, 44000, 46000, 48000, 50000, 52000],
        subgoals: {},
      },
      CAC: {
        owner: "Marco", isPercent: false, isCurrency: true,
        real: [180, 165, 172, 158, 170, null, null, null, null, null, null, null],
        forecast: [170, 165, 160, 155, 150, 145, 140, 135, 130, 125, 120, 115],
        subgoals: {},
      },
    },
  };

  const config: FwConfig = {
    "Web Traffic": { mode: "STANDARD" },
    "Content Published": { mode: "STANDARD" },
    MQL: { mode: "STANDARD" },
    "Email Open Rate": { mode: "STANDARD" },
    NPS: { mode: "LIMITI", limInf: 60, limSup: 80 },
    "Retention Rate": { mode: "STANDARD" },
    Referral: { mode: "STANDARD" },
    "Revenue da Marketing": { mode: "STANDARD" },
    CAC: { mode: "INVERSO" },
  };

  return { data, config };
}
