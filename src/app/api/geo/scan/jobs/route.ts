import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { authUser } from "@/lib/api-auth";

/**
 * GET  ?company=<slug>&status=<queued|running|done|failed>?&prompt_id=<id>?&limit=<n>?
 *      → lista job (default limit=50, ordinati queued_at desc)
 * DELETE ?id=<uuid> → cancella un job dallo storico (utility manuale)
 */
export async function GET(req: NextRequest) {
  const user = await authUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const company = req.nextUrl.searchParams.get("company");
  const status = req.nextUrl.searchParams.get("status");
  const promptId = req.nextUrl.searchParams.get("prompt_id");
  const limit = Math.min(200, Number(req.nextUrl.searchParams.get("limit") || 50));
  if (!company) return NextResponse.json({ error: "company richiesto" }, { status: 400 });

  const svc = createServiceClient();
  let q = svc.from("geo_scan_jobs").select("*").eq("company", company).order("queued_at", { ascending: false }).limit(limit);
  if (status) q = q.eq("status", status);
  if (promptId) q = q.eq("prompt_id", promptId);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data ?? [] });
}

export async function DELETE(req: NextRequest) {
  const user = await authUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id richiesto" }, { status: 400 });

  const svc = createServiceClient();
  const { error } = await svc.from("geo_scan_jobs").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
