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

export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if (guard instanceof NextResponse) return guard;
  const b = await req.json();
  if (!b.source_slug || !b.dest_slug || !b.year) return NextResponse.json({ error: "source/dest/year richiesti" }, { status: 400 });
  if (b.source_slug === b.dest_slug) return NextResponse.json({ error: "source e dest devono differire" }, { status: 400 });
  const svc = createServiceClient();
  const payload = {
    source_slug: b.source_slug,
    dest_slug: b.dest_slug,
    year: Math.round(Number(b.year)),
    status: b.status || "open",
    client_reference: nullableStr(b.client_reference),
    opportunity_reference: nullableStr(b.opportunity_reference),
    external_crm_id: nullableStr(b.external_crm_id),
    expected_revenue: nullableNum(b.expected_revenue),
    won_revenue: nullableNum(b.won_revenue),
    won_margin: nullableNum(b.won_margin),
    opened_at: b.opened_at || new Date().toISOString().slice(0, 10),
    closed_at: b.closed_at || null,
    notes: nullableStr(b.notes),
  };
  const { data, error } = await svc.from("serenissima_cross_sell").insert(payload).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}

export async function PUT(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if (guard instanceof NextResponse) return guard;
  const b = await req.json();
  if (!b.id) return NextResponse.json({ error: "id richiesto" }, { status: 400 });
  const svc = createServiceClient();
  const payload = {
    status: b.status || "open",
    client_reference: nullableStr(b.client_reference),
    opportunity_reference: nullableStr(b.opportunity_reference),
    external_crm_id: nullableStr(b.external_crm_id),
    expected_revenue: nullableNum(b.expected_revenue),
    won_revenue: nullableNum(b.won_revenue),
    won_margin: nullableNum(b.won_margin),
    opened_at: b.opened_at,
    closed_at: b.closed_at || null,
    notes: nullableStr(b.notes),
    updated_at: new Date().toISOString(),
  };
  const { error } = await svc.from("serenissima_cross_sell").update(payload).eq("id", b.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if (guard instanceof NextResponse) return guard;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id richiesto" }, { status: 400 });
  const svc = createServiceClient();
  const { error } = await svc.from("serenissima_cross_sell").delete().eq("id", id);
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
