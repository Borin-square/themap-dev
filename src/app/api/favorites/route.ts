import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";

async function getUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data: { user }, error } = await supabase.auth.getUser(token);
  return error ? null : user;
}

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("user_favorites")
    .select("id, href, label, sub, accent, added_at")
    .eq("user_id", user.id)
    .order("added_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ favorites: data ?? [] });
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const { href, label, sub, accent } = body as { href?: string; label?: string; sub?: string; accent?: string };
  if (!href || !label) return NextResponse.json({ error: "href e label richiesti" }, { status: 400 });

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("user_favorites")
    .upsert(
      { user_id: user.id, href, label, sub: sub ?? null, accent: accent ?? null },
      { onConflict: "user_id,href" },
    )
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ favorite: data });
}

export async function DELETE(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const href = req.nextUrl.searchParams.get("href");
  if (!href) return NextResponse.json({ error: "href richiesto" }, { status: 400 });

  const svc = createServiceClient();
  const { error } = await svc.from("user_favorites").delete().eq("user_id", user.id).eq("href", href);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
