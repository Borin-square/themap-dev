import { describe, it, expect } from "vitest";
import {
  createSeededRng,
  sampleFixed,
  sampleUniform,
  sampleTriangular,
  sampleNormal,
  sampleDist,
  calcPercentiles,
  calcPearson,
  calcSpearman,
  calcCapacityDisponibile,
  calcCapacity,
  classifyFeasibility,
  applySalesCapacityConstraint,
  runSingleSimulation,
  runMonteCarlo,
  buildDefaultSimConfig,
  analyzeResults,
  SIM_VAR_META,
  type SimConfig,
  type DistConfig,
} from "@/lib/simulation-engine";
import { eeRecalc, getEeMockMetrics, initEeValues, getEeYear } from "@/lib/economic-engine";

// ─── RNG ─────────────────────────────────────────────────────────────────────

describe("createSeededRng", () => {
  it("produces values in [0, 1)", () => {
    const rng = createSeededRng(42);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("is reproducible with the same seed", () => {
    const r1 = createSeededRng(99);
    const r2 = createSeededRng(99);
    for (let i = 0; i < 50; i++) {
      expect(r1()).toBe(r2());
    }
  });

  it("produces different sequences with different seeds", () => {
    const r1 = createSeededRng(1);
    const r2 = createSeededRng(2);
    const seq1 = Array.from({ length: 20 }, () => r1());
    const seq2 = Array.from({ length: 20 }, () => r2());
    expect(seq1).not.toEqual(seq2);
  });
});

// ─── DISTRIBUTIONS ───────────────────────────────────────────────────────────

describe("sampleFixed", () => {
  it("always returns current value", () => {
    expect(sampleFixed(42)).toBe(42);
    expect(sampleFixed(0)).toBe(0);
    expect(sampleFixed(-5)).toBe(-5);
  });
});

describe("sampleUniform", () => {
  it("stays within [min, max]", () => {
    const rng = createSeededRng(1);
    for (let i = 0; i < 500; i++) {
      const v = sampleUniform(10, 30, rng);
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThanOrEqual(30);
    }
  });

  it("handles degenerate case min=max", () => {
    const rng = createSeededRng(1);
    expect(sampleUniform(5, 5, rng)).toBe(5);
  });
});

describe("sampleTriangular", () => {
  it("stays within [min, max]", () => {
    const rng = createSeededRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = sampleTriangular(0, 5, 10, rng);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(10);
    }
  });

  it("returns mode when min=max", () => {
    const rng = createSeededRng(1);
    expect(sampleTriangular(5, 5, 5, rng)).toBe(5);
  });

  it("mean is approximately (min+mode+max)/3 over many samples", () => {
    const rng = createSeededRng(13);
    const N = 10000;
    let sum = 0;
    for (let i = 0; i < N; i++) sum += sampleTriangular(0, 3, 6, rng);
    const empiricalMean = sum / N;
    const theoreticalMean = (0 + 3 + 6) / 3;
    expect(Math.abs(empiricalMean - theoreticalMean)).toBeLessThan(0.15);
  });
});

describe("sampleNormal", () => {
  it("mean is approximately correct over many samples", () => {
    const rng = createSeededRng(21);
    const N = 10000;
    let sum = 0;
    for (let i = 0; i < N; i++) sum += sampleNormal(100, 15, rng);
    const empiricalMean = sum / N;
    expect(Math.abs(empiricalMean - 100)).toBeLessThan(1);
  });
});

describe("sampleDist", () => {
  it("dispatches correctly by type", () => {
    const rng = () => 0.5;
    const fixedCfg: DistConfig = { type: "fixed", current: 42, min: 0, mostLikely: 42, max: 100, stddev: 5, confidence: 1, source: "" };
    expect(sampleDist(fixedCfg, rng)).toBe(42);

    const unifCfg: DistConfig = { type: "uniform", current: 10, min: 10, mostLikely: 15, max: 20, stddev: 2, confidence: 1, source: "" };
    expect(sampleDist(unifCfg, rng)).toBe(15); // 10 + 0.5*(20-10)
  });
});

// ─── STATISTICS ──────────────────────────────────────────────────────────────

describe("calcPercentiles", () => {
  it("returns correct percentiles for sorted array", () => {
    const vals = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    const p = calcPercentiles(vals);
    expect(p.p50).toBeCloseTo(50.5, 0);
    expect(p.p10).toBeCloseTo(10.9, 0);
    expect(p.p90).toBeCloseTo(90.1, 0);
    expect(p.mean).toBeCloseTo(50.5, 0);
  });

  it("handles single value", () => {
    const p = calcPercentiles([42]);
    expect(p.p50).toBe(42);
    expect(p.mean).toBe(42);
  });

  it("handles empty array", () => {
    const p = calcPercentiles([]);
    expect(p.p50).toBe(0);
  });

  it("p10 < p25 < p50 < p75 < p90 for non-degenerate data", () => {
    const rng = createSeededRng(5);
    const vals = Array.from({ length: 1000 }, () => sampleNormal(0, 1, rng));
    const p = calcPercentiles(vals);
    expect(p.p10).toBeLessThan(p.p25);
    expect(p.p25).toBeLessThan(p.p50);
    expect(p.p50).toBeLessThan(p.p75);
    expect(p.p75).toBeLessThan(p.p90);
  });
});

describe("calcPearson", () => {
  it("returns 1 for perfectly correlated arrays", () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = [2, 4, 6, 8, 10];
    expect(calcPearson(xs, ys)).toBeCloseTo(1, 5);
  });

  it("returns -1 for perfectly negatively correlated arrays", () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = [5, 4, 3, 2, 1];
    expect(calcPearson(xs, ys)).toBeCloseTo(-1, 5);
  });

  it("returns 0 for constant array", () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = [7, 7, 7, 7, 7];
    expect(calcPearson(xs, ys)).toBe(0);
  });
});

describe("calcSpearman", () => {
  it("returns 1 for monotonically increasing pair", () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = [10, 20, 50, 100, 1000];
    expect(calcSpearman(xs, ys)).toBeCloseTo(1, 5);
  });

  it("handles ties correctly (no NaN)", () => {
    const xs = [1, 1, 2, 2, 3];
    const ys = [1, 2, 3, 4, 5];
    const r = calcSpearman(xs, ys);
    expect(Number.isFinite(r)).toBe(true);
  });
});

// ─── CAPACITY ────────────────────────────────────────────────────────────────

describe("calcCapacityDisponibile", () => {
  it("computes numPersone × oreTeoriche × percAvailability", () => {
    expect(calcCapacityDisponibile({ numPersone: 5, oreTeoriche: 1760, percAvailability: 0.8 }))
      .toBe(5 * 1760 * 0.8);
  });
});

describe("calcCapacity", () => {
  const cap = { numPersone: 5, oreTeoriche: 1760, percAvailability: 0.8 };
  const out = { maxHours: 500, costoOra: 50 };

  it("no gap: all internal, no outsourcing", () => {
    const r = calcCapacity(1000, cap, out);
    expect(r.outsourcedHours).toBe(0);
    expect(r.unservedHours).toBe(0);
    expect(r.internalHours).toBe(1000);
  });

  it("gap within outsourcing limit: outsourced = gap", () => {
    const disponibile = 5 * 1760 * 0.8; // 7040
    const necessaria = disponibile + 200;
    const r = calcCapacity(necessaria, cap, out);
    expect(r.outsourcedHours).toBeCloseTo(200, 0);
    expect(r.unservedHours).toBe(0);
    expect(r.outsourcingCost).toBeCloseTo(200 * 50, 0);
  });

  it("gap exceeds outsourcing limit: unservedHours > 0", () => {
    const disponibile = 5 * 1760 * 0.8;
    const necessaria = disponibile + 600; // gap 600 > maxHours 500
    const r = calcCapacity(necessaria, cap, out);
    expect(r.outsourcedHours).toBe(500);
    expect(r.unservedHours).toBeCloseTo(100, 0);
  });

  it("scenario not feasible when unserved > 0", () => {
    const disponibile = 5 * 1760 * 0.8;
    const r = calcCapacity(disponibile + 600, cap, out);
    expect(classifyFeasibility(r, 0.15)).toBe("NOT_FEASIBLE");
  });

  it("scenario feasible when no gap and no outsourcing", () => {
    const r = calcCapacity(1000, cap, { maxHours: 0, costoOra: 50 });
    expect(classifyFeasibility(r, 0.15)).toBe("FEASIBLE");
  });

  it("scenario stressed when outsourcing is used", () => {
    const disponibile = 5 * 1760 * 0.8;
    const r = calcCapacity(disponibile + 200, cap, out); // gap 200, within limit
    expect(classifyFeasibility(r, 0.15)).toBe("CAPACITY_STRESSED");
  });
});

// ─── SALES CAPACITY CONSTRAINT ───────────────────────────────────────────────

describe("applySalesCapacityConstraint", () => {
  it("passes through when total <= max", () => {
    const vals = {
      "N° OFFERTE F. SALES": 10,
      "N° OFFERTE FONTE MARKETING": 5,
      "N° COMMERCIALI": 2,
      "CAPIENZA SALES EXECUTIVE": 10,
    };
    const r = applySalesCapacityConstraint(vals);
    expect(r.offerteScartate).toBe(0);
    expect(r.offerteGestite).toBe(15);
  });

  it("caps total when exceeding capacity", () => {
    const vals = {
      "N° OFFERTE F. SALES": 20,
      "N° OFFERTE FONTE MARKETING": 10,
      "N° COMMERCIALI": 2,
      "CAPIENZA SALES EXECUTIVE": 10,
    };
    const r = applySalesCapacityConstraint(vals);
    expect(r.maxGestibili).toBe(20);
    expect(r.offerteGestite).toBe(20);
    expect(r.offerteScartate).toBe(10);
    // Pro-rated: sales 20/30, mkt 10/30
    expect(r.offerteGestite_sales).toBeCloseTo((20 / 30) * 20, 5);
    expect(r.offerteGestite_marketing).toBeCloseTo((10 / 30) * 20, 5);
  });

  it("sum of gestite_sales + gestite_marketing = offerteGestite", () => {
    const vals = {
      "N° OFFERTE F. SALES": 30,
      "N° OFFERTE FONTE MARKETING": 20,
      "N° COMMERCIALI": 3,
      "CAPIENZA SALES EXECUTIVE": 10,
    };
    const r = applySalesCapacityConstraint(vals);
    expect(r.offerteGestite_sales + r.offerteGestite_marketing).toBeCloseTo(r.offerteGestite, 8);
  });
});

// ─── RECURRING + STOCK CONSTRAINT ────────────────────────────────────────────

describe("enforceRecurringStock in runSingleSimulation", () => {
  it("PERC_STOCK = 1 - PERC_RIC when constraint enabled", () => {
    const mockMetrics = getEeMockMetrics();
    const { values: base } = initEeValues(mockMetrics, getEeYear());
    const cfg = buildDefaultSimConfig(base);
    cfg.constraints.enforceRecurringStock = true;
    base["PERC. RICORRENTI"] = 0.7;

    const result = runSingleSimulation(cfg, base, () => 0.5);
    expect(result.inputs["PERC. RICORRENTI"]).toBeCloseTo(0.7, 5);
    expect(result.inputs["PERC. STOCK"]).toBeCloseTo(0.3, 5);
    expect(result.inputs["PERC. RICORRENTI"] + result.inputs["PERC. STOCK"]).toBeCloseTo(1, 10);
  });
});

// ─── SIMULATION REPRODUCIBILITY ──────────────────────────────────────────────

describe("runMonteCarlo reproducibility", () => {
  it("same seed produces identical results", () => {
    const mockMetrics = getEeMockMetrics();
    const { values: base } = initEeValues(mockMetrics, getEeYear());
    const cfg = buildDefaultSimConfig(base);
    cfg.numRuns = 100;
    cfg.seed = 12345;

    // Make at least one var non-fixed to exercise sampling
    cfg.distributions["N° OFFERTE F. SALES"] = {
      type: "uniform",
      current: 30,
      min: 20,
      mostLikely: 30,
      max: 40,
      stddev: 5,
      confidence: 0.8,
      source: "test",
    };

    const r1 = runMonteCarlo(cfg, base);
    const r2 = runMonteCarlo(cfg, base);

    expect(r1.length).toBe(100);
    expect(r2.length).toBe(100);
    for (let i = 0; i < 100; i++) {
      expect(r1[i].vdp).toBe(r2[i].vdp);
      expect(r1[i].margine).toBe(r2[i].margine);
    }
  });
});

// ─── BASE SCENARIO MATCHES ECONOMIC ENGINE ───────────────────────────────────

describe("Simulation base ≡ Economic Engine when all FIXED and constraints inactive", () => {
  it("VDP and margine match eeRecalc when all distributions are fixed", () => {
    const mockMetrics = getEeMockMetrics();
    const { values: base } = initEeValues(mockMetrics, getEeYear());

    // Build config with all distributions FIXED (type=fixed with current=base value)
    const cfg = buildDefaultSimConfig(base);
    cfg.constraints.enforceRecurringStock = false;
    cfg.constraints.enforceSalesCapacity = false;

    // Large capacity so it never constrains
    cfg.capacity = { numPersone: 9999, oreTeoriche: 9999, percAvailability: 1 };
    cfg.outsourcing = { maxHours: 0, costoOra: 0 };

    const result = runSingleSimulation(cfg, base, () => 0.5);
    const { calc } = eeRecalc(base);

    expect(result.vdp).toBeCloseTo(calc["VALORE DELLA PRODUZIONE"] ?? 0, 0);
    expect(result.margine).toBeCloseTo(calc["MARGINE LORDO (NO BANDI)"] ?? 0, 0);
    expect(result.totalCosts).toBeCloseTo(calc["TOTALE COSTI"] ?? 0, 0);
  });
});

// ─── DISTRIBUTION BOUNDS ─────────────────────────────────────────────────────

describe("distribution sampling stays within valid bounds", () => {
  it("percent variables (0-1) are clamped after sampling", () => {
    const mockMetrics = getEeMockMetrics();
    const { values: base } = initEeValues(mockMetrics, getEeYear());
    const cfg = buildDefaultSimConfig(base);
    cfg.numRuns = 500;
    cfg.seed = 7;
    cfg.constraints.enforceSalesCapacity = false;
    cfg.capacity = { numPersone: 9999, oreTeoriche: 9999, percAvailability: 1 };
    cfg.outsourcing = { maxHours: 0, costoOra: 0 };

    // Set churn as a normal that could go out of [0,1]
    cfg.distributions["CHURN RATE"] = {
      type: "normal",
      current: 0.03,
      min: 0,
      mostLikely: 0.03,
      max: 0.1,
      stddev: 0.05, // large stddev to stress-test clamping
      confidence: 0.8,
      source: "test",
    };

    const results = runMonteCarlo(cfg, base);
    for (const r of results) {
      const churn = r.inputs["CHURN RATE"];
      expect(churn).toBeGreaterThanOrEqual(0);
      expect(churn).toBeLessThanOrEqual(1);
    }
  });
});

// ─── SCENARIO NOT FEASIBLE ───────────────────────────────────────────────────

describe("NOT_FEASIBLE scenario detection", () => {
  it("marks NOT_FEASIBLE when unserved hours > 0", () => {
    const mockMetrics = getEeMockMetrics();
    const { values: base } = initEeValues(mockMetrics, getEeYear());
    const cfg = buildDefaultSimConfig(base);
    cfg.constraints.enforceRecurringStock = false;
    cfg.constraints.enforceSalesCapacity = false;

    // Tiny capacity so almost certainly NOT_FEASIBLE
    cfg.capacity = { numPersone: 0, oreTeoriche: 0, percAvailability: 0 };
    cfg.outsourcing = { maxHours: 0, costoOra: 0 };

    const result = runSingleSimulation(cfg, base, () => 0.5);
    // If VDP > 0, capacity necessaria > 0, and disponibile = 0 → unserved > 0
    if (result.vdp > 0) {
      expect(result.feasibility).toBe("NOT_FEASIBLE");
      expect(result.capacity.unservedHours).toBeGreaterThan(0);
    }
  });
});

// ─── OUTSOURCING OVERFLOW ─────────────────────────────────────────────────────

describe("outsourcing overflow", () => {
  it("correctly splits between internal, outsourced, unserved", () => {
    const disponibile = 1000;
    const necessaria = 1800;
    const maxOutsourcing = 500;
    const cap = { numPersone: 1, oreTeoriche: disponibile, percAvailability: 1 };
    const out = { maxHours: maxOutsourcing, costoOra: 100 };

    const r = calcCapacity(necessaria, cap, out);
    expect(r.internalHours).toBe(1000);
    expect(r.outsourcedHours).toBe(500);
    expect(r.unservedHours).toBe(300); // 1800 - 1000 - 500
    expect(r.outsourcingCost).toBe(500 * 100);
  });
});

// ─── PERCENTILES IN ANALYSIS ──────────────────────────────────────────────────

describe("analyzeResults percentiles and probabilities", () => {
  it("probPositive matches fraction above 0", () => {
    const mockMetrics = getEeMockMetrics();
    const { values: base } = initEeValues(mockMetrics, getEeYear());
    const cfg = buildDefaultSimConfig(base);
    cfg.numRuns = 200;
    cfg.seed = 99;
    cfg.capacity = { numPersone: 9999, oreTeoriche: 9999, percAvailability: 1 };
    cfg.outsourcing = { maxHours: 0, costoOra: 0 };

    const results = runMonteCarlo(cfg, base);
    const analysis = analyzeResults(results, 50000, SIM_VAR_META);

    const manualProb = results.filter((r) => r.margine > 0).length / results.length;
    expect(analysis.probPositive).toBeCloseTo(manualProb, 10);
  });

  it("probAboveTarget matches fraction above target", () => {
    const mockMetrics = getEeMockMetrics();
    const { values: base } = initEeValues(mockMetrics, getEeYear());
    const cfg = buildDefaultSimConfig(base);
    cfg.numRuns = 100;
    cfg.seed = 42;
    cfg.margineTarget = 100000;
    cfg.capacity = { numPersone: 9999, oreTeoriche: 9999, percAvailability: 1 };
    cfg.outsourcing = { maxHours: 0, costoOra: 0 };

    const results = runMonteCarlo(cfg, base);
    const analysis = analyzeResults(results, 100000, SIM_VAR_META);

    const manualProb = results.filter((r) => r.margine > 100000).length / results.length;
    expect(analysis.probAboveTarget).toBeCloseTo(manualProb, 10);
  });
});
