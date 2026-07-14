import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { requireAuth } from "../../../_auth";
import { sectionsToDraft } from "@/lib/page-generator";
import type { PgPage, PgProject, PgSection, PgMedia } from "@/lib/page-generator";

export const maxDuration = 15;

/* GET /api/page-generator/pages/[id]/preview-prompt
   Ricostruisce e restituisce (system, user) che verrebbero inviati a Claude
   durante build-html, senza fare la chiamata. Utile per iterare sul prompt. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await ctx.params;
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
    .single<{ id: string; version_no: number; sections: PgSection[]; draft_text: string | null }>();

  const { data: mediaList } = await svc
    .from("pg_media").select("*").eq("page_id", id).order("position");
  const media: PgMedia[] = mediaList ?? [];

  const draftText = version?.draft_text || (version ? sectionsToDraft(version.sections) : "");

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
    hasDesign ? "3. Se una struttura non è coperta dal DESIGN SNIPPET, usa i tag HTML5 semantici nativi (`<details>`/`<summary>` per accordion, `<figure>`/`<figcaption>` per immagini con didascalia, `<blockquote>`/`<cite>` per citazioni, `<table>` per dati tabulari) senza inventare classi. Meglio semantica nativa che paragrafi generici." : "",
    hasDesign ? "4. Rispetta anche gli wrapper container mostrati nello snippet (div.entry-content, article, ecc.). Se nello snippet i contenuti stanno dentro un container, mettili anche tu dentro quel container." : "",
    hasDesign ? "5. Rispetta le convenzioni di quoting (doppi apici, singoli apici), l'ordine degli attributi e lo stile di formattazione (indentazione, capo riga) visibili nello snippet." : "",
    "",
    project.wp_html_prompt && project.wp_html_prompt.trim()
      ? `## ISTRUZIONI AGGIUNTIVE DEL PROGETTO (integrano, non sostituiscono, le regole sopra)\n${project.wp_html_prompt.trim()}\n`
      : "",
    hasDesign ? "## PATTERN COMPOSITIVI E RITMO VISIVO" : "",
    hasDesign ? "Un buon output non è \"classi giuste + basta\": è varietà visiva. Prima di scrivere una sezione, scegli il componente del DESIGN SNIPPET che la esprime meglio, poi alterna." : "",
    hasDesign ? "- Se lo snippet include COMPONENTI STRUTTURATI (grid di card, blocchi numerati, servizi, callout, conversazioni, FAQ, ecc.), USALI dove il contenuto lo giustifica: elenchi di elementi paralleli → grid di card; procedimenti/step → blocchi numerati; punti forti/differenziatori → card o callout; domande e risposte → FAQ pattern." : "",
    hasDesign ? "- Se lo snippet include VARIANTI TIPOGRAFICHE (pre-title/eyebrow, testo grande enfatico, testo piccolo secondario, ecc.), usale per introdurre sezioni, dare enfasi a frasi chiave o annotare contesti." : "",
    hasDesign ? "- ALTERNA blocchi diversi: max 2-3 paragrafi consecutivi, poi intervalla con un elemento visivo diverso (heading, lista, card, callout, immagine, citazione)." : "",
    hasDesign ? "- RITMO tipico di sezione: H2 (con eventuale pre-title), paragrafo introduttivo breve, pattern strutturato adatto (card/step/lista/tabella), paragrafo di sintesi o transizione." : "",
    hasDesign ? "- La bozza è un canovaccio, non uno script: hai licenza di rimodulare in blocchi visivi ciò che è scritto in prosa, purché mantieni argomenti, ordine e significato. Se è definito un TONE OF VOICE, ogni riscrittura lo applica." : "",
    "",
    "## ANTIPATTERN DA EVITARE",
    "- Sequenze di 4+ paragrafi consecutivi senza alcun elemento visivo intermedio.",
    "- Duplicare l'H1 nella pagina (uno solo, all'inizio).",
    "- H3 orfani senza un H2 padre a monte.",
    "- Attributi `style=\"...\"` inline: usa solo classi del DESIGN SNIPPET.",
    hasDesign ? "- Applicare classi a tag \"a caso\" per riempire: se una classe esiste per un certo elemento, usala solo lì." : "",
    "- Trasformare tutto in liste puntate: se il contenuto è narrativo, resta in paragrafi; usa liste per elementi realmente paralleli.",
    "- Riscrivere la bozza abbandonando il TONE OF VOICE definito.",
    "",
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
    draftText || "(nessuna bozza ancora — genera prima le sezioni)",
    ``,
    `Prima di scrivere l'HTML, ripassa mentalmente le classi e i pattern presenti nel DESIGN SNIPPET del system prompt e usa SOLO quelli. Se una struttura non è coperta, adotta la variante più semplice compatibile senza inventare classi.`,
  ].filter(Boolean).join("\n");

  return NextResponse.json({
    system: systemPrompt,
    user: userMsg,
    hasDraft: !!draftText,
    hasCustomPrompt: !!(project.wp_html_prompt && project.wp_html_prompt.trim()),
  });
}
