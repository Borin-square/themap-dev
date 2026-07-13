import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase-server";
import { requireAuth } from "../../../_auth";
import {
  buildDraftSystemPrompt,
  buildDraftUserMessage,
  parseDraftSections,
} from "@/lib/page-generator";
import type { PgPage, PgProject, PgAuthor, PgCaseStudy } from "@/lib/page-generator";

export const maxDuration = 300;

/* POST /api/page-generator/pages/[id]/draft — stream bozza Claude e salva versione */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await ctx.params;
  const svc = createServiceClient();

  // Fetch pagina
  const { data: page, error: pageErr } = await svc
    .from("pg_pages").select("*").eq("id", id).single<PgPage>();
  if (pageErr || !page) return NextResponse.json({ error: "Pagina non trovata" }, { status: 404 });

  // Fetch progetto
  const { data: project, error: projErr } = await svc
    .from("pg_projects").select("*").eq("id", page.project_id).single<PgProject>();
  if (projErr || !project) return NextResponse.json({ error: "Progetto non trovato" }, { status: 404 });

  // Fetch autori e casi studio selezionati
  const authors: PgAuthor[] = page.author_ids?.length > 0
    ? (await svc.from("pg_authors").select("*").in("id", page.author_ids)).data ?? []
    : [];
  const cases: PgCaseStudy[] = page.case_study_ids?.length > 0
    ? (await svc.from("pg_case_studies").select("*").in("id", page.case_study_ids)).data ?? []
    : [];

  // Contesto pillar per cluster page
  let parentPillarContext: string | null = null;
  if (page.page_type === "cluster" && page.parent_pillar_id) {
    const { data: parent } = await svc
      .from("pg_pages").select("kw_main,title,info_gain_text").eq("id", page.parent_pillar_id).single();
    if (parent) {
      parentPillarContext = [
        `Pillar: ${parent.title || parent.kw_main}`,
        parent.info_gain_text ? `Info gain pillar: ${parent.info_gain_text}` : "",
      ].filter(Boolean).join("\n");
    }
  }

  if (!page.kw_main.trim()) {
    return NextResponse.json({ error: "Keyword principale richiesta" }, { status: 400 });
  }

  const systemPrompt = buildDraftSystemPrompt({
    pageType: page.page_type,
    toneOfVoice: project.tone_of_voice,
    designNotes: project.wp_design_notes,
  });
  const userMsg = buildDraftUserMessage({
    kwMain: page.kw_main,
    kwSecondary: page.kw_secondary,
    searchIntent: page.search_intent,
    infoGain: page.info_gain_text,
    sourceDocExtracted: page.source_doc_extracted,
    authors: authors.map((a) => ({ name: a.name, role: a.role, bio: a.bio })),
    cases: cases.map((c) => ({ title: c.title, client: c.client, results: c.results })),
    parentPillarContext,
  });

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const maxTokens = page.page_type === "pillar" ? 8000 : 4000;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let fullText = "";
      try {
        const anthropicStream = anthropic.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: maxTokens,
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

        // Salva versione dopo streaming
        const sections = parseDraftSections(fullText);

        // Calcola prossimo version_no
        const { data: versions } = await svc
          .from("pg_page_versions")
          .select("version_no")
          .eq("page_id", id)
          .order("version_no", { ascending: false })
          .limit(1);
        const nextVersion = (versions?.[0]?.version_no ?? 0) + 1;

        await svc.from("pg_page_versions").insert({
          page_id: id,
          version_no: nextVersion,
          draft_text: fullText,
          sections,
        });

        // Aggiorna updated_at pagina
        await svc.from("pg_pages")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", id);

        controller.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Errore generazione";
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
