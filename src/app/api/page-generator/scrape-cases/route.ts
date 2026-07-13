import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase-server";
import { requireAuth } from "../_auth";

export const maxDuration = 120;

const EXTRACT_TOOL = {
  name: "extract_case_studies",
  description: "Estrae la lista di casi studio/progetti dalla pagina HTML fornita.",
  input_schema: {
    type: "object" as const,
    properties: {
      cases: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Titolo del caso studio" },
            client: { type: "string", description: "Nome del cliente" },
            sector: { type: "string", description: "Settore/industria" },
            summary: { type: "string", description: "Riassunto (max 500 caratteri)" },
            results: { type: "string", description: "Risultati chiave (metriche, KPI, esiti)" },
            url: { type: ["string", "null"], description: "URL del caso studio (assoluto)" },
          },
          required: ["title"],
        },
      },
    },
    required: ["cases"],
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

export async function POST(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await req.json() as { project_id?: string; url?: string };
  if (!body.project_id) return NextResponse.json({ error: "project_id richiesto" }, { status: 400 });

  const svc = createServiceClient();
  const { data: project } = await svc.from("pg_projects").select("*").eq("id", body.project_id).single();
  if (!project) return NextResponse.json({ error: "Progetto non trovato" }, { status: 404 });

  const targetUrl = body.url || project.case_studies_page_url;
  if (!targetUrl) return NextResponse.json({ error: "URL non fornito e non presente nel progetto" }, { status: 400 });

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

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    tools: [EXTRACT_TOOL],
    tool_choice: { type: "tool", name: "extract_case_studies" },
    messages: [{
      role: "user",
      content: `Estrai tutti i casi studio dalla seguente pagina HTML.\nURL sorgente: ${targetUrl}\n\nHTML:\n\`\`\`html\n${sanitized}\n\`\`\``,
    }],
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    return NextResponse.json({ error: "Estrazione fallita" }, { status: 500 });
  }
  const extracted = toolUse.input as {
    cases: Array<{
      title: string; client?: string; sector?: string;
      summary?: string; results?: string; url?: string | null;
    }>;
  };

  if (!extracted.cases?.length) {
    return NextResponse.json({ error: "Nessun caso studio trovato nella pagina" }, { status: 200, statusText: "empty" });
  }

  const rows = extracted.cases.map((c) => ({
    project_id: body.project_id!,
    title: c.title,
    client: c.client ?? "",
    sector: c.sector ?? "",
    summary: c.summary ?? "",
    results: c.results ?? "",
    url: absolutize(c.url, targetUrl),
    source_url: targetUrl,
  }));

  const { data, error } = await svc.from("pg_case_studies").insert(rows).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ cases: data ?? [], count: data?.length ?? 0 });
}
