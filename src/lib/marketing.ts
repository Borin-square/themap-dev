export const MKTG_STATI = ["PIANIFICATA", "ATTIVA", "IN PAUSA", "COMPLETATA", "ANNULLATA"] as const;
export const MKTG_PIATTAFORME = ["Google Ads", "Meta Ads", "LinkedIn Ads", "TikTok Ads", "Programmatic", "Email", "SEO", "Altro"] as const;
export const MKTG_CANALI = ["Search", "Display", "Video", "Social", "Shopping", "Email", "Content", "Altro"] as const;
export const MKTG_MONTHS = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

export const MKTG_MET_EDIT = ["BUDGET_FC", "BUDGET_RE", "LEAD_FC", "LEAD_RE", "IMPRESSIONI", "CLICK", "ROAS"] as const;
export const MKTG_MET_LABELS: Record<string, string> = {
  BUDGET_FC: "Budget FC", BUDGET_RE: "Budget RE", LEAD_FC: "Lead FC", LEAD_RE: "Lead RE",
  IMPRESSIONI: "Impressioni", CLICK: "Click", ROAS: "ROAS",
};

export type MktgStato = typeof MKTG_STATI[number];

export interface Campaign {
  id: string;
  nome: string;
  piattaforma: string;
  canale: string;
  obiettivo: string;
  stato: MktgStato;
  data_inizio: string;
  data_fine: string;
  target: string;
  landing_page: string;
  note: string;
  periodi: Record<string, (number | null)[]>; // metric → 12 months
}

export interface MktgDoc {
  id: string;
  titolo: string;
  url: string;
  desc: string;
}

/* ── Brand Asset ── */

export interface BrandLogo {
  id: string;
  name: string;
  url: string;
  variant: string; // "Primary", "White", "Icon", etc.
}

export interface BrandColor {
  id: string;
  name: string;
  hex: string;
  usage: string;
  percentage?: number;
}

export interface BrandFont {
  id: string;
  name: string;
  weight: string;
  usage: string;
  url?: string; // custom uploaded font file
}

export interface BrandImage {
  id: string;
  name: string;
  url: string;
}

export interface BrandSection {
  id: string;
  title: string;
  content: string;
  images?: string[]; // URLs from Supabase Storage
  blocks?: BrandBlock[];
}

/* ── Block System ── */

export type BlockType =
  // Basic
  | "text" | "heading" | "paragraph" | "button" | "image" | "video" | "audio" | "spacer" | "divider" | "icon" | "embed"
  // Layout
  | "section" | "container" | "grid" | "columns-1" | "columns-2" | "columns-3" | "header" | "footer" | "hero" | "card" | "list" | "accordion" | "tabs"
  // Strategy
  | "strategy";

export interface BrandBlock {
  id: string;
  type: BlockType;
  data: Record<string, unknown>;
  children?: BrandBlock[]; // for layout blocks
}

export interface BlockCategory {
  id: string;
  label: string;
  blocks: { type: BlockType; label: string; icon: string }[];
}

export const BLOCK_CATEGORIES: BlockCategory[] = [
  {
    id: "basic", label: "Basic Blocks",
    blocks: [
      { type: "text", label: "Text", icon: "T" },
      { type: "heading", label: "Heading", icon: "H" },
      { type: "paragraph", label: "Paragraph", icon: "\u00B6" },
      { type: "button", label: "Button", icon: "\u25A3" },
      { type: "image", label: "Image / Media", icon: "\u25A8" },
      { type: "video", label: "Video", icon: "\u25B6" },
      { type: "audio", label: "Audio", icon: "\u266B" },
      { type: "spacer", label: "Spacer", icon: "\u2195" },
      { type: "divider", label: "Divider", icon: "\u2014" },
      { type: "icon", label: "Icon", icon: "\u2605" },
      { type: "embed", label: "Embed", icon: "\u29C9" },
    ],
  },
  {
    id: "layout", label: "Layout Blocks",
    blocks: [
      { type: "section", label: "Section", icon: "\u25A1" },
      { type: "container", label: "Container", icon: "\u25A0" },
      { type: "grid", label: "Grid", icon: "\u2637" },
      { type: "columns-1", label: "1 Column", icon: "\u2503" },
      { type: "columns-2", label: "2 Columns", icon: "\u2503\u2503" },
      { type: "columns-3", label: "3 Columns", icon: "\u2503\u2503\u2503" },
      { type: "header", label: "Header", icon: "\u2587" },
      { type: "footer", label: "Footer", icon: "\u2581" },
      { type: "hero", label: "Hero", icon: "\u2B1A" },
      { type: "card", label: "Card", icon: "\u25AD" },
      { type: "list", label: "List", icon: "\u2261" },
      { type: "accordion", label: "Accordion", icon: "\u25BC" },
      { type: "tabs", label: "Tabs", icon: "\u2630" },
    ],
  },
];

export function emptyBlock(type: BlockType): BrandBlock {
  const base = { id: crypto.randomUUID(), type, data: {}, children: [] };
  switch (type) {
    case "heading": return { ...base, data: { text: "", level: 2 } };
    case "text": case "paragraph": return { ...base, data: { text: "" } };
    case "button": return { ...base, data: { text: "Button", url: "", variant: "primary" } };
    case "image": return { ...base, data: { url: "", alt: "", caption: "" } };
    case "video": return { ...base, data: { url: "", caption: "" } };
    case "audio": return { ...base, data: { url: "", caption: "" } };
    case "spacer": return { ...base, data: { height: 40 } };
    case "divider": return { ...base, data: {} };
    case "icon": return { ...base, data: { name: "", size: 24 } };
    case "embed": return { ...base, data: { url: "", html: "" } };
    case "hero": return { ...base, data: { title: "", subtitle: "", bgUrl: "", bgColor: "" } };
    case "card": return { ...base, data: { title: "", text: "", imageUrl: "" } };
    case "list": return { ...base, data: { items: [""] } };
    case "accordion": return { ...base, data: { items: [{ title: "", content: "" }] } };
    case "tabs": return { ...base, data: { items: [{ label: "", content: "" }] } };
    default: return base;
  }
}

export interface BrandConfig {
  brandName: string;
  tagline: string;
  logos: BrandLogo[];
  logoGuidelines: string;
  colors: BrandColor[];
  fonts: BrandFont[];
  images: BrandImage[];
  sections: BrandSection[];
}

export function emptyBrandConfig(): BrandConfig {
  return {
    brandName: "", tagline: "",
    logos: [], logoGuidelines: "",
    colors: [], fonts: [],
    images: [], sections: [],
  };
}

export function emptyCampaign(): Campaign {
  return {
    id: crypto.randomUUID(),
    nome: "", piattaforma: "Google Ads", canale: "", obiettivo: "",
    stato: "PIANIFICATA", data_inizio: "", data_fine: "",
    target: "", landing_page: "", note: "",
    periodi: {},
  };
}

export function emptyDoc(): MktgDoc {
  return { id: crypto.randomUUID(), titolo: "", url: "", desc: "" };
}

export function mktgFmt(v: number | null): string {
  if (v == null || isNaN(v)) return "0";
  if (Math.abs(v) >= 1000) return Math.round(v).toLocaleString("it-IT");
  if (v % 1 !== 0) return v.toFixed(2);
  return String(Math.round(v));
}

export function mktgStatoColor(s: string): string {
  const m: Record<string, string> = {
    ATTIVA: "var(--grn)", PIANIFICATA: "var(--acc)", "IN PAUSA": "#f59e0b",
    COMPLETATA: "var(--fg3)", ANNULLATA: "#ef4444",
  };
  return m[s] || "var(--fg2)";
}

export function campTotals(c: Campaign) {
  const p = c.periodi;
  const sum = (k: string): number => (p[k] || []).reduce<number>((s, v) => s + (v ?? 0), 0);
  const budgetFc = sum("BUDGET_FC"), budgetRe = sum("BUDGET_RE");
  const leadFc = sum("LEAD_FC"), leadRe = sum("LEAD_RE");
  const impressioni = sum("IMPRESSIONI"), click = sum("CLICK");
  const cplFc = leadFc > 0 ? budgetFc / leadFc : null;
  const cplRe = leadRe > 0 ? budgetRe / leadRe : null;
  return { budgetFc, budgetRe, leadFc, leadRe, impressioni, click, cplFc, cplRe };
}

export function getMockCampaigns(): Campaign[] {
  return [
    {
      id: "c1", nome: "Lead Gen Search IT", piattaforma: "Google Ads", canale: "Search",
      obiettivo: "Lead Generation", stato: "ATTIVA", data_inizio: "2026-01-01", data_fine: "2026-06-30",
      target: "PMI Italia 10-200 dip", landing_page: "https://example.com/demo", note: "",
      periodi: {
        BUDGET_FC: [2000, 2000, 2500, 2500, 3000, 3000, null, null, null, null, null, null],
        BUDGET_RE: [1800, 2100, 2400, 2600, 2900, null, null, null, null, null, null, null],
        LEAD_FC: [40, 40, 50, 50, 60, 60, null, null, null, null, null, null],
        LEAD_RE: [35, 42, 48, 55, 58, null, null, null, null, null, null, null],
        IMPRESSIONI: [50000, 55000, 60000, 62000, 65000, null, null, null, null, null, null, null],
        CLICK: [2500, 2800, 3100, 3200, 3400, null, null, null, null, null, null, null],
        ROAS: [3.2, 3.5, 3.1, 3.8, 4.0, null, null, null, null, null, null, null],
      },
    },
    {
      id: "c2", nome: "Brand Awareness Social", piattaforma: "Meta Ads", canale: "Social",
      obiettivo: "Brand Awareness", stato: "ATTIVA", data_inizio: "2026-02-01", data_fine: "2026-12-31",
      target: "Decision maker 25-55", landing_page: "", note: "Campagna sempre attiva",
      periodi: {
        BUDGET_FC: [null, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500],
        BUDGET_RE: [null, 1400, 1600, 1450, 1550, null, null, null, null, null, null, null],
        LEAD_FC: [null, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20],
        LEAD_RE: [null, 18, 22, 19, 21, null, null, null, null, null, null, null],
        IMPRESSIONI: [null, 120000, 130000, 125000, 135000, null, null, null, null, null, null, null],
        CLICK: [null, 3500, 3800, 3600, 4000, null, null, null, null, null, null, null],
        ROAS: [null, 2.1, 2.3, 2.0, 2.5, null, null, null, null, null, null, null],
      },
    },
    {
      id: "c3", nome: "Retargeting Display", piattaforma: "Google Ads", canale: "Display",
      obiettivo: "Conversioni", stato: "PIANIFICATA", data_inizio: "2026-07-01", data_fine: "2026-12-31",
      target: "Visitatori sito", landing_page: "https://example.com/offerta", note: "",
      periodi: {},
    },
  ];
}

export function getMockDocs(): MktgDoc[] {
  return [
    { id: "d1", titolo: "Piano Marketing 2026", url: "https://docs.google.com/document/d/example1", desc: "Strategia e obiettivi annuali" },
    { id: "d2", titolo: "Brand Guidelines", url: "https://docs.google.com/presentation/d/example2", desc: "Linee guida brand identity" },
  ];
}
