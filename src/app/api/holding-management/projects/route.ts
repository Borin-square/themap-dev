import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { authUser } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  const user = await authUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const holding = req.nextUrl.searchParams.get("holding");
  const yearParam = req.nextUrl.searchParams.get("year");
  if (!holding) return NextResponse.json({ error: "holding richiesto" }, { status: 400 });
  const year = yearParam ? parseInt(yearParam, 10) : 2026;

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("hm_projects")
    .select("*")
    .eq("holding_slug", holding)
    .eq("year", year)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data ?? [] });
}

export async function POST(req: NextRequest) {
  const user = await authUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, holding_slug, operative_slug, title, description, deadline, status, goal_ref, year } = body || {};

  if (!holding_slug || !operative_slug || !title) {
    return NextResponse.json({ error: "holding_slug, operative_slug, title richiesti" }, { status: 400 });
  }

  const payload: Record<string, unknown> = {
    holding_slug,
    operative_slug,
    title,
    description: description ?? null,
    deadline: deadline || null,
    status: status || "todo",
    goal_ref: goal_ref ?? null,
    year: year ?? 2026,
    updated_at: new Date().toISOString(),
  };

  const svc = createServiceClient();
  if (id) {
    const { data, error } = await svc.from("hm_projects").update(payload).eq("id", id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ row: data });
  }
  payload.created_by = user.email || user.id;
  const { data, error } = await svc.from("hm_projects").insert(payload).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ row: data });
}

export async function DELETE(req: NextRequest) {
  const user = await authUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id richiesto" }, { status: 400 });

  const svc = createServiceClient();
  const { error } = await svc.from("hm_projects").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
