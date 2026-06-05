/* ── GEO Tool Suite — Types ── */

export const LLM_LIST = ["ChatGPT", "Claude", "Gemini", "Perplexity", "AI Overviews"] as const;
export type LLMName = typeof LLM_LIST[number];

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
  "GPTBot", "ChatGPT-User", "ClaudeBot", "PerplexityBot",
  "Googlebot", "Google-Extended", "OAI-SearchBot",
  "Applebot-Extended", "Meta-ExternalAgent", "CCBot",
] as const;

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
  crawlers: { name: string; accessible: boolean; responseTime?: number; statusCode?: number }[];
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
