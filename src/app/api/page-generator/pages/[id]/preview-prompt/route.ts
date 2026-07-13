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
    `BOZZA (contenuto da convertire — non alterare significato e ordine):`,
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
