import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase-server";
import { requireAuth } from "../../../_auth";
import { buildDraftSystemPrompt } from "@/lib/page-generator";
import type { PgPage, PgProject, PgSection } from "@/lib/page-generator";

export const maxDuration = 300;

interface Body {
  section_id: string;
  version_no: number;
  instructions?: string;   // eventuali istruzioni aggiuntive dell'utente
}

/* POST /api/page-generator/pages/[id]/section — rigenera una sezione singola in streaming */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await ctx.params;
  const body = await req.json() as Body;
  if (!body.section_id || !body.version_no) {
    return NextResponse.json({ error: "section_id e version_no richiesti" }, { status: 400 });
  }

  const svc = createServiceClient();

  const { data: page, error: pageErr } = await svc
    .from("pg_pages").select("*").eq("id", id).single<PgPage>();
  if (pageErr || !page) return NextResponse.json({ error: "Pagina non trovata" }, { status: 404 });

  const { data: project, error: projErr } = await svc
    .from("pg_projects").select("*").eq("id", page.project_id).single<PgProject>();
  if (projErr || !project) return NextResponse.json({ error: "Progetto non trovato" }, { status: 404 });

  const { data: version, error: verErr } = await svc
    .from("pg_page_versions")
    .select("*")
    .eq("page_id", id)
    .eq("version_no", body.version_no)
    .single<{ id: string; sections: PgSection[]; draft_text: string | null }>();
  if (verErr || !version) return NextResponse.json({ error: "Versione non trovata" }, { status: 404 });

  const sections = version.sections ?? [];
  const target = sections.find((s) => s.id === body.section_id);
  if (!target) return NextResponse.json({ error: "Sezione non trovata" }, { status: 404 });

  // Contesto: le altre sezioni come sommario (solo titoli + primi 200 char)
  const outline = sections
    .sort((a, b) => a.order - b.order)
    .map((s) => `- ${s === target ? "[QUESTA]" : ""} ${s.title}: ${s.body.slice(0, 200).replace(/\s+/g, " ")}`)
    .join("\n");

  const systemPrompt = buildDraftSystemPrompt({
    pageType: page.page_type,
    toneOfVoice: project.tone_of_voice,
    designNotes: project.wp_design_notes,
  });

  const userMsg = [
    `Devi RIGENERARE la sezione "${target.title}" di una pagina già esistente.`,
    ``,
    `KEYWORD PRINCIPALE: ${page.kw_main}`,
    page.kw_secondary.length > 0 ? `KEYWORD SECONDARIE: ${page.kw_secondary.join(", ")}` : "",
    page.info_gain_text ? `INFORMATION GAIN DELLA PAGINA:\n${page.info_gain_text}` : "",
    ``,
    `OUTLINE COMPLETO DELLA PAGINA (per contesto, non ripetere le altre sezioni):`,
    outline,
    ``,
    `SEZIONE ATTUALE (da rigenerare):`,
    `## ${target.title}`,
    target.body,
    ``,
    body.instructions ? `ISTRUZIONI PER LA RIGENERAZIONE:\n${body.instructions}` : "Migliora chiarezza, unicità e allineamento al topical authority. Mantieni il titolo, cambia il corpo.",
    ``,
    `OUTPUT: solo il corpo della sezione (senza l'heading ## Titolo), in testo Markdown-like.`,
  ].filter(Boolean).join("\n");

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let fullText = "";
      try {
        const anthropicStream = anthropic.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 2000,
          system: systemPrompt,
          messages: [{ role: "user", content: userMsg }],
        });

        for await (const event of anthropicStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            const text = event.delta.text;
            fullText += text;
            controller.enqueue(encoder.encode(text));
          }
        }

        // Aggiorna la sezione nella versione corrente
        const updatedSections = sections.map((s) =>
          s.id === body.section_id ? { ...s, body: fullText.trim() } : s
        );

        // Ricostruisce il draft_text
        const newDraftText = updatedSections
          .sort((a, b) => a.order - b.order)
          .map((s, i) => (i === 0 && s.title === "Introduzione") ? s.body : `## ${s.title}\n\n${s.body}`)
          .join("\n\n");

        await svc.from("pg_page_versions")
          .update({ sections: updatedSections, draft_text: newDraftText })
          .eq("id", version.id);

        await svc.from("pg_pages")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", id);

        controller.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Errore rigenerazione";
        controller.enqueue(encoder.encode(`\n\n[ERROR: ${message}]`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
