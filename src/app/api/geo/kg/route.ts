import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";
import type { KGAnalysis, KGExtractedUrl } from "@/lib/geo/types";

export const maxDuration = 30;

async function requireAuth(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// GET /api/geo/kg?company=slug — list audits per company
export async function GET(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const slug = req.nextUrl.searchParams.get("company");
  if (!slug) return NextResponse.json({ error: "company richiesto" }, { status: 400 });

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("kg_audits")
    .select("*")
    .eq("company_slug", slug)
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ audits: data ?? [] });
}

interface SaveBody {
  company_slug: string;
  url: string;
  extracted?: KGExtractedUrl;
  analysis?: KGAnalysis;
  accepted_suggestions?: string[];
  final_markup?: string;
}

// POST /api/geo/kg — upsert un audit per (company_slug, url)
export async function POST(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = (await req.json()) as SaveBody;
  if (!body.company_slug || !body.url) {
    return NextResponse.json({ error: "company_slug e url richiesti" }, { status: 400 });
  }

  const svc = createServiceClient();
  const now = new Date().toISOString();

  const row: Record<string, unknown> = {
    company_slug: body.company_slug,
    url: body.url,
    updated_at: now,
  };
  if (body.extracted) {
    row.extracted_blocks = body.extracted.blocks;
    row.extracted_at = body.extracted.extractedAt;
  }
  if (body.analysis !== undefined) {
    row.analysis = body.analysis;
    row.analyzed_at = body.analysis?.analyzedAt ?? now;
  }
  if (body.accepted_suggestions !== undefined) {
    row.accepted_suggestions = body.accepted_suggestions;
  }
  if (body.final_markup !== undefined) {
    row.final_markup = body.final_markup;
    row.generated_at = now;
  }

  const { data, error } = await svc
    .from("kg_audits")
    .upsert(row, { onConflict: "company_slug,url" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ audit: data });
}

// DELETE /api/geo/kg?id=uuid — rimuove un audit
export async function DELETE(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id richiesto" }, { status: 400 });

  const svc = createServiceClient();
  const { error } = await svc.from("kg_audits").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
