import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { authUser } from "@/lib/api-auth";
import { guardFeature } from "@/lib/api-feature-guard";

const FEATURE = "holding-management.opportunities";

/**
 * GET  /api/holding-management/opportunities?holding=<slug>
 *   → { opportunities, scores, attachments, settings, partners }
 * POST /api/holding-management/opportunities
 *   → create/update opportunità (id → update, senza id → insert)
 * DELETE /api/holding-management/opportunities?id=<uuid>
 *   → elimina opportunità (cascade su scores + attachments; NON rimuove file dallo storage)
 */

const DEFAULT_SETTINGS = {
  no_threshold: 60,
  deep_dive_threshold: 75,
  leader_min: 20,
  partner_user_ids: [] as string[],
};

export async function GET(req: NextRequest) {
  const user = await authUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const holding = req.nextUrl.searchParams.get("holding");
  if (!holding) return NextResponse.json({ error: "holding richiesto" }, { status: 400 });
  const guard = await guardFeature(holding, FEATURE);
  if (guard) return guard;

  const svc = createServiceClient();

  const [oppsRes, settingsRes] = await Promise.all([
    svc.from("hm_opportunities").select("*").eq("holding_slug", holding).order("created_at", { ascending: false }),
    svc.from("hm_opportunity_settings").select("*").eq("holding_slug", holding).maybeSingle(),
  ]);
  if (oppsRes.error) return NextResponse.json({ error: oppsRes.error.message }, { status: 500 });
  if (settingsRes.error) return NextResponse.json({ error: settingsRes.error.message }, { status: 500 });

  const opportunities = oppsRes.data ?? [];
  const oppIds = opportunities.map((o) => o.id);

  let scores: unknown[] = [];
  let attachments: unknown[] = [];
  if (oppIds.length > 0) {
    const [sc, at] = await Promise.all([
      svc.from("hm_opportunity_scores").select("*").in("opportunity_id", oppIds),
      svc.from("hm_opportunity_attachments").select("*").in("opportunity_id", oppIds).order("uploaded_at", { ascending: false }),
    ]);
    if (sc.error) return NextResponse.json({ error: sc.error.message }, { status: 500 });
    if (at.error) return NextResponse.json({ error: at.error.message }, { status: 500 });
    scores = sc.data ?? [];
    attachments = at.data ?? [];
  }

  const settings = settingsRes.data ?? { holding_slug: holding, ...DEFAULT_SETTINGS };

  // Risolvi email/nome dei partner correnti dai profili
  const partnerIds: string[] = Array.isArray(settings.partner_user_ids) ? settings.partner_user_ids : [];
  let partners: { id: string; email: string; nome: string }[] = [];
  if (partnerIds.length > 0) {
    const { data: profs } = await svc.from("user_profiles").select("id,email,nome").in("id", partnerIds);
    partners = (profs ?? []).map((p) => ({ id: p.id, email: p.email, nome: p.nome }));
  }

  return NextResponse.json({ opportunities, scores, attachments, settings, partners });
}

export async function POST(req: NextRequest) {
  const user = await authUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, holding_slug, name, description, leader_proponent, sector } = body || {};
  if (!holding_slug || !name?.trim()) {
    return NextResponse.json({ error: "holding_slug e name richiesti" }, { status: 400 });
  }
  const guard = await guardFeature(holding_slug, FEATURE);
  if (guard) return guard;

  const svc = createServiceClient();

  if (id) {
    // Update solo campi editabili — non tocca status/decision (usa /action)
    const { data, error } = await svc
      .from("hm_opportunities")
      .update({
        name: name.trim(),
        description: description ?? null,
        leader_proponent: leader_proponent ?? null,
        sector: sector ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ row: data });
  }

  const { data, error } = await svc
    .from("hm_opportunities")
    .insert({
      holding_slug,
      name: name.trim(),
      description: description ?? null,
      leader_proponent: leader_proponent ?? null,
      sector: sector ?? null,
      status: "in_valutazione",
      created_by: user.email || user.id,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ row: data });
}

export async function DELETE(req: NextRequest) {
  const user = await authUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id richiesto" }, { status: 400 });

  const svc = createServiceClient();
  const { data: row } = await svc.from("hm_opportunities").select("holding_slug").eq("id", id).maybeSingle();
  if (row?.holding_slug) {
    const guard = await guardFeature(row.holding_slug, FEATURE);
    if (guard) return guard;
  }
  const { error } = await svc.from("hm_opportunities").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
