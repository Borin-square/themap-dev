import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";

async function getUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data: { user }, error } = await supabase.auth.getUser(token);
  return error ? null : user;
}

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const company = req.nextUrl.searchParams.get("company");

  const svc = createServiceClient();
  let q = svc.from("marketing_sync_requests").select("*").order("requested_at", { ascending: false }).limit(10);
  if (company) q = q.eq("company_slug", company);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ requests: data ?? [] });
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { company, range_keys } = body as { company: string; range_keys: string[] };
  if (!company || !Array.isArray(range_keys) || range_keys.length === 0) {
    return NextResponse.json({ error: "company e range_keys richiesti" }, { status: 400 });
  }

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("marketing_sync_requests")
    .insert({
      company_slug: company,
      range_keys,
      status: "pending",
      requested_by: user.email || null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ request: data });
}
