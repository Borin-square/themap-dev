import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { authUser } from "@/lib/api-auth";

/**
 * POST /api/holding-management/opportunities/action
 * body: { action, ...payload }
 *
 * action:
 *   - "reveal"            { opportunity_id }
 *       richiede: tutti i partner hanno votato tutte le 20 sotto-voci
 *   - "unreveal"          { opportunity_id }
 *       riporta a in_valutazione (utility di correzione, prima della decisione)
 *   - "decide"            { opportunity_id, decision: 'no'|'osservazione'|'approfondimento' }
 *       richiede status = 'rivelata'
 *   - "archive"           { opportunity_id }
 *   - "unarchive"         { opportunity_id }  // torna allo stato precedente basato sui campi
 *   - "settings"          { holding_slug, no_threshold, deep_dive_threshold, leader_min, partner_user_ids }
 *   - "attachment_add"    { opportunity_id, file_name, storage_path, public_url, size_bytes }
 *   - "attachment_delete" { attachment_id }
 */

const TOTAL_CRITERIA = 20; // 4 categorie × 5 sotto-voci

export async function POST(req: NextRequest) {
  const user = await authUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { action } = body || {};
  if (!action) return NextResponse.json({ error: "action richiesta" }, { status: 400 });

  const svc = createServiceClient();
  const now = new Date().toISOString();
  const actor = user.email || user.id;

  if (action === "reveal") {
    const { opportunity_id } = body;
    if (!opportunity_id) return NextResponse.json({ error: "opportunity_id richiesto" }, { status: 400 });

    const { data: opp } = await svc.from("hm_opportunities").select("id, holding_slug, status").eq("id", opportunity_id).maybeSingle();
    if (!opp) return NextResponse.json({ error: "Opportunità non trovata" }, { status: 404 });
    if (opp.status !== "in_valutazione") return NextResponse.json({ error: "Stato non compatibile con reveal" }, { status: 400 });

    const { data: settings } = await svc.from("hm_opportunity_settings").select("partner_user_ids").eq("holding_slug", opp.holding_slug).maybeSingle();
    const partners: string[] = Array.isArray(settings?.partner_user_ids) ? settings!.partner_user_ids : [];
    if (partners.length < 3) return NextResponse.json({ error: "Configura 3 soci nelle impostazioni prima di rivelare" }, { status: 400 });

    const { data: scores } = await svc.from("hm_opportunity_scores").select("user_id,criterion_key").eq("opportunity_id", opportunity_id);
    const byUser = new Map<string, Set<string>>();
    for (const s of scores ?? []) {
      const set = byUser.get(s.user_id) ?? new Set<string>();
      set.add(s.criterion_key);
      byUser.set(s.user_id, set);
    }
    for (const pid of partners) {
      const set = byUser.get(pid);
      if (!set || set.size < TOTAL_CRITERIA) {
        return NextResponse.json({ error: "Non tutti i soci hanno completato la scorecard" }, { status: 400 });
      }
    }

    const { data, error } = await svc
      .from("hm_opportunities")
      .update({ status: "rivelata", revealed_at: now, revealed_by: actor, updated_at: now })
      .eq("id", opportunity_id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ row: data });
  }

  if (action === "unreveal") {
    const { opportunity_id } = body;
    if (!opportunity_id) return NextResponse.json({ error: "opportunity_id richiesto" }, { status: 400 });

    const { data, error } = await svc
      .from("hm_opportunities")
      .update({ status: "in_valutazione", revealed_at: null, revealed_by: null, decision: null, decided_at: null, decided_by: null, updated_at: now })
      .eq("id", opportunity_id)
      .in("status", ["rivelata", "decisa"])
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ row: data });
  }

  if (action === "decide") {
    const { opportunity_id, decision } = body;
    if (!opportunity_id || !decision) return NextResponse.json({ error: "opportunity_id + decision richiesti" }, { status: 400 });
    if (!["no", "osservazione", "approfondimento"].includes(decision)) return NextResponse.json({ error: "decision non valida" }, { status: 400 });

    const { data: opp } = await svc.from("hm_opportunities").select("status").eq("id", opportunity_id).maybeSingle();
    if (!opp) return NextResponse.json({ error: "Opportunità non trovata" }, { status: 404 });
    if (opp.status !== "rivelata" && opp.status !== "decisa") {
      return NextResponse.json({ error: "Rivela i voti prima di decidere" }, { status: 400 });
    }

    const { data, error } = await svc
      .from("hm_opportunities")
      .update({ status: "decisa", decision, decided_at: now, decided_by: actor, updated_at: now })
      .eq("id", opportunity_id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ row: data });
  }

  if (action === "archive") {
    const { opportunity_id } = body;
    if (!opportunity_id) return NextResponse.json({ error: "opportunity_id richiesto" }, { status: 400 });
    const { data, error } = await svc
      .from("hm_opportunities")
      .update({ status: "archiviata", archived_at: now, updated_at: now })
      .eq("id", opportunity_id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ row: data });
  }

  if (action === "unarchive") {
    const { opportunity_id } = body;
    if (!opportunity_id) return NextResponse.json({ error: "opportunity_id richiesto" }, { status: 400 });
    // Ripristina lo stato coerente con la presenza di decision/revealed
    const { data: opp } = await svc.from("hm_opportunities").select("decision, revealed_at").eq("id", opportunity_id).maybeSingle();
    const next = opp?.decision ? "decisa" : opp?.revealed_at ? "rivelata" : "in_valutazione";
    const { data, error } = await svc
      .from("hm_opportunities")
      .update({ status: next, archived_at: null, updated_at: now })
      .eq("id", opportunity_id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ row: data });
  }

  if (action === "settings") {
    const { holding_slug, no_threshold, deep_dive_threshold, leader_min, partner_user_ids } = body;
    if (!holding_slug) return NextResponse.json({ error: "holding_slug richiesto" }, { status: 400 });
    if (partner_user_ids && !Array.isArray(partner_user_ids)) return NextResponse.json({ error: "partner_user_ids deve essere un array" }, { status: 400 });
    if (partner_user_ids && partner_user_ids.length > 3) return NextResponse.json({ error: "Massimo 3 soci" }, { status: 400 });
    const noT = Number(no_threshold);
    const ddT = Number(deep_dive_threshold);
    if (Number.isFinite(noT) && Number.isFinite(ddT) && noT >= ddT) {
      return NextResponse.json({ error: "Soglia No deve essere minore di soglia Approfondimento" }, { status: 400 });
    }

    const payload: Record<string, unknown> = {
      holding_slug,
      updated_at: now,
      updated_by: actor,
    };
    if (Number.isFinite(noT)) payload.no_threshold = noT;
    if (Number.isFinite(ddT)) payload.deep_dive_threshold = ddT;
    if (Number.isFinite(Number(leader_min))) payload.leader_min = Number(leader_min);
    if (partner_user_ids) payload.partner_user_ids = partner_user_ids;

    const { data, error } = await svc
      .from("hm_opportunity_settings")
      .upsert(payload, { onConflict: "holding_slug" })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ row: data });
  }

  if (action === "attachment_add") {
    const { opportunity_id, file_name, storage_path, public_url, size_bytes } = body;
    if (!opportunity_id || !file_name || !storage_path || !public_url) {
      return NextResponse.json({ error: "opportunity_id, file_name, storage_path, public_url richiesti" }, { status: 400 });
    }
    const { data, error } = await svc
      .from("hm_opportunity_attachments")
      .insert({
        opportunity_id,
        file_name,
        storage_path,
        public_url,
        size_bytes: size_bytes ?? null,
        uploaded_by: actor,
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ row: data });
  }

  if (action === "attachment_delete") {
    const { attachment_id } = body;
    if (!attachment_id) return NextResponse.json({ error: "attachment_id richiesto" }, { status: 400 });
    const { data: att } = await svc.from("hm_opportunity_attachments").select("storage_path").eq("id", attachment_id).maybeSingle();
    if (att?.storage_path) {
      await svc.storage.from("hm-opportunities").remove([att.storage_path]);
    }
    const { error } = await svc.from("hm_opportunity_attachments").delete().eq("id", attachment_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "action sconosciuta" }, { status: 400 });
}
