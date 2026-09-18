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
  if (!b.name || b.render_x == null || b.render_y == null) {
    return NextResponse.json({ error: "name, render_x, render_y richiesti" }, { status: 400 });
  }
  const svc = createServiceClient();
  const { data, error } = await svc.from("serenissima_settlement_anchors").insert({
    name: String(b.name).trim(),
    render_x: clamp01(b.render_x),
    render_y: clamp01(b.render_y),
    region: nullableStr(b.region),
    capacity: b.capacity ? Math.max(1, Math.round(Number(b.capacity))) : 1,
    notes: nullableStr(b.notes),
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}

export async function PUT(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if (guard instanceof NextResponse) return guard;
  const b = await req.json();
  if (!b.id) return NextResponse.json({ error: "id richiesto" }, { status: 400 });
  const svc = createServiceClient();
  const { error } = await svc.from("serenissima_settlement_anchors").update({
    name: String(b.name).trim(),
    render_x: clamp01(b.render_x),
    render_y: clamp01(b.render_y),
    region: nullableStr(b.region),
    capacity: b.capacity ? Math.max(1, Math.round(Number(b.capacity))) : 1,
    notes: nullableStr(b.notes),
    updated_at: new Date().toISOString(),
  }).eq("id", b.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if (guard instanceof NextResponse) return guard;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id richiesto" }, { status: 400 });
  const svc = createServiceClient();
  const { error } = await svc.from("serenissima_settlement_anchors").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

function clamp01(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}
function nullableStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}
