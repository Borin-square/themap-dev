// Generatori procedurali per la mappa Serenissima.
// Tutto seedato per stabilità: la stessa "city_seed" deve produrre la stessa città
// in ogni render / device.

// ============================================================
// SEEDED RNG
// ============================================================

// Mulberry32 — deterministico, buono per estetica (non crypto).
export function makeRng(seedStr: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  let a = h;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rand(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

// ============================================================
// ISLAND / LANDMASS BLOBS
// ============================================================

/**
 * Restituisce un path SVG chiuso che rappresenta un'isola/landmass organica
 * attorno al centro (cx, cy), con raggio medio r. Vertici perturbati da rumore
 * seedato.
 */
export function islandPath(seed: string, cx: number, cy: number, r: number, points = 24): string {
  const rng = makeRng(seed + ":island");
  const pts: [number, number][] = [];
  const base = r;
  // Ampiezza di variazione per rendere le isole irregolari
  const jitter = base * 0.28;
  for (let i = 0; i < points; i++) {
    const ang = (i / points) * Math.PI * 2;
    // Perturbazione a due frequenze (macro + micro)
    const wobble1 = Math.sin(ang * 2 + rng() * 6) * jitter * 0.6;
    const wobble2 = Math.sin(ang * 5 + rng() * 6) * jitter * 0.3;
    const rr = base + wobble1 + wobble2 + rng() * jitter * 0.4 - jitter * 0.2;
    pts.push([cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr]);
  }
  return smoothClosedPath(pts);
}

/** Cubic-bezier smoothed closed path (Catmull-Rom style). */
function smoothClosedPath(pts: [number, number][]): string {
  if (pts.length < 3) return "";
  const n = pts.length;
  const tension = 0.22;
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1x = p1[0] + (p2[0] - p0[0]) * tension;
    const c1y = p1[1] + (p2[1] - p0[1]) * tension;
    const c2x = p2[0] - (p3[0] - p1[0]) * tension;
    const c2y = p2[1] - (p3[1] - p1[1]) * tension;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d + " Z";
}

// ============================================================
// CITY: cluster di building
// ============================================================

export interface Building {
  x: number;
  y: number;
  w: number;
  h: number;
  roof: "gable" | "flat" | "spire";
  tone: number; // 0..1
}

/**
 * Cluster di building deterministico attorno a (cx, cy).
 * count e size derivati da headcount → cityRadius.
 */
export function generateCityBuildings(seed: string, cx: number, cy: number, radius: number): Building[] {
  const rng = makeRng(seed + ":city");
  // 1 building ogni ~14 unit^2 di area, min 3 max 40
  const count = Math.max(3, Math.min(40, Math.floor((radius * radius) / 60)));
  const buildings: Building[] = [];
  const packRadius = radius * 0.72;
  for (let i = 0; i < count; i++) {
    // Disposizione a spirale + jitter
    const t = i / count;
    const ang = t * Math.PI * 2 * 3.2 + rng() * 0.6;
    const rr = Math.sqrt(t) * packRadius * (0.6 + rng() * 0.4);
    const x = cx + Math.cos(ang) * rr;
    const y = cy + Math.sin(ang) * rr;
    const w = rand(rng, 6, 12);
    const h = rand(rng, 8, 18);
    const roll = rng();
    const roof: Building["roof"] = roll < 0.72 ? "gable" : roll < 0.94 ? "flat" : "spire";
    buildings.push({ x, y, w, h, roof, tone: rng() });
  }
  return buildings;
}

// ============================================================
// DECORATIVE ISLETS (scattered "undeveloped territory")
// ============================================================

export interface Islet {
  cx: number;
  cy: number;
  r: number;
  seed: string;
}

/** Genera islets sparsi nel mondo escludendo aree occupate dalle città. */
export function generateIslets(
  worldSeed: string,
  worldW: number,
  worldH: number,
  exclusions: { cx: number; cy: number; r: number }[],
  count = 26,
): Islet[] {
  const rng = makeRng(worldSeed + ":islets");
  const islets: Islet[] = [];
  let tries = 0;
  while (islets.length < count && tries < count * 20) {
    tries++;
    const cx = rand(rng, 40, worldW - 40);
    const cy = rand(rng, 40, worldH - 40);
    const r = rand(rng, 8, 22);
    let ok = true;
    for (const e of exclusions) {
      const dx = cx - e.cx;
      const dy = cy - e.cy;
      if (Math.sqrt(dx * dx + dy * dy) < e.r + r + 30) { ok = false; break; }
    }
    if (!ok) continue;
    // Distanziamento anche tra islets
    for (const i of islets) {
      const dx = cx - i.cx;
      const dy = cy - i.cy;
      if (Math.sqrt(dx * dx + dy * dy) < r + i.r + 24) { ok = false; break; }
    }
    if (!ok) continue;
    islets.push({ cx, cy, r, seed: `${worldSeed}:isl:${islets.length}` });
  }
  return islets;
}

// ============================================================
// MOUNTAINS on islands
// ============================================================

export interface Mountain {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function generateMountains(seed: string, cx: number, cy: number, islandR: number): Mountain[] {
  const rng = makeRng(seed + ":mtn");
  const count = Math.floor(rand(rng, 1, 4));
  const arr: Mountain[] = [];
  for (let i = 0; i < count; i++) {
    const ang = rng() * Math.PI * 2;
    const rr = islandR * (0.45 + rng() * 0.35);
    const x = cx + Math.cos(ang) * rr;
    const y = cy + Math.sin(ang) * rr;
    const w = rand(rng, 18, 34);
    const h = rand(rng, 14, 26);
    arr.push({ x, y, w, h });
  }
  return arr;
}

// ============================================================
// ROUTE PATH (curva tra due punti)
// ============================================================

/** Path SVG a curva quadratica arcuata tra due punti. */
export function curvedPath(x1: number, y1: number, x2: number, y2: number, curvature = 0.25): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  // Perpendicolare al segmento, ampiezza proporzionale alla distanza
  const len = Math.sqrt(dx * dx + dy * dy);
  const px = -dy / (len || 1);
  const py = dx / (len || 1);
  const off = len * curvature;
  const cx = mx + px * off;
  const cy = my + py * off;
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

/** Punto lungo la curva quadratica a t (0..1) — per posizionare label / navi. */
export function pointOnQuadratic(x1: number, y1: number, cx: number, cy: number, x2: number, y2: number, t: number): [number, number] {
  const u = 1 - t;
  const x = u * u * x1 + 2 * u * t * cx + t * t * x2;
  const y = u * u * y1 + 2 * u * t * cy + t * t * y2;
  return [x, y];
}

// ============================================================
// WORLD MAPPING
// ============================================================

export const WORLD_W = 1600;
export const WORLD_H = 900;
// Margine interno: le città vivono nel rettangolo utile.
export const WORLD_PAD = 100;

/** Da coord strategiche (0..1) a coord mondo (con padding). */
export function strategicToWorld(px: number, py: number): { x: number; y: number } {
  const x = WORLD_PAD + px * (WORLD_W - 2 * WORLD_PAD);
  // y invertita: 1 = nord (community/audience), 0 = sud (B2B)
  const y = WORLD_PAD + (1 - py) * (WORLD_H - 2 * WORLD_PAD);
  return { x, y };
}
