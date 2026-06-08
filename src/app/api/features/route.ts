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

// GET — list all company_features (for admin matrix)
export async function GET(req: NextRequest) {
  const caller = await getCallerProfile(req);
  if (!caller || caller.ruolo !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const svc = createServiceClient();
  const { data, error } = await svc.from("company_features").select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// PUT — toggle a feature for a company (upsert)
export async function PUT(req: NextRequest) {
  const caller = await getCallerProfile(req);
  if (!caller || caller.ruolo !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { company_slug, feature_key, enabled } = await req.json();
  if (!company_slug || !feature_key || typeof enabled !== "boolean") {
    return NextResponse.json({ error: "company_slug, feature_key e enabled richiesti" }, { status: 400 });
  }

  const svc = createServiceClient();
  const { error } = await svc
    .from("company_features")
    .upsert({ company_slug, feature_key, enabled }, { onConflict: "company_slug,feature_key" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
