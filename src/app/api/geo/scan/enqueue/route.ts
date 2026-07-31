import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { authUser } from "@/lib/api-auth";

/**
 * POST /api/geo/scan/enqueue
 * body: { company, prompt_id, prompt_text, llm, brand_name, competitors[], site_url? }
 *   → INSERT job (queued), fa fire-and-forget al worker per elaborazione immediata.
 * body con `batch: [ ... ]` accetta più job in un colpo (max 25).
 * Ritorna la lista dei job creati.
 */
export async function POST(req: NextRequest) {
  const user = await authUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const items: unknown[] = Array.isArray(body?.batch) ? body.batch : [body];
  if (items.length === 0) return NextResponse.json({ error: "batch vuoto" }, { status: 400 });
  if (items.length > 25) return NextResponse.json({ error: "max 25 job per batch" }, { status: 400 });

  const rows = items.map((raw) => {
    const it = raw as {
      company?: string; prompt_id?: string; prompt_text?: string; llm?: string;
      brand_name?: string; competitors?: string[]; site_url?: string;
    };
    return {
      company: it.company,
      prompt_id: it.prompt_id,
      prompt_text: it.prompt_text,
      llm: it.llm,
      brand_name: it.brand_name,
      competitors: it.competitors || [],
      site_url: it.site_url || null,
      status: "queued" as const,
      source: "manual" as const,
      created_by: user.email || user.id,
    };
  });

  for (const r of rows) {
    if (!r.company || !r.prompt_id || !r.prompt_text || !r.llm || !r.brand_name) {
      return NextResponse.json({ error: "campi mancanti (company, prompt_id, prompt_text, llm, brand_name)" }, { status: 400 });
    }
  }

  const svc = createServiceClient();
  const { data, error } = await svc.from("geo_scan_jobs").insert(rows).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fire-and-forget al worker: max 3 invocation parallele (concurrency cap lato client)
  const workerUrl = new URL("/api/geo/scan/worker", req.nextUrl.origin).toString();
  const cronSecret = process.env.CRON_SECRET;
  const parallel = Math.min(3, rows.length);
  for (let i = 0; i < parallel; i++) {
    fetch(workerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {}),
      },
      body: JSON.stringify({ triggered_by: "enqueue" }),
    }).catch((e) => console.error("[enqueue] worker fire failed:", e));
  }

  return NextResponse.json({ jobs: data });
}
