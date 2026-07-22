import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "brand-assets";
const MAX_MB = 25;

async function getCallerProfile(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  const svc = createServiceClient();
  const { data: profile } = await svc.from("user_profiles").select("*").eq("id", user.id).single();
  return profile;
}

// GET ?company=slug — list presentations for a company
export async function GET(req: NextRequest) {
  const caller = await getCallerProfile(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const company = req.nextUrl.searchParams.get("company");
  if (!company) return NextResponse.json({ error: "company richiesta" }, { status: 400 });

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("hm_presentations")
    .select("id, company_slug, title, file_url, file_path, created_at, updated_at")
    .eq("company_slug", company)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST (multipart/form-data) — upload PDF + create row
export async function POST(req: NextRequest) {
  const caller = await getCallerProfile(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const company = form.get("company") as string | null;
  const title = ((form.get("title") as string | null) || "").trim();

  if (!file || !company) return NextResponse.json({ error: "file e company richiesti" }, { status: 400 });
  if (file.type !== "application/pdf") return NextResponse.json({ error: "Solo PDF" }, { status: 400 });
  if (file.size > MAX_MB * 1024 * 1024) return NextResponse.json({ error: `File troppo grande (max ${MAX_MB}MB)` }, { status: 400 });

  const path = `holding-management/${company}/${crypto.randomUUID()}.pdf`;
  const svc = createServiceClient();

  const { error: upErr } = await svc.storage.from(BUCKET).upload(path, file, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: { publicUrl } } = svc.storage.from(BUCKET).getPublicUrl(path);
  const finalTitle = title || file.name.replace(/\.pdf$/i, "");

  const { data, error } = await svc
    .from("hm_presentations")
    .insert({ company_slug: company, title: finalTitle, file_url: publicUrl, file_path: path })
    .select()
    .single();
  if (error) {
    await svc.storage.from(BUCKET).remove([path]);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

// PATCH — rename
export async function PATCH(req: NextRequest) {
  const caller = await getCallerProfile(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, title } = await req.json();
  if (!id || !title?.trim()) return NextResponse.json({ error: "id e title richiesti" }, { status: 400 });

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("hm_presentations")
    .update({ title: title.trim(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE — remove file + row
export async function DELETE(req: NextRequest) {
  const caller = await getCallerProfile(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id richiesto" }, { status: 400 });

  const svc = createServiceClient();
  const { data: row } = await svc.from("hm_presentations").select("file_path").eq("id", id).single();
  if (row?.file_path) {
    await svc.storage.from(BUCKET).remove([row.file_path]);
  }
  const { error } = await svc.from("hm_presentations").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
