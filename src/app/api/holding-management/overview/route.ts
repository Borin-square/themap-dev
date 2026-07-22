import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";
import { fwMom, type FwData, type FwConfig } from "@/lib/flywheel";
import { eeRecalc } from "@/lib/economic-engine";
import { dataVersion } from "@/lib/square-marketing-data";

function fwKeys(slug: string): { data: string; config: string } {
  const v = dataVersion(slug);
  const suf = v != null ? `:v${v}` : "";
  return { data: `fwData${suf}`, config: `fwConfig${suf}` };
}

async function authOk(req: NextRequest): Promise<boolean> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7);
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data: { user }, error } = await supabase.auth.getUser(token);
  return !!user && !error;
}

interface OperativeStats {
  slug: string;
  name: string;
  color: string;
  momentum: number | null;         // 0..1 ratio (real/forecast for the year)
  revenueForecast: number | null;  // TOTALE VENDITE (yearly)
  costsForecast: number | null;    // sum of monthly costiTot
  marginForecast: number | null;   // revenue - costs
  hasFlywheel: boolean;
  hasEconomicEngine: boolean;
}

export async function GET(req: NextRequest) {
  if (!(await authOk(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const yearParam = req.nextUrl.searchParams.get("year");
  const year = yearParam ? parseInt(yearParam, 10) : 2026;
  if (Number.isNaN(year)) return NextResponse.json({ error: "year invalido" }, { status: 400 });

  const svc = createServiceClient();

  const { data: companies, error: cErr } = await svc
    .from("companies")
    .select("slug, name, color, type")
    .eq("type", "operative")
    .order("name");
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

  const slugs = (companies ?? []).map((c) => c.slug);
  if (slugs.length === 0) {
    return NextResponse.json({ operatives: [], totals: emptyTotals(), year });
  }

  const wantedKeys = new Set<string>(["eeForecast"]);
  for (const s of slugs) {
    const k = fwKeys(s);
    wantedKeys.add(k.data);
    wantedKeys.add(k.config);
  }
  const { data: states, error: sErr } = await svc
    .from("app_state")
    .select("company, key, data")
    .in("company", slugs)
    .in("key", Array.from(wantedKeys))
    .eq("year", year);
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });

  const stateBy: Record<string, { fwData?: FwData; fwConfig?: FwConfig; eeForecast?: Record<string, number> }> = {};
  for (const row of states ?? []) {
    const k = fwKeys(row.company);
    stateBy[row.company] ??= {};
    if (row.key === k.data) stateBy[row.company].fwData = row.data as FwData;
    else if (row.key === k.config) stateBy[row.company].fwConfig = row.data as FwConfig;
    else if (row.key === "eeForecast") stateBy[row.company].eeForecast = row.data as Record<string, number>;
  }

  const operatives: OperativeStats[] = (companies ?? []).map((c) => {
    const st = stateBy[c.slug] || {};
    let momentum: number | null = null;
    if (st.fwData && st.fwConfig) {
      try { momentum = fwMom(st.fwData, "ytd", st.fwConfig); } catch { momentum = null; }
    }

    let revenueForecast: number | null = null;
    let costsForecast: number | null = null;
    let marginForecast: number | null = null;
    if (st.eeForecast) {
      try {
        const { calc } = eeRecalc(st.eeForecast);
        revenueForecast = typeof calc["VALORE DELLA PRODUZIONE"] === "number" ? calc["VALORE DELLA PRODUZIONE"] : null;
        costsForecast = typeof calc["TOTALE COSTI"] === "number" ? calc["TOTALE COSTI"] : null;
        marginForecast = typeof calc["MARGINE LORDO (NO BANDI)"] === "number" ? calc["MARGINE LORDO (NO BANDI)"] : null;
      } catch { /* leave nulls */ }
    }

    return {
      slug: c.slug,
      name: c.name,
      color: c.color,
      momentum,
      revenueForecast,
      costsForecast,
      marginForecast,
      hasFlywheel: !!st.fwData,
      hasEconomicEngine: !!st.eeForecast,
    };
  });

  const totals = {
    revenueForecast: sumNonNull(operatives.map((o) => o.revenueForecast)),
    costsForecast: sumNonNull(operatives.map((o) => o.costsForecast)),
    marginForecast: sumNonNull(operatives.map((o) => o.marginForecast)),
    avgMomentum: avgNonNull(operatives.map((o) => o.momentum)),
    countOperatives: operatives.length,
    countWithFlywheel: operatives.filter((o) => o.hasFlywheel).length,
    countWithEE: operatives.filter((o) => o.hasEconomicEngine).length,
  };

  return NextResponse.json({ operatives, totals, year });
}

function emptyTotals() {
  return {
    revenueForecast: 0,
    costsForecast: 0,
    marginForecast: 0,
    avgMomentum: null,
    countOperatives: 0,
    countWithFlywheel: 0,
    countWithEE: 0,
  };
}

function sumNonNull(xs: (number | null)[]): number {
  let sum = 0;
  for (const x of xs) if (typeof x === "number") sum += x;
  return sum;
}

function avgNonNull(xs: (number | null)[]): number | null {
  const vs = xs.filter((x): x is number => typeof x === "number");
  if (vs.length === 0) return null;
  return vs.reduce((s, x) => s + x, 0) / vs.length;
}
