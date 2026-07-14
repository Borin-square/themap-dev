import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase-server";
import { requireAuth } from "../../../_auth";
import type { PgPage, PgProject, PgSection } from "@/lib/page-generator";

export const maxDuration = 300;

/* POST /api/page-generator/pages/[id]/rebuild-section — streaming
   Body: { h2_index: number, user_instruction: string }
   Rigenera SOLO una sezione dell'HTML output (identificata dall'indice dell'H2),
   passando come contesto le sezioni sorelle per mantenere coerenza di markup.
   Sostituisce in-place nell'html_output della latestVersion e salva. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({})) as {
    h2_index?: number;
    user_instruction?: string;
  };
  if (typeof body.h2_index !== "number" || body.h2_index < -1) {
    return NextResponse.json({ error: "h2_index mancante o invalido (usa -1 per la hero)" }, { status: 400 });
  }
  const instruction = (body.user_instruction ?? "").trim();

  const svc = createServiceClient();
  const { data: page } = await svc.from("pg_pages").select("*").eq("id", id).single<PgPage>();
  if (!page) return NextResponse.json({ error: "Pagina non trovata" }, { status: 404 });

  const { data: project } = await svc
    .from("pg_projects").select("*").eq("id", page.project_id).single<PgProject>();
  if (!project) return NextResponse.json({ error: "Progetto non trovato" }, { status: 404 });

  const { data: version } = await svc
    .from("pg_page_versions")
    .select("*")
    .eq("page_id", id)
    .order("version_no", { ascending: false })
    .limit(1)
    .single<{ id: string; version_no: number; sections: PgSection[]; html_output: string | null }>();
  if (!version?.html_output?.trim()) {
    return NextResponse.json({ error: "Nessun HTML output. Genera prima l'HTML completo." }, { status: 400 });
  }

  const parts = splitByH2(version.html_output);
  const isHero = body.h2_index === -1;

  if (isHero && !parts.intro.trim()) {
    return NextResponse.json({ error: "Nessuna hero (intro prima del primo H2) da rigenerare" }, { status: 400 });
  }
  if (!isHero && parts.sections.length === 0) {
    return NextResponse.json({ error: "Nessun H2 rilevato nell'HTML" }, { status: 400 });
  }
  if (!isHero && body.h2_index >= parts.sections.length) {
    return NextResponse.json({ error: `h2_index fuori range (0..${parts.sections.length - 1})` }, { status: 400 });
  }

  const targetHtml = isHero ? parts.intro : parts.sections[body.h2_index].html;
  const siblingBefore = isHero ? null : parts.sections[body.h2_index - 1] ?? null;
  // Per la hero, il "sibling dopo" è la prima H2 come esempio di stile.
  const siblingAfter = isHero ? (parts.sections[0] ?? null) : (parts.sections[body.h2_index + 1] ?? null);

  const hasDesign = !!(project.wp_design_snippet && project.wp_design_snippet.trim());

  const systemPrompt = [
    "Sei un frontend engineer specializzato nella conversione di bozze editoriali in HTML per temi WordPress.",
    isHero
      ? "Il tuo compito ORA è rigenerare la HERO/INTRO della pagina (H1 + paragrafi introduttivi), mantenendo piena coerenza di markup e classi con il resto della pagina già esistente."
      : "Il tuo compito ORA è rigenerare UNA SINGOLA SEZIONE di una pagina esistente, mantenendo la piena coerenza di markup e classi con il resto della pagina.",
    "",
    "## FONTE UNICA DELLO STILE",
    hasDesign
      ? "Il DESIGN SNIPPET qui sotto è l'UNICA fonte autorizzata per markup e classi CSS. È la tua legge:"
      : "L'utente NON ha fornito uno snippet di design. Usa markup semantico standard senza classi CSS custom.",
    hasDesign ? "═══════════════ DESIGN SNIPPET (VINCOLANTE) ═══════════════" : "",
    hasDesign ? project.wp_design_snippet : "",
    hasDesign ? "═══════════════════════════════════════════════════════════" : "",
    "",
    project.wp_design_notes ? `## NOTE OPERATIVE DEL DESIGNER\n${project.wp_design_notes}` : "",
    "",
    project.tone_of_voice && project.tone_of_voice.trim()
      ? `## TONE OF VOICE\n${project.tone_of_voice.trim()}\nApplica questo tone a tutto il testo che scrivi (titoli, paragrafi, FAQ, CTA, callout). Se il markup attuale ha una scrittura fuori tone, puoi riformulare mantenendo argomenti e significato.\n`
      : "",
    "## REGOLE DI ADERENZA ALLO STILE",
    hasDesign ? "1. Usa SOLO le classi CSS del DESIGN SNIPPET. Vietato inventare classi." : "1. Solo markup semantico standard.",
    hasDesign ? "2. Rispetta i pattern del DESIGN SNIPPET per h2, h3, p, ul, blockquote, figure, ecc." : "2. Struttura minimale.",
    hasDesign ? "3. Rispetta wrapper container mostrati nello snippet." : "",
    "",
    project.wp_html_prompt && project.wp_html_prompt.trim()
      ? `## ISTRUZIONI AGGIUNTIVE DEL PROGETTO\n${project.wp_html_prompt.trim()}\n`
      : "",
    isHero
      ? "## PRIMA SEZIONE H2 DELLA PAGINA (usa come esempio di stile GIÀ ADOTTATO — l'intro deve fluire coerentemente in questo blocco)"
      : "## SEZIONI SORELLE DELLA PAGINA (usa come esempio di stile GIÀ ADOTTATO su questa pagina — replica quel markup)",
    !isHero && siblingBefore ? `\n### SEZIONE PRECEDENTE (già presente nella pagina):\n${siblingBefore.html}` : "",
    siblingAfter
      ? (isHero
          ? `\n### PRIMO H2 (il tuo output deve stare PRIMA di questo):\n${siblingAfter.html}`
          : `\n### SEZIONE SUCCESSIVA (già presente nella pagina):\n${siblingAfter.html}`)
      : "",
    "",
    "## OUTPUT",
    isHero
      ? "- Restituisci SOLO il markup HTML della hero: l'H1 con il titolo pagina come primo elemento, seguito dai paragrafi introduttivi (con classi del design snippet se pertinenti, es. .big, .lead, .pre-title)."
      : "- Restituisci SOLO il markup HTML della nuova sezione, dall'<h2 di apertura in poi (INCLUSO l'h2), fino a prima del prossimo <h2>.",
    isHero
      ? "- NON generare l'<h2 successivo: il tuo output finisce dove inizia la prima H2 della pagina."
      : "- L'H2 deve mantenere lo stesso `id` originale se presente (SEO anchor).",
    "- NON generare tag <html>, <head>, <body>, wrapper globali, code fence (```), commenti esplicativi.",
    "- Nessun testo introduttivo o conclusivo: la prima riga della risposta è la prima riga di markup.",
  ].filter(Boolean).join("\n");

  const userMsg = [
    `TITOLO PAGINA: ${page.title || page.kw_main}`,
    `KEYWORD PRINCIPALE: ${page.kw_main}`,
    page.meta_description ? `META DESCRIPTION: ${page.meta_description}` : "",
    ``,
    isHero
      ? `HERO ATTUALE DA RIGENERARE (verrà sostituita — H1 + intro):`
      : `SEZIONE ATTUALE DA RIGENERARE (il markup che verrà sostituito):`,
    targetHtml,
    ``,
    instruction
      ? `ISTRUZIONE DELL'UTENTE PER QUESTA RIGENERAZIONE:\n${instruction}`
      : (isHero
          ? `ISTRUZIONE: rigenera la hero migliorando gancio, chiarezza e coerenza col design snippet. Mantieni il messaggio ma allinea markup e classi allo stile della pagina.`
          : `ISTRUZIONE: rigenera questa sezione migliorando aderenza al design snippet e alle sezioni sorelle. Mantieni il contenuto e il significato, ma allinea markup, classi e struttura ai pattern usati nelle sezioni sorelle.`),
    ``,
    isHero
      ? `Restituisci SOLO il nuovo markup della hero (H1 + intro), che deve fluire nel primo H2 già presente sotto.`
      : `Restituisci SOLO il nuovo markup della sezione (dall'<h2 in poi, fino al prossimo <h2 escluso).`,
  ].filter(Boolean).join("\n");

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = project.html_model || "claude-opus-4-7";
  const thinkingOn = project.html_thinking !== false;
  const maxTokens = thinkingOn ? 8000 : 4000; // sezione singola: budget più basso

  const encoder = new TextEncoder();
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
          throw new Error("Risposta LLM vuota. Verifica config modello/thinking.");
        }

        // Pulizia: rimuovi code fence eventuali
        const cleaned = fullText
          .replace(/^```html\s*\n?/i, "")
          .replace(/^```\s*\n?/i, "")
          .replace(/\n?```\s*$/i, "")
          .trim();

        // Ricostruisce l'HTML output sostituendo il blocco target
        let newHtml: string;
        if (isHero) {
          // Sostituisce l'intro, mantiene tutte le sezioni H2 esistenti
          const suffix = cleaned.endsWith("\n") ? "" : "\n";
          newHtml = cleaned + suffix + parts.sections.map((s) => s.html).join("");
        } else {
          const newSections = parts.sections.map((s, i) => i === body.h2_index ? cleaned : s.html);
          newHtml = parts.intro + newSections.join("");
        }

        await svc.from("pg_page_versions")
          .update({ html_output: newHtml })
          .eq("id", version.id);

        await svc.from("pg_pages")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", id);

        controller.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Errore rigenerazione sezione";
        console.error("[rebuild-section] error:", { model, thinkingOn, message, err });
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

/** Splitta HTML per H2. Restituisce l'intro (tutto prima del primo <h2>) e le sezioni.
 *  Ogni sezione include il proprio <h2 ...>...</h2> di apertura e va fino a prima del prossimo <h2>. */
function splitByH2(html: string): {
  intro: string;
  sections: Array<{ title: string; html: string; id: string | null }>;
} {
  const h2Re = /<h2\b[^>]*>[\s\S]*?<\/h2>/gi;
  const h2Matches: Array<{ index: number; length: number; tag: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = h2Re.exec(html)) !== null) {
    h2Matches.push({ index: m.index, length: m[0].length, tag: m[0] });
  }
  if (h2Matches.length === 0) return { intro: html, sections: [] };

  const intro = html.slice(0, h2Matches[0].index);
  const sections: Array<{ title: string; html: string; id: string | null }> = [];
  for (let i = 0; i < h2Matches.length; i++) {
    const start = h2Matches[i].index;
    const end = i + 1 < h2Matches.length ? h2Matches[i + 1].index : html.length;
    const sectionHtml = html.slice(start, end);
    const titleMatch = h2Matches[i].tag.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() : `Sezione ${i + 1}`;
    const idMatch = h2Matches[i].tag.match(/\bid\s*=\s*["']([^"']+)["']/i);
    sections.push({ title, html: sectionHtml, id: idMatch ? idMatch[1] : null });
  }
  return { intro, sections };
}
