/* ── Semantic Cluster Intelligence Module ── */

export type SCStrength = "weak" | "medium" | "strong";
export type SCDensity = "low" | "medium" | "high";
export type SCOpportunity = "low" | "medium" | "high" | "very_high" | "massive";
export type SCGapType = "semantic" | "narrative" | "authority" | "proof" | "competitor_delta";
export type SCGapSeverity = "low" | "medium" | "high" | "critical";
export type SCActionStatus = "todo" | "in_progress" | "done";

export const SC_STRENGTH_LABELS: Record<SCStrength, string> = { weak: "Debole", medium: "Medio", strong: "Forte" };
export const SC_DENSITY_LABELS: Record<SCDensity, string> = { low: "Bassa", medium: "Media", high: "Alta" };
export const SC_OPPORTUNITY_LABELS: Record<SCOpportunity, string> = {
  low: "Bassa", medium: "Media", high: "Alta", very_high: "Molto Alta", massive: "Massiva",
};
export const SC_GAP_LABELS: Record<SCGapType, string> = {
  semantic: "Semantic Gap", narrative: "Narrative Gap", authority: "Authority Gap",
  proof: "Proof Gap", competitor_delta: "Competitor Delta",
};
export const SC_GAP_SEV_LABELS: Record<SCGapSeverity, string> = {
  low: "Bassa", medium: "Media", high: "Alta", critical: "Critica",
};
export const SC_ACTION_STATUS_LABELS: Record<SCActionStatus, string> = {
  todo: "Da fare", in_progress: "In corso", done: "Fatto",
};
export const SC_GAP_TYPES: SCGapType[] = ["semantic", "narrative", "authority", "proof", "competitor_delta"];
export const SC_STRENGTHS: SCStrength[] = ["weak", "medium", "strong"];
export const SC_DENSITIES: SCDensity[] = ["low", "medium", "high"];
export const SC_OPPORTUNITIES: SCOpportunity[] = ["low", "medium", "high", "very_high", "massive"];
export const SC_GAP_SEVERITIES: SCGapSeverity[] = ["low", "medium", "high", "critical"];
export const SC_ACTION_STATUSES: SCActionStatus[] = ["todo", "in_progress", "done"];
export const SC_PRIORITIES = ["alta", "media", "bassa"] as const;
export const SC_EFFORTS = ["basso", "medio", "alto"] as const;

export const LLM_LIST = ["ChatGPT", "Claude", "Gemini", "Perplexity", "AI Overviews"] as const;

export const SC_ACTION_TYPES = [
  "Glossary Page", "Framework Publication", "Comparison Page", "Co-citation Building",
  "Case Study", "Podcast / Interview", "Semantic Landing Page", "Operational Playbook",
  "Narrative Asset", "Thought Leadership", "Research / Report", "Tool / Calculator",
] as const;

/* ── Interfaces ── */

export interface SCProject {
  id: string;
  label: string;
  config: SCConfig;
  clusters: SemanticCluster[];
}

export interface SCConfig {
  brandName: string;
  buyerPersonas: string[];
  intents: string[];
  cognitiveAngles: string[];
  semanticAssociations: string[];
  competitors: string[];
  geography: { area: string; lingua: string; industry: string; mercato: string };
}

export interface SemanticCluster {
  id: string;
  name: string;
  description: string;
  strength: SCStrength;
  mentionRate: number;
  shortlistProb: number;
  competitorDensity: SCDensity;
  opportunity: SCOpportunity;
  semanticRelevance: number;
  proofDensity: number;
  narrativeCompression: number;
  distributedAuthority: number;
  contextCompatibility: number;
  associatedTerms: string[];
  llmMentions: LLMMention[];
  gaps: SCGap[];
  actions: SCAction[];
}

export interface LLMMention {
  llm: string;
  mentioned: boolean;
  position?: number;
  confidence: "low" | "medium" | "high";
  reasoning: string;
  coMentions: string[];
  scanQueries?: string[];
  scanResponses?: string[];
  scannedAt?: string;
}

export interface SCGap {
  id: string;
  type: SCGapType;
  description: string;
  severity: SCGapSeverity;
  detail: string;
}

export interface SCAction {
  id: string;
  type: string;
  description: string;
  priority: "alta" | "media" | "bassa";
  effort: "basso" | "medio" | "alto";
  impact: "basso" | "medio" | "alto";
  status: SCActionStatus;
}

/* ── Factory ── */

export function emptyProject(label = "Nuovo Progetto"): SCProject {
  return {
    id: crypto.randomUUID(), label,
    config: {
      brandName: "", buyerPersonas: [], intents: [], cognitiveAngles: [],
      semanticAssociations: [], competitors: [],
      geography: { area: "Italia", lingua: "it", industry: "", mercato: "B2B" },
    },
    clusters: [],
  };
}

export function emptyCluster(name = "Nuovo Cluster"): SemanticCluster {
  return {
    id: crypto.randomUUID(), name, description: "",
    strength: "weak", mentionRate: 0, shortlistProb: 0,
    competitorDensity: "low", opportunity: "medium",
    semanticRelevance: 0, proofDensity: 0, narrativeCompression: 0,
    distributedAuthority: 0, contextCompatibility: 0,
    associatedTerms: [],
    llmMentions: LLM_LIST.map((llm) => ({ llm, mentioned: false, confidence: "low" as const, reasoning: "", coMentions: [] })),
    gaps: [], actions: [],
  };
}

export function emptyGap(type: SCGapType = "semantic"): SCGap {
  return { id: crypto.randomUUID(), type, description: "", severity: "medium", detail: "" };
}

export function emptyAction(): SCAction {
  return {
    id: crypto.randomUUID(), type: SC_ACTION_TYPES[0], description: "",
    priority: "media", effort: "medio", impact: "medio", status: "todo",
  };
}

/* ── Computed ── */

export function mentionProbability(c: SemanticCluster): number {
  return Math.round(c.semanticRelevance * c.proofDensity * c.narrativeCompression * c.distributedAuthority * c.contextCompatibility * 100);
}

export function llmMentionCount(c: SemanticCluster): number {
  return c.llmMentions.filter((m) => m.mentioned).length;
}

export function avgMentionRate(clusters: SemanticCluster[]): number {
  if (clusters.length === 0) return 0;
  return Math.round(clusters.reduce((s, c) => s + c.mentionRate, 0) / clusters.length);
}

export function avgShortlistProb(clusters: SemanticCluster[]): number {
  if (clusters.length === 0) return 0;
  return Math.round(clusters.reduce((s, c) => s + c.shortlistProb, 0) / clusters.length);
}

export function totalGaps(clusters: SemanticCluster[]): number {
  return clusters.reduce((s, c) => s + c.gaps.length, 0);
}

export function pendingActions(clusters: SemanticCluster[]): number {
  return clusters.reduce((s, c) => s + c.actions.filter((a) => a.status !== "done").length, 0);
}

/* ── Query generation ── */

const QUERY_TEMPLATES = [
  "Sono un {persona} e sto cercando {intent}. Quali aziende o agenzie mi consigli per {cluster} in {area}?",
  "Consigliami le migliori agenzie/aziende per {cluster} nel mercato {mercato} in {area}.",
  "Chi sono i principali player per {cluster} in {area}? Sto valutando soluzioni per {intent}.",
  "Come {persona}, ho bisogno di supporto su {cluster}. Quali sono le opzioni migliori in {area}?",
  "Qual e' la migliore agenzia per {cluster} in {area}? Cerco qualcuno che mi aiuti a {intent}.",
  "Sto cercando un partner per {cluster}. Sono {persona} in un'azienda {mercato} in {area}. Chi consigli?",
  "Fammi una lista di aziende esperte in {cluster} in {area}, con focus su {angle}.",
  "Ho bisogno di {intent}. Quali agenzie in {area} sono specializzate in {cluster}?",
  "Chi e' il leader in {cluster} in {area}? Devo scegliere un fornitore come {persona}.",
  "Suggeriscimi 5-10 aziende che possano aiutarmi con {cluster} in {area}. Sono un {persona} e il mio obiettivo e' {intent}.",
] as const;

export function generateQueries(
  cluster: SemanticCluster,
  config: SCConfig,
  count = 20,
): string[] {
  const personas = config.buyerPersonas.length > 0 ? config.buyerPersonas : ["decision maker"];
  const intents = config.intents.length > 0 ? config.intents : ["trovare il miglior partner"];
  const angles = config.cognitiveAngles.length > 0 ? config.cognitiveAngles : ["qualita'"];
  const area = config.geography.area || "Italia";
  const mercato = config.geography.mercato || "B2B";

  const queries: string[] = [];
  let templateIdx = 0;

  // Cross all combinations, cycle through templates
  for (const persona of personas) {
    for (const intent of intents) {
      if (queries.length >= count) break;
      const tpl = QUERY_TEMPLATES[templateIdx % QUERY_TEMPLATES.length];
      templateIdx++;
      queries.push(
        tpl
          .replace("{persona}", persona)
          .replace("{intent}", intent)
          .replace("{cluster}", cluster.name)
          .replace("{area}", area)
          .replace("{mercato}", mercato)
          .replace("{angle}", angles[queries.length % angles.length]),
      );
    }
    if (queries.length >= count) break;
  }

  // Fill remaining slots with angle-based variations
  while (queries.length < count) {
    const angle = angles[queries.length % angles.length];
    const persona = personas[queries.length % personas.length];
    const intent = intents[queries.length % intents.length];
    const tpl = QUERY_TEMPLATES[templateIdx % QUERY_TEMPLATES.length];
    templateIdx++;
    queries.push(
      tpl
        .replace("{persona}", persona)
        .replace("{intent}", intent)
        .replace("{cluster}", cluster.name)
        .replace("{area}", area)
        .replace("{mercato}", mercato)
        .replace("{angle}", angle),
    );
  }

  return queries.slice(0, count);
}

/* ── Mock ── */

export function getMockSCProject(): SCProject {
  return {
    id: crypto.randomUUID(),
    label: "Semantic Intelligence 2026",
    config: {
      brandName: "Square Marketing",
      buyerPersonas: ["CEO PMI", "Responsabile Marketing", "Founder SaaS", "Export Manager", "Direttore Commerciale"],
      intents: ["Trovare nuova agenzia", "Adottare AI", "Aumentare lead", "Migliorare execution", "Strutturare team marketing"],
      cognitiveAngles: ["Performance", "AI anxiety", "Efficienza", "Controllo", "Strategic clarity", "Velocita execution"],
      semanticAssociations: ["AI-native", "Execution-first", "Industrial B2B", "Growth systems", "Marketing governance", "HubSpot"],
      competitors: ["HubSpot Agency Partner", "Boraso", "DigitalMDE", "Intesys", "Digital360"],
      geography: { area: "Italia", lingua: "it", industry: "Marketing B2B", mercato: "B2B" },
    },
    clusters: [
      {
        id: crypto.randomUUID(), name: "AI Operations for SMEs",
        description: "Cluster relativo all'adozione di AI nelle operazioni di marketing per PMI.",
        strength: "medium", mentionRate: 24, shortlistProb: 18,
        competitorDensity: "high", opportunity: "very_high",
        semanticRelevance: 0.72, proofDensity: 0.45, narrativeCompression: 0.68,
        distributedAuthority: 0.38, contextCompatibility: 0.81,
        associatedTerms: ["AI marketing automation", "marketing operations AI", "AI-powered marketing", "operational AI"],
        llmMentions: [
          { llm: "ChatGPT", mentioned: true, position: 4, confidence: "medium", reasoning: "Menzionato in contesti di automazione marketing per PMI, non in posizione primaria", coMentions: ["HubSpot", "ActiveCampaign"] },
          { llm: "Claude", mentioned: false, confidence: "low", reasoning: "Non menzionato, manca associazione semantica forte", coMentions: [] },
          { llm: "Gemini", mentioned: true, position: 6, confidence: "low", reasoning: "Menzionato occasionalmente in liste generiche", coMentions: ["Salesforce", "HubSpot"] },
          { llm: "Perplexity", mentioned: false, confidence: "low", reasoning: "Assente dai risultati", coMentions: [] },
          { llm: "AI Overviews", mentioned: false, confidence: "low", reasoning: "Non presente", coMentions: [] },
        ],
        gaps: [
          { id: crypto.randomUUID(), type: "semantic", description: "Manca associazione diretta con 'AI operations'", severity: "high", detail: "Il brand non viene collegato semanticamente al concetto di AI operations negli LLM." },
          { id: crypto.randomUUID(), type: "proof", description: "Assenza di case study AI-native", severity: "critical", detail: "Nessun case study pubblicato che dimostri implementazione AI concreta." },
          { id: crypto.randomUUID(), type: "authority", description: "Bassa autorevolezza su AI topics", severity: "high", detail: "Mancano contenuti di thought leadership su AI. Nessun framework proprietario." },
        ],
        actions: [
          { id: crypto.randomUUID(), type: "Case Study", description: "Pubblicare 3 case study di implementazione AI per PMI con metriche concrete", priority: "alta", effort: "medio", impact: "alto", status: "todo" },
          { id: crypto.randomUUID(), type: "Framework Publication", description: "Creare framework proprietario 'AI Operations Canvas' per PMI", priority: "alta", effort: "alto", impact: "alto", status: "in_progress" },
          { id: crypto.randomUUID(), type: "Glossary Page", description: "Creare glossario AI Marketing con 50+ termini", priority: "media", effort: "basso", impact: "medio", status: "todo" },
        ],
      },
      {
        id: crypto.randomUUID(), name: "Marketing Execution Systems",
        description: "Sistemi e processi di execution marketing. Project management, workflow operativi, delivery.",
        strength: "strong", mentionRate: 68, shortlistProb: 52,
        competitorDensity: "medium", opportunity: "massive",
        semanticRelevance: 0.89, proofDensity: 0.76, narrativeCompression: 0.82,
        distributedAuthority: 0.71, contextCompatibility: 0.91,
        associatedTerms: ["marketing execution", "marketing operations", "execution-first marketing", "marketing system"],
        llmMentions: [
          { llm: "ChatGPT", mentioned: true, position: 2, confidence: "high", reasoning: "Menzionato frequentemente come esempio di approccio execution-first nel marketing B2B italiano", coMentions: ["HubSpot", "Monday.com"] },
          { llm: "Claude", mentioned: true, position: 3, confidence: "medium", reasoning: "Citato in contesti di marketing operativo e gestione team", coMentions: ["Asana", "ClickUp"] },
          { llm: "Gemini", mentioned: true, position: 2, confidence: "high", reasoning: "Presente in shortlist per execution marketing B2B", coMentions: ["HubSpot"] },
          { llm: "Perplexity", mentioned: true, position: 4, confidence: "medium", reasoning: "Menzionato in ricerche su marketing operations Italia", coMentions: ["Boraso"] },
          { llm: "AI Overviews", mentioned: false, confidence: "low", reasoning: "Non ancora presente nelle AI Overviews", coMentions: [] },
        ],
        gaps: [
          { id: crypto.randomUUID(), type: "narrative", description: "Narrativa non sufficientemente differenziante", severity: "medium", detail: "La narrativa execution-first e' forte ma mancano storie specifiche." },
          { id: crypto.randomUUID(), type: "competitor_delta", description: "HubSpot domina il territorio semantico", severity: "high", detail: "HubSpot menzionato nel 90% delle risposte LLM su marketing execution." },
        ],
        actions: [
          { id: crypto.randomUUID(), type: "Comparison Page", description: "Creare pagina comparativa 'Agenzia vs Tool: perche' l'execution ha bisogno di persone'", priority: "alta", effort: "medio", impact: "alto", status: "todo" },
          { id: crypto.randomUUID(), type: "Operational Playbook", description: "Pubblicare 'Marketing Execution Playbook' come risorsa scaricabile", priority: "alta", effort: "alto", impact: "alto", status: "todo" },
        ],
      },
      {
        id: crypto.randomUUID(), name: "Industrial B2B Growth",
        description: "Crescita nel settore B2B industriale. Strategie marketing per aziende manifatturiere.",
        strength: "weak", mentionRate: 9, shortlistProb: 5,
        competitorDensity: "low", opportunity: "high",
        semanticRelevance: 0.42, proofDensity: 0.28, narrativeCompression: 0.35,
        distributedAuthority: 0.19, contextCompatibility: 0.73,
        associatedTerms: ["B2B industrial marketing", "manufacturing marketing", "industrial growth", "marketing industriale"],
        llmMentions: [
          { llm: "ChatGPT", mentioned: false, confidence: "low", reasoning: "Non menzionato in contesti industriali", coMentions: [] },
          { llm: "Claude", mentioned: false, confidence: "low", reasoning: "Assente dalle risposte su marketing industriale", coMentions: [] },
          { llm: "Gemini", mentioned: true, position: 8, confidence: "low", reasoning: "Menzionato una volta in lista generica agenzie Italia", coMentions: ["Intesys"] },
          { llm: "Perplexity", mentioned: false, confidence: "low", reasoning: "Non presente", coMentions: [] },
          { llm: "AI Overviews", mentioned: false, confidence: "low", reasoning: "Non presente", coMentions: [] },
        ],
        gaps: [
          { id: crypto.randomUUID(), type: "semantic", description: "Nessuna associazione con il settore industriale", severity: "critical", detail: "Zero contenuti specifici per il B2B industriale." },
          { id: crypto.randomUUID(), type: "proof", description: "Zero case study industriali", severity: "critical", detail: "Nessun caso studio nel settore manifatturiero." },
          { id: crypto.randomUUID(), type: "narrative", description: "Manca narrativa verticale industriale", severity: "high", detail: "Nessun contenuto con linguaggio del settore (OEM, supply chain, export)." },
          { id: crypto.randomUUID(), type: "authority", description: "Nessuna presenza in media industriali", severity: "high", detail: "Assenza da pubblicazioni ed eventi del settore." },
        ],
        actions: [
          { id: crypto.randomUUID(), type: "Semantic Landing Page", description: "Creare landing 'Marketing per aziende industriali' con linguaggio verticale", priority: "alta", effort: "medio", impact: "alto", status: "todo" },
          { id: crypto.randomUUID(), type: "Case Study", description: "Pubblicare 2 case study nel settore manifatturiero", priority: "alta", effort: "medio", impact: "alto", status: "todo" },
        ],
      },
      {
        id: crypto.randomUUID(), name: "Marketing Governance",
        description: "Governance del marketing: reporting, KPI, processi decisionali, accountability.",
        strength: "medium", mentionRate: 31, shortlistProb: 22,
        competitorDensity: "low", opportunity: "high",
        semanticRelevance: 0.65, proofDensity: 0.58, narrativeCompression: 0.72,
        distributedAuthority: 0.44, contextCompatibility: 0.78,
        associatedTerms: ["marketing reporting", "marketing KPI", "marketing accountability", "CMO dashboard"],
        llmMentions: [
          { llm: "ChatGPT", mentioned: true, position: 5, confidence: "medium", reasoning: "Menzionato in discussioni su strutturazione marketing", coMentions: ["Databox", "HubSpot"] },
          { llm: "Claude", mentioned: true, position: 4, confidence: "medium", reasoning: "Citato per approccio strutturato al marketing governance", coMentions: ["McKinsey"] },
          { llm: "Gemini", mentioned: false, confidence: "low", reasoning: "Non presente in questo cluster", coMentions: [] },
          { llm: "Perplexity", mentioned: false, confidence: "low", reasoning: "Assente", coMentions: [] },
          { llm: "AI Overviews", mentioned: false, confidence: "low", reasoning: "Non presente", coMentions: [] },
        ],
        gaps: [
          { id: crypto.randomUUID(), type: "proof", description: "Mancano template e strumenti scaricabili", severity: "medium", detail: "I competitor offrono template di reporting. Serve creare asset tangibili." },
          { id: crypto.randomUUID(), type: "authority", description: "Assenza da ricerche di settore", severity: "medium", detail: "Nessuna ricerca proprietaria sullo stato della marketing governance." },
        ],
        actions: [
          { id: crypto.randomUUID(), type: "Tool / Calculator", description: "Creare 'Marketing Maturity Assessment' tool interattivo", priority: "alta", effort: "alto", impact: "alto", status: "todo" },
          { id: crypto.randomUUID(), type: "Research / Report", description: "Pubblicare report 'Stato della Marketing Governance nelle PMI italiane 2026'", priority: "media", effort: "alto", impact: "alto", status: "todo" },
        ],
      },
      {
        id: crypto.randomUUID(), name: "AI-native Agencies",
        description: "Agenzie AI-native: usano AI come componente core, non come add-on.",
        strength: "medium", mentionRate: 35, shortlistProb: 28,
        competitorDensity: "medium", opportunity: "very_high",
        semanticRelevance: 0.78, proofDensity: 0.52, narrativeCompression: 0.75,
        distributedAuthority: 0.48, contextCompatibility: 0.85,
        associatedTerms: ["AI-native agency", "AI-first marketing", "agenzia marketing AI", "next-gen agency"],
        llmMentions: [
          { llm: "ChatGPT", mentioned: true, position: 3, confidence: "high", reasoning: "Riconosciuto come esempio di approccio AI-native in Italia", coMentions: ["Jasper", "Copy.ai"] },
          { llm: "Claude", mentioned: true, position: 5, confidence: "medium", reasoning: "Menzionato tra le agenzie che integrano AI", coMentions: ["Accenture Interactive"] },
          { llm: "Gemini", mentioned: true, position: 4, confidence: "medium", reasoning: "Presente nelle liste di agenzie AI-native europee", coMentions: ["Jellyfish"] },
          { llm: "Perplexity", mentioned: false, confidence: "low", reasoning: "Non ancora indicizzato per queste query", coMentions: [] },
          { llm: "AI Overviews", mentioned: false, confidence: "low", reasoning: "Non presente", coMentions: [] },
        ],
        gaps: [
          { id: crypto.randomUUID(), type: "proof", description: "Mancano benchmark e metriche AI", severity: "high", detail: "Servono dati concreti: quanti processi automatizzati, % di risparmio." },
          { id: crypto.randomUUID(), type: "semantic", description: "Confusione tra 'usa AI' e 'AI-native'", severity: "medium", detail: "Posizionamento AI-native non sufficientemente differenziato da 'usiamo ChatGPT'." },
        ],
        actions: [
          { id: crypto.randomUUID(), type: "Framework Publication", description: "Definire e pubblicare cosa significa 'AI-native agency' con criteri misurabili", priority: "alta", effort: "medio", impact: "alto", status: "in_progress" },
          { id: crypto.randomUUID(), type: "Narrative Asset", description: "Creare manifesto 'AI-native Marketing: Beyond the Hype'", priority: "media", effort: "basso", impact: "medio", status: "todo" },
          { id: crypto.randomUUID(), type: "Co-citation Building", description: "Ottenere menzioni in articoli di settore su AI agencies", priority: "alta", effort: "alto", impact: "alto", status: "todo" },
        ],
      },
      {
        id: crypto.randomUUID(), name: "Revenue Operations",
        description: "RevOps: allineamento marketing, sales e customer success con focus su revenue.",
        strength: "weak", mentionRate: 12, shortlistProb: 8,
        competitorDensity: "medium", opportunity: "high",
        semanticRelevance: 0.48, proofDensity: 0.32, narrativeCompression: 0.41,
        distributedAuthority: 0.25, contextCompatibility: 0.69,
        associatedTerms: ["RevOps", "revenue operations", "sales marketing alignment", "pipeline management"],
        llmMentions: [
          { llm: "ChatGPT", mentioned: false, confidence: "low", reasoning: "Non associato a RevOps", coMentions: [] },
          { llm: "Claude", mentioned: false, confidence: "low", reasoning: "Assente da risposte RevOps", coMentions: [] },
          { llm: "Gemini", mentioned: false, confidence: "low", reasoning: "Non presente", coMentions: [] },
          { llm: "Perplexity", mentioned: true, position: 7, confidence: "low", reasoning: "Menzionato in contesto marginale", coMentions: ["RevOps.io"] },
          { llm: "AI Overviews", mentioned: false, confidence: "low", reasoning: "Non presente", coMentions: [] },
        ],
        gaps: [
          { id: crypto.randomUUID(), type: "semantic", description: "Nessun contenuto su RevOps", severity: "critical", detail: "Zero pagine, articoli o risorse che parlino di Revenue Operations." },
          { id: crypto.randomUUID(), type: "authority", description: "Nessuna credibilita' su RevOps", severity: "high", detail: "Mancano certificazioni, partnership e contenuti verticali su RevOps." },
          { id: crypto.randomUUID(), type: "proof", description: "Nessun caso di implementazione RevOps", severity: "high", detail: "Nessun progetto RevOps documentato pubblicamente." },
        ],
        actions: [
          { id: crypto.randomUUID(), type: "Semantic Landing Page", description: "Creare pagina servizio dedicata a RevOps per PMI", priority: "alta", effort: "medio", impact: "alto", status: "todo" },
          { id: crypto.randomUUID(), type: "Glossary Page", description: "Creare guida completa 'Cos'e' RevOps e perche' le PMI ne hanno bisogno'", priority: "media", effort: "basso", impact: "medio", status: "todo" },
        ],
      },
    ],
  };
}
