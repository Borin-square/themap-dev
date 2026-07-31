import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { authUser } from "@/lib/api-auth";
import { computeNextRun, type Cadence } from "@/lib/geo/schedule";

/**
 * GET  ?company=<slug>&prompt_id=<id?>  → lista schedule
 * POST { company, prompt_id, llm, cadence, dow?, day_of_month?, hour, minute, enabled? }
 *      → crea o aggiorna (con id per update)
 * DELETE ?id=<uuid> → cancella
 */

export async function GET(req: NextRequest) {
  const user = await authUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const company = req.nextUrl.searchParams.get("company");
  const promptId = req.nextUrl.searchParams.get("prompt_id");
  if (!company) return NextResponse.json({ error: "company richiesto" }, { status: 400 });

  const svc = createServiceClient();
  let q = svc.from("geo_scan_schedules").select("*").eq("company", company).order("created_at", { ascending: false });
  if (promptId) q = q.eq("prompt_id", promptId);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data ?? [] });
}

export async function POST(req: NextRequest) {
  const user = await authUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    id, company, prompt_id, llm, cadence, dow, day_of_month,
    hour = 9, minute = 0, enabled = true,
  } = body || {};

  if (!company || !prompt_id || !llm || !cadence) {
    return NextResponse.json({ error: "company, prompt_id, llm, cadence richiesti" }, { status: 400 });
  }
  if (!["daily", "weekly", "monthly"].includes(cadence)) {
    return NextResponse.json({ error: "cadence non valida" }, { status: 400 });
  }
  const h = Number(hour), m = Number(minute);
  if (!Number.isInteger(h) || h < 0 || h > 23) return NextResponse.json({ error: "hour non valida" }, { status: 400 });
  if (!Number.isInteger(m) || m < 0 || m > 59) return NextResponse.json({ error: "minute non valida" }, { status: 400 });

  const dowVal = cadence === "weekly" ? (dow == null ? 1 : Number(dow)) : null;
  const domVal = cadence === "monthly" ? (day_of_month == null ? 1 : Math.min(28, Math.max(1, Number(day_of_month)))) : null;
  const nextRun = computeNextRun(cadence as Cadence, dowVal, domVal, h, m, new Date()).toISOString();
  const now = new Date().toISOString();

  const svc = createServiceClient();
  if (id) {
    const { data, error } = await svc
      .from("geo_scan_schedules")
      .update({
        llm, cadence, dow: dowVal, day_of_month: domVal, hour: h, minute: m,
        enabled, next_run_at: nextRun, updated_at: now,
      })
      .eq("id", id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ row: data });
  }

  const { data, error } = await svc
    .from("geo_scan_schedules")
    .insert({
      company, prompt_id, llm, cadence,
      dow: dowVal, day_of_month: domVal, hour: h, minute: m,
      enabled, next_run_at: nextRun,
      created_by: user.email || user.id,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ row: data });
}

export async function DELETE(req: NextRequest) {
  const user = await authUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id richiesto" }, { status: 400 });

  const svc = createServiceClient();
  const { error } = await svc.from("geo_scan_schedules").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
