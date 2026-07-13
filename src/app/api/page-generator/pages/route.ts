import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { requireAuth } from "../_auth";
import type { PgPageDraft, PgPageType } from "@/lib/page-generator";
import { PG_PAGE_TYPES } from "@/lib/page-generator";

export const maxDuration = 30;

/* GET /api/page-generator/pages?project=uuid — lista pagine di un progetto */
export async function GET(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const project = req.nextUrl.searchParams.get("project");
  if (!project) return NextResponse.json({ error: "project richiesto" }, { status: 400 });

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("pg_pages")
    .select("*")
    .eq("project_id", project)
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ pages: data ?? [] });
}

/* POST /api/page-generator/pages — crea nuova pagina
   Body: { project_id: string, page: PgPageDraft } */
export async function POST(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await req.json() as { project_id?: string; page?: PgPageDraft };
  if (!body.project_id || !body.page?.page_type) {
    return NextResponse.json({ error: "project_id e page.page_type richiesti" }, { status: 400 });
  }
  if (!PG_PAGE_TYPES.includes(body.page.page_type as PgPageType)) {
    return NextResponse.json({ error: "page_type non valido" }, { status: 400 });
  }

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("pg_pages")
    .insert({
      project_id: body.project_id,
      title: body.page.title ?? "",
      slug: body.page.slug ?? null,
      page_type: body.page.page_type,
      parent_pillar_id: body.page.parent_pillar_id ?? null,
      kw_main: body.page.kw_main ?? "",
      kw_secondary: body.page.kw_secondary ?? [],
      search_intent: body.page.search_intent ?? null,
      info_gain_text: body.page.info_gain_text ?? "",
      source_doc_url: body.page.source_doc_url ?? null,
      source_doc_extracted: body.page.source_doc_extracted ?? null,
      author_ids: body.page.author_ids ?? [],
      case_study_ids: body.page.case_study_ids ?? [],
      meta_description: body.page.meta_description ?? null,
      status: body.page.status ?? "draft",
      notes: body.page.notes ?? "",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ page: data });
}
