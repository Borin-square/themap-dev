import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";
import { fwGR, fwCR, fwDV, FW_FUNCS, type FwData, type FwConfig, type FwGoalData, type FwSubgoalData } from "@/lib/flywheel";
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

interface Alert {
  operativeSlug: string;
  operativeName: string;
  operativeColor: string;
  func: string;
  goalName: string;
  subgoalName: string | null;
  isSubgoal: boolean;
  owner: string;
  ratio: number;
  realValue: string;
  forecastValue: string;
  severity: "red" | "critical";
}

const RED_THRESHOLD = 0.7;
const CRITICAL_THRESHOLD = 0.4;

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
  if (slugs.length === 0) return NextResponse.json({ alerts: [], year, per });

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

  const alerts: Alert[] = [];

  for (const c of companies ?? []) {
    const st = stateBy[c.slug];
    if (!st?.fwData || !st?.fwConfig) continue;
    const fwData = st.fwData;
    const fwConfig = st.fwConfig;

    for (const fn of FW_FUNCS) {
      const goals = fwData[fn] || {};
      for (const goalName of Object.keys(goals)) {
        const gObj: FwGoalData = goals[goalName];
        const cfg = fwConfig[goalName] || { mode: "STANDARD" as const };
        const subKeys = Object.keys(gObj.subgoals);

        let goalRatio: number | null = null;
        try { goalRatio = fwGR(gObj, per, cfg); } catch {}

        // If goal has no subgoals, alert on goal itself when red
        if (subKeys.length === 0) {
          if (goalRatio != null && goalRatio < RED_THRESHOLD) {
            alerts.push({
              operativeSlug: c.slug,
              operativeName: c.name,
              operativeColor: c.color,
              func: fn,
              goalName,
              subgoalName: null,
              isSubgoal: false,
              owner: gObj.owner || "—",
              ratio: goalRatio,
              realValue: fwDV(gObj.real, per, gObj.isPercent, gObj.isCurrency, gObj.decimals),
              forecastValue: fwDV(gObj.forecast, per, gObj.isPercent, gObj.isCurrency, gObj.decimals),
              severity: goalRatio < CRITICAL_THRESHOLD ? "critical" : "red",
            });
          }
          continue;
        }

        // Goal has subgoals: also alert on the parent if aggregate ratio < threshold
        if (goalRatio != null && goalRatio < RED_THRESHOLD) {
          alerts.push({
            operativeSlug: c.slug,
            operativeName: c.name,
            operativeColor: c.color,
            func: fn,
            goalName,
            subgoalName: null,
            isSubgoal: false,
            owner: gObj.owner || "—",
            ratio: goalRatio,
            realValue: fwDV(gObj.real, per, gObj.isPercent, gObj.isCurrency, gObj.decimals),
            forecastValue: fwDV(gObj.forecast, per, gObj.isPercent, gObj.isCurrency, gObj.decimals),
            severity: goalRatio < CRITICAL_THRESHOLD ? "critical" : "red",
          });
        }

        // Alert on every red subgoal individually
        for (const subName of subKeys) {
          const sub: FwSubgoalData = gObj.subgoals[subName];
          let subRatio: number | null = null;
          try {
            subRatio = fwCR(sub, per, cfg.mode, cfg.start, cfg.limInf, cfg.limSup);
          } catch {}
          if (subRatio != null && subRatio < RED_THRESHOLD) {
            alerts.push({
              operativeSlug: c.slug,
              operativeName: c.name,
              operativeColor: c.color,
              func: fn,
              goalName,
              subgoalName: subName,
              isSubgoal: true,
              owner: sub.owner || gObj.owner || "—",
              ratio: subRatio,
              realValue: fwDV(sub.real, per, sub.isPercent, sub.isCurrency, sub.decimals),
              forecastValue: fwDV(sub.forecast, per, sub.isPercent, sub.isCurrency, sub.decimals),
              severity: subRatio < CRITICAL_THRESHOLD ? "critical" : "red",
            });
          }
        }
      }
    }
  }

  // Sort worst → best
  alerts.sort((a, b) => a.ratio - b.ratio);

  return NextResponse.json({ alerts, year, per });
}
