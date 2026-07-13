import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { requireAuth } from "../_auth";

export const maxDuration = 30;

/* GET /api/page-generator/authors?project=uuid */
export async function GET(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const project = req.nextUrl.searchParams.get("project");
  if (!project) return NextResponse.json({ error: "project richiesto" }, { status: 400 });

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("pg_authors")
    .select("*")
    .eq("project_id", project)
    .order("name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ authors: data ?? [] });
}

/* POST /api/page-generator/authors — crea uno o più autori
   Body: { project_id, authors: [{ name, role?, bio?, photo_url?, linkedin_url?, same_as?, source_url? }] } */
export async function POST(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await req.json() as {
    project_id?: string;
    authors?: Array<{
      name: string; role?: string; bio?: string; photo_url?: string | null;
      linkedin_url?: string | null; same_as?: string[]; source_url?: string | null;
    }>;
  };
  if (!body.project_id || !body.authors?.length) {
    return NextResponse.json({ error: "project_id e authors richiesti" }, { status: 400 });
  }

  const rows = body.authors
    .filter((a) => a.name?.trim())
    .map((a) => ({
      project_id: body.project_id!,
      name: a.name.trim(),
      role: a.role ?? "",
      bio: a.bio ?? "",
      photo_url: a.photo_url ?? null,
      linkedin_url: a.linkedin_url ?? null,
      same_as: a.same_as ?? [],
      source_url: a.source_url ?? null,
    }));

  const svc = createServiceClient();
  const { data, error } = await svc.from("pg_authors").insert(rows).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ authors: data ?? [] });
}
