import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";

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

const KEY_CONFIG = "mktgConfig";
const KEY_LAYOUT = "mktgReportLayout";

export async function GET(req: NextRequest) {
  if (!(await authOk(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const company = req.nextUrl.searchParams.get("company");
  if (!company) return NextResponse.json({ error: "company richiesto" }, { status: 400 });

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("app_state")
    .select("key, data")
    .eq("company", company)
    .in("key", [KEY_CONFIG, KEY_LAYOUT])
    .eq("year", 2026);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const out: { config: unknown; layout: unknown } = { config: null, layout: null };
  for (const row of data ?? []) {
    if (row.key === KEY_CONFIG) out.config = row.data;
    else if (row.key === KEY_LAYOUT) out.layout = row.data;
  }
  return NextResponse.json(out);
}

export async function POST(req: NextRequest) {
  if (!(await authOk(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { company, config, layout } = await req.json();
  if (!company) return NextResponse.json({ error: "company richiesto" }, { status: 400 });

  const svc = createServiceClient();
  const rows: { company: string; key: string; year: number; data: unknown; updated_at: string }[] = [];
  const now = new Date().toISOString();
  if (config !== undefined) rows.push({ company, key: KEY_CONFIG, year: 2026, data: config, updated_at: now });
  if (layout !== undefined) rows.push({ company, key: KEY_LAYOUT, year: 2026, data: layout, updated_at: now });
  if (rows.length === 0) return NextResponse.json({ error: "Nessun dato da salvare" }, { status: 400 });

  const { error } = await svc.from("app_state").upsert(rows, { onConflict: "company,key,year" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
