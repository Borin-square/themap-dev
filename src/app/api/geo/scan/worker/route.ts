import { NextRequest, NextResponse, after } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { runScan } from "@/lib/geo/scanner";

export const maxDuration = 300;

/**
 * POST /api/geo/scan/worker
 * Auth: Bearer CRON_SECRET (chiamato da Vercel Cron o da enqueue in fire-and-forget).
 * Prende UN job in status='queued' con FOR UPDATE SKIP LOCKED, lo esegue,
 * salva result_scan. Alla fine, se restano altri queued, self-triggera un
 * nuovo worker (parallelismo naturale sui serverless).
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const svc = createServiceClient();

  // Prendi 1 job atomicamente. Non ho SQL grezzo dal client Supabase-js, uso RPC-like via .rpc,
  // oppure emulo con UPDATE ... RETURNING dopo SELECT (accettabile qui: le concurrent worker
  // sono poche e la INSERT del job è idempotente per stato).
  const { data: candidates, error: selErr } = await svc
    .from("geo_scan_jobs")
    .select("*")
    .eq("status", "queued")
    .order("queued_at", { ascending: true })
    .limit(1);
  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 });
  if (!candidates || candidates.length === 0) return NextResponse.json({ ok: true, processed: 0 });

  const job = candidates[0];
  // Claim: passa a running solo se ancora queued (evita race)
  const { data: claimed, error: claimErr } = await svc
    .from("geo_scan_jobs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", job.id)
    .eq("status", "queued")
    .select()
    .single();
  if (claimErr || !claimed) return NextResponse.json({ ok: true, processed: 0, note: "job già preso da altro worker" });

  // Esegui lo scan
  const result = await runScan({
    prompt: claimed.prompt_text,
    llm: claimed.llm,
    brandName: claimed.brand_name,
    competitors: claimed.competitors || [],
    siteUrl: claimed.site_url || undefined,
  });
  const now = new Date().toISOString();
  if (result.ok) {
    await svc.from("geo_scan_jobs").update({ status: "done", completed_at: now, result_scan: result.scan, error: null }).eq("id", claimed.id);
  } else {
    await svc.from("geo_scan_jobs").update({ status: "failed", completed_at: now, error: result.error }).eq("id", claimed.id);
  }

  // Se il job era da schedule, aggiorna last_run_at
  if (claimed.schedule_id) {
    await svc.from("geo_scan_schedules").update({ last_run_at: now, last_job_id: claimed.id }).eq("id", claimed.schedule_id);
  }

  // Auto-continua se ci sono altri queued (fino a self-triggering) — evita di aspettare il cron
  const { count } = await svc.from("geo_scan_jobs").select("id", { count: "exact", head: true }).eq("status", "queued");
  if ((count ?? 0) > 0) {
    const workerUrl = new URL("/api/geo/scan/worker", req.nextUrl.origin).toString();
    after(async () => {
      await fetch(workerUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
        },
        body: JSON.stringify({ triggered_by: "worker-chain" }),
      }).catch((e) => console.error("[worker] chain fire failed:", e));
    });
  }

  return NextResponse.json({ ok: true, processed: 1, job_id: claimed.id, status: result.ok ? "done" : "failed" });
}

/** GET fallback per Vercel Cron (i cron di Vercel usano GET) */
export async function GET(req: NextRequest) {
  return POST(req);
}
