import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";

// Verify the request comes from an authenticated admin
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

// GET — list all user profiles
export async function GET(req: NextRequest) {
  const caller = await getCallerProfile(req);
  if (!caller || (caller.ruolo !== "SUPER_ADMIN" && caller.ruolo !== "ADMIN")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const svc = createServiceClient();
  const { data, error } = await svc.from("user_profiles").select("*").order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST — invite user (auth + profile + email)
export async function POST(req: NextRequest) {
  const caller = await getCallerProfile(req);
  if (!caller || (caller.ruolo !== "SUPER_ADMIN" && caller.ruolo !== "ADMIN")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json();
  const { email, nome, ruolo, funzione, aziende } = body;
  if (!email) {
    return NextResponse.json({ error: "Email richiesta" }, { status: 400 });
  }

  const svc = createServiceClient();

  // Build redirect URL from request origin
  const origin = req.headers.get("origin") || `https://${req.headers.get("host")}`;

  // Invite user via Supabase — sends email automatically
  const { data: authData, error: authErr } = await svc.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${origin}/set-password`,
  });

  if (authErr) {
    return NextResponse.json({ error: authErr.message }, { status: 400 });
  }

  // Create profile
  const { error: profErr } = await svc.from("user_profiles").insert({
    id: authData.user.id,
    email,
    nome: nome || "",
    ruolo: ruolo || "OPERATIVO",
    funzione: funzione || "",
    aziende: aziende || "*",
  });

  if (profErr) {
    return NextResponse.json({ error: profErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, invited: true });
}

// PUT — update user profile
export async function PUT(req: NextRequest) {
  const caller = await getCallerProfile(req);
  if (!caller || (caller.ruolo !== "SUPER_ADMIN" && caller.ruolo !== "ADMIN")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json();
  const { id, nome, ruolo, funzione, aziende } = body;
  if (!id) {
    return NextResponse.json({ error: "ID richiesto" }, { status: 400 });
  }

  const svc = createServiceClient();
  const { error } = await svc.from("user_profiles").update({
    nome, ruolo, funzione, aziende,
  }).eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE — remove user (auth + profile)
export async function DELETE(req: NextRequest) {
  const caller = await getCallerProfile(req);
  if (!caller || (caller.ruolo !== "SUPER_ADMIN" && caller.ruolo !== "ADMIN")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await req.json();
  if (!id) {
    return NextResponse.json({ error: "ID richiesto" }, { status: 400 });
  }

  const svc = createServiceClient();

  // Delete auth user (cascade deletes profile via FK)
  const { error } = await svc.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
