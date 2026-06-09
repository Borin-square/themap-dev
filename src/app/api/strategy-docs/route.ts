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

// GET — list docs for a company
export async function GET(req: NextRequest) {
  const caller = await getCallerProfile(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const slug = req.nextUrl.searchParams.get("company");
  if (!slug) return NextResponse.json({ error: "company richiesto" }, { status: 400 });

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("strategy_docs")
    .select("*")
    .eq("company_slug", slug)
    .order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST — create doc
export async function POST(req: NextRequest) {
  const caller = await getCallerProfile(req);
  if (!caller || (caller.ruolo !== "SUPER_ADMIN" && caller.ruolo !== "ADMIN")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { company_slug, titolo, url, descrizione } = await req.json();
  if (!company_slug || !titolo) {
    return NextResponse.json({ error: "company_slug e titolo richiesti" }, { status: 400 });
  }

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("strategy_docs")
    .insert({ company_slug, titolo, url: url || "", descrizione: descrizione || "" })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// PUT — update doc
export async function PUT(req: NextRequest) {
  const caller = await getCallerProfile(req);
  if (!caller || (caller.ruolo !== "SUPER_ADMIN" && caller.ruolo !== "ADMIN")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id, titolo, url, descrizione } = await req.json();
  if (!id) return NextResponse.json({ error: "id richiesto" }, { status: 400 });

  const svc = createServiceClient();
  const { error } = await svc
    .from("strategy_docs")
    .update({ titolo, url, descrizione, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE — remove doc
export async function DELETE(req: NextRequest) {
  const caller = await getCallerProfile(req);
  if (!caller || (caller.ruolo !== "SUPER_ADMIN" && caller.ruolo !== "ADMIN")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id richiesto" }, { status: 400 });

  const svc = createServiceClient();
  const { error } = await svc.from("strategy_docs").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
