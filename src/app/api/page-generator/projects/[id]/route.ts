import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { requireAuth } from "../../_auth";
import type { PgProjectDraft } from "@/lib/page-generator";

export const maxDuration = 30;

/* GET /api/page-generator/projects/[id] — dettaglio progetto */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await ctx.params;
  const svc = createServiceClient();
  const { data, error } = await svc.from("pg_projects").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ project: data });
}

/* PATCH /api/page-generator/projects/[id] — aggiorna campi progetto */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await ctx.params;
  const patch = await req.json() as Partial<PgProjectDraft>;

  const allowed: (keyof PgProjectDraft)[] = [
    "name", "wp_design_snippet", "wp_design_notes", "tone_of_voice",
    "authors_page_url", "case_studies_page_url", "drive_folder_url",
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
    .from("pg_projects")
    .update(row)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ project: data });
}

/* DELETE /api/page-generator/projects/[id] */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await ctx.params;
  const svc = createServiceClient();
  const { error } = await svc.from("pg_projects").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
