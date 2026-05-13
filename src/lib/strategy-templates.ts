/* ── Strategy Template Catalog ── */

export interface STDef {
  type: string;
  label: string;
  desc: string;
  icon: string;
  badge?: "popular" | "advanced";
  keywords: string[];
  visual: "quad" | "canvas" | "sixcol" | "hflow" | "table" | "cards" | "nested" | "list";
  pattern: "sections" | "table" | "cards";
  columns?: { key: string; label: string; hint?: string }[];
  fields?: { key: string; label: string; type: "text" | "list" | "textarea"; hint?: string }[];
  sectionDefs?: { key: string; label: string; color?: string; hint?: string }[];
}

export interface STCategory {
  id: string;
  label: string;
  templates: STDef[];
}

/* helpers */
const sec = (key: string, label: string, color?: string, hint?: string) => ({ key, label, color, hint });
const col = (key: string, label: string, hint?: string) => ({ key, label, hint });
const fld = (key: string, label: string, type: "text" | "list" | "textarea" = "text", hint?: string) => ({ key, label, type, hint });

export const STRATEGY_CATEGORIES: STCategory[] = [
  {
    id: "analysis", label: "Strategic Analysis",
    templates: [
      { type: "swot", label: "SWOT Analysis", desc: "Strengths, Weaknesses, Opportunities, Threats", icon: "\u25A7", badge: "popular", keywords: ["swot", "strengths", "weaknesses", "opportunities", "threats"], visual: "quad", pattern: "sections", sectionDefs: [sec("strengths", "Strengths", "#22c55e", "Es: Team esperto, Brand riconosciuto, Tecnologia proprietaria, Rete distributiva solida"), sec("weaknesses", "Weaknesses", "#ef4444", "Es: Budget limitato, Scarsa presenza online, Dipendenza da un cliente, Turn-over elevato"), sec("opportunities", "Opportunities", "#3b82f6", "Es: Mercato in crescita, Nuovi segmenti, Partnership strategiche, Trend favorevole"), sec("threats", "Threats", "#f59e0b", "Es: Nuovi competitor, Cambio normativo, Recessione economica, Innovazione disruptive")] },
      { type: "pestel", label: "PESTEL Analysis", desc: "Macro-environment analysis across 6 dimensions", icon: "\u25C9", badge: "advanced", keywords: ["pestel", "macro", "political", "economic"], visual: "sixcol", pattern: "sections", sectionDefs: [sec("political", "Political", "#8b5cf6", "Es: Stabilita governo, Politiche fiscali, Regolamentazione settore, Accordi commerciali"), sec("economic", "Economic", "#3b82f6", "Es: Tasso inflazione, Potere d'acquisto, Costo materie prime, Andamento PIL"), sec("social", "Social", "#22c55e", "Es: Trend demografici, Stili di vita, Sensibilita ambientale, Livello istruzione"), sec("technological", "Technological", "#f59e0b", "Es: AI e automazione, Nuove piattaforme, Digitalizzazione, R&D nel settore"), sec("environmental", "Environmental", "#10b981", "Es: Normative green, Carbon footprint, Economia circolare, Energie rinnovabili"), sec("legal", "Legal", "#ef4444", "Es: GDPR, Diritto del lavoro, Normative settoriali, Proprieta intellettuale")] },
      { type: "porter", label: "Porter's Five Forces", desc: "Industry competitive forces analysis", icon: "\u2B23", badge: "advanced", keywords: ["porter", "competition", "forces", "industry"], visual: "list", pattern: "sections", sectionDefs: [sec("rivalry", "Competitive Rivalry"), sec("newEntrants", "Threat of New Entrants"), sec("substitutes", "Threat of Substitutes"), sec("buyerPower", "Buyer Power"), sec("supplierPower", "Supplier Power")] },
      { type: "competitor-analysis", label: "Competitor Analysis", desc: "Compare competitors across key dimensions", icon: "\u2694", badge: "popular", keywords: ["competitor", "benchmark", "comparison"], visual: "table", pattern: "table", columns: [col("competitor", "Competitor", "Es: Acme Corp, Beta Inc"), col("positioning", "Positioning", "Es: Premium, Low-cost, Innovatore"), col("strengths", "Strengths", "Es: Brand forte, Prezzo aggressivo"), col("weaknesses", "Weaknesses", "Es: UX datata, Servizio lento"), col("pricing", "Pricing", "Es: 49-199/mese, Freemium"), col("channels", "Channels", "Es: Paid, SEO, Partnership"), col("differentiation", "Differentiation", "Es: AI-powered, White-glove"), col("threat", "Threat Level", "Alto / Medio / Basso")] },
      { type: "market-map", label: "Market Map", desc: "Visual overview of market landscape", icon: "\u25A3", keywords: ["market", "landscape", "overview"], visual: "table", pattern: "table", columns: [col("segment", "Segment"), col("players", "Key Players"), col("size", "Market Size"), col("growth", "Growth"), col("opportunity", "Opportunity")] },
      { type: "positioning-map", label: "Positioning Map", desc: "Brand positioning on key axes", icon: "\u29BF", keywords: ["positioning", "brand", "perception"], visual: "table", pattern: "table", columns: [col("brand", "Brand"), col("axisX", "Axis X Value"), col("axisY", "Axis Y Value"), col("notes", "Notes")] },
      { type: "bmc", label: "Business Model Canvas", desc: "9-block Osterwalder canvas", icon: "\u25A8", badge: "advanced", keywords: ["business model", "canvas", "osterwalder"], visual: "canvas", pattern: "sections", sectionDefs: [sec("partners", "Key Partners", undefined, "Es: Fornitori critici, Partner tecnologici, Alleanze strategiche, Co-branding"), sec("activities", "Key Activities", undefined, "Es: Produzione, Marketing, Sviluppo prodotto, Customer service, Logistica"), sec("resources", "Key Resources", undefined, "Es: Team, Brevetti, Brand, Piattaforma tecnologica, Database clienti"), sec("propositions", "Value Propositions", undefined, "Es: Risparmio tempo, Qualita superiore, Personalizzazione, Prezzo competitivo"), sec("relationships", "Customer Relationships", undefined, "Es: Assistenza dedicata, Self-service, Community, Co-creazione"), sec("channels", "Channels", undefined, "Es: E-commerce, Retail, Social media, Partnership, Sales team"), sec("segments", "Customer Segments", undefined, "Es: PMI 10-50 dipendenti, Enterprise, Freelance, Early adopter"), sec("costs", "Cost Structure", undefined, "Es: Personale, Infrastruttura tech, Marketing, Logistica, R&D"), sec("revenue", "Revenue Streams", undefined, "Es: Abbonamento SaaS, Fee una tantum, Commissioni, Licensing, Upselling")] },
      { type: "vpc", label: "Value Proposition Canvas", desc: "Map customer jobs, pains, and gains to your offer", icon: "\u29C9", keywords: ["value proposition", "jobs", "pains", "gains"], visual: "sixcol", pattern: "sections", sectionDefs: [sec("jobs", "Customer Jobs", "#3b82f6"), sec("pains", "Pains", "#ef4444"), sec("gains", "Gains", "#22c55e"), sec("products", "Products & Services", "#8b5cf6"), sec("painRelievers", "Pain Relievers", "#f59e0b"), sec("gainCreators", "Gain Creators", "#10b981")] },
      { type: "risk-matrix", label: "Risk Matrix", desc: "Map risks by probability and impact", icon: "\u26A0", keywords: ["risk", "probability", "impact"], visual: "table", pattern: "table", columns: [col("risk", "Risk"), col("probability", "Probability"), col("impact", "Impact"), col("mitigation", "Mitigation"), col("owner", "Owner"), col("status", "Status")] },
    ],
  },
  {
    id: "marketing", label: "Marketing Strategy",
    templates: [
      { type: "target-analysis", label: "Target Analysis", desc: "Segment, prioritize and profile your audience", icon: "\u25CE", keywords: ["target", "segment", "audience"], visual: "table", pattern: "table", columns: [col("segment", "Segment"), col("size", "Size"), col("priority", "Priority"), col("potential", "Potential"), col("acquisition", "Ease of Acquisition"), col("needs", "Key Needs"), col("barriers", "Barriers"), col("message", "Core Message")] },
      { type: "buyer-personas", label: "Buyer Personas", desc: "Detailed profiles of your ideal customers", icon: "\u263A", badge: "popular", keywords: ["personas", "buyer", "audience", "profile"], visual: "cards", pattern: "cards", fields: [fld("name", "Name", "text", "Es: Marco Bianchi"), fld("role", "Role", "text", "Es: Marketing Manager, CEO, CTO"), fld("company", "Company", "text", "Es: PMI manifatturiera, 50 dipendenti"), fld("goals", "Goals", "list", "Es: Aumentare lead qualificati, Ridurre CAC"), fld("painPoints", "Pain Points", "list", "Es: Poco tempo per analisi, Tool frammentati"), fld("frustrations", "Frustrations", "list", "Es: Report manuali, Dati inaffidabili"), fld("motivations", "Motivations", "list", "Es: Crescita professionale, Risultati misurabili"), fld("channels", "Preferred Channels", "list", "Es: LinkedIn, Newsletter, Webinar, Podcast"), fld("messages", "Key Messages", "list", "Es: Risparmia 10h/settimana, ROI garantito"), fld("quote", "Representative Quote", "textarea", "Una frase che rappresenta il modo di pensare di questa persona")] },
      { type: "customer-journey", label: "Customer Journey Map", desc: "Map the customer experience across stages", icon: "\u27A1", keywords: ["journey", "customer", "experience", "touchpoints"], visual: "hflow", pattern: "sections", sectionDefs: [sec("awareness", "Awareness", "#8b5cf6", "Es: Scopre il brand via ads, contenuto organico, passaparola"), sec("consideration", "Consideration", "#3b82f6", "Es: Confronta alternative, legge review, scarica risorse"), sec("decision", "Decision", "#f59e0b", "Es: Richiede demo, parla con sales, valuta pricing"), sec("purchase", "Purchase", "#22c55e", "Es: Completa onboarding, primo utilizzo, setup iniziale"), sec("retention", "Retention", "#10b981", "Es: Usa prodotto regolarmente, riceve supporto, rinnova"), sec("advocacy", "Advocacy", "#ec4899", "Es: Lascia review, referral, case study, social proof")] },
      { type: "funnel-strategy", label: "Funnel Strategy", desc: "Define strategy for each funnel stage", icon: "\u25BD", keywords: ["funnel", "tofu", "mofu", "bofu"], visual: "list", pattern: "sections", sectionDefs: [sec("tofu", "Top of Funnel (TOFU)", "#8b5cf6"), sec("mofu", "Middle of Funnel (MOFU)", "#3b82f6"), sec("bofu", "Bottom of Funnel (BOFU)", "#22c55e")] },
      { type: "channel-strategy", label: "Channel Strategy", desc: "Plan your channel mix", icon: "\u21C4", keywords: ["channel", "mix", "distribution"], visual: "table", pattern: "table", columns: [col("channel", "Channel"), col("objective", "Objective"), col("budget", "Budget"), col("kpi", "KPI"), col("owner", "Owner"), col("timeline", "Timeline")] },
      { type: "campaign-plan", label: "Campaign Plan", desc: "Plan and track marketing campaigns", icon: "\u2691", keywords: ["campaign", "plan", "launch"], visual: "table", pattern: "table", columns: [col("campaign", "Campaign"), col("channel", "Channel"), col("audience", "Audience"), col("budget", "Budget"), col("startDate", "Start"), col("endDate", "End"), col("kpi", "KPI"), col("owner", "Owner")] },
      { type: "content-strategy", label: "Content Strategy", desc: "Plan your content across formats and channels", icon: "\u270E", keywords: ["content", "editorial", "blog"], visual: "table", pattern: "table", columns: [col("topic", "Topic"), col("format", "Format"), col("channel", "Channel"), col("audience", "Audience"), col("goal", "Goal"), col("deadline", "Deadline"), col("owner", "Owner"), col("status", "Status")] },
      { type: "brand-positioning", label: "Brand Positioning", desc: "Define your brand positioning statement", icon: "\u2B21", keywords: ["brand", "positioning", "statement"], visual: "list", pattern: "sections", sectionDefs: [sec("target", "For [target audience]"), sec("need", "Who need [need/problem]"), sec("brand", "Our brand is [category]"), sec("benefit", "That delivers [key benefit]"), sec("reason", "Because [reason to believe]"), sec("unlike", "Unlike [competitors]")] },
      { type: "tov-matrix", label: "Tone of Voice Matrix", desc: "Define your brand voice dimensions", icon: "\u266A", keywords: ["tone", "voice", "brand", "communication"], visual: "table", pattern: "table", columns: [col("dimension", "Dimension"), col("weAre", "We are"), col("weAreNot", "We are not"), col("example", "Example"), col("context", "Context")] },
    ],
  },
  {
    id: "planning", label: "Planning & Execution",
    templates: [
      { type: "gantt", label: "Gantt Chart", desc: "Visual timeline for tasks and milestones", icon: "\u2637", badge: "popular", keywords: ["gantt", "timeline", "schedule", "project"], visual: "table", pattern: "table", columns: [col("task", "Task", "Es: Setup campagna, Creazione asset, Lancio"), col("owner", "Owner", "Es: Marco, Team Design"), col("start", "Start", "Es: 2026-01-15"), col("end", "End", "Es: 2026-02-28"), col("status", "Status", "Not started / In progress / Done"), col("progress", "Progress %", "Es: 0, 50, 100")] },
      { type: "roadmap", label: "Roadmap", desc: "High-level timeline of initiatives", icon: "\u279C", keywords: ["roadmap", "timeline", "initiatives"], visual: "table", pattern: "table", columns: [col("initiative", "Initiative"), col("quarter", "Quarter"), col("priority", "Priority"), col("owner", "Owner"), col("status", "Status")] },
      { type: "action-plan", label: "Action Plan", desc: "Detailed action items with owners and deadlines", icon: "\u2713", keywords: ["action", "plan", "tasks", "todo"], visual: "table", pattern: "table", columns: [col("action", "Action"), col("description", "Description"), col("owner", "Owner"), col("deadline", "Deadline"), col("priority", "Priority"), col("status", "Status")] },
      { type: "milestone-plan", label: "Milestone Plan", desc: "Key milestones and deliverables", icon: "\u25C6", keywords: ["milestone", "deliverable"], visual: "table", pattern: "table", columns: [col("milestone", "Milestone"), col("date", "Date"), col("owner", "Owner"), col("deliverable", "Deliverable"), col("status", "Status")] },
      { type: "sprint-plan", label: "Weekly Sprint Plan", desc: "Plan weekly sprints with goals and tasks", icon: "\u21BB", keywords: ["sprint", "weekly", "agile"], visual: "table", pattern: "table", columns: [col("task", "Task"), col("goal", "Sprint Goal"), col("owner", "Owner"), col("estimate", "Estimate"), col("status", "Status")] },
      { type: "quarterly-plan", label: "Quarterly Plan", desc: "Plan initiatives by quarter", icon: "\u25A3", keywords: ["quarterly", "q1", "q2", "q3", "q4"], visual: "list", pattern: "sections", sectionDefs: [sec("q1", "Q1", "#3b82f6"), sec("q2", "Q2", "#22c55e"), sec("q3", "Q3", "#f59e0b"), sec("q4", "Q4", "#ef4444")] },
      { type: "okr-plan", label: "OKR Plan", desc: "Objectives and Key Results", icon: "\u25CE", keywords: ["okr", "objectives", "key results"], visual: "nested", pattern: "sections", sectionDefs: [sec("obj1", "Objective 1", "#3b82f6", "Es KR: Aumentare MRR del 30%, Ridurre churn al 2%, Lanciare 2 nuovi canali"), sec("obj2", "Objective 2", "#22c55e", "Es KR: 500 lead qualificati/mese, CAC sotto 80EUR, NPS > 50"), sec("obj3", "Objective 3", "#f59e0b", "Es KR: 3 partnership attive, 10 case study, Entrare in 2 nuovi mercati")] },
      { type: "raci", label: "RACI Matrix", desc: "Responsible, Accountable, Consulted, Informed", icon: "\u25A6", keywords: ["raci", "responsibility", "roles"], visual: "table", pattern: "table", columns: [col("task", "Task"), col("responsible", "Responsible"), col("accountable", "Accountable"), col("consulted", "Consulted"), col("informed", "Informed")] },
    ],
  },
  {
    id: "financial", label: "Financial & Budget",
    templates: [
      { type: "marketing-budget", label: "Marketing Budget", desc: "Plan and track marketing spend by channel", icon: "\u20AC", badge: "popular", keywords: ["budget", "spend", "marketing", "allocation"], visual: "table", pattern: "table", columns: [col("channel", "Channel", "Es: Google Ads, Meta Ads, SEO, Content"), col("monthly", "Monthly Budget", "Es: 3.000"), col("annual", "Annual Budget", "Es: 36.000"), col("objective", "Objective", "Es: Lead generation, Brand awareness"), col("owner", "Owner", "Es: Marketing Manager"), col("roi", "Expected ROI", "Es: 3.5x, 200%"), col("notes", "Notes", "Es: Attivo da Q2, Test A/B in corso")] },
      { type: "media-budget", label: "Media Budget", desc: "Allocate media spend across platforms", icon: "\u25B6", keywords: ["media", "budget", "spend", "ads"], visual: "table", pattern: "table", columns: [col("platform", "Platform"), col("format", "Format"), col("monthly", "Monthly"), col("quarterly", "Quarterly"), col("annual", "Annual"), col("kpi", "KPI"), col("notes", "Notes")] },
      { type: "monthly-budget", label: "Monthly Budget Tracker", desc: "Track budget vs actual spend monthly", icon: "\u2630", keywords: ["monthly", "budget", "tracker", "actual"], visual: "table", pattern: "table", columns: [col("category", "Category"), col("budget", "Budget"), col("actual", "Actual"), col("variance", "Variance"), col("notes", "Notes")] },
      { type: "forecast-table", label: "Forecast Table", desc: "Revenue and cost forecasting", icon: "\u2197", keywords: ["forecast", "revenue", "projection"], visual: "table", pattern: "table", columns: [col("item", "Item"), col("q1", "Q1"), col("q2", "Q2"), col("q3", "Q3"), col("q4", "Q4"), col("total", "Total")] },
      { type: "roi-calculator", label: "ROI Calculator", desc: "Calculate return on investment", icon: "\u2211", keywords: ["roi", "return", "investment"], visual: "table", pattern: "table", columns: [col("investment", "Investment"), col("cost", "Cost"), col("revenue", "Revenue"), col("roi", "ROI %"), col("payback", "Payback Period")] },
      { type: "cost-breakdown", label: "Cost Breakdown", desc: "Break down costs by category", icon: "\u25A4", keywords: ["cost", "breakdown", "expense"], visual: "table", pattern: "table", columns: [col("category", "Category"), col("item", "Item"), col("cost", "Cost"), col("frequency", "Frequency"), col("annual", "Annual"), col("notes", "Notes")] },
      { type: "budget-allocation", label: "Budget Allocation Matrix", desc: "Allocate budget across channels and goals", icon: "\u25A5", keywords: ["budget", "allocation", "matrix"], visual: "table", pattern: "table", columns: [col("channel", "Channel"), col("awareness", "Awareness"), col("acquisition", "Acquisition"), col("retention", "Retention"), col("total", "Total")] },
    ],
  },
  {
    id: "goals", label: "Goals & Performance",
    templates: [
      { type: "goals-matrix", label: "Goals Matrix", desc: "Track goals with KPIs, owners and status", icon: "\u2302", badge: "popular", keywords: ["goals", "objectives", "kpi", "targets"], visual: "table", pattern: "table", columns: [col("goal", "Goal", "Es: Aumentare revenue, Entrare in nuovo mercato"), col("description", "Description", "Es: +30% MRR entro Q4 tramite upselling"), col("kpi", "KPI", "Es: MRR, # Clienti, NPS"), col("baseline", "Baseline", "Es: 50k/mese, 120 clienti"), col("target", "Target", "Es: 65k/mese, 180 clienti"), col("deadline", "Deadline", "Es: 2026-12-31"), col("owner", "Owner", "Es: Head of Growth"), col("status", "Status", "Not started / In progress / Done"), col("priority", "Priority", "Alta / Media / Bassa")] },
      { type: "kpi-dashboard", label: "KPI Dashboard", desc: "Track key performance indicators", icon: "\u25C8", keywords: ["kpi", "dashboard", "metrics"], visual: "table", pattern: "table", columns: [col("kpi", "KPI"), col("target", "Target"), col("current", "Current"), col("trend", "Trend"), col("owner", "Owner"), col("notes", "Notes")] },
      { type: "okr-matrix", label: "OKR Matrix", desc: "Full OKR framework with scoring", icon: "\u25CE", keywords: ["okr", "matrix", "scoring"], visual: "table", pattern: "table", columns: [col("objective", "Objective"), col("keyResult", "Key Result"), col("target", "Target"), col("current", "Current"), col("score", "Score"), col("owner", "Owner")] },
      { type: "smart-goals", label: "SMART Goals", desc: "Specific, Measurable, Achievable, Relevant, Time-bound", icon: "\u2713", keywords: ["smart", "goals", "specific", "measurable"], visual: "table", pattern: "table", columns: [col("goal", "Goal"), col("specific", "Specific"), col("measurable", "Measurable"), col("achievable", "Achievable"), col("relevant", "Relevant"), col("timeBound", "Time-bound")] },
      { type: "north-star", label: "North Star Metric", desc: "Define your one metric that matters", icon: "\u2605", keywords: ["north star", "metric", "focus"], visual: "list", pattern: "sections", sectionDefs: [sec("metric", "North Star Metric"), sec("inputs", "Input Metrics"), sec("actions", "Key Actions"), sec("segments", "Key Segments")] },
      { type: "growth-model", label: "Growth Model", desc: "Map your growth engine and levers", icon: "\u2197", keywords: ["growth", "model", "engine", "levers"], visual: "list", pattern: "sections", sectionDefs: [sec("acquisition", "Acquisition", "#3b82f6"), sec("activation", "Activation", "#22c55e"), sec("retention", "Retention", "#f59e0b"), sec("revenue", "Revenue", "#8b5cf6"), sec("referral", "Referral", "#ec4899")] },
      { type: "flywheel-metrics", label: "Flywheel Metrics", desc: "Track your flywheel momentum", icon: "\u21BB", badge: "advanced", keywords: ["flywheel", "momentum", "metrics"], visual: "table", pattern: "table", columns: [col("stage", "Stage"), col("metric", "Metric"), col("target", "Target"), col("current", "Current"), col("trend", "Trend"), col("action", "Next Action")] },
      { type: "performance-review", label: "Performance Review", desc: "Review team or campaign performance", icon: "\u2713", keywords: ["performance", "review", "evaluation"], visual: "table", pattern: "table", columns: [col("area", "Area"), col("goal", "Goal"), col("result", "Result"), col("score", "Score"), col("notes", "Notes")] },
    ],
  },
  {
    id: "research", label: "Research & Insights",
    templates: [
      { type: "customer-interviews", label: "Customer Interviews", desc: "Organize and synthesize interview findings", icon: "\u263A", keywords: ["interview", "customer", "qualitative"], visual: "cards", pattern: "cards", fields: [fld("name", "Interviewee"), fld("role", "Role"), fld("date", "Date"), fld("keyInsights", "Key Insights", "list"), fld("quotes", "Notable Quotes", "list"), fld("painPoints", "Pain Points", "list"), fld("opportunities", "Opportunities", "list")] },
      { type: "survey-summary", label: "Survey Summary", desc: "Summarize survey results", icon: "\u2637", keywords: ["survey", "results", "quantitative"], visual: "table", pattern: "table", columns: [col("question", "Question"), col("responses", "Responses"), col("topAnswer", "Top Answer"), col("percentage", "%"), col("insight", "Insight")] },
      { type: "insight-board", label: "Insight Board", desc: "Collect and organize research insights", icon: "\u25C8", keywords: ["insight", "research", "findings"], visual: "list", pattern: "sections", sectionDefs: [sec("observations", "Observations", "#3b82f6"), sec("insights", "Insights", "#22c55e"), sec("hypotheses", "Hypotheses", "#f59e0b"), sec("actions", "Actions", "#8b5cf6")] },
      { type: "problem-framing", label: "Problem Framing", desc: "Define and structure the problem space", icon: "\u2049", keywords: ["problem", "framing", "definition"], visual: "list", pattern: "sections", sectionDefs: [sec("problem", "Problem Statement"), sec("context", "Context"), sec("impact", "Impact"), sec("constraints", "Constraints"), sec("criteria", "Success Criteria")] },
      { type: "jtbd", label: "Jobs To Be Done", desc: "Map customer jobs, triggers and outcomes", icon: "\u2692", keywords: ["jtbd", "jobs", "customer", "outcomes"], visual: "table", pattern: "table", columns: [col("job", "Job"), col("trigger", "Trigger"), col("currentSolution", "Current Solution"), col("desiredOutcome", "Desired Outcome"), col("barriers", "Barriers")] },
      { type: "pain-points", label: "Pain Points Matrix", desc: "Map pain points by severity and frequency", icon: "\u26A0", keywords: ["pain", "points", "severity", "frequency"], visual: "table", pattern: "table", columns: [col("painPoint", "Pain Point"), col("segment", "Segment"), col("severity", "Severity"), col("frequency", "Frequency"), col("currentFix", "Current Fix"), col("opportunity", "Opportunity")] },
      { type: "opportunity-matrix", label: "Opportunity Matrix", desc: "Evaluate opportunities by impact and effort", icon: "\u2B50", keywords: ["opportunity", "impact", "effort", "prioritization"], visual: "table", pattern: "table", columns: [col("opportunity", "Opportunity"), col("impact", "Impact"), col("effort", "Effort"), col("priority", "Priority"), col("owner", "Owner"), col("notes", "Notes")] },
    ],
  },
];

/** Flat lookup */
export const ALL_TEMPLATES: STDef[] = STRATEGY_CATEGORIES.flatMap((c) => c.templates);
export function getTemplateDef(type: string): STDef | undefined { return ALL_TEMPLATES.find((t) => t.type === type); }

/** Generate default content for a template */
export function defaultStrategyContent(def: STDef): Record<string, unknown> {
  if (def.pattern === "sections") {
    return {
      sections: (def.sectionDefs || []).map((s) => ({
        key: s.key, label: s.label, color: s.color || "", hint: s.hint || "", items: [""],
      })),
    };
  }
  if (def.pattern === "table") {
    const emptyRow: Record<string, string> = {};
    for (const c of def.columns || []) emptyRow[c.key] = "";
    return { columns: def.columns || [], rows: [{ ...emptyRow }] };
  }
  if (def.pattern === "cards") {
    const emptyCard: Record<string, string | string[]> = {};
    for (const f of def.fields || []) emptyCard[f.key] = f.type === "list" ? [""] : "";
    return { fields: def.fields || [], cards: [{ ...emptyCard }] };
  }
  return {};
}
