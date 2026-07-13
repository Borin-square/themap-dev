import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { requireAuth } from "../../_auth";

export const maxDuration = 30;

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await ctx.params;
  const patch = await req.json() as Record<string, unknown>;
  const allowed = ["url", "media_type", "alt_text", "caption", "position"];
  const row: Record<string, unknown> = {};
  for (const k of allowed) if (k in patch) row[k] = patch[k];
  if (Object.keys(row).length === 0) {
    return NextResponse.json({ error: "Nessun campo aggiornabile" }, { status: 400 });
  }

  const svc = createServiceClient();
  const { data, error } = await svc.from("pg_media").update(row).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ media: data });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await ctx.params;
  const svc = createServiceClient();
  const { error } = await svc.from("pg_media").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
