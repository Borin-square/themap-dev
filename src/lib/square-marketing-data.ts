import type { FwData, FwConfig } from "./flywheel";
import type { Campaign } from "./marketing";
import type { Persona } from "./people";

/* ══════════════════════════════════════
   SQUARE MARKETING — Dati iniziali
   ══════════════════════════════════════ */

// ── PEOPLE ──

export function getSquarePeople(): Persona[] {
  return [
    { nome: "Davide Borin", azienda: "SQUARE MARKETING", funzione: "DIREZIONE", livello: "SENIOR", contratto: "DIPENDENTE", team: "DIREZIONE", leader: true, anni: { 2026: { capSett: 40, mesiEff: 12, costoOra: null, ral: 75000 } } },
    { nome: "Sara Colombo", azienda: "SQUARE MARKETING", funzione: "MARKETING", livello: "SENIOR", contratto: "DIPENDENTE", team: "Strategy", leader: true, anni: { 2026: { capSett: 40, mesiEff: 12, costoOra: null, ral: 45000 } } },
    { nome: "Luca Martinelli", azienda: "SQUARE MARKETING", funzione: "SALES", livello: "SENIOR", contratto: "DIPENDENTE", team: "Sales", leader: true, anni: { 2026: { capSett: 40, mesiEff: 12, costoOra: null, ral: 48000 } } },
    { nome: "Giulia Ferraro", azienda: "SQUARE MARKETING", funzione: "OPERATION", livello: "SENIOR", contratto: "DIPENDENTE", team: "Account", leader: true, anni: { 2026: { capSett: 40, mesiEff: 12, costoOra: null, ral: 42000 } } },
    { nome: "Marco Pellegrini", azienda: "SQUARE MARKETING", funzione: "MARKETING", livello: "MIDDLE", contratto: "DIPENDENTE", team: "Performance", leader: false, anni: { 2026: { capSett: 40, mesiEff: 12, costoOra: null, ral: 35000 } } },
    { nome: "Chiara Benedetti", azienda: "SQUARE MARKETING", funzione: "MARKETING", livello: "MIDDLE", contratto: "DIPENDENTE", team: "Content", leader: false, anni: { 2026: { capSett: 40, mesiEff: 11, costoOra: null, ral: 32000 } } },
    { nome: "Andrea Moretti", azienda: "SQUARE MARKETING", funzione: "OPERATION", livello: "MIDDLE", contratto: "DIPENDENTE", team: "Account", leader: false, anni: { 2026: { capSett: 40, mesiEff: 12, costoOra: null, ral: 33000 } } },
    { nome: "Elena Ricci", azienda: "SQUARE MARKETING", funzione: "MARKETING", livello: "JUNIOR", contratto: "DIPENDENTE", team: "Social", leader: false, anni: { 2026: { capSett: 40, mesiEff: 11, costoOra: null, ral: 26000 } } },
    { nome: "Tommaso Galli", azienda: "SQUARE MARKETING", funzione: "OPERATION", livello: "JUNIOR", contratto: "DIPENDENTE", team: "Account", leader: false, anni: { 2026: { capSett: 40, mesiEff: 10, costoOra: null, ral: 25000 } } },
    { nome: "Alessia Fontana", azienda: "SQUARE MARKETING", funzione: "MARKETING", livello: "MIDDLE", contratto: "FREELANCE", team: "SEO", leader: false, anni: { 2026: { capSett: 24, mesiEff: 10, costoOra: 35, ral: null } } },
    { nome: "Roberto De Luca", azienda: "SQUARE MARKETING", funzione: "MARKETING", livello: "SENIOR", contratto: "FREELANCE", team: "Creative", leader: false, anni: { 2026: { capSett: 20, mesiEff: 12, costoOra: 50, ral: null } } },
    { nome: "Valentina Orsini", azienda: "SQUARE MARKETING", funzione: "AMMINISTRAZIONE", livello: "MIDDLE", contratto: "DIPENDENTE", team: "Admin", leader: true, anni: { 2026: { capSett: 30, mesiEff: 12, costoOra: null, ral: 32000 } } },
  ];
}

// ── FLYWHEEL ──

export function getSquareFwData(): { data: FwData; config: FwConfig } {
  const data: FwData = {
    MARKETING: {
      "Lead Generation": {
        owner: "Marco Pellegrini", isPercent: false, isCurrency: false,
        real: [85, 92, 98, 105, 110, null, null, null, null, null, null, null],
        forecast: [80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 130, 135],
        subgoals: {
          "Google Ads": { owner: "Marco Pellegrini", isPercent: false, isCurrency: false, real: [35, 38, 42, 45, 48, null, null, null, null, null, null, null], forecast: [30, 32, 35, 38, 40, 42, 45, 48, 50, 52, 55, 58] },
          "Meta Ads": { owner: "Marco Pellegrini", isPercent: false, isCurrency: false, real: [28, 30, 32, 35, 33, null, null, null, null, null, null, null], forecast: [25, 27, 28, 30, 32, 34, 35, 37, 38, 40, 42, 44] },
          "SEO / Organic": { owner: "Alessia Fontana", isPercent: false, isCurrency: false, real: [22, 24, 24, 25, 29, null, null, null, null, null, null, null], forecast: [25, 26, 27, 27, 28, 29, 30, 30, 32, 33, 33, 33] },
        },
      },
      "Brand Awareness": {
        owner: "Sara Colombo", isPercent: true, isCurrency: false,
        real: [0.12, 0.13, 0.14, 0.15, 0.16, null, null, null, null, null, null, null],
        forecast: [0.12, 0.13, 0.14, 0.15, 0.16, 0.17, 0.18, 0.19, 0.20, 0.21, 0.22, 0.23],
        subgoals: {},
      },
      "Content Output": {
        owner: "Chiara Benedetti", isPercent: false, isCurrency: false,
        real: [12, 14, 11, 15, 13, null, null, null, null, null, null, null],
        forecast: [12, 12, 12, 14, 14, 14, 16, 16, 16, 18, 18, 18],
        subgoals: {},
      },
    },
    SALES: {
      "Fatturato": {
        owner: "Luca Martinelli", isPercent: false, isCurrency: true,
        real: [38000, 42000, 45000, 41000, 48000, null, null, null, null, null, null, null],
        forecast: [35000, 37000, 40000, 42000, 45000, 47000, 50000, 48000, 52000, 55000, 58000, 62000],
        subgoals: {
          Retainer: { owner: "Luca Martinelli", isPercent: false, isCurrency: true, real: [22000, 22000, 24000, 24000, 26000, null, null, null, null, null, null, null], forecast: [20000, 20000, 22000, 22000, 24000, 24000, 26000, 26000, 28000, 28000, 30000, 30000] },
          Progetti: { owner: "Luca Martinelli", isPercent: false, isCurrency: true, real: [16000, 20000, 21000, 17000, 22000, null, null, null, null, null, null, null], forecast: [15000, 17000, 18000, 20000, 21000, 23000, 24000, 22000, 24000, 27000, 28000, 32000] },
        },
      },
      "Pipeline Value": {
        owner: "Luca Martinelli", isPercent: false, isCurrency: true,
        real: [120000, 135000, 145000, 130000, 155000, null, null, null, null, null, null, null],
        forecast: [100000, 110000, 120000, 130000, 140000, 150000, 160000, 165000, 170000, 180000, 190000, 200000],
        subgoals: {},
      },
      "Conversion Rate": {
        owner: "Luca Martinelli", isPercent: true, isCurrency: false,
        real: [0.22, 0.25, 0.24, 0.28, 0.26, null, null, null, null, null, null, null],
        forecast: [0.25, 0.25, 0.26, 0.26, 0.27, 0.27, 0.28, 0.28, 0.29, 0.29, 0.30, 0.30],
        subgoals: {},
      },
    },
    OPERATION: {
      "Client Satisfaction": {
        owner: "Giulia Ferraro", isPercent: false, isCurrency: false,
        real: [8.2, 8.4, 8.1, 8.5, 8.3, null, null, null, null, null, null, null],
        forecast: [8.0, 8.0, 8.2, 8.2, 8.3, 8.3, 8.5, 8.5, 8.5, 8.5, 8.5, 8.5],
        subgoals: {},
      },
      "On-time Delivery": {
        owner: "Giulia Ferraro", isPercent: true, isCurrency: false,
        real: [0.88, 0.91, 0.85, 0.93, 0.90, null, null, null, null, null, null, null],
        forecast: [0.90, 0.90, 0.90, 0.92, 0.92, 0.92, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95],
        subgoals: {},
      },
      "Churn Rate": {
        owner: "Giulia Ferraro", isPercent: true, isCurrency: false,
        real: [0.05, 0.03, 0.04, 0.02, 0.03, null, null, null, null, null, null, null],
        forecast: [0.05, 0.05, 0.04, 0.04, 0.04, 0.03, 0.03, 0.03, 0.03, 0.02, 0.02, 0.02],
        subgoals: {},
      },
    },
  };

  const config: FwConfig = {
    "Lead Generation": { mode: "STANDARD" },
    "Brand Awareness": { mode: "STANDARD" },
    "Content Output": { mode: "STANDARD" },
    Fatturato: { mode: "STANDARD" },
    "Pipeline Value": { mode: "STANDARD" },
    "Conversion Rate": { mode: "STANDARD" },
    "Client Satisfaction": { mode: "LIMITI", limInf: 7.0, limSup: 8.5 },
    "On-time Delivery": { mode: "STANDARD" },
    "Churn Rate": { mode: "INVERSO" },
  };

  return { data, config };
}

// ── CAMPAIGNS ──

export function getSquareCampaigns(): Campaign[] {
  return [
    {
      id: "sq-c1", nome: "Performance Google IT", piattaforma: "Google Ads", canale: "Search",
      obiettivo: "Lead Generation", stato: "ATTIVA", data_inizio: "2026-01-01", data_fine: "2026-12-31",
      target: "PMI Nord Italia - Marketing Manager", landing_page: "https://squaremarketing.it/contatti", note: "Campagna always-on",
      periodi: {
        BUDGET_FC: [1800, 1800, 2000, 2000, 2200, 2200, 2500, 2500, 2500, 2800, 2800, 3000],
        BUDGET_RE: [1750, 1900, 2100, 1950, 2300, null, null, null, null, null, null, null],
        LEAD_FC: [22, 22, 25, 25, 28, 28, 32, 32, 32, 35, 35, 38],
        LEAD_RE: [20, 24, 28, 26, 30, null, null, null, null, null, null, null],
        IMPRESSIONI: [42000, 45000, 48000, 50000, 52000, null, null, null, null, null, null, null],
        CLICK: [2100, 2300, 2500, 2600, 2800, null, null, null, null, null, null, null],
        ROAS: [4.2, 4.5, 4.1, 4.8, 4.3, null, null, null, null, null, null, null],
      },
    },
    {
      id: "sq-c2", nome: "Brand Social", piattaforma: "Meta Ads", canale: "Social",
      obiettivo: "Brand Awareness", stato: "ATTIVA", data_inizio: "2026-02-01", data_fine: "2026-12-31",
      target: "Imprenditori e marketing manager 30-55", landing_page: "", note: "Focus su Instagram e LinkedIn",
      periodi: {
        BUDGET_FC: [null, 1200, 1200, 1200, 1500, 1500, 1500, 1500, 1800, 1800, 1800, 2000],
        BUDGET_RE: [null, 1100, 1300, 1150, 1600, null, null, null, null, null, null, null],
        LEAD_FC: [null, 15, 15, 15, 18, 18, 18, 18, 22, 22, 22, 25],
        LEAD_RE: [null, 12, 16, 14, 20, null, null, null, null, null, null, null],
        IMPRESSIONI: [null, 95000, 102000, 98000, 110000, null, null, null, null, null, null, null],
        CLICK: [null, 2800, 3100, 2900, 3400, null, null, null, null, null, null, null],
        ROAS: [null, 2.8, 3.1, 2.6, 3.5, null, null, null, null, null, null, null],
      },
    },
    {
      id: "sq-c3", nome: "LinkedIn B2B", piattaforma: "LinkedIn Ads", canale: "Social",
      obiettivo: "Lead Generation", stato: "ATTIVA", data_inizio: "2026-03-01", data_fine: "2026-09-30",
      target: "C-Level e Marketing Director", landing_page: "https://squaremarketing.it/case-studies", note: "InMail + Sponsored Content",
      periodi: {
        BUDGET_FC: [null, null, 800, 800, 1000, 1000, 1000, 1000, 1000, null, null, null],
        BUDGET_RE: [null, null, 780, 850, 950, null, null, null, null, null, null, null],
        LEAD_FC: [null, null, 8, 8, 10, 10, 12, 12, 12, null, null, null],
        LEAD_RE: [null, null, 7, 9, 11, null, null, null, null, null, null, null],
        IMPRESSIONI: [null, null, 25000, 28000, 32000, null, null, null, null, null, null, null],
        CLICK: [null, null, 450, 520, 580, null, null, null, null, null, null, null],
        ROAS: [null, null, 3.8, 4.2, 5.1, null, null, null, null, null, null, null],
      },
    },
    {
      id: "sq-c4", nome: "Retargeting Multi-channel", piattaforma: "Google Ads", canale: "Display",
      obiettivo: "Conversioni", stato: "PIANIFICATA", data_inizio: "2026-07-01", data_fine: "2026-12-31",
      target: "Visitatori sito e lead non convertiti", landing_page: "https://squaremarketing.it/offerta", note: "Cross-platform retargeting",
      periodi: {
        BUDGET_FC: [null, null, null, null, null, null, 600, 600, 600, 800, 800, 800],
        LEAD_FC: [null, null, null, null, null, null, 15, 15, 15, 20, 20, 20],
      },
    },
    {
      id: "sq-c5", nome: "SEO Content Hub", piattaforma: "SEO", canale: "Content",
      obiettivo: "Traffico Organico", stato: "ATTIVA", data_inizio: "2026-01-01", data_fine: "2026-12-31",
      target: "Ricerche informazionali marketing", landing_page: "https://squaremarketing.it/blog", note: "4 articoli/mese + pillar pages",
      periodi: {
        BUDGET_FC: [500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500],
        BUDGET_RE: [480, 520, 500, 500, 550, null, null, null, null, null, null, null],
        IMPRESSIONI: [18000, 22000, 28000, 35000, 42000, null, null, null, null, null, null, null],
        CLICK: [900, 1100, 1400, 1750, 2100, null, null, null, null, null, null, null],
      },
    },
  ];
}

// ── TOOLS / PANNELLI ──

export interface ToolItem {
  id: number;
  label: string;
  url: string;
  desc: string;
  funzione: string;
}

export function getSquareTools(): ToolItem[] {
  return [
    { id: 1, label: "Google Analytics 4", url: "https://analytics.google.com", desc: "Dashboard analytics clienti", funzione: "MARKETING" },
    { id: 2, label: "Semrush", url: "https://semrush.com", desc: "SEO, keyword research, competitor analysis", funzione: "MARKETING" },
    { id: 3, label: "HubSpot CRM", url: "https://app.hubspot.com", desc: "CRM e pipeline commerciale", funzione: "SALES" },
    { id: 4, label: "Google Ads Manager", url: "https://ads.google.com", desc: "Gestione campagne Google", funzione: "MARKETING" },
    { id: 5, label: "Meta Business Suite", url: "https://business.facebook.com", desc: "Gestione campagne Meta", funzione: "MARKETING" },
    { id: 6, label: "LinkedIn Campaign Manager", url: "https://www.linkedin.com/campaignmanager", desc: "Campagne LinkedIn B2B", funzione: "MARKETING" },
    { id: 7, label: "Canva", url: "https://canva.com", desc: "Design grafiche e creativita", funzione: "MARKETING" },
    { id: 8, label: "Notion", url: "https://notion.so", desc: "Knowledge base e project management", funzione: "OPERATION" },
    { id: 9, label: "Slack", url: "https://slack.com", desc: "Comunicazione team", funzione: "OPERATION" },
    { id: 10, label: "Google Drive", url: "https://drive.google.com", desc: "Documentazione condivisa", funzione: "DIREZIONE" },
    { id: 11, label: "Fatture in Cloud", url: "https://fattureincloud.it", desc: "Fatturazione e contabilita", funzione: "AMMINISTRAZIONE" },
    { id: 12, label: "Looker Studio", url: "https://lookerstudio.google.com", desc: "Report e dashboard clienti", funzione: "OPERATION" },
    { id: 13, label: "Hotjar", url: "https://hotjar.com", desc: "Heatmap e UX analytics", funzione: "MARKETING" },
    { id: 14, label: "Mailchimp", url: "https://mailchimp.com", desc: "Email marketing e automazioni", funzione: "MARKETING" },
  ];
}

// ── BUDGET MARKETING ──

export interface BudgetItem {
  id: string;
  attivita: string;
  spesa_fc: number | null;
  spesa_re: number | null;
  effort: number | null; // ore
  commenti: string;
  is_group: boolean;
  parent_gid: string;
  group_id: string;
}

export function getSquareBudget(): BudgetItem[] {
  return [
    { id: "g1", attivita: "Performance Advertising", spesa_fc: 52800, spesa_re: 24100, effort: null, commenti: "", is_group: true, parent_gid: "", group_id: "g1" },
    { id: "b1", attivita: "Google Ads Search", spesa_fc: 26400, spesa_re: 10700, effort: 120, commenti: "Campagna always-on", is_group: false, parent_gid: "g1", group_id: "" },
    { id: "b2", attivita: "Meta Ads Social", spesa_fc: 17400, spesa_re: 8150, effort: 80, commenti: "Instagram + Facebook", is_group: false, parent_gid: "g1", group_id: "" },
    { id: "b3", attivita: "LinkedIn Ads B2B", spesa_fc: 9000, spesa_re: 5250, effort: 60, commenti: "InMail + Sponsored", is_group: false, parent_gid: "g1", group_id: "" },

    { id: "g2", attivita: "Content & SEO", spesa_fc: 12000, spesa_re: 5500, effort: null, commenti: "", is_group: true, parent_gid: "", group_id: "g2" },
    { id: "b4", attivita: "Blog & Pillar Pages", spesa_fc: 6000, spesa_re: 3000, effort: 180, commenti: "4 articoli/mese", is_group: false, parent_gid: "g2", group_id: "" },
    { id: "b5", attivita: "SEO Tools (Semrush)", spesa_fc: 3600, spesa_re: 1500, effort: 24, commenti: "Licenza annuale", is_group: false, parent_gid: "g2", group_id: "" },
    { id: "b6", attivita: "Video Production", spesa_fc: 2400, spesa_re: 1000, effort: 60, commenti: "1 video/mese", is_group: false, parent_gid: "g2", group_id: "" },

    { id: "g3", attivita: "Brand & PR", spesa_fc: 8000, spesa_re: 2800, effort: null, commenti: "", is_group: true, parent_gid: "", group_id: "g3" },
    { id: "b7", attivita: "Eventi e Sponsorship", spesa_fc: 5000, spesa_re: 1800, effort: 40, commenti: "2 eventi H1", is_group: false, parent_gid: "g3", group_id: "" },
    { id: "b8", attivita: "PR e Media Relations", spesa_fc: 3000, spesa_re: 1000, effort: 30, commenti: "", is_group: false, parent_gid: "g3", group_id: "" },

    { id: "g4", attivita: "Tools & Infrastruttura", spesa_fc: 7200, spesa_re: 3100, effort: null, commenti: "", is_group: true, parent_gid: "", group_id: "g4" },
    { id: "b9", attivita: "CRM (HubSpot)", spesa_fc: 3600, spesa_re: 1500, effort: 12, commenti: "Piano Professional", is_group: false, parent_gid: "g4", group_id: "" },
    { id: "b10", attivita: "Analytics & Reporting", spesa_fc: 2400, spesa_re: 1100, effort: 48, commenti: "GA4 + Hotjar + Looker", is_group: false, parent_gid: "g4", group_id: "" },
    { id: "b11", attivita: "Email Marketing (Mailchimp)", spesa_fc: 1200, spesa_re: 500, effort: 36, commenti: "", is_group: false, parent_gid: "g4", group_id: "" },
  ];
}
