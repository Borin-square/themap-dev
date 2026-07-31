import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { computeNextRun, type Cadence } from "@/lib/geo/schedule";

export const maxDuration = 60;

/**
 * POST /api/geo/scan/scheduler
 * Auth: Bearer CRON_SECRET (Vercel Cron ogni 5 min).
 * Trova le geo_scan_schedules con enabled=true AND next_run_at<=now(),
 * crea 1 job in geo_scan_jobs (source=scheduled) e aggiorna next_run_at.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const svc = createServiceClient();
  const nowIso = new Date().toISOString();

  const { data: due, error } = await svc
    .from("geo_scan_schedules")
    .select("*")
    .eq("enabled", true)
    .lte("next_run_at", nowIso);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!due || due.length === 0) return NextResponse.json({ ok: true, enqueued: 0 });

  // Per ogni schedule dovuta: leggi il project per estrarre il prompt corrente
  // + brand/competitors/siteUrl. Il project è dentro app_state (JSON blob).
  const enqueued: string[] = [];
  for (const sch of due) {
    const { data: state } = await svc.from("app_state").select("data").eq("company", sch.company).eq("key", "geoProject").eq("year", 2026).maybeSingle();
    interface StateData { config?: { brandName?: string; competitors?: string[]; siteUrl?: string }; prompts?: { id: string; text: string }[] }
    const data = state?.data as StateData | undefined;
    const prompts = data?.prompts;
    const cfg = data?.config;
    if (!prompts || !cfg?.brandName) continue;
    const p = prompts.find((pr) => pr.id === sch.prompt_id);
    if (!p) continue;

    const { data: job, error: jErr } = await svc.from("geo_scan_jobs").insert({
      company: sch.company,
      prompt_id: sch.prompt_id,
      prompt_text: p.text,
      llm: sch.llm,
      brand_name: cfg.brandName,
      competitors: cfg.competitors || [],
      site_url: cfg.siteUrl || null,
      status: "queued",
      source: "scheduled",
      schedule_id: sch.id,
      created_by: "scheduler",
    }).select().single();
    if (jErr || !job) continue;
    enqueued.push(job.id);

    const next = computeNextRun(sch.cadence as Cadence, sch.dow, sch.day_of_month, sch.hour, sch.minute, new Date());
    await svc.from("geo_scan_schedules").update({ next_run_at: next.toISOString(), updated_at: nowIso }).eq("id", sch.id);
  }

  // Sveglia il worker
  if (enqueued.length > 0) {
    const workerUrl = new URL("/api/geo/scan/worker", req.nextUrl.origin).toString();
    fetch(workerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(secret ? { Authorization: `Bearer ${secret}` } : {}) },
      body: JSON.stringify({ triggered_by: "scheduler" }),
    }).catch((e) => console.error("[scheduler] worker fire failed:", e));
  }

  return NextResponse.json({ ok: true, enqueued: enqueued.length, job_ids: enqueued });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
