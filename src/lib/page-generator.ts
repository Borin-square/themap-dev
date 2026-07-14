/* Page Generator: tipi e helper condivisi (client + server) */

export const PG_PAGE_TYPES = ["pillar", "cluster"] as const;
export type PgPageType = typeof PG_PAGE_TYPES[number];

export const PG_STATUSES = ["draft", "in_review", "ready", "exported"] as const;
export type PgStatus = typeof PG_STATUSES[number];

export const PG_STATUS_LABELS: Record<PgStatus, string> = {
  draft: "Bozza",
  in_review: "In review",
  ready: "Pronta",
  exported: "Esportata",
};

export const PG_STATUS_COLORS: Record<PgStatus, string> = {
  draft: "#94a3b8",
  in_review: "#f59e0b",
  ready: "#10b981",
  exported: "#6366f1",
};

export const PG_MEDIA_TYPES = ["image", "video", "embed", "file"] as const;
export type PgMediaType = typeof PG_MEDIA_TYPES[number];

/* ─────────────────────────  Domain models  ───────────────────────── */

export interface PgProject {
  id: string;
  company_slug: string;
  name: string;
  wp_design_snippet: string;
  wp_design_notes: string;
  wp_html_prompt: string;
  html_model: string;
  html_thinking: boolean;
  tone_of_voice: string;
  authors_page_url: string | null;
  case_studies_page_url: string | null;
  drive_folder_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface PgAuthor {
  id: string;
  project_id: string;
  name: string;
  role: string;
  bio: string;
  photo_url: string | null;
  linkedin_url: string | null;
  same_as: string[];
  source_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface PgCaseStudy {
  id: string;
  project_id: string;
  title: string;
  client: string;
  sector: string;
  summary: string;
  results: string;
  url: string | null;
  source_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface PgPage {
  id: string;
  project_id: string;
  title: string;
  slug: string | null;
  page_type: PgPageType;
  parent_pillar_id: string | null;
  kw_main: string;
  kw_secondary: string[];
  search_intent: string | null;
  info_gain_text: string;
  source_doc_url: string | null;
  source_doc_extracted: string | null;
  author_ids: string[];
  case_study_ids: string[];
  meta_description: string | null;
  reference_urls: string[];
  status: PgStatus;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface PgSection {
  id: string;
  title: string;
  body: string;
  order: number;
}

export interface PgPageVersion {
  id: string;
  page_id: string;
  version_no: number;
  draft_text: string | null;
  sections: PgSection[];
  html_output: string | null;
  css_output: string | null;
  kg_json: unknown | null;
  created_at: string;
}

export interface PgMedia {
  id: string;
  page_id: string;
  url: string;
  media_type: PgMediaType;
  alt_text: string;
  caption: string;
  position: number;
  created_at: string;
}

/* ─────────────────────────  Draft input types  ───────────────────────── */

export interface PgProjectDraft {
  name: string;
  wp_design_snippet?: string;
  wp_design_notes?: string;
  wp_html_prompt?: string;
  html_model?: string;
  html_thinking?: boolean;
  tone_of_voice?: string;
  authors_page_url?: string | null;
  case_studies_page_url?: string | null;
  drive_folder_url?: string | null;
}

export interface PgPageDraft {
  title?: string;
  slug?: string | null;
  page_type: PgPageType;
  parent_pillar_id?: string | null;
  kw_main?: string;
  kw_secondary?: string[];
  search_intent?: string | null;
  info_gain_text?: string;
  source_doc_url?: string | null;
  source_doc_extracted?: string | null;
  author_ids?: string[];
  case_study_ids?: string[];
  meta_description?: string | null;
  reference_urls?: string[];
  status?: PgStatus;
  notes?: string;
}

/* ─────────────────────────  Helpers  ───────────────────────── */

export function emptyProject(company_slug: string): PgProjectDraft & { company_slug: string } {
  return {
    company_slug,
    name: "Nuovo progetto",
    wp_design_snippet: "",
    wp_design_notes: "",
    wp_html_prompt: "",
    html_model: "claude-opus-4-7",
    html_thinking: true,
    tone_of_voice: "",
    authors_page_url: null,
    case_studies_page_url: null,
    drive_folder_url: null,
  };
}

export function emptyPage(project_id: string, page_type: PgPageType = "cluster"): PgPageDraft & { project_id: string } {
  return {
    project_id,
    title: "",
    slug: null,
    page_type,
    parent_pillar_id: null,
    kw_main: "",
    kw_secondary: [],
    search_intent: null,
    info_gain_text: "",
    source_doc_url: null,
    source_doc_extracted: null,
    author_ids: [],
    case_study_ids: [],
    meta_description: null,
    reference_urls: [],
    status: "draft",
    notes: "",
  };
}

/** Parsa un CSV di keyword (una per riga o separate da virgola) */
export function parseKeywordCsv(text: string): string[] {
  return text
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Genera uno slug SEO-friendly da un titolo */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

/** Target parole per tipo di pagina (usato dal prompt Claude) */
export const PG_WORD_TARGET: Record<PgPageType, { min: number; max: number }> = {
  pillar: { min: 2000, max: 3500 },
  cluster: { min: 800, max: 1500 },
};

/** Parsa il testo bozza in sezioni usando gli heading `## Titolo`.
 *  Il testo prima del primo H2 viene messo in una sezione "Introduzione". */
export function parseDraftSections(draft: string): PgSection[] {
  if (!draft.trim()) return [];
  const lines = draft.split(/\r?\n/);
  const sections: PgSection[] = [];
  let currentTitle: string | null = null;
  let currentBody: string[] = [];
  let order = 0;

  const pushCurrent = () => {
    if (currentTitle === null && currentBody.length === 0) return;
    const title = currentTitle ?? "Introduzione";
    const body = currentBody.join("\n").trim();
    if (!body && !currentTitle) return;
    sections.push({
      id: `s${order}-${slugify(title)}`,
      title,
      body,
      order,
    });
    order++;
  };

  for (const line of lines) {
    const h2 = /^##\s+(.+)$/.exec(line);
    if (h2) {
      pushCurrent();
      currentTitle = h2[1].trim();
      currentBody = [];
      continue;
    }
    // Salta H1 iniziale (# Titolo)
    if (/^#\s+/.test(line) && currentTitle === null && currentBody.length === 0) continue;
    currentBody.push(line);
  }
  pushCurrent();
  return sections;
}

/** Ricompone il testo bozza a partire da un array di sezioni */
export function sectionsToDraft(sections: PgSection[]): string {
  return sections
    .sort((a, b) => a.order - b.order)
    .map((s) => {
      if (s.title === "Introduzione" && sections.indexOf(s) === 0) return s.body;
      return `## ${s.title}\n\n${s.body}`;
    })
    .join("\n\n");
}

/** Costruisce il system prompt per la generazione bozza (topical authority). */
export function buildDraftSystemPrompt(input: {
  pageType: PgPageType;
  toneOfVoice: string;
  designNotes?: string;
}): string {
  const target = PG_WORD_TARGET[input.pageType];
  const pillarInstructions = `Stai scrivendo una PILLAR PAGE.
Copertura ampia e autorevole del topic, orientata a topical authority.
Struttura: introduzione forte, ${target.min}-${target.max} parole, 6-10 sezioni H2, sotto-sezioni H3 dove serve.
Copri tutti i sub-topic principali; ognuno rimanda mentalmente a un cluster che approfondirà.
NON scrivere conclusioni banali: chiudi con next-step / call-to-action editoriale.`;

  const clusterInstructions = `Stai scrivendo una CLUSTER PAGE.
Deep-dive verticale su un sotto-argomento specifico, ${target.min}-${target.max} parole.
Struttura: 4-6 sezioni H2 focalizzate, no digressioni, esempi concreti.
Includi rimandi impliciti alla pillar del cluster (senza aggiungere link — quelli si inseriranno dopo).`;

  return [
    "Sei un content strategist SEO esperto in topical authority e semantic SEO in italiano.",
    "Scrivi in italiano corretto, professionale, senza cliché AI (\"nel mondo di oggi\", \"in un panorama sempre più competitivo\", ecc.).",
    "Non inventare dati, statistiche o citazioni. Se ti mancano dati usa formulazioni prudenti.",
    "OUTPUT: solo testo Markdown-like. Struttura FISSA:",
    "  - Prima riga: `# Titolo H1` (usa una variante SEO-friendly della keyword principale, senza clickbait).",
    "  - Poi le sezioni con `## Titolo sezione` seguite dal corpo.",
    "  - NON usare heading `###` per ora, solo H2.",
    "  - NON aggiungere frontmatter, commenti, code fence o meta.",
    "  - NON generare HTML: solo testo puro con gli heading markdown.",
    "",
    input.pageType === "pillar" ? pillarInstructions : clusterInstructions,
    "",
    input.toneOfVoice ? `TONE OF VOICE:\n${input.toneOfVoice}` : "",
    input.designNotes ? `NOTE DI STILE EDITORIALE:\n${input.designNotes}` : "",
  ].filter(Boolean).join("\n");
}

/** Costruisce il messaggio user per la bozza. */
export function buildDraftUserMessage(input: {
  kwMain: string;
  kwSecondary: string[];
  searchIntent?: string | null;
  infoGain: string;
  sourceDocExtracted?: string | null;
  authors: { name: string; role: string; bio: string }[];
  cases: { title: string; client: string; results: string }[];
  parentPillarContext?: string | null;
}): string {
  const parts: string[] = [];
  parts.push(`KEYWORD PRINCIPALE: ${input.kwMain}`);
  if (input.kwSecondary.length > 0) {
    parts.push(`KEYWORD SECONDARIE: ${input.kwSecondary.join(", ")}`);
  }
  if (input.searchIntent) {
    parts.push(`INTENTO DI RICERCA: ${input.searchIntent}`);
  }
  parts.push("");
  parts.push("INFORMATION GAIN (cosa questa pagina dice che le altre pagine sulla stessa KW NON dicono — è il valore differenziante da inserire):");
  parts.push(input.infoGain || "(non fornito — deduci angolo differenziante dalla KW e dagli input contestuali sotto)");
  if (input.sourceDocExtracted) {
    parts.push("");
    parts.push("DOCUMENTO SORGENTE (materiale grezzo da cui trarre fatti/spunti — NON copiare, rielabora):");
    parts.push(input.sourceDocExtracted.slice(0, 8000));
  }
  if (input.authors.length > 0) {
    parts.push("");
    parts.push("AUTORI (da menzionare quando pertinente per credibilità E-E-A-T):");
    input.authors.forEach((a) => {
      parts.push(`- ${a.name}${a.role ? " (" + a.role + ")" : ""}${a.bio ? " — " + a.bio.slice(0, 200) : ""}`);
    });
  }
  if (input.cases.length > 0) {
    parts.push("");
    parts.push("CASI STUDIO (citali come esempi concreti dove sensato):");
    input.cases.forEach((c) => {
      parts.push(`- ${c.title}${c.client ? " — cliente: " + c.client : ""}${c.results ? " — risultati: " + c.results.slice(0, 200) : ""}`);
    });
  }
  if (input.parentPillarContext) {
    parts.push("");
    parts.push("CONTESTO PILLAR DI RIFERIMENTO (questa cluster ne è un sotto-argomento):");
    parts.push(input.parentPillarContext.slice(0, 2000));
  }
  parts.push("");
  parts.push("Genera ora la bozza secondo la struttura richiesta.");
  return parts.join("\n");
}
