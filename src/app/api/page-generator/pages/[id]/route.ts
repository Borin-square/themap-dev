import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { requireAuth } from "../../_auth";
import type { PgPageDraft } from "@/lib/page-generator";

export const maxDuration = 30;

/* GET /api/page-generator/pages/[id] — dettaglio + ultima versione */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await ctx.params;
  const svc = createServiceClient();

  const { data: page, error } = await svc.from("pg_pages").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  const { data: versions } = await svc
    .from("pg_page_versions")
    .select("*")
    .eq("page_id", id)
    .order("version_no", { ascending: false });

  return NextResponse.json({ page, versions: versions ?? [] });
}

/* PATCH /api/page-generator/pages/[id] */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await ctx.params;
  const patch = await req.json() as Partial<PgPageDraft>;

  const allowed: (keyof PgPageDraft)[] = [
    "title", "slug", "page_type", "parent_pillar_id",
    "kw_main", "kw_secondary", "search_intent",
    "info_gain_text", "source_doc_url", "source_doc_extracted",
    "author_ids", "case_study_ids",
    "meta_description", "reference_urls", "status", "notes",
  ];
  const row: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in patch) row[k] = (patch as Record<string, unknown>)[k];
  }
  if (Object.keys(row).length === 0) {
    return NextResponse.json({ error: "Nessun campo aggiornabile" }, { status: 400 });
  }

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("pg_pages")
    .update(row)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ page: data });
}

/* DELETE /api/page-generator/pages/[id] */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await ctx.params;
  const svc = createServiceClient();
  const { error } = await svc.from("pg_pages").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
