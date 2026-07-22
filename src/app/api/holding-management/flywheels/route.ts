import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";
import { fwMom, fwGR, FW_FUNCS, type FwData, type FwConfig } from "@/lib/flywheel";
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

interface OperativeFlywheel {
  slug: string;
  name: string;
  color: string;
  momentum: number | null;
  funcRatios: Record<string, number | null>;
  goalCount: number;
  hasFlywheel: boolean;
  fwData: FwData | null;
  fwConfig: FwConfig | null;
}

export async function GET(req: NextRequest) {
  if (!(await authOk(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const yearParam = req.nextUrl.searchParams.get("year");
  const per = req.nextUrl.searchParams.get("per") || "ytd";
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
  if (slugs.length === 0) return NextResponse.json({ operatives: [], year, per });

  // Build set of (company, key) pairs we need to fetch (respecting per-company data version)
  const wantedKeys = new Set<string>();
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

  const stateBy: Record<string, { fwData?: FwData; fwConfig?: FwConfig }> = {};
  for (const row of states ?? []) {
    const k = fwKeys(row.company);
    stateBy[row.company] ??= {};
    if (row.key === k.data) stateBy[row.company].fwData = row.data as FwData;
    else if (row.key === k.config) stateBy[row.company].fwConfig = row.data as FwConfig;
  }

  const operatives: OperativeFlywheel[] = (companies ?? []).map((c) => {
    const st = stateBy[c.slug] || {};
    const funcRatios: Record<string, number | null> = {};
    let goalCount = 0;
    let momentum: number | null = null;
    const hasFlywheel = !!st.fwData;

    if (st.fwData && st.fwConfig) {
      const fwData = st.fwData;
      const fwConfig = st.fwConfig;
      try { momentum = fwMom(fwData, per, fwConfig); } catch {}
      for (const fn of FW_FUNCS) {
        const goals = fwData[fn] || {};
        const names = Object.keys(goals);
        if (names.length === 0) { funcRatios[fn] = null; continue; }
        let sum = 0, count = 0;
        for (const name of names) {
          const cfg = fwConfig[name] || { mode: "STANDARD" as const };
          try {
            const r = fwGR(goals[name], per, cfg);
            if (r !== null) { sum += r; count++; }
          } catch {}
          goalCount++;
        }
        funcRatios[fn] = count > 0 ? sum / count : null;
      }
    } else {
      for (const fn of FW_FUNCS) funcRatios[fn] = null;
    }

    return {
      slug: c.slug,
      name: c.name,
      color: c.color,
      momentum,
      funcRatios,
      goalCount,
      hasFlywheel,
      fwData: st.fwData ?? null,
      fwConfig: st.fwConfig ?? null,
    };
  });

  return NextResponse.json({ operatives, year, per });
}
