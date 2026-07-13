import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { requireAuth } from "../_auth";

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const project = req.nextUrl.searchParams.get("project");
  if (!project) return NextResponse.json({ error: "project richiesto" }, { status: 400 });

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("pg_case_studies")
    .select("*")
    .eq("project_id", project)
    .order("title", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cases: data ?? [] });
}

/* POST — crea uno o più casi studio */
export async function POST(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await req.json() as {
    project_id?: string;
    cases?: Array<{
      title: string; client?: string; sector?: string;
      summary?: string; results?: string; url?: string | null; source_url?: string | null;
    }>;
  };
  if (!body.project_id || !body.cases?.length) {
    return NextResponse.json({ error: "project_id e cases richiesti" }, { status: 400 });
  }

  const rows = body.cases
    .filter((c) => c.title?.trim())
    .map((c) => ({
      project_id: body.project_id!,
      title: c.title.trim(),
      client: c.client ?? "",
      sector: c.sector ?? "",
      summary: c.summary ?? "",
      results: c.results ?? "",
      url: c.url ?? null,
      source_url: c.source_url ?? null,
    }));

  const svc = createServiceClient();
  const { data, error } = await svc.from("pg_case_studies").insert(rows).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cases: data ?? [] });
}
