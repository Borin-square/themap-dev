import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase-server";
import { requireAuth } from "../_auth";

export const maxDuration = 120;

const EXTRACT_TOOL = {
  name: "extract_authors",
  description: "Estrae la lista di autori/persone del team dalla pagina HTML fornita.",
  input_schema: {
    type: "object" as const,
    properties: {
      authors: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Nome completo" },
            role: { type: "string", description: "Ruolo o qualifica" },
            bio: { type: "string", description: "Bio breve (max 500 caratteri)" },
            photo_url: { type: ["string", "null"], description: "URL foto se disponibile (URL assoluto)" },
            linkedin_url: { type: ["string", "null"], description: "URL LinkedIn se presente" },
            same_as: {
              type: "array",
              items: { type: "string" },
              description: "Altri URL profilo (Twitter/X, GitHub, sito personale, etc.)",
            },
          },
          required: ["name"],
        },
      },
    },
    required: ["authors"],
  },
};

function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .slice(0, 60000);
}

function absolutize(url: string | null | undefined, base: string): string | null {
  if (!url) return null;
  try { return new URL(url, base).toString(); } catch { return url; }
}

/* POST /api/page-generator/scrape-authors
   Body: { project_id: string, url?: string }  (se url mancante usa authors_page_url del progetto) */
export async function POST(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await req.json() as { project_id?: string; url?: string };
  if (!body.project_id) return NextResponse.json({ error: "project_id richiesto" }, { status: 400 });

  const svc = createServiceClient();
  const { data: project } = await svc.from("pg_projects").select("*").eq("id", body.project_id).single();
  if (!project) return NextResponse.json({ error: "Progetto non trovato" }, { status: 404 });

  const targetUrl = body.url || project.authors_page_url;
  if (!targetUrl) return NextResponse.json({ error: "URL non fornito e non presente nel progetto" }, { status: 400 });

  // Fetch HTML
  let html: string;
  try {
    const resp = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; TheMapBot/1.0; +https://the-map-v2.vercel.app)",
        "Accept": "text/html,application/xhtml+xml",
      },
    });
    if (!resp.ok) return NextResponse.json({ error: `HTTP ${resp.status} da ${targetUrl}` }, { status: 502 });
    html = await resp.text();
  } catch (e) {
    return NextResponse.json({ error: `Fetch fallito: ${(e as Error).message}` }, { status: 502 });
  }

  const sanitized = sanitizeHtml(html);

  // Chiama Claude con tool_use
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    tools: [EXTRACT_TOOL],
    tool_choice: { type: "tool", name: "extract_authors" },
    messages: [{
      role: "user",
      content: `Estrai tutti gli autori/membri del team dalla seguente pagina HTML.\nURL sorgente: ${targetUrl}\n\nHTML:\n\`\`\`html\n${sanitized}\n\`\`\``,
    }],
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    return NextResponse.json({ error: "Estrazione fallita" }, { status: 500 });
  }
  const extracted = toolUse.input as {
    authors: Array<{
      name: string; role?: string; bio?: string;
      photo_url?: string | null; linkedin_url?: string | null;
      same_as?: string[];
    }>;
  };

  if (!extracted.authors?.length) {
    return NextResponse.json({ error: "Nessun autore trovato nella pagina" }, { status: 200, statusText: "empty" });
  }

  // Absolutize URLs & insert
  const rows = extracted.authors.map((a) => ({
    project_id: body.project_id!,
    name: a.name,
    role: a.role ?? "",
    bio: a.bio ?? "",
    photo_url: absolutize(a.photo_url, targetUrl),
    linkedin_url: absolutize(a.linkedin_url, targetUrl),
    same_as: (a.same_as ?? []).map((u) => absolutize(u, targetUrl)).filter(Boolean) as string[],
    source_url: targetUrl,
  }));

  const { data, error } = await svc.from("pg_authors").insert(rows).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ authors: data ?? [], count: data?.length ?? 0 });
}
