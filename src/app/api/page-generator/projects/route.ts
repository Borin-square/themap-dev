import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { requireAuth } from "../_auth";
import type { PgProjectDraft } from "@/lib/page-generator";

export const maxDuration = 30;

/* GET /api/page-generator/projects?company=slug — lista progetti per company */
export async function GET(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const slug = req.nextUrl.searchParams.get("company");
  if (!slug) return NextResponse.json({ error: "company richiesto" }, { status: 400 });

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("pg_projects")
    .select("*")
    .eq("company_slug", slug)
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ projects: data ?? [] });
}

/* POST /api/page-generator/projects — crea nuovo progetto
   Body: { company_slug: string, project: PgProjectDraft } */
export async function POST(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await req.json() as { company_slug?: string; project?: PgProjectDraft };
  if (!body.company_slug || !body.project?.name) {
    return NextResponse.json({ error: "company_slug e project.name richiesti" }, { status: 400 });
  }

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("pg_projects")
    .insert({
      company_slug: body.company_slug,
      name: body.project.name,
      wp_design_snippet: body.project.wp_design_snippet ?? "",
      wp_design_notes: body.project.wp_design_notes ?? "",
      tone_of_voice: body.project.tone_of_voice ?? "",
      authors_page_url: body.project.authors_page_url ?? null,
      case_studies_page_url: body.project.case_studies_page_url ?? null,
      drive_folder_url: body.project.drive_folder_url ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ project: data });
}
