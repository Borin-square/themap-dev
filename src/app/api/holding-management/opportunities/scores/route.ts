import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { authUser } from "@/lib/api-auth";

/**
 * POST /api/holding-management/opportunities/scores
 * body: { opportunity_id, criterion_key, category, score }
 *
 * Regole:
 * - Solo l'utente loggato può votare per sé (user_id = auth.uid).
 * - Solo i partner configurati (hm_opportunity_settings.partner_user_ids) possono votare.
 * - Ammesso solo se opportunità è in status 'in_valutazione'.
 * - Upsert su (opportunity_id, user_id, criterion_key).
 */
export async function POST(req: NextRequest) {
  const user = await authUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { opportunity_id, criterion_key, category, score } = body || {};
  if (!opportunity_id || !criterion_key || !category || typeof score !== "number") {
    return NextResponse.json({ error: "opportunity_id, criterion_key, category, score richiesti" }, { status: 400 });
  }
  if (!["leader", "project_quality", "serenissima_impact", "portfolio_coherence"].includes(category)) {
    return NextResponse.json({ error: "category non valida" }, { status: 400 });
  }

  const svc = createServiceClient();

  // Verifica opportunità esistente + status editabile
  const { data: opp, error: oppErr } = await svc
    .from("hm_opportunities")
    .select("id, holding_slug, status")
    .eq("id", opportunity_id)
    .maybeSingle();
  if (oppErr) return NextResponse.json({ error: oppErr.message }, { status: 500 });
  if (!opp) return NextResponse.json({ error: "Opportunità non trovata" }, { status: 404 });
  if (opp.status !== "in_valutazione") {
    return NextResponse.json({ error: "Voti congelati: opportunità già rivelata" }, { status: 400 });
  }

  // Verifica che l'utente sia tra i partner configurati
  const { data: settings } = await svc
    .from("hm_opportunity_settings")
    .select("partner_user_ids")
    .eq("holding_slug", opp.holding_slug)
    .maybeSingle();
  const partners: string[] = Array.isArray(settings?.partner_user_ids) ? settings!.partner_user_ids : [];
  if (!partners.includes(user.id)) {
    return NextResponse.json({ error: "Non sei tra i soci abilitati al voto" }, { status: 403 });
  }

  const { data, error } = await svc
    .from("hm_opportunity_scores")
    .upsert(
      {
        opportunity_id,
        user_id: user.id,
        category,
        criterion_key,
        score,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "opportunity_id,user_id,criterion_key" },
    )
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Tocca updated_at dell'opportunità per triggerare realtime lato lista
  await svc.from("hm_opportunities").update({ updated_at: new Date().toISOString() }).eq("id", opportunity_id);

  return NextResponse.json({ row: data });
}
