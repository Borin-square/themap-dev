import { supabase } from "./supabase";
import { eeRecalc } from "./economic-engine";
import type { Persona } from "./people";

// ============================================================
// TYPES
// ============================================================

export type PortfolioStatus = "portfolio" | "evaluating" | "incubating" | "exited" | "archived";
export type MaturityStage = "rotta" | "porto" | "corporazioni" | "repubblica" | "arsenale";
export type RevenueStatus = "revenue" | "pre_revenue" | "unknown";
export type DataType = "actual" | "forecast";
export type CrossSellStatus = "open" | "won" | "lost" | "cancelled";

export const MATURITY_ORDER: MaturityStage[] = ["rotta", "porto", "corporazioni", "repubblica", "arsenale"];
export const MATURITY_LABELS: Record<MaturityStage, string> = {
  rotta: "I · Rotta",
  porto: "II · Porto",
  corporazioni: "III · Corporazioni",
  repubblica: "IV · Repubblica",
  arsenale: "V · Arsenale",
};

export const PORTFOLIO_LABELS: Record<PortfolioStatus, string> = {
  portfolio: "Portfolio",
  evaluating: "Evaluating",
  incubating: "Incubating",
  exited: "Exited",
  archived: "Archived",
};

export interface CompanyMap {
  company_slug: string;
  portfolio_status: PortfolioStatus;
  /** Posizione strategica (services↔products, B2B↔community). Business meaning. */
  strategic_x: number;
  strategic_y: number;
  /** Posizione visiva sulla base-map illustrata. Se null: fallback su strategic_x/y. */
  render_x: number | null;
  render_y: number | null;
  /** Variante grafica città (portfolio/evaluating/incubating/...). Default = portfolio_status. */
  asset_variant: string | null;
  expandability_score: number | null;
  confidence_score: number | null;
  ownership_pct: number | null;
  business_model: string | null;
  emblem_path: string | null;
  city_seed: string;
  notes: string | null;
  // joined from companies
  name: string;
  color: string;
}

export interface SettlementAnchor {
  id: string;
  name: string;
  render_x: number;
  render_y: number;
  region: string | null;
  capacity: number;
  notes: string | null;
}

export interface SnapshotOverride {
  company_slug: string;
  year: number;
  headcount: number | null;
  revenue: number | null;
  ebitda: number | null;
  revenue_status: RevenueStatus;
  maturity_stage: MaturityStage | null;
  data_type: DataType;
  notes: string | null;
}

export interface CrossSellEvent {
  id: string;
  source_slug: string;
  dest_slug: string;
  year: number;
  status: CrossSellStatus;
  client_reference: string | null;
  opportunity_reference: string | null;
  external_crm_id: string | null;
  expected_revenue: number | null;
  won_revenue: number | null;
  won_margin: number | null;
  opened_at: string;
  closed_at: string | null;
  notes: string | null;
}

/** Snapshot risolto per year: preferisce override manuale, fallback a app_state. */
export interface ResolvedSnapshot {
  company_slug: string;
  year: number;
  headcount: number | null;
  revenue: number | null;
  ebitda: number | null;
  revenue_status: RevenueStatus;
  maturity_stage: MaturityStage | null;
  data_type: DataType;
  // provenance: da dove viene ciascun campo
  source: {
    headcount: "override" | "app_state" | "missing";
    revenue: "override" | "app_state" | "missing";
    ebitda: "override" | "app_state" | "missing";
  };
}

// ============================================================
// FETCHERS
// ============================================================

export const YEAR_MIN = 2024;
export const YEAR_MAX = 2029;
export const CURRENT_YEAR = new Date().getFullYear();

export async function fetchCompanyMaps(): Promise<CompanyMap[]> {
  // Left-join companies (type='operative') + serenissima_company_map.
  // Prendiamo tutte le operative e mostriamo quelle con riga in company_map;
  // le operative senza mappa vengono restituite comunque con default position (0.5, 0.5).
  const { data: companies, error: cErr } = await supabase
    .from("companies")
    .select("slug, name, color, type")
    .eq("type", "operative")
    .order("name");
  if (cErr || !companies) return [];

  const slugs = companies.map((c) => c.slug);
  if (slugs.length === 0) return [];

  const { data: maps } = await supabase
    .from("serenissima_company_map")
    .select("*")
    .in("company_slug", slugs);

  const mapBySlug = new Map<string, Omit<CompanyMap, "name" | "color">>();
  for (const m of maps ?? []) {
    mapBySlug.set(m.company_slug, m as Omit<CompanyMap, "name" | "color">);
  }

  return companies.map((c) => {
    const m = mapBySlug.get(c.slug);
    if (m) return { ...m, name: c.name, color: c.color };
    // Default row per operative senza mappatura
    return {
      company_slug: c.slug,
      portfolio_status: "portfolio" as PortfolioStatus,
      strategic_x: 0.5,
      strategic_y: 0.5,
      render_x: null,
      render_y: null,
      asset_variant: null,
      expandability_score: null,
      confidence_score: null,
      ownership_pct: null,
      business_model: null,
      emblem_path: null,
      city_seed: c.slug,
      notes: null,
      name: c.name,
      color: c.color,
    };
  });
}

export async function fetchSettlementAnchors(): Promise<SettlementAnchor[]> {
  const { data } = await supabase
    .from("serenissima_settlement_anchors")
    .select("*")
    .order("name");
  return (data ?? []) as SettlementAnchor[];
}

/** Ritorna la posizione visiva effettiva: render_x/y se presente, altrimenti strategic. */
export function effectiveRenderCoords(c: CompanyMap): { x: number; y: number } {
  return { x: c.render_x ?? c.strategic_x, y: c.render_y ?? c.strategic_y };
}

/** Snap-to-nearest: dato un punto (0..1) e la lista degli anchor, restituisce
 *  l'anchor libero più vicino (rispetto capacity → considera occupancyBySlug).
 *  Se occupancyBySlug non è passata, tutti gli anchor sono considerati liberi. */
export function snapToNearestAnchor(
  x: number,
  y: number,
  anchors: SettlementAnchor[],
  occupancyByAnchorId?: Map<string, number>,
): SettlementAnchor | null {
  let best: SettlementAnchor | null = null;
  let bestD = Infinity;
  for (const a of anchors) {
    const used = occupancyByAnchorId?.get(a.id) ?? 0;
    if (used >= a.capacity) continue;
    const dx = a.render_x - x;
    const dy = a.render_y - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = a; }
  }
  return best;
}

/** Trova l'anchor che matcha (o è più vicino) alla posizione render corrente. */
export function findAnchorForCoords(
  x: number,
  y: number,
  anchors: SettlementAnchor[],
  tolerance = 0.005,
): SettlementAnchor | null {
  const tolSq = tolerance * tolerance;
  for (const a of anchors) {
    const dx = a.render_x - x;
    const dy = a.render_y - y;
    if (dx * dx + dy * dy <= tolSq) return a;
  }
  return null;
}

export async function fetchSnapshotOverrides(year: number): Promise<SnapshotOverride[]> {
  const { data } = await supabase
    .from("serenissima_snapshots")
    .select("*")
    .eq("year", year);
  return (data ?? []) as SnapshotOverride[];
}

export async function fetchCrossSell(year: number): Promise<CrossSellEvent[]> {
  const { data } = await supabase
    .from("serenissima_cross_sell")
    .select("*")
    .eq("year", year);
  return (data ?? []) as CrossSellEvent[];
}

/**
 * Legge da app_state per year:
 *  - key='eeForecast' → revenue/ebitda via eeRecalc
 *  - key='people'     → headcount = numero di persone con anni[year] non nullo
 */
export async function fetchAppStateDerived(
  slugs: string[],
  year: number,
): Promise<Map<string, { headcount: number | null; revenue: number | null; ebitda: number | null }>> {
  const result = new Map<string, { headcount: number | null; revenue: number | null; ebitda: number | null }>();
  if (slugs.length === 0) return result;

  const { data } = await supabase
    .from("app_state")
    .select("company, key, data, year")
    .in("company", slugs)
    .in("key", ["eeForecast", "people"])
    .eq("year", year);

  for (const slug of slugs) {
    result.set(slug, { headcount: null, revenue: null, ebitda: null });
  }

  for (const row of data ?? []) {
    const bucket = result.get(row.company);
    if (!bucket) continue;
    if (row.key === "eeForecast") {
      try {
        const { calc } = eeRecalc(row.data as Record<string, number>);
        const rev = calc["VALORE DELLA PRODUZIONE"];
        const mar = calc["MARGINE LORDO (NO BANDI)"];
        if (typeof rev === "number") bucket.revenue = rev;
        if (typeof mar === "number") bucket.ebitda = mar;
      } catch { /* ignore */ }
    } else if (row.key === "people") {
      try {
        const arr = row.data as Persona[];
        if (Array.isArray(arr)) {
          bucket.headcount = arr.filter((p) => p?.anni?.[year] != null).length;
        }
      } catch { /* ignore */ }
    }
  }
  return result;
}

export async function fetchResolvedSnapshots(year: number): Promise<Map<string, ResolvedSnapshot>> {
  const maps = await fetchCompanyMaps();
  const slugs = maps.map((m) => m.company_slug);
  const [overrides, derived] = await Promise.all([
    fetchSnapshotOverrides(year),
    fetchAppStateDerived(slugs, year),
  ]);

  const ovrBySlug = new Map<string, SnapshotOverride>();
  for (const o of overrides) {
    // Preferisci actual > forecast se ci sono duplicati
    const existing = ovrBySlug.get(o.company_slug);
    if (!existing || (existing.data_type === "forecast" && o.data_type === "actual")) {
      ovrBySlug.set(o.company_slug, o);
    }
  }

  const out = new Map<string, ResolvedSnapshot>();
  for (const slug of slugs) {
    const o = ovrBySlug.get(slug);
    const d = derived.get(slug) || { headcount: null, revenue: null, ebitda: null };
    const headcount = o?.headcount ?? d.headcount;
    const revenue = o?.revenue ?? d.revenue;
    const ebitda = o?.ebitda ?? d.ebitda;
    out.set(slug, {
      company_slug: slug,
      year,
      headcount,
      revenue,
      ebitda,
      revenue_status: o?.revenue_status ?? "unknown",
      maturity_stage: o?.maturity_stage ?? null,
      data_type: o?.data_type ?? "actual",
      source: {
        headcount: o?.headcount != null ? "override" : d.headcount != null ? "app_state" : "missing",
        revenue: o?.revenue != null ? "override" : d.revenue != null ? "app_state" : "missing",
        ebitda: o?.ebitda != null ? "override" : d.ebitda != null ? "app_state" : "missing",
      },
    });
  }
  return out;
}

export async function fetchHoldingSlugs(): Promise<string[]> {
  const { data } = await supabase
    .from("companies")
    .select("slug")
    .eq("type", "holding");
  return (data ?? []).map((c) => c.slug as string);
}

// ============================================================
// CALCOLI VISUAL GRAMMAR
// ============================================================

/** Footprint di una città in raggio "world units" (base map = 1000x1000).
 *  Scala nonlineare radice quadrata così un'azienda 4x più grande non è 4x più larga. */
export function headcountToRadius(headcount: number | null): number {
  const h = Math.max(1, headcount ?? 1);
  // Da 1 persona → ~14 unit, 60 persone → ~110 unit
  return 14 + Math.sqrt(h) * 12;
}

/** Semantic band per label descrittivo. */
export function headcountBand(headcount: number | null): string {
  const h = headcount ?? 0;
  if (h <= 0) return "—";
  if (h === 1) return "Avamposto";
  if (h <= 5) return "Villaggio";
  if (h <= 12) return "Borgo";
  if (h <= 30) return "Piccola città";
  if (h <= 60) return "Città";
  return "Grande città";
}

/** Attività/prosperità 0..1 da revenue per persona. */
export function activityLevel(revenuePerPerson: number | null): number {
  if (revenuePerPerson == null || revenuePerPerson <= 0) return 0;
  // Saturazione morbida attorno a 150k/pp
  return Math.min(1, Math.log10(1 + revenuePerPerson / 15000) / 2);
}

/** Raggio area di espansione potenziale (world units). */
export function expandabilityRadius(score: number | null, baseRadius: number): number {
  const s = Math.max(0, Math.min(5, score ?? 0));
  if (s === 0) return 0;
  return baseRadius * (1.4 + s * 0.55);
}

/** Opacità/chiarezza dell'area di espansione 0..1. */
export function confidenceClarity(score: number | null): number {
  const s = Math.max(1, Math.min(5, score ?? 1));
  return 0.12 + (s - 1) * 0.12; // 0.12 .. 0.60
}

export function revenuePerPerson(revenue: number | null, headcount: number | null): number | null {
  if (revenue == null || headcount == null || headcount <= 0) return null;
  return revenue / headcount;
}

// ============================================================
// CROSS-SELL AGGREGATION
// ============================================================

export interface AggregatedRoute {
  source_slug: string;
  dest_slug: string;
  won_revenue: number;
  won_margin: number;
  distinct_clients: number;
  open_pipeline: number;
  open_count: number;
  won_count: number;
}

export function aggregateRoutes(events: CrossSellEvent[]): AggregatedRoute[] {
  const key = (s: string, d: string) => `${s}→${d}`;
  const acc = new Map<string, AggregatedRoute & { clients: Set<string> }>();

  for (const ev of events) {
    const k = key(ev.source_slug, ev.dest_slug);
    let row = acc.get(k);
    if (!row) {
      row = {
        source_slug: ev.source_slug,
        dest_slug: ev.dest_slug,
        won_revenue: 0,
        won_margin: 0,
        distinct_clients: 0,
        open_pipeline: 0,
        open_count: 0,
        won_count: 0,
        clients: new Set(),
      };
      acc.set(k, row);
    }
    if (ev.client_reference) row.clients.add(ev.client_reference);
    if (ev.status === "won") {
      row.won_revenue += ev.won_revenue ?? 0;
      row.won_margin += ev.won_margin ?? 0;
      row.won_count += 1;
    } else if (ev.status === "open") {
      row.open_pipeline += ev.expected_revenue ?? 0;
      row.open_count += 1;
    }
  }

  return Array.from(acc.values()).map((r) => ({
    source_slug: r.source_slug,
    dest_slug: r.dest_slug,
    won_revenue: r.won_revenue,
    won_margin: r.won_margin,
    distinct_clients: r.clients.size,
    open_pipeline: r.open_pipeline,
    open_count: r.open_count,
    won_count: r.won_count,
  }));
}

/** Scala width di una route in base a won_revenue, con clamp min/max. */
export function routeWidth(wonRevenue: number, maxWonRevenue: number): number {
  if (wonRevenue <= 0) return 1.5;
  const t = Math.max(0, Math.min(1, wonRevenue / Math.max(1, maxWonRevenue)));
  return 2 + t * 8; // 2px .. 10px
}

// ============================================================
// FORMATTERS
// ============================================================

export function formatEuro(n: number | null | undefined): string {
  if (n == null) return "—";
  if (Math.abs(n) >= 1_000_000) return `€${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `€${(n / 1_000).toFixed(0)}K`;
  return `€${Math.round(n)}`;
}

export function formatInt(n: number | null | undefined): string {
  if (n == null) return "—";
  return Math.round(n).toString();
}

export function formatPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}
