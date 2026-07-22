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

  const azienda = req.nextUrl.searchParams.get("azienda"); // optional filter
  const holding = req.nextUrl.searchParams.get("holding"); // optional: solo rituals delle operative di questa holding
  const from = req.nextUrl.searchParams.get("from"); // ISO date
  const to = req.nextUrl.searchParams.get("to"); // ISO date

  const svc = createServiceClient();

  let operativeSlugs: string[] | null = null;
  if (holding) {
    const { data: own, error: oErr } = await svc
      .from("holding_ownership")
      .select("operative_slug")
      .eq("holding_slug", holding);
    if (oErr) return NextResponse.json({ error: oErr.message }, { status: 500 });
    operativeSlugs = Array.from(new Set((own ?? []).map((r) => r.operative_slug as string)));
    if (operativeSlugs.length === 0) {
      // La holding non possiede operative → nessun ritual da mostrare.
      return NextResponse.json({ rows: [] });
    }
  }

  let q = svc.from("rituals").select("*").order("data", { ascending: true });
  if (azienda) q = q.eq("azienda", azienda);
  if (operativeSlugs) q = q.in("azienda", operativeSlugs);
  if (from) q = q.gte("data", from);
  if (to) q = q.lte("data", to);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!(await authOk(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const { id, azienda, tipologia, titolo, data, data_fine, ora, luogo, confermato, partecipanti, odg } = body || {};

  if (!azienda || !tipologia || !titolo || !data) {
    return NextResponse.json({ error: "azienda, tipologia, titolo, data richiesti" }, { status: 400 });
  }

  const svc = createServiceClient();
  const payload: Record<string, unknown> = {
    azienda,
    tipologia,
    titolo,
    data,
    data_fine: data_fine || null,
    ora: ora ?? null,
    luogo: luogo ?? null,
    confermato: !!confermato,
    partecipanti: partecipanti ?? null,
    odg: odg ?? null,
    updated_at: new Date().toISOString(),
  };

  if (id) {
    const { data: row, error } = await svc.from("rituals").update(payload).eq("id", id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ row });
  } else {
    const { data: row, error } = await svc.from("rituals").insert(payload).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ row });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await authOk(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id richiesto" }, { status: 400 });

  const svc = createServiceClient();
  const { error } = await svc.from("rituals").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
