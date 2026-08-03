import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "brand-assets";
const MAX_MB = 25;

async function getCaller(req: NextRequest): Promise<{ id: string; email?: string | null } | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return { id: user.id, email: user.email };
}

// GET ?holding=slug[&operative=slug] — list strategies della holding
export async function GET(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const holding = req.nextUrl.searchParams.get("holding");
  const operative = req.nextUrl.searchParams.get("operative"); // optional
  if (!holding) return NextResponse.json({ error: "holding richiesto" }, { status: 400 });

  const svc = createServiceClient();
  let q = svc
    .from("hm_strategies")
    .select("id, holding_slug, operative_slug, title, file_url, file_path, uploaded_by, created_at, updated_at")
    .eq("holding_slug", holding);
  if (operative) q = q.eq("operative_slug", operative);
  q = q.order("created_at", { ascending: false });

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data ?? [] });
}

// POST (multipart/form-data) — upload PDF + create row
export async function POST(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const holding = (form.get("holding") as string | null)?.trim();
  const operative = (form.get("operative") as string | null)?.trim();
  const title = ((form.get("title") as string | null) || "").trim();

  if (!file || !holding || !operative) {
    return NextResponse.json({ error: "file, holding, operative richiesti" }, { status: 400 });
  }
  if (file.type !== "application/pdf") return NextResponse.json({ error: "Solo PDF" }, { status: 400 });
  if (file.size > MAX_MB * 1024 * 1024) return NextResponse.json({ error: `File troppo grande (max ${MAX_MB}MB)` }, { status: 400 });

  const path = `holding-management/strategies/${holding}/${operative}/${crypto.randomUUID()}.pdf`;
  const svc = createServiceClient();

  const { error: upErr } = await svc.storage.from(BUCKET).upload(path, file, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: { publicUrl } } = svc.storage.from(BUCKET).getPublicUrl(path);
  const finalTitle = title || file.name.replace(/\.pdf$/i, "");

  const { data, error } = await svc
    .from("hm_strategies")
    .insert({
      holding_slug: holding,
      operative_slug: operative,
      title: finalTitle,
      file_url: publicUrl,
      file_path: path,
      uploaded_by: caller.email || caller.id,
    })
    .select()
    .single();
  if (error) {
    await svc.storage.from(BUCKET).remove([path]);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ row: data });
}

// PATCH — rename
export async function PATCH(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, title } = await req.json();
  if (!id || !title?.trim()) return NextResponse.json({ error: "id e title richiesti" }, { status: 400 });

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("hm_strategies")
    .update({ title: title.trim(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ row: data });
}

// DELETE — remove file + row
export async function DELETE(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id richiesto" }, { status: 400 });

  const svc = createServiceClient();
  const { data: row } = await svc.from("hm_strategies").select("file_path").eq("id", id).single();
  if (row?.file_path) {
    await svc.storage.from(BUCKET).remove([row.file_path]);
  }
  const { error } = await svc.from("hm_strategies").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
