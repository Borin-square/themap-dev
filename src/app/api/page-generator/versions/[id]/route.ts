import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { requireAuth } from "../../_auth";
import type { PgSection } from "@/lib/page-generator";

export const maxDuration = 30;

interface PatchBody {
  sections?: PgSection[];
  draft_text?: string;
  html_output?: string;
  kg_json?: unknown;
}

/* PATCH /api/page-generator/versions/[id] — aggiorna una versione (per edit manuale sezioni) */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await ctx.params;
  const patch = await req.json() as PatchBody;

  const row: Record<string, unknown> = {};
  if (patch.sections !== undefined) row.sections = patch.sections;
  if (patch.draft_text !== undefined) row.draft_text = patch.draft_text;
  if (patch.html_output !== undefined) row.html_output = patch.html_output;
  if (patch.kg_json !== undefined) row.kg_json = patch.kg_json;

  if (Object.keys(row).length === 0) {
    return NextResponse.json({ error: "Nessun campo aggiornabile" }, { status: 400 });
  }

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("pg_page_versions")
    .update(row)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ version: data });
}
