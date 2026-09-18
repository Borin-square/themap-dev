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
  const body = await req.json();
  const {
    company_slug, portfolio_status, position_x, position_y,
    expandability_score, confidence_score, ownership_pct,
    business_model, emblem_path, notes,
  } = body;
  if (!company_slug) return NextResponse.json({ error: "company_slug richiesto" }, { status: 400 });

  const svc = createServiceClient();
  const payload = {
    company_slug,
    portfolio_status: portfolio_status ?? "portfolio",
    position_x: clamp01(position_x),
    position_y: clamp01(position_y),
    expandability_score: nullableInt(expandability_score, 1, 5),
    confidence_score: nullableInt(confidence_score, 1, 5),
    ownership_pct: nullableNum(ownership_pct, 0, 100),
    business_model: nullableStr(business_model),
    emblem_path: nullableStr(emblem_path),
    notes: nullableStr(notes),
    updated_at: new Date().toISOString(),
  };
  const { error } = await svc.from("serenissima_company_map").upsert(payload, { onConflict: "company_slug" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if (guard instanceof NextResponse) return guard;
  const slug = req.nextUrl.searchParams.get("company_slug");
  if (!slug) return NextResponse.json({ error: "company_slug richiesto" }, { status: 400 });
  const svc = createServiceClient();
  const { error } = await svc.from("serenissima_company_map").delete().eq("company_slug", slug);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

function clamp01(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}
function nullableInt(v: unknown, min: number, max: number): number | null {
  if (v == null || v === "") return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, n));
}
function nullableNum(v: unknown, min: number, max: number): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, n));
}
function nullableStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}
