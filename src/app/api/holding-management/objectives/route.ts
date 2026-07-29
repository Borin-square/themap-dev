import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { authUser } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  const user = await authUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const holding = req.nextUrl.searchParams.get("holding");
  if (!holding) return NextResponse.json({ error: "holding richiesto" }, { status: 400 });
  const yearParam = req.nextUrl.searchParams.get("year"); // opzionale: filtra march sull'anno

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("hm_objectives")
    .select("*")
    .eq("holding_slug", holding)
    .order("kind", { ascending: true })
    .order("order_index", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let rows = data ?? [];
  if (yearParam) {
    const year = parseInt(yearParam, 10);
    if (!Number.isNaN(year)) {
      // Filtra march sull'anno richiesto; bhag/medium sono year-agnostic.
      rows = rows.filter((r) => r.kind !== "march" || r.year === year);
    }
  }
  return NextResponse.json({ rows });
}

export async function POST(req: NextRequest) {
  const user = await authUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    id, holding_slug, kind, title, description, target_year, year,
    metric_name, metric_target, metric_current, metric_unit,
    status, parent_id, order_index, owner,
  } = body || {};

  if (!holding_slug || !kind || !title) {
    return NextResponse.json({ error: "holding_slug, kind, title richiesti" }, { status: 400 });
  }
  if (!["bhag", "medium", "march"].includes(kind)) {
    return NextResponse.json({ error: "kind non valido" }, { status: 400 });
  }

  const payload: Record<string, unknown> = {
    holding_slug,
    kind,
    title,
    description: description ?? null,
    target_year: target_year ?? null,
    year: year ?? null,
    metric_name: metric_name ?? null,
    metric_target: metric_target ?? null,
    metric_current: metric_current ?? null,
    metric_unit: metric_unit ?? null,
    status: status ?? null,
    parent_id: parent_id || null,
    order_index: order_index ?? 0,
    owner: owner ?? null,
    updated_at: new Date().toISOString(),
  };

  const svc = createServiceClient();
  if (id) {
    const { data, error } = await svc.from("hm_objectives").update(payload).eq("id", id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ row: data });
  }
  payload.created_by = user.email || user.id;
  const { data, error } = await svc.from("hm_objectives").insert(payload).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ row: data });
}

export async function DELETE(req: NextRequest) {
  const user = await authUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id richiesto" }, { status: 400 });

  const svc = createServiceClient();
  const { error } = await svc.from("hm_objectives").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
