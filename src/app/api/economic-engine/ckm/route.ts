import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { authUser } from "@/lib/api-auth";

/**
 * GET /api/economic-engine/ckm?company=<slug>
 * Legge tutti i forecast salvati (app_state key='eeForecast') per la company
 * su TUTTI gli anni e li ritorna come mappa { [year]: values }.
 * La UI ckm calcola poi i risultati (calc) via eeRecalc lato client.
 */
export async function GET(req: NextRequest) {
  const user = await authUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const company = req.nextUrl.searchParams.get("company");
  if (!company) return NextResponse.json({ error: "company richiesto" }, { status: 400 });

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("app_state")
    .select("year,data")
    .eq("company", company)
    .eq("key", "eeForecast");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byYear: Record<string, Record<string, number>> = {};
  for (const row of data ?? []) {
    if (row.year != null && row.data && typeof row.data === "object") {
      byYear[String(row.year)] = row.data as Record<string, number>;
    }
  }
  return NextResponse.json({ byYear });
}
