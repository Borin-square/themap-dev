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

export async function GET(req: NextRequest) {
  if (!(await authOk(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const company = req.nextUrl.searchParams.get("company");
  if (!company) return NextResponse.json({ error: "company richiesto" }, { status: 400 });

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("marketing_snapshots")
    .select("range_key, data, fetched_at")
    .eq("company_slug", company);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byRange: Record<string, { data: unknown; fetched_at: string }> = {};
  for (const row of data ?? []) byRange[row.range_key] = { data: row.data, fetched_at: row.fetched_at };
  return NextResponse.json({ snapshots: byRange });
}
