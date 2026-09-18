import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase-server";

async function requireSuperAdmin(req: NextRequest): Promise<{ ok: true } | NextResponse> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const token = authHeader.slice(7);
  const sb = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const svc = createServiceClient();
  const { data: profile } = await svc.from("user_profiles").select("ruolo").eq("id", user.id).single();
  if (profile?.ruolo !== "SUPER_ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return { ok: true };
}

export async function PUT(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if (guard instanceof NextResponse) return guard;
  const b = await req.json();
  if (!b.company_slug || !b.year) return NextResponse.json({ error: "company_slug e year richiesti" }, { status: 400 });
  const svc = createServiceClient();
  const payload = {
    company_slug: b.company_slug,
    year: Math.round(Number(b.year)),
    headcount: nullableNum(b.headcount),
    revenue: nullableNum(b.revenue),
    ebitda: nullableNum(b.ebitda),
    revenue_status: b.revenue_status || "unknown",
    maturity_stage: b.maturity_stage || null,
    data_type: b.data_type || "actual",
    notes: nullableStr(b.notes),
    updated_at: new Date().toISOString(),
  };
  const { error } = await svc.from("serenissima_snapshots").upsert(payload, { onConflict: "company_slug,year,data_type" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if (guard instanceof NextResponse) return guard;
  const slug = req.nextUrl.searchParams.get("company_slug");
  const year = req.nextUrl.searchParams.get("year");
  const dt = req.nextUrl.searchParams.get("data_type") || "actual";
  if (!slug || !year) return NextResponse.json({ error: "params richiesti" }, { status: 400 });
  const svc = createServiceClient();
  const { error } = await svc.from("serenissima_snapshots")
    .delete()
    .eq("company_slug", slug).eq("year", parseInt(year)).eq("data_type", dt);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

function nullableNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function nullableStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}
