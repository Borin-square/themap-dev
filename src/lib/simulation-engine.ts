// === SIMULATION ENGINE ===
// Pure functions for Monte Carlo simulation on top of the Economic Engine.
// No React, no browser APIs. Safe to import in Node test environments.

import { eeRecalc, getEeMockMetrics, initEeValues, getEeYear } from "./economic-engine";

// ─── TYPES ───────────────────────────────────────────────────────────────────

export type DistType = "fixed" | "uniform" | "triangular" | "normal";
export type VarRole =
  | "FIXED"
  | "DECISION"
  | "DISTRIBUTION"
  | "DERIVED"
  | "CONSTRAINT"
  | "OUTPUT";
export type Feasibility = "FEASIBLE" | "CAPACITY_STRESSED" | "NOT_FEASIBLE";

// ─── CONSTRAINT ENGINE TYPES ─────────────────────────────────────────────────

export type ConstraintType = "HARD" | "ELASTIC" | "PERFORMANCE" | "SOFT";
export type ConstraintStatus = "ACTIVE" | "INACTIVE" | "EXPERIMENTAL" | "DA_DEFINIRE";
export type ConstraintCategory =
  | "DEMAND" | "SALES" | "PRICING" | "RECURRING"
  | "DELIVERY" | "OUTSOURCING" | "PEOPLE" | "CASH"
  | "MARGIN" | "MANAGEMENT" | "CLIENT_CONCENTRATION" | "QUALITY";

export interface ConstraintResponse {
  name: string;
  status: ConstraintStatus;
}

export interface ConstraintDef {
  id: string;
  name: string;
  category: ConstraintCategory;
  tipo: ConstraintType;
  status: ConstraintStatus;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  description?: string;
  responses: ConstraintResponse[];
}

export interface ConstraintRunResult {
  constraintId: string;
  touched: boolean;
  exceeded: boolean;
  resolved: boolean;
  unresolved: boolean;
  responseName?: string;
  responseCost: number;
}

export interface ConstraintPressure {
  constraintId: string;
  name: string;
  category: ConstraintCategory;
  tipo: ConstraintType;
  status: ConstraintStatus;
  pctTouched: number;
  pctExceeded: number;
  pctResolved: number;
  pctUnresolved: number;
  avgResponseCost: number;
  bindingCount: number;
}

export interface ValidationError {
  key: string;
  field: string;
  message: string;
}

// ─── CORE TYPES ──────────────────────────────────────────────────────────────

export interface DistConfig {
  type: DistType;
  current: number;     // base value (from EE Playground)
  min: number;
  mostLikely: number;  // mode for triangular, mean for normal
  max: number;
  stddev: number;      // used for normal only
  confidence: number;  // 0–1, informational
  source: string;      // informational label
}

export interface VarMeta {
  key: string;
  label: string;
  role: VarRole;
  isPercent?: boolean;
  isEuro?: boolean;
  isInt?: boolean;
}

export interface CapacityConfig {
  numPersone: number;
  oreTeoriche: number;       // ore/persona/anno
  percAvailability: number;  // 0–1
}

export interface OutsourcingConfig {
  maxHours: number;
  costoOra: number;
}

export interface CapacityConstraintConfig {
  // Fraction of disponibile over which we consider CAPACITY_STRESSED
  stressThreshold: number;
}

export interface SimConstraints {
  enforceRecurringStock: boolean;  // PERC_RIC + PERC_STOCK = 1
  enforceSalesCapacity: boolean;   // cap offerte a max gestibili
}

export interface SimConfig {
  distributions: Record<string, DistConfig>;
  capacity: CapacityConfig;
  outsourcing: OutsourcingConfig;
  capConstraint: CapacityConstraintConfig;
  constraints: SimConstraints;
  numRuns: number;
  seed?: number;
  margineTarget: number;
}

export interface CapacityResult {
  necessaria: number;
  disponibile: number;
  internalHours: number;
  outsourcedHours: number;
  unservedHours: number;
  outsourcingCost: number;
}

export interface SalesCapacityResult {
  offerteGestite_sales: number;
  offerteGestite_marketing: number;
  offerteGenerate: number;
  maxGestibili: number;
  offerteGestite: number;
  offerteScartate: number;
}

export interface SimRunResult {
  inputs: Record<string, number>;
  // Economic outputs
  vdp: number;
  totalCosts: number;
  margine: number;
  marginePerc: number;
  mrr: number;          // recurring run-rate: ricRic[11] × 12
  totalVendite: number;
  // Sales capacity
  offerteGenerate: number;
  maxOfferteGestibili: number;
  offerteGestite: number;
  offerteScartate: number;
  // Capacity
  capacity: CapacityResult;
  feasibility: Feasibility;
  // Constraint engine
  constraintResults: ConstraintRunResult[];
}

export interface SimPercentiles {
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  mean: number;
}

export interface SensitivityEntry {
  key: string;
  label: string;
  pearson: number;
  spearman: number;
}

export interface SimAnalysis {
  percentiles: SimPercentiles;
  probPositive: number;
  probAboveTarget: number;
  feasibleCount: number;
  stressedCount: number;
  notFeasibleCount: number;
  sensitivity: SensitivityEntry[];
  maxFeasibleVdp: number;
  maxFeasibleMargine: number;
  mainConstraint: string;
  constraintPressure: ConstraintPressure[];
}

// ─── VAR METADATA ────────────────────────────────────────────────────────────

export const SIM_DISTRIBUTION_KEYS: readonly string[] = [
  "N° OFFERTE F. SALES",
  "N° OFFERTE FONTE MARKETING",
  "TASSO DI CHIUSURA F. SALES",
  "TASSO DI CHIUSURA F. MARKETING",
  "VALORE VENDITA MEDIA",
  "CHURN RATE",
  "PREZZO MEDIO ORARIO",
  "% ORE LAVORATE",
  "TASSO DI TRASFERIMENTO",
  "COSTO VAR.",
  "COSTI FISSI",
] as const;

export const SIM_VAR_META: VarMeta[] = [
  { key: "N° OFFERTE F. SALES",           label: "Offerte Sales",           role: "DISTRIBUTION", isInt: true },
  { key: "N° OFFERTE FONTE MARKETING",    label: "Offerte Marketing",       role: "DISTRIBUTION", isInt: true },
  { key: "TASSO DI CHIUSURA F. SALES",    label: "Tasso chiusura Sales",    role: "DISTRIBUTION", isPercent: true },
  { key: "TASSO DI CHIUSURA F. MARKETING",label: "Tasso chiusura Marketing",role: "DISTRIBUTION", isPercent: true },
  { key: "VALORE VENDITA MEDIA",          label: "Valore vendita media",    role: "DISTRIBUTION", isEuro: true },
  { key: "CHURN RATE",                    label: "Churn Rate",              role: "DISTRIBUTION", isPercent: true },
  { key: "PREZZO MEDIO ORARIO",           label: "Prezzo orario",           role: "DISTRIBUTION", isEuro: true },
  { key: "% ORE LAVORATE",               label: "% ore billabili",         role: "DISTRIBUTION", isPercent: true },
  { key: "TASSO DI TRASFERIMENTO",        label: "Tasso trasferimento",     role: "DISTRIBUTION", isPercent: true },
  { key: "COSTO VAR.",                    label: "Costi variabili %",       role: "DISTRIBUTION", isPercent: true },
  { key: "COSTI FISSI",                   label: "Costi fissi mensili",     role: "DISTRIBUTION", isEuro: true },
  { key: "N° COMMERCIALI",               label: "N° commerciali",          role: "DECISION",  isInt: true },
  { key: "CAPIENZA SALES EXECUTIVE",      label: "Capienza commerciale",    role: "DECISION",  isInt: true },
  { key: "BUDGET MARKETING",              label: "Budget marketing",        role: "DECISION",  isEuro: true },
  { key: "COSTO ORARIO DIPENDENTE",       label: "Costo orario dip.",       role: "DECISION",  isEuro: true },
  { key: "PARTENZA RICORRENTE",           label: "Partenza ricorrente",     role: "FIXED",     isEuro: true },
  { key: "PERC. RICORRENTI",             label: "% ricorrenti",            role: "FIXED",     isPercent: true },
  { key: "PERC. STOCK",                  label: "% stock",                 role: "DERIVED",   isPercent: true },
  { key: "MULTIPLO",                      label: "Multiplo valutazione",    role: "FIXED" },
];

// ─── CONSTRAINT DEFINITIONS ──────────────────────────────────────────────────
// 12 pre-wired categories. ACTIVE = evaluated each run. INACTIVE = pre-wired but no business rules yet.

export const DEFAULT_CONSTRAINT_DEFS: ConstraintDef[] = [
  {
    id: "DEMAND_PIPELINE",
    name: "Pipeline domanda",
    category: "DEMAND",
    tipo: "PERFORMANCE",
    status: "INACTIVE",
    severity: "MEDIUM",
    description: "Offerte generate vs pipeline target",
    responses: [],
  },
  {
    id: "SALES_CAPACITY",
    name: "Sales capacity",
    category: "SALES",
    tipo: "ELASTIC",
    status: "ACTIVE",
    severity: "HIGH",
    description: "Offerte gestibili dai commerciali vs offerte generate",
    responses: [
      { name: "Capping offerte", status: "ACTIVE" },
    ],
  },
  {
    id: "PRICING_FLOOR",
    name: "Prezzo minimo",
    category: "PRICING",
    tipo: "SOFT",
    status: "INACTIVE",
    severity: "LOW",
    description: "Valore vendita media vs floor sostenibile",
    responses: [],
  },
  {
    id: "RECURRING_SUM",
    name: "Ricorrenti + Stock = 1",
    category: "RECURRING",
    tipo: "HARD",
    status: "ACTIVE",
    severity: "CRITICAL",
    description: "PERC_RIC + PERC_STOCK devono sommare a 1",
    responses: [
      { name: "Derivazione automatica PERC_STOCK", status: "ACTIVE" },
    ],
  },
  {
    id: "DELIVERY_CAPACITY",
    name: "Productive capacity",
    category: "DELIVERY",
    tipo: "ELASTIC",
    status: "ACTIVE",
    severity: "CRITICAL",
    description: "Capacity necessaria vs disponibile interna",
    responses: [
      { name: "Outsourcing", status: "ACTIVE" },
      { name: "Hiring", status: "INACTIVE" },
      { name: "Backlog domanda", status: "INACTIVE" },
    ],
  },
  {
    id: "OUTSOURCING_LIMIT",
    name: "Limite outsourcing",
    category: "OUTSOURCING",
    tipo: "HARD",
    status: "ACTIVE",
    severity: "HIGH",
    description: "Max ore outsourcabili — se gap residuo > 0 → NOT_FEASIBLE",
    responses: [],
  },
  {
    id: "PEOPLE_SPAN",
    name: "Management span",
    category: "PEOPLE",
    tipo: "SOFT",
    status: "INACTIVE",
    severity: "LOW",
    description: "Rapporto commerciali / manager sostenibile",
    responses: [],
  },
  {
    id: "CASH_COSTS",
    name: "Budget costi",
    category: "CASH",
    tipo: "PERFORMANCE",
    status: "INACTIVE",
    severity: "MEDIUM",
    description: "Costi totali vs budget autorizzato",
    responses: [],
  },
  {
    id: "MARGIN_TARGET",
    name: "Target margine",
    category: "MARGIN",
    tipo: "PERFORMANCE",
    status: "INACTIVE",
    severity: "MEDIUM",
    description: "Margine lordo vs obiettivo",
    responses: [],
  },
  {
    id: "MANAGEMENT_CAPACITY",
    name: "Carico manageriale",
    category: "MANAGEMENT",
    tipo: "SOFT",
    status: "INACTIVE",
    severity: "LOW",
    description: "Numero di iniziative / decisioni sostenibili",
    responses: [],
  },
  {
    id: "CLIENT_CONCENTRATION",
    name: "Concentrazione clienti",
    category: "CLIENT_CONCENTRATION",
    tipo: "SOFT",
    status: "INACTIVE",
    severity: "LOW",
    description: "% revenue da top 3 clienti vs limite rischio",
    responses: [],
  },
  {
    id: "QUALITY_UTILIZATION",
    name: "% ore billabili",
    category: "QUALITY",
    tipo: "PERFORMANCE",
    status: "INACTIVE",
    severity: "MEDIUM",
    description: "% ore lavorate effettive vs standard qualità",
    responses: [],
  },
];

// ─── SEEDED RNG (Mulberry32) ─────────────────────────────────────────────────

export function createSeededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

// ─── DISTRIBUTION SAMPLING ───────────────────────────────────────────────────

export function sampleFixed(current: number): number {
  return current;
}

export function sampleUniform(min: number, max: number, rng: () => number): number {
  return min + rng() * (max - min);
}

// Inverse-CDF method for triangular distribution
export function sampleTriangular(min: number, mode: number, max: number, rng: () => number): number {
  if (max <= min) return mode;
  const u = rng();
  const f = (mode - min) / (max - min);
  if (u < f) {
    return min + Math.sqrt(u * (max - min) * (mode - min));
  }
  return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
}

// Box-Muller transform for Normal sampling
export function sampleNormal(mean: number, stddev: number, rng: () => number): number {
  const u1 = Math.max(rng(), 1e-10);
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stddev;
}

export function sampleDist(cfg: DistConfig, rng: () => number): number {
  switch (cfg.type) {
    case "fixed":      return sampleFixed(cfg.current);
    case "uniform":    return sampleUniform(cfg.min, cfg.max, rng);
    case "triangular": return sampleTriangular(cfg.min, cfg.mostLikely, cfg.max, rng);
    case "normal":     return sampleNormal(cfg.mostLikely, cfg.stddev, rng);
  }
}

// ─── STATISTICS ──────────────────────────────────────────────────────────────

export function calcPercentiles(values: number[]): SimPercentiles {
  if (values.length === 0) return { p10: 0, p25: 0, p50: 0, p75: 0, p90: 0, mean: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const q = (p: number): number => {
    const idx = (p / 100) * (n - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo]);
  };
  const mean = values.reduce((a, b) => a + b, 0) / n;
  return { p10: q(10), p25: q(25), p50: q(50), p75: q(75), p90: q(90), mean };
}

export function calcPearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  return den < 1e-12 ? 0 : num / den;
}

function rankArray(arr: number[]): number[] {
  const indexed = arr.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);
  const ranks = new Array(arr.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j < indexed.length && indexed[j].v === indexed[i].v) j++;
    const avgRank = (i + j - 1) / 2 + 1;
    for (let k = i; k < j; k++) ranks[indexed[k].i] = avgRank;
    i = j;
  }
  return ranks;
}

export function calcSpearman(xs: number[], ys: number[]): number {
  if (xs.length < 2) return 0;
  return calcPearson(rankArray(xs), rankArray(ys));
}

// ─── CAPACITY ────────────────────────────────────────────────────────────────

export function calcCapacityDisponibile(cfg: CapacityConfig): number {
  return cfg.numPersone * cfg.oreTeoriche * cfg.percAvailability;
}

export function calcCapacity(
  necessaria: number,
  capacityCfg: CapacityConfig,
  outsourcingCfg: OutsourcingConfig,
): CapacityResult {
  const disponibile = calcCapacityDisponibile(capacityCfg);
  const gap = Math.max(0, necessaria - disponibile);
  const internalHours = Math.min(necessaria, disponibile);
  const outsourcedHours = Math.min(gap, outsourcingCfg.maxHours);
  const unservedHours = Math.max(0, gap - outsourcingCfg.maxHours);
  const outsourcingCost = outsourcedHours * outsourcingCfg.costoOra;
  return { necessaria, disponibile, internalHours, outsourcedHours, unservedHours, outsourcingCost };
}

export function classifyFeasibility(cap: CapacityResult, stressThreshold: number): Feasibility {
  if (cap.unservedHours > 0) return "NOT_FEASIBLE";
  // Any outsourcing needed or capacity gap above threshold → STRESSED
  if (cap.outsourcedHours > 0) return "CAPACITY_STRESSED";
  if (cap.disponibile > 0 && cap.necessaria > cap.disponibile * (1 + stressThreshold)) {
    return "CAPACITY_STRESSED";
  }
  return "FEASIBLE";
}

// ─── SALES CAPACITY CONSTRAINT ───────────────────────────────────────────────

export function applySalesCapacityConstraint(values: Record<string, number>): SalesCapacityResult {
  const sales = values["N° OFFERTE F. SALES"] ?? 0;
  const mkt = values["N° OFFERTE FONTE MARKETING"] ?? 0;
  const totale = sales + mkt;
  const numComm = values["N° COMMERCIALI"] ?? 0;
  const capienza = values["CAPIENZA SALES EXECUTIVE"] ?? 0;
  const max = numComm * capienza;

  if (max <= 0 || totale <= max) {
    return {
      offerteGestite_sales: sales,
      offerteGestite_marketing: mkt,
      offerteGenerate: totale,
      maxGestibili: max,
      offerteGestite: totale,
      offerteScartate: 0,
    };
  }

  const ratio = totale > 0 ? max / totale : 1;
  return {
    offerteGestite_sales: sales * ratio,
    offerteGestite_marketing: mkt * ratio,
    offerteGenerate: totale,
    maxGestibili: max,
    offerteGestite: max,
    offerteScartate: totale - max,
  };
}

// ─── CONSTRAINT ENGINE ───────────────────────────────────────────────────────

export function evaluateConstraints(
  inputs: Record<string, number>,
  capResult: CapacityResult,
  sc: SalesCapacityResult,
  simConstraints: SimConstraints,
): ConstraintRunResult[] {
  const out: ConstraintRunResult[] = [];

  for (const def of DEFAULT_CONSTRAINT_DEFS) {
    if (def.status === "INACTIVE") continue;

    let r: ConstraintRunResult;

    switch (def.id) {
      case "SALES_CAPACITY": {
        const exceeded = sc.offerteScartate > 0;
        r = {
          constraintId: def.id,
          touched: sc.offerteGenerate > 0,
          exceeded,
          resolved: exceeded,   // always resolved by capping — ELASTIC
          unresolved: false,
          responseName: exceeded ? "Capping offerte" : undefined,
          responseCost: 0,
        };
        break;
      }

      case "RECURRING_SUM": {
        // By the time we evaluate, inputs are already corrected if enforceRecurringStock=true
        const ric = inputs["PERC. RICORRENTI"] ?? 0;
        const stock = inputs["PERC. STOCK"] ?? 0;
        const violated = Math.abs(ric + stock - 1) > 0.001;
        r = {
          constraintId: def.id,
          touched: true,
          exceeded: violated,
          resolved: !violated || simConstraints.enforceRecurringStock,
          unresolved: violated && !simConstraints.enforceRecurringStock,
          responseName: simConstraints.enforceRecurringStock ? "Derivazione automatica PERC_STOCK" : undefined,
          responseCost: 0,
        };
        break;
      }

      case "DELIVERY_CAPACITY": {
        const exceeded = capResult.necessaria > capResult.disponibile;
        const unresolved = capResult.unservedHours > 0;
        r = {
          constraintId: def.id,
          touched: capResult.necessaria > 0,
          exceeded,
          resolved: exceeded && !unresolved,  // outsourcing covered the gap
          unresolved,
          responseName: exceeded ? "Outsourcing" : undefined,
          responseCost: capResult.outsourcingCost,
        };
        break;
      }

      case "OUTSOURCING_LIMIT": {
        const outsourcingNeeded = capResult.necessaria > capResult.disponibile;
        const gapExceedsLimit = capResult.unservedHours > 0;
        r = {
          constraintId: def.id,
          touched: outsourcingNeeded,
          exceeded: gapExceedsLimit,
          resolved: false,
          unresolved: gapExceedsLimit,
          responseCost: 0,
        };
        break;
      }

      default: {
        // EXPERIMENTAL constraints: tracked but no evaluation logic yet
        r = {
          constraintId: def.id,
          touched: false,
          exceeded: false,
          resolved: false,
          unresolved: false,
          responseCost: 0,
        };
      }
    }

    out.push(r);
  }

  return out;
}

// ─── DISTRIBUTION VALIDATION ─────────────────────────────────────────────────

export function validateDistributions(
  distributions: Record<string, DistConfig>,
  distMetas: VarMeta[],
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const meta of distMetas) {
    const d = distributions[meta.key];
    if (!d) continue;

    const pct = meta.isPercent ?? false;
    const pos = (meta.isEuro || meta.isInt) ?? false;

    const check = (field: keyof DistConfig, label: string) => {
      const v = d[field] as number;
      if (isNaN(v)) return;
      if (pct && (v < 0 || v > 1)) {
        errors.push({ key: meta.key, field, message: `${label} deve essere tra 0% e 100%` });
      } else if (pos && v < 0) {
        errors.push({ key: meta.key, field, message: `${label} deve essere ≥ 0` });
      }
    };

    switch (d.type) {
      case "fixed":
        check("current", "Valore");
        break;
      case "uniform":
        check("min", "Min");
        check("max", "Max");
        if (!isNaN(d.min) && !isNaN(d.max) && d.min > d.max)
          errors.push({ key: meta.key, field: "max", message: "Max deve essere ≥ Min" });
        break;
      case "triangular":
        check("min", "Min");
        check("mostLikely", "Più probabile");
        check("max", "Max");
        if (!isNaN(d.min) && !isNaN(d.max) && d.min > d.max)
          errors.push({ key: meta.key, field: "max", message: "Max deve essere ≥ Min" });
        if (!isNaN(d.min) && !isNaN(d.mostLikely) && !isNaN(d.max) &&
            (d.mostLikely < d.min || d.mostLikely > d.max))
          errors.push({ key: meta.key, field: "mostLikely", message: "Più probabile deve essere tra Min e Max" });
        break;
      case "normal":
        check("mostLikely", "Media");
        if (!isNaN(d.stddev) && d.stddev < 0)
          errors.push({ key: meta.key, field: "stddev", message: "Dev. std deve essere ≥ 0" });
        break;
    }
  }

  return errors;
}

// ─── SINGLE RUN ──────────────────────────────────────────────────────────────

// Percent-bounded keys: values must stay in [0, 1]
const PERCENT_KEYS = new Set([
  "TASSO DI CHIUSURA F. SALES",
  "TASSO DI CHIUSURA F. MARKETING",
  "CHURN RATE",
  "% ORE LAVORATE",
  "TASSO DI TRASFERIMENTO",
  "COSTO VAR.",
  "PERC. RICORRENTI",
  "PERC. STOCK",
]);

// Non-negative keys
const NONNEG_KEYS = new Set([
  "N° OFFERTE F. SALES",
  "N° OFFERTE FONTE MARKETING",
  "VALORE VENDITA MEDIA",
  "PREZZO MEDIO ORARIO",
  "COSTI FISSI",
]);

function clampSampled(key: string, value: number): number {
  if (PERCENT_KEYS.has(key)) return Math.min(1, Math.max(0, value));
  if (NONNEG_KEYS.has(key)) return Math.max(0, value);
  return value;
}

export function runSingleSimulation(
  cfg: SimConfig,
  baseValues: Record<string, number>,
  rng: () => number,
): SimRunResult {
  // 1. Start from base values (FIXED, DECISION, STIMA vars come from here)
  const inputs: Record<string, number> = { ...baseValues };

  // 2. Sample DISTRIBUTION vars
  for (const key of SIM_DISTRIBUTION_KEYS) {
    const distCfg = cfg.distributions[key];
    if (!distCfg) continue;
    inputs[key] = clampSampled(key, sampleDist(distCfg, rng));
  }

  // 3. Enforce PERC_RIC + PERC_STOCK = 1
  if (cfg.constraints.enforceRecurringStock) {
    const ric = Math.min(1, Math.max(0, inputs["PERC. RICORRENTI"] ?? 0));
    inputs["PERC. RICORRENTI"] = ric;
    inputs["PERC. STOCK"] = 1 - ric;
  }

  // 4. Enforce sales capacity constraint
  let sc: SalesCapacityResult;
  if (cfg.constraints.enforceSalesCapacity) {
    sc = applySalesCapacityConstraint(inputs);
    inputs["N° OFFERTE F. SALES"] = sc.offerteGestite_sales;
    inputs["N° OFFERTE FONTE MARKETING"] = sc.offerteGestite_marketing;
  } else {
    const sales = inputs["N° OFFERTE F. SALES"] ?? 0;
    const mkt = inputs["N° OFFERTE FONTE MARKETING"] ?? 0;
    const numComm = inputs["N° COMMERCIALI"] ?? 0;
    const capienza = inputs["CAPIENZA SALES EXECUTIVE"] ?? 0;
    sc = {
      offerteGestite_sales: sales,
      offerteGestite_marketing: mkt,
      offerteGenerate: sales + mkt,
      maxGestibili: numComm * capienza,
      offerteGestite: sales + mkt,
      offerteScartate: 0,
    };
  }

  // 5. Run Economic Engine (unmodified)
  const { calc, monthly } = eeRecalc(inputs);

  // 6. Capacity
  const necessaria = calc["CAPACITY NECESSARIA"] ?? 0;
  const capResult = calcCapacity(necessaria, cfg.capacity, cfg.outsourcing);
  const feasibility = classifyFeasibility(capResult, cfg.capConstraint.stressThreshold);

  // 7. MRR: same formula as Indicatori component (last month × 12)
  const mrr = monthly.length === 12 ? monthly[11].ricRic * 12 : 0;

  const vdp = calc["VALORE DELLA PRODUZIONE"] ?? 0;
  const totalCosts = calc["TOTALE COSTI"] ?? 0;
  const margine = calc["MARGINE LORDO (NO BANDI)"] ?? 0;

  // 8. Constraint engine
  const constraintResults = evaluateConstraints(inputs, capResult, sc, cfg.constraints);

  return {
    inputs,
    vdp,
    totalCosts,
    margine,
    marginePerc: vdp > 0 ? (margine / vdp) * 100 : 0,
    mrr,
    totalVendite: calc["TOTALE VENDITE"] ?? 0,
    offerteGenerate: sc.offerteGenerate,
    maxOfferteGestibili: sc.maxGestibili,
    offerteGestite: sc.offerteGestite,
    offerteScartate: sc.offerteScartate,
    capacity: capResult,
    feasibility,
    constraintResults,
  };
}

// ─── MONTE CARLO ─────────────────────────────────────────────────────────────

export function runMonteCarlo(
  cfg: SimConfig,
  baseValues: Record<string, number>,
): SimRunResult[] {
  const rng = cfg.seed !== undefined ? createSeededRng(cfg.seed) : Math.random;
  const results: SimRunResult[] = [];
  for (let i = 0; i < cfg.numRuns; i++) {
    results.push(runSingleSimulation(cfg, baseValues, rng));
  }
  return results;
}

// ─── ANALYSIS ────────────────────────────────────────────────────────────────

function computeConstraintPressure(results: SimRunResult[]): ConstraintPressure[] {
  const n = results.length;
  if (n === 0) return [];

  const allIds = new Set(results.flatMap((r) => r.constraintResults.map((c) => c.constraintId)));
  return Array.from(allIds).map((id) => {
    const def = DEFAULT_CONSTRAINT_DEFS.find((d) => d.id === id);
    const runs = results.map((r) => r.constraintResults.find((c) => c.constraintId === id));
    const valid = runs.filter((c): c is ConstraintRunResult => c !== undefined);
    const nn = valid.length;
    if (nn === 0) return null;

    return {
      constraintId: id,
      name: def?.name ?? id,
      category: def?.category ?? "DELIVERY",
      tipo: def?.tipo ?? "SOFT",
      status: def?.status ?? "INACTIVE",
      pctTouched:   valid.filter((c) => c.touched).length / nn,
      pctExceeded:  valid.filter((c) => c.exceeded).length / nn,
      pctResolved:  valid.filter((c) => c.resolved).length / nn,
      pctUnresolved:valid.filter((c) => c.unresolved).length / nn,
      avgResponseCost: valid.reduce((s, c) => s + c.responseCost, 0) / nn,
      bindingCount: valid.filter((c) => c.unresolved).length,
    } satisfies ConstraintPressure;
  }).filter((p): p is ConstraintPressure => p !== null);
}

export function analyzeResults(
  results: SimRunResult[],
  margineTarget: number,
  varMeta: VarMeta[],
): SimAnalysis {
  const n = results.length;
  if (n === 0) {
    return {
      percentiles: { p10: 0, p25: 0, p50: 0, p75: 0, p90: 0, mean: 0 },
      probPositive: 0,
      probAboveTarget: 0,
      feasibleCount: 0,
      stressedCount: 0,
      notFeasibleCount: 0,
      sensitivity: [],
      maxFeasibleVdp: 0,
      maxFeasibleMargine: 0,
      mainConstraint: "—",
      constraintPressure: [],
    };
  }

  const margines = results.map((r) => r.margine);
  const feasible = results.filter((r) => r.feasibility === "FEASIBLE");
  const stressed = results.filter((r) => r.feasibility === "CAPACITY_STRESSED");
  const notFeasible = results.filter((r) => r.feasibility === "NOT_FEASIBLE");

  // Sensitivity: Pearson on active DISTRIBUTION vars
  const activeKeys = SIM_DISTRIBUTION_KEYS.filter((k) => {
    const xs = results.map((r) => r.inputs[k] ?? 0);
    const first = xs[0];
    return xs.some((v) => v !== first);
  });

  const sensitivity: SensitivityEntry[] = activeKeys
    .map((key) => {
      const xs = results.map((r) => r.inputs[key] ?? 0);
      const meta = varMeta.find((m) => m.key === key);
      return {
        key,
        label: meta?.label ?? key,
        pearson: calcPearson(xs, margines),
        spearman: calcSpearman(xs, margines),
      };
    })
    .filter((e) => Math.abs(e.pearson) > 0.001)
    .sort((a, b) => Math.abs(b.pearson) - Math.abs(a.pearson));

  // Constraint pressure
  const constraintPressure = computeConstraintPressure(results);

  // Main constraint: find which was binding in NOT_FEASIBLE scenarios
  let mainConstraint = "—";
  if (notFeasible.length > 0) {
    const bindingCounts: Record<string, number> = {};
    for (const r of notFeasible) {
      for (const cr of r.constraintResults) {
        if (cr.unresolved) {
          bindingCounts[cr.constraintId] = (bindingCounts[cr.constraintId] ?? 0) + 1;
        }
      }
    }
    const top = Object.entries(bindingCounts).sort((a, b) => b[1] - a[1])[0];
    if (top) {
      const def = DEFAULT_CONSTRAINT_DEFS.find((d) => d.id === top[0]);
      mainConstraint = def?.name ?? top[0];
    } else {
      const capCount = notFeasible.filter((r) => r.capacity.unservedHours > 0).length;
      const salesCount = notFeasible.filter((r) => r.offerteScartate > 0).length;
      mainConstraint = capCount >= salesCount ? "Capacity operativa" : "Sales capacity";
    }
  }

  return {
    percentiles: calcPercentiles(margines),
    probPositive: results.filter((r) => r.margine > 0).length / n,
    probAboveTarget: results.filter((r) => r.margine > margineTarget).length / n,
    feasibleCount: feasible.length,
    stressedCount: stressed.length,
    notFeasibleCount: notFeasible.length,
    sensitivity,
    maxFeasibleVdp: feasible.length > 0 ? Math.max(...feasible.map((r) => r.vdp)) : 0,
    maxFeasibleMargine: feasible.length > 0 ? Math.max(...feasible.map((r) => r.margine)) : 0,
    mainConstraint,
    constraintPressure,
  };
}

// ─── DEFAULT CONFIG ───────────────────────────────────────────────────────────

export function buildDefaultSimConfig(eeValues?: Record<string, number>): SimConfig {
  const mockMetrics = getEeMockMetrics();
  const { values: mockValues } = initEeValues(mockMetrics, getEeYear());
  const base = eeValues ?? mockValues;

  const distributions: Record<string, DistConfig> = {};
  for (const key of SIM_DISTRIBUTION_KEYS) {
    const current = base[key] ?? 0;
    distributions[key] = {
      type: "fixed",
      current,
      min: current,
      mostLikely: current,
      max: current,
      stddev: Math.max(current * 0.1, 0.001),
      confidence: 0.8,
      source: "DA DEFINIRE",
    };
  }

  return {
    distributions,
    capacity: { numPersone: 5, oreTeoriche: 1760, percAvailability: 0.8 },
    outsourcing: { maxHours: 0, costoOra: 50 },
    capConstraint: { stressThreshold: 0.15 },
    constraints: { enforceRecurringStock: true, enforceSalesCapacity: true },
    numRuns: 1000,
    seed: undefined,
    margineTarget: 0,
  };
}
