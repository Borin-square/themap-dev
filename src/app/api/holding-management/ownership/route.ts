import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";

async function authOk(req: NextRequest): Promise<boolean> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7);
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data: { user }, error } = await supabase.auth.getUser(token);
  return !!user && !error;
}

export async function GET(req: NextRequest) {
  if (!(await authOk(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const holdingSlug = req.nextUrl.searchParams.get("holding");
  if (!holdingSlug) return NextResponse.json({ error: "holding slug richiesto" }, { status: 400 });

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("holding_ownership")
    .select("*")
    .eq("holding_slug", holdingSlug)
    .order("valid_from", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ rows: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!(await authOk(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const { holding_slug, operative_slug, percent, valid_from, note } = body || {};
  if (!holding_slug || !operative_slug || typeof percent !== "number") {
    return NextResponse.json({ error: "holding_slug, operative_slug, percent (number) richiesti" }, { status: 400 });
  }
  if (percent < 0 || percent > 100) {
    return NextResponse.json({ error: "percent deve essere tra 0 e 100" }, { status: 400 });
  }

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("holding_ownership")
    .upsert(
      {
        holding_slug,
        operative_slug,
        percent,
        valid_from: valid_from || new Date().toISOString().slice(0, 10),
        note: note ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "holding_slug,operative_slug,valid_from" },
    )
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ row: data });
}

export async function DELETE(req: NextRequest) {
  if (!(await authOk(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id richiesto" }, { status: 400 });

  const svc = createServiceClient();
  const { error } = await svc.from("holding_ownership").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
