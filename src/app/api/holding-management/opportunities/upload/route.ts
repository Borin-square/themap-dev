import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { authUser } from "@/lib/api-auth";
import { guardFeature } from "@/lib/api-feature-guard";

const FEATURE = "holding-management.opportunities";
const BUCKET = "hm-opportunities";
const MAX_MB = 50;

// POST (multipart/form-data): file + opportunity_id
// Upload server-side via service role per bypassare le RLS di storage.objects,
// poi crea la row in hm_opportunity_attachments. Coerente con il pattern usato
// da /api/holding-management/strategies (POST).
export async function POST(req: NextRequest) {
  const user = await authUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const opportunity_id = ((form.get("opportunity_id") as string | null) || "").trim();

  if (!file || !opportunity_id) {
    return NextResponse.json({ error: "file e opportunity_id richiesti" }, { status: 400 });
  }
  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "Solo PDF" }, { status: 400 });
  }
  if (file.size > MAX_MB * 1024 * 1024) {
    return NextResponse.json({ error: `File troppo grande (max ${MAX_MB}MB)` }, { status: 400 });
  }

  const svc = createServiceClient();

  const { data: opp, error: oppErr } = await svc
    .from("hm_opportunities")
    .select("id, holding_slug")
    .eq("id", opportunity_id)
    .maybeSingle();
  if (oppErr) return NextResponse.json({ error: oppErr.message }, { status: 500 });
  if (!opp) return NextResponse.json({ error: "Opportunità non trovata" }, { status: 404 });

  const guard = await guardFeature(opp.holding_slug, FEATURE);
  if (guard) return guard;

  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${opp.holding_slug}/${opportunity_id}/${Date.now()}-${safeName}`;

  const { error: upErr } = await svc.storage.from(BUCKET).upload(path, file, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: { publicUrl } } = svc.storage.from(BUCKET).getPublicUrl(path);

  const { data, error } = await svc
    .from("hm_opportunity_attachments")
    .insert({
      opportunity_id,
      file_name: file.name,
      storage_path: path,
      public_url: publicUrl,
      size_bytes: file.size,
      uploaded_by: user.email || user.id,
    })
    .select()
    .single();
  if (error) {
    await svc.storage.from(BUCKET).remove([path]);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ row: data });
}
