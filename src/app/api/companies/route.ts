import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";

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

// POST — create company
export async function POST(req: NextRequest) {
  const caller = await getCallerProfile(req);
  if (!caller || (caller.ruolo !== "SUPER_ADMIN" && caller.ruolo !== "ADMIN")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { slug, name, color, type } = await req.json();
  if (!slug || !name || !color) {
    return NextResponse.json({ error: "Slug, nome e colore richiesti" }, { status: 400 });
  }
  const companyType = type === "holding" || type === "operative" ? type : "client";

  const svc = createServiceClient();
  const { error } = await svc.from("companies").insert({ slug, name, color, type: companyType });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// PUT — update company (slug is immutable)
export async function PUT(req: NextRequest) {
  const caller = await getCallerProfile(req);
  if (!caller || (caller.ruolo !== "SUPER_ADMIN" && caller.ruolo !== "ADMIN")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { slug, name, color, type } = await req.json();
  if (!slug) {
    return NextResponse.json({ error: "Slug richiesto" }, { status: 400 });
  }

  const patch: { name?: string; color?: string; type?: "holding" | "operative" | "client" } = {};
  if (name !== undefined) patch.name = name;
  if (color !== undefined) patch.color = color;
  if (type === "holding" || type === "operative" || type === "client") patch.type = type;

  const svc = createServiceClient();
  const { error } = await svc.from("companies").update(patch).eq("slug", slug);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE — remove company
export async function DELETE(req: NextRequest) {
  const caller = await getCallerProfile(req);
  if (!caller || (caller.ruolo !== "SUPER_ADMIN" && caller.ruolo !== "ADMIN")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { slug } = await req.json();
  if (!slug) {
    return NextResponse.json({ error: "Slug richiesto" }, { status: 400 });
  }

  const svc = createServiceClient();
  const { error } = await svc.from("companies").delete().eq("slug", slug);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
