/* ── GEO Tool Suite — Types ── */

export const LLM_LIST = ["ChatGPT", "Claude", "Gemini", "Perplexity", "AI Overviews"] as const;
export type LLMName = typeof LLM_LIST[number];

/** Modello effettivamente usato per ogni LLM nelle route /api/geo/* */
export const LLM_MODELS: Record<LLMName, string> = {
  ChatGPT: "gpt-4o",
  Claude: "claude-sonnet-4-6",
  Gemini: "gemini-2.5-flash",
  Perplexity: "",
  "AI Overviews": "",
};

export function llmLabel(llm: string): string {
  const model = LLM_MODELS[llm as LLMName];
  return model ? `${llm} (${model})` : llm;
}

export const GEO_INTENTS = ["informativo", "comparativo", "transazionale", "locale", "verticale"] as const;
export type GEOIntent = typeof GEO_INTENTS[number];

export const GEO_FUNNELS = ["TOFU", "MOFU", "BOFU"] as const;
export type GEOFunnel = typeof GEO_FUNNELS[number];

export const GEO_PRIORITIES = ["alta", "media", "bassa"] as const;
export type GEOPriority = typeof GEO_PRIORITIES[number];

export const GEO_SENTIMENT_LABELS = { negativo: "Negativo", neutro: "Neutro", positivo: "Positivo" } as const;
export type GEOSentimentLabel = keyof typeof GEO_SENTIMENT_LABELS;

export const GEO_SOURCE_TYPES = [
  "owned", "competitor", "directory", "media", "blog",
  "marketplace", "forum", "review", "social", "other",
] as const;
export type GEOSourceType = typeof GEO_SOURCE_TYPES[number];

export const GEO_SOURCE_LABELS: Record<GEOSourceType, string> = {
  owned: "Proprietario", competitor: "Competitor", directory: "Directory",
  media: "Media", blog: "Blog", marketplace: "Marketplace",
  forum: "Forum", review: "Recensione", social: "Social", other: "Altro",
};

export const GEO_PRIORITY_TIERS = ["quick_win", "strategic_bet", "low_priority", "long_term"] as const;
export type GEOPriorityTier = typeof GEO_PRIORITY_TIERS[number];
export const GEO_TIER_LABELS: Record<GEOPriorityTier, string> = {
  quick_win: "Quick Win", strategic_bet: "Strategic Bet",
  low_priority: "Bassa Priorita", long_term: "Long Term",
};

/* ── Config ── */

export interface GEOConfig {
  brandName: string;
  siteUrl: string;
  country: string;
  language: string;
  industry: string;
  market: string;
  buyerPersonas: string[];
  services: string[];
  competitors: string[];
  competitorDomains: Record<string, string>;
  problems: string[];
}

/* ── Prompts ── */

export interface GEOPrompt {
  id: string;
  text: string;
  intent: GEOIntent;
  funnelStage: GEOFunnel;
  buyerPersona: string;
  commercialValue: number; // 0-100
  source: "generated" | "manual" | "imported";
  clusterId?: string;
  scans: GEOScan[];
  // Computed
  opportunityScore?: number;
  effortScore?: number;
  impactScore?: number;
  priorityTier?: GEOPriorityTier;
}

/* ── Scan (per prompt, per LLM) ── */

export interface GEOScan {
  id: string;
  llm: string;
  scannedAt: string;
  rawResponse: string;
  // Brand
  brandMentioned: boolean;
  brandPosition?: number;
  brandContext?: string;
  brandAttributes: string[];
  // Sentiment
  sentiment: GEOSentimentData;
  // Competitors
  competitorMentions: GEOCompetitorMention[];
  // Citations
  citations: GEOCitation[];
  // Meta
  confidence: "low" | "medium" | "high";
  reasoning: string;
}

export interface GEOSentimentData {
  score: number; // -1 to 1
  label: GEOSentimentLabel;
  phrases: string[];
  strengths: string[];
  weaknesses: string[];
  alignmentScore: number; // 0-100
}

export interface GEOCompetitorMention {
  name: string;
  position?: number;
  attributes: string[];
  sentiment: GEOSentimentLabel;
  strengths: string[];
  weaknesses: string[];
}

export interface GEOCitation {
  url: string;
  title?: string;
  domain: string;
  type: GEOSourceType;
  brandMentioned: boolean;
  competitorMentioned?: string;
  authority: "low" | "medium" | "high";
  controllable: boolean;
}

/* ── Intent Clusters ── */

export interface GEOIntentCluster {
  id: string;
  name: string;
  description: string;
  mainIntent: GEOIntent;
  subIntents: string[];
  buyerPersona: string;
  maturityLevel: "awareness" | "consideration" | "decision";
  promptIds: string[];
}

/* ── Audit Types ── */

export const AI_CRAWLERS = [
  // OpenAI / ChatGPT
  "GPTBot", "ChatGPT-User", "OAI-SearchBot",
  // Anthropic / Claude
  "ClaudeBot", "Claude-User", "Claude-SearchBot",
  // Google / Gemini / AI Overviews
  "Googlebot", "Google-Extended",
  // Microsoft / Copilot (Bing index)
  "Bingbot",
  // Perplexity
  "PerplexityBot", "Perplexity-User",
  // Apple
  "Applebot", "Applebot-Extended",
  // Meta AI
  "Meta-ExternalAgent", "Meta-ExternalFetcher", "FacebookBot",
  // DuckDuckGo
  "DuckAssistBot",
  // Amazon (Rufus / Alexa)
  "Amazonbot",
  // ByteDance (Doubao, TikTok AI)
  "Bytespider",
  // You.com
  "YouBot",
  // Cohere
  "cohere-ai",
  // Mistral Le Chat
  "MistralAI-User",
  // Common Crawl
  "CCBot",
] as const;

export const AI_CRAWLER_INFO: Record<string, { provider: string; purpose: string }> = {
  "GPTBot": { provider: "OpenAI", purpose: "Training ChatGPT" },
  "ChatGPT-User": { provider: "OpenAI", purpose: "ChatGPT browsing on-demand" },
  "OAI-SearchBot": { provider: "OpenAI", purpose: "ChatGPT Search index" },
  "ClaudeBot": { provider: "Anthropic", purpose: "Training Claude" },
  "Claude-User": { provider: "Anthropic", purpose: "Claude.ai web access on-demand" },
  "Claude-SearchBot": { provider: "Anthropic", purpose: "Claude Search index" },
  "Googlebot": { provider: "Google", purpose: "Google Search + AI Overviews" },
  "Google-Extended": { provider: "Google", purpose: "Training Gemini" },
  "Bingbot": { provider: "Microsoft", purpose: "Bing + Copilot (web grounding)" },
  "PerplexityBot": { provider: "Perplexity", purpose: "Index Perplexity" },
  "Perplexity-User": { provider: "Perplexity", purpose: "Fetch on-demand su ricerca utente" },
  "Applebot": { provider: "Apple", purpose: "Spotlight, Siri" },
  "Applebot-Extended": { provider: "Apple", purpose: "Apple Intelligence training" },
  "Meta-ExternalAgent": { provider: "Meta", purpose: "Meta AI training" },
  "Meta-ExternalFetcher": { provider: "Meta", purpose: "Meta AI fetch on-demand" },
  "FacebookBot": { provider: "Meta", purpose: "Facebook AI tooling" },
  "DuckAssistBot": { provider: "DuckDuckGo", purpose: "DuckDuckGo AI Assist" },
  "Amazonbot": { provider: "Amazon", purpose: "Rufus, Alexa+" },
  "Bytespider": { provider: "ByteDance", purpose: "Doubao, TikTok AI" },
  "YouBot": { provider: "You.com", purpose: "You.com AI search" },
  "cohere-ai": { provider: "Cohere", purpose: "Training Cohere" },
  "MistralAI-User": { provider: "Mistral", purpose: "Le Chat web search" },
  "CCBot": { provider: "Common Crawl", purpose: "Dataset usato da molti LLM" },
};

/** Crawler la cui assenza compromette gravemente la visibilità AI. */
export const AI_CRAWLERS_CRITICAL: ReadonlySet<string> = new Set([
  "Googlebot",      // AI Overviews + Gemini grounding
  "Bingbot",        // Copilot
  "GPTBot",         // ChatGPT training
  "OAI-SearchBot",  // ChatGPT Search
  "PerplexityBot",  // Perplexity
  "ClaudeBot",      // Claude training
]);

/** User-Agent ufficiali (o canonici) usati per simulare la richiesta del bot al sito. */
export const AI_CRAWLER_UAS: Record<string, string> = {
  "GPTBot": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot",
  "ChatGPT-User": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ChatGPT-User/1.0; +https://openai.com/bot)",
  "OAI-SearchBot": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)",
  "ClaudeBot": "Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
  "Claude-User": "Mozilla/5.0 (compatible; Claude-User/1.0; +Claude-User@anthropic.com)",
  "Claude-SearchBot": "Mozilla/5.0 (compatible; Claude-SearchBot/1.0; +ClaudeBot@anthropic.com)",
  "Googlebot": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Google-Extended": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Bingbot": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/116.0.1938.76 Safari/537.36",
  "PerplexityBot": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
  "Perplexity-User": "Mozilla/5.0 (compatible; Perplexity-User/1.0; +https://docs.perplexity.ai/guides/bots)",
  "Applebot": "Mozilla/5.0 (compatible; Applebot/0.1; +http://www.apple.com/go/applebot)",
  "Applebot-Extended": "Mozilla/5.0 (compatible; Applebot/0.1; +http://www.apple.com/go/applebot)",
  "Meta-ExternalAgent": "meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)",
  "Meta-ExternalFetcher": "meta-externalfetcher/1.1",
  "FacebookBot": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  "DuckAssistBot": "Mozilla/5.0 (compatible; DuckAssistBot/1.0; +https://duckduckgo.com/duckassistbot.html)",
  "Amazonbot": "Mozilla/5.0 (compatible; Amazonbot/0.1; +https://developer.amazon.com/support/amazonbot)",
  "Bytespider": "Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)",
  "YouBot": "Mozilla/5.0 (compatible; YouBot/1.0; +http://www.you.com/specifications-for-youbot.txt)",
  "cohere-ai": "cohere-ai",
  "MistralAI-User": "MistralAI-User/1.0",
  "CCBot": "CCBot/2.0 (https://commoncrawl.org/faq/)",
};

export type CrawlerStatus = "allowed" | "blocked" | "unknown";

export interface CrawlabilityResult {
  id: string;
  url: string;
  scannedAt: string;
  robotsTxt: string;
  crawlers: { name: string; status: CrawlerStatus; rule?: string }[];
  sitemap: { found: boolean; url?: string; entries?: number };
  issues: AuditIssue[];
  score: number;
}

export interface AuditIssue {
  type: "critical" | "warning" | "info";
  category: string;
  message: string;
  detail?: string;
  fix?: string;
}

export interface ContentReadinessResult {
  id: string;
  url: string;
  title: string;
  scannedAt: string;
  scores: {
    clarity: number;
    completeness: number;
    structure: number;
    specificity: number;
    proofPresence: number;
    faqPresence: number;
    dataPresence: number;
    extractability: number;
  };
  overallScore: number;
  missingBlocks: string[];
  suggestions: string[];
  issues: AuditIssue[];
}

export interface StructuredDataResult {
  id: string;
  url: string;
  scannedAt: string;
  schemas: { type: string; found: boolean; properties: string[]; missing: string[] }[];
  overallScore: number;
  suggestedMarkup: string[];
  issues: AuditIssue[];
}

export interface EntityStrengthResult {
  id: string;
  scannedAt: string;
  scores: {
    consistency: number;
    externalPresence: number;
    structuredData: number;
    citations: number;
    reviews: number;
    serviceClarity: number;
    geoClarity: number;
  };
  overallScore: number;
  entities: {
    name: string;
    type: string;
    status: "strong" | "weak" | "missing";
    description: string;
    confidence: "low" | "medium" | "high";
  }[];
  issues: AuditIssue[];
  suggestions: string[];
}

export interface GEOAudits {
  crawlability: CrawlabilityResult[];
  contentReadiness: ContentReadinessResult[];
  structuredData: StructuredDataResult[];
  entityStrength: EntityStrengthResult[];
}

/* ── Phase 4: Action Planner ── */

export interface ContentGap {
  topic: string;
  description: string;
  contentType: "pagina" | "sezione" | "faq" | "case-study" | "guida" | "blog";
  priority: "alta" | "media" | "bassa";
  estimatedImpact: number;
  relatedPrompts: string[];
}

export interface ContentGapsResult {
  id: string;
  scannedAt: string;
  gaps: ContentGap[];
  overallCoverage: number;
  suggestions: string[];
}

export interface SourceTarget {
  domain: string;
  type: GEOSourceType;
  currentStatus: "non-presente" | "presente-debole" | "presente-forte";
  actionRequired: string;
  priority: "alta" | "media" | "bassa";
  difficulty: number;
  citedBy: string[];
  brandFoundBy: string[];
  evidence: string;
}

export interface SourceAcquisitionResult {
  id: string;
  scannedAt: string;
  targets: SourceTarget[];
  currentCoverage: number;
  suggestions: string[];
  llmsScanned: string[];
  fromExistingScans: number;
}

/* ── Digital PR ── */

export interface DigitalPRTarget {
  name: string;
  url: string;
  type: "testata" | "blog" | "podcast" | "directory" | "associazione" | "portale" | "newsletter" | "altro";
  relevance: number; // 0-100
  difficulty: number; // 0-100
  contentType: "guest-post" | "intervista" | "comunicato" | "case-study" | "listing" | "menzione" | "partnership";
  approach: string;
  why: string;
}

export interface DigitalPRResult {
  id: string;
  scannedAt: string;
  targets: DigitalPRTarget[];
  summary: string;
  suggestions: string[];
}

export type ActionStatus = "da-fare" | "in-corso" | "completato";

export interface ActionItem {
  id: string;
  category: "content" | "technical" | "source" | "entity" | "structured-data";
  title: string;
  description: string;
  priority: "alta" | "media" | "bassa";
  effort: "basso" | "medio" | "alto";
  impact: "basso" | "medio" | "alto";
  status: ActionStatus;
}

export interface ActionPlanResult {
  id: string;
  generatedAt: string;
  items: ActionItem[];
  summary: string;
}

/* ── Phase 5: Monitoring ── */

export interface BotTrafficCheck {
  id: string;
  url: string;
  scannedAt: string;
  crawlers: {
    name: string;
    accessible: boolean;
    responseTime?: number;
    statusCode?: number;
    wafDetected?: string | null;
    server?: string | null;
  }[];
  overallScore: number;
  issues: AuditIssue[];
}

export interface AIReferralEntry {
  id: string;
  date: string;
  source: string;
  visits: number;
  topPages: string[];
  notes: string;
}

/* ── Extended Project ── */

export interface GEOActions {
  contentGaps: ContentGapsResult[];
  sourceAcquisition: SourceAcquisitionResult[];
  digitalPR: DigitalPRResult[];
  actionPlan: ActionPlanResult | null;
}

export interface GEOMonitoring {
  botTraffic: BotTrafficCheck[];
  aiReferrals: AIReferralEntry[];
}

/* ── Project ── */

export interface GEOProject {
  id: string;
  config: GEOConfig;
  prompts: GEOPrompt[];
  clusters: GEOIntentCluster[];
  audits: GEOAudits;
  actions: GEOActions;
  monitoring: GEOMonitoring;
}

/* ── Factories ── */

export function emptyConfig(): GEOConfig {
  return {
    brandName: "", siteUrl: "", country: "Italia", language: "it",
    industry: "", market: "B2B", buyerPersonas: [], services: [],
    competitors: [], competitorDomains: {}, problems: [],
  };
}

export function emptyPrompt(text = "", source: GEOPrompt["source"] = "manual"): GEOPrompt {
  return {
    id: crypto.randomUUID(), text, intent: "informativo",
    funnelStage: "TOFU", buyerPersona: "", commercialValue: 50,
    source, scans: [],
  };
}

export function emptyAudits(): GEOAudits {
  return { crawlability: [], contentReadiness: [], structuredData: [], entityStrength: [] };
}

export function emptyActions(): GEOActions {
  return { contentGaps: [], sourceAcquisition: [], digitalPR: [], actionPlan: null };
}

export function emptyMonitoring(): GEOMonitoring {
  return { botTraffic: [], aiReferrals: [] };
}

export function emptyProject(): GEOProject {
  return {
    id: crypto.randomUUID(),
    config: emptyConfig(),
    prompts: [],
    clusters: [],
    audits: emptyAudits(),
    actions: emptyActions(),
    monitoring: emptyMonitoring(),
  };
}

export function emptyScan(llm: string): GEOScan {
  return {
    id: crypto.randomUUID(), llm, scannedAt: new Date().toISOString(),
    rawResponse: "", brandMentioned: false, brandAttributes: [],
    sentiment: { score: 0, label: "neutro", phrases: [], strengths: [], weaknesses: [], alignmentScore: 0 },
    competitorMentions: [], citations: [],
    confidence: "low", reasoning: "",
  };
}
