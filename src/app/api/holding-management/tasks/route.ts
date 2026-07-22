import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { authUser } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  const user = await authUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const holding = req.nextUrl.searchParams.get("holding");
  const yearParam = req.nextUrl.searchParams.get("year");
  const operative = req.nextUrl.searchParams.get("operative"); // optional filter
  const assignee = req.nextUrl.searchParams.get("assignee");   // optional filter
  const status = req.nextUrl.searchParams.get("status");       // optional filter
  const projectId = req.nextUrl.searchParams.get("project_id");// optional filter

  if (!holding) return NextResponse.json({ error: "holding richiesto" }, { status: 400 });
  const year = yearParam ? parseInt(yearParam, 10) : 2026;

  const svc = createServiceClient();
  let q = svc
    .from("hm_tasks")
    .select("*")
    .eq("holding_slug", holding)
    .eq("year", year);

  if (operative) q = q.eq("operative_slug", operative);
  if (assignee) q = q.eq("assignee_name", assignee);
  if (status) q = q.eq("status", status);
  if (projectId) q = q.eq("project_id", projectId);

  q = q.order("deadline", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false });

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data ?? [] });
}

export async function POST(req: NextRequest) {
  const user = await authUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    id, holding_slug, operative_slug, project_id, title, description,
    assignee_name, deadline, status, priority, goal_ref, year,
  } = body || {};

  if (!holding_slug || !operative_slug || !title) {
    return NextResponse.json({ error: "holding_slug, operative_slug, title richiesti" }, { status: 400 });
  }

  const payload: Record<string, unknown> = {
    holding_slug,
    operative_slug,
    project_id: project_id || null,
    title,
    description: description ?? null,
    assignee_name: assignee_name ?? null,
    deadline: deadline || null,
    status: status || "todo",
    priority: priority || "med",
    goal_ref: goal_ref ?? null,
    year: year ?? 2026,
    updated_at: new Date().toISOString(),
  };

  const svc = createServiceClient();
  if (id) {
    const { data, error } = await svc.from("hm_tasks").update(payload).eq("id", id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ row: data });
  }
  payload.created_by = user.email || user.id;
  const { data, error } = await svc.from("hm_tasks").insert(payload).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ row: data });
}

export async function DELETE(req: NextRequest) {
  const user = await authUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id richiesto" }, { status: 400 });

  const svc = createServiceClient();
  const { error } = await svc.from("hm_tasks").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
