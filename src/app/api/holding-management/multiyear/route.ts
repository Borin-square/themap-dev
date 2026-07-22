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

interface OpYearRow {
  slug: string;
  revenue: number | null;
  costs: number | null;
  margin: number | null;
  momentum: number | null;
}

interface YearBlock {
  year: number;
  operatives: OpYearRow[];
}

const YEAR_MIN = 2024;
const YEAR_MAX = 2029;

export async function GET(req: NextRequest) {
  if (!(await authOk(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceClient();

  const { data: companies, error: cErr } = await svc
    .from("companies")
    .select("slug, name, color, type")
    .eq("type", "operative")
    .order("name");
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

  const slugs = (companies ?? []).map((c) => c.slug);
  const opsMeta = (companies ?? []).map((c) => ({ slug: c.slug, name: c.name, color: c.color }));

  if (slugs.length === 0) {
    return NextResponse.json({ operatives: [], years: [], yearMin: YEAR_MIN, yearMax: YEAR_MAX });
  }

  const wantedKeys = new Set<string>(["eeForecast"]);
  for (const s of slugs) {
    const k = fwKeys(s);
    wantedKeys.add(k.data);
    wantedKeys.add(k.config);
  }
  const { data: states, error: sErr } = await svc
    .from("app_state")
    .select("company, key, data, year")
    .in("company", slugs)
    .in("key", Array.from(wantedKeys))
    .gte("year", YEAR_MIN)
    .lte("year", YEAR_MAX);
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });

  // Group state by year → company → key
  const byYearCompany: Record<number, Record<string, { fwData?: FwData; fwConfig?: FwConfig; eeForecast?: Record<string, number> }>> = {};
  for (const row of states ?? []) {
    const yr = row.year as number;
    const k = fwKeys(row.company);
    byYearCompany[yr] ??= {};
    byYearCompany[yr][row.company] ??= {};
    if (row.key === k.data) byYearCompany[yr][row.company].fwData = row.data as FwData;
    else if (row.key === k.config) byYearCompany[yr][row.company].fwConfig = row.data as FwConfig;
    else if (row.key === "eeForecast") byYearCompany[yr][row.company].eeForecast = row.data as Record<string, number>;
  }

  const years: YearBlock[] = [];
  for (let year = YEAR_MIN; year <= YEAR_MAX; year++) {
    const perCompany = byYearCompany[year] || {};
    const opRows: OpYearRow[] = opsMeta.map((c) => {
      const st = perCompany[c.slug] || {};
      let momentum: number | null = null;
      if (st.fwData && st.fwConfig) {
        try { momentum = fwMom(st.fwData, "year", st.fwConfig); } catch {}
      }
      let revenue: number | null = null;
      let costs: number | null = null;
      let margin: number | null = null;
      if (st.eeForecast) {
        try {
          const { calc } = eeRecalc(st.eeForecast);
          revenue = typeof calc["VALORE DELLA PRODUZIONE"] === "number" ? calc["VALORE DELLA PRODUZIONE"] : null;
          costs = typeof calc["TOTALE COSTI"] === "number" ? calc["TOTALE COSTI"] : null;
          margin = typeof calc["MARGINE LORDO (NO BANDI)"] === "number" ? calc["MARGINE LORDO (NO BANDI)"] : null;
        } catch {}
      }
      return { slug: c.slug, revenue, costs, margin, momentum };
    });
    years.push({ year, operatives: opRows });
  }

  return NextResponse.json({ operatives: opsMeta, years, yearMin: YEAR_MIN, yearMax: YEAR_MAX });
}
