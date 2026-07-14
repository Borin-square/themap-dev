import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase-server";
import { requireAuth } from "../../../_auth";
import { sectionsToDraft } from "@/lib/page-generator";
import type { PgPage, PgProject, PgSection, PgMedia } from "@/lib/page-generator";

export const maxDuration = 300;

/* POST /api/page-generator/pages/[id]/build-html — genera l'HTML WordPress in streaming
   Body: { version_no?: number }  (default: ultima versione) */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({})) as { version_no?: number };
  const svc = createServiceClient();

  const { data: page, error: pageErr } = await svc
    .from("pg_pages").select("*").eq("id", id).single<PgPage>();
  if (pageErr || !page) return NextResponse.json({ error: "Pagina non trovata" }, { status: 404 });

  const { data: project, error: projErr } = await svc
    .from("pg_projects").select("*").eq("id", page.project_id).single<PgProject>();
  if (projErr || !project) return NextResponse.json({ error: "Progetto non trovato" }, { status: 404 });

  // Prendi la versione target (default: ultima)
  const versionQuery = svc.from("pg_page_versions").select("*").eq("page_id", id);
  const { data: version } = body.version_no
    ? await versionQuery.eq("version_no", body.version_no).single<{ id: string; version_no: number; sections: PgSection[]; draft_text: string | null }>()
    : await versionQuery.order("version_no", { ascending: false }).limit(1).single<{ id: string; version_no: number; sections: PgSection[]; draft_text: string | null }>();

  if (!version) return NextResponse.json({ error: "Nessuna versione trovata. Genera prima una bozza." }, { status: 400 });

  // Media della pagina
  const { data: mediaList } = await svc
    .from("pg_media").select("*").eq("page_id", id).order("position");
  const media: PgMedia[] = mediaList ?? [];

  const draftText = version.draft_text || sectionsToDraft(version.sections);
  if (!draftText.trim()) {
    return NextResponse.json({ error: "Bozza vuota" }, { status: 400 });
  }

  const hasDesign = !!(project.wp_design_snippet && project.wp_design_snippet.trim());

  const systemPrompt = [
    "Sei un frontend engineer specializzato nella conversione di bozze editoriali in HTML per temi WordPress.",
    "",
    "## FONTE UNICA DELLO STILE",
    hasDesign
      ? "Il DESIGN SNIPPET qui sotto è l'UNICA fonte autorizzata per scelte di markup e classi CSS. È la tua legge:"
      : "L'utente NON ha fornito uno snippet di design. Usa markup semantico standard senza classi CSS custom.",
    "",
    hasDesign ? "═══════════════ DESIGN SNIPPET (VINCOLANTE) ═══════════════" : "",
    hasDesign ? project.wp_design_snippet : "",
    hasDesign ? "═══════════════════════════════════════════════════════════" : "",
    "",
    project.wp_design_notes ? `## NOTE OPERATIVE DEL DESIGNER\n${project.wp_design_notes}` : "",
    "",
    project.tone_of_voice && project.tone_of_voice.trim()
      ? `## TONE OF VOICE\n${project.tone_of_voice.trim()}\nUsa questo tone in TUTTO il testo che scrivi o riscrivi: titoli, paragrafi, FAQ, CTA, callout, alt text, meta. Se la bozza è formulata diversamente, riformulala nel tone mantenendo significato e argomenti.\n`
      : "",
    "## REGOLE DI ADERENZA ALLO STILE (rispetta tutte)",
    hasDesign ? "1. Usa SOLO ed ESCLUSIVAMENTE le classi CSS presenti nel DESIGN SNIPPET. È vietato inventare nomi di classe. Se una classe non appare nello snippet, non esiste." : "1. Nessuna classe CSS custom: usa solo tag semantici.",
    hasDesign ? "2. Copia i PATTERN DI MARKUP dello snippet: se lo snippet mostra `<h2 class=\"wp-block-heading\">Testo</h2>`, gli H2 li scrivi ESATTAMENTE così. Stesso principio per paragrafi, liste, immagini, callout, blockquote, wrapper." : "2. Struttura minimale: h1/h2/p/ul/blockquote.",
    hasDesign ? "3. Se una struttura non è coperta dal DESIGN SNIPPET (es. serve un accordion e non c'è), scegli l'elemento più semplice compatibile (dettaglio HTML5 nativo o tag base) senza aggiungere classi non presenti." : "",
    hasDesign ? "4. Rispetta anche gli wrapper container mostrati nello snippet (div.entry-content, article, ecc.). Se nello snippet i contenuti stanno dentro un container, mettili anche tu dentro quel container." : "",
    hasDesign ? "5. Rispetta le convenzioni di quoting (doppi apici, singoli apici), l'ordine degli attributi e lo stile di formattazione (indentazione, capo riga) visibili nello snippet." : "",
    "",
    project.wp_html_prompt && project.wp_html_prompt.trim()
      ? `## ISTRUZIONI AGGIUNTIVE DEL PROGETTO (integrano, non sostituiscono, le regole sopra)\n${project.wp_html_prompt.trim()}\n`
      : "",
    "## STRUTTURA CONTENUTO",
    "- NON generare header, footer, tag <html>, <head>, <body>. Solo il body della pagina, senza tag wrapper globali.",
    "- Il primo elemento visibile deve essere l'H1 con il titolo della pagina.",
    "- Ogni H2 riceve un attributo `id` derivato dallo slug del titolo (SEO anchor).",
    "- Preserva l'ordine della bozza; non riorganizzare le sezioni.",
    "- Inserisci i media forniti dentro le sezioni pertinenti, dopo il primo paragrafo che introduce quel tema. Usa esattamente l'alt text fornito.",
    "- Alla fine del body includi UN SOLO `<script type=\"application/ld+json\">` con schema Article base (headline, description, inLanguage=\"it-IT\"). Sarà arricchito successivamente.",
    "",
    "## OUTPUT",
    "- Restituisci SOLO HTML raw. Nessun code fence (```), nessun frontmatter, nessun commento esplicativo.",
    "- Nessun testo introduttivo o conclusivo. La prima riga della risposta è la prima riga di HTML.",
  ].filter(Boolean).join("\n");

  const mediaBlock = media.length > 0
    ? media.map((m, i) => `${i + 1}. ${m.media_type.toUpperCase()} — URL: ${m.url} — ALT: "${m.alt_text}"${m.caption ? " — CAPTION: " + m.caption : ""}`).join("\n")
    : "(nessuno)";

  const userMsg = [
    `Converti la seguente bozza in HTML per WordPress applicando esattamente il DESIGN SNIPPET fornito nel system prompt.`,
    ``,
    `TITOLO PAGINA: ${page.title || page.kw_main}`,
    `KEYWORD PRINCIPALE: ${page.kw_main}`,
    page.kw_secondary.length > 0 ? `KEYWORD SECONDARIE: ${page.kw_secondary.join(", ")}` : "",
    page.meta_description ? `META DESCRIPTION: ${page.meta_description}` : "",
    ``,
    `MEDIA DISPONIBILI (inserisci nei punti pertinenti, con l'alt text esatto):`,
    mediaBlock,
    ``,
    page.reference_urls && page.reference_urls.length > 0
      ? `ESEMPI DI DESIGN (altre pagine dello stesso sito — usale come riferimento per markup e classi da riprodurre):\n${page.reference_urls.map((u, i) => `${i + 1}. ${u}`).join("\n")}\n`
      : "",
    `BOZZA (contenuto di partenza — puoi migliorare la scrittura applicando il tone of voice se definito, ma mantieni significato, argomenti e ordine delle sezioni):`,
    draftText,
    ``,
    `Prima di scrivere l'HTML, ripassa mentalmente le classi e i pattern presenti nel DESIGN SNIPPET del system prompt e usa SOLO quelli. Se una struttura non è coperta, adotta la variante più semplice compatibile senza inventare classi.`,
  ].filter(Boolean).join("\n");

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const model = project.html_model || "claude-opus-4-7";
  const thinkingOn = project.html_thinking !== false;
  const maxTokens = thinkingOn ? 16000 : 8000;

  const encoder = new TextEncoder();
  // Marker riconosciuto dal client per distinguere errore da successo.
  const ERROR_MARKER = "<!--__PG_STREAM_ERROR__:";

  const stream = new ReadableStream({
    async start(controller) {
      let fullText = "";
      try {
        const streamParams: Parameters<typeof anthropic.messages.stream>[0] = {
          model,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: "user", content: userMsg }],
          // Con thinking on l'API forza temperature=1 (non è ammessa < 1).
          // Con thinking off, temperature=0 per aderenza deterministica.
          ...(thinkingOn
            ? { thinking: { type: "adaptive" as const, display: "summarized" as const } }
            : { temperature: 0 }),
        };
        const anthropicStream = anthropic.messages.stream(streamParams);

        for await (const event of anthropicStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            const text = event.delta.text;
            fullText += text;
            controller.enqueue(encoder.encode(text));
          }
        }

        if (!fullText.trim()) {
          throw new Error("Risposta LLM vuota (0 token output). Verifica config modello/thinking.");
        }

        // Pulizia: rimuovi eventuali code fence residui
        const cleaned = fullText
          .replace(/^```html\s*\n?/i, "")
          .replace(/^```\s*\n?/i, "")
          .replace(/\n?```\s*$/i, "")
          .trim();

        await svc.from("pg_page_versions")
          .update({ html_output: cleaned })
          .eq("id", version.id);

        await svc.from("pg_pages")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", id);

        controller.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Errore build HTML";
        console.error("[build-html] error:", { model, thinkingOn, message, err });
        // Emette marker riconoscibile dal client + NON aggiorna il DB (l'HTML precedente resta valido).
        controller.enqueue(encoder.encode(`\n\n${ERROR_MARKER} ${message}-->`));
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
