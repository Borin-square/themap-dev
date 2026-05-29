const BASE = "https://api.hubapi.com";

function tk() { return process.env.HUBSPOT_ACCESS_TOKEN!; }

async function hs(path: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${tk()}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`HubSpot ${res.status}: ${await res.text()}`);
  return res.json();
}

async function hsPost(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tk()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HubSpot ${res.status}: ${await res.text()}`);
  return res.json();
}

// Paginated search — fetches ALL results up to maxPages * 100
async function hsSearchAll(object: string, body: Record<string, unknown>, maxPages = 5) {
  const allResults: Record<string, unknown>[] = [];
  let after: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const payload = { ...body, limit: 100, ...(after ? { after } : {}) };
    const data = await hsPost(`/crm/v3/objects/${object}/search`, payload);
    allResults.push(...(data.results || []));
    after = data.paging?.next?.after;
    if (!after) break;
  }
  return allResults;
}

// --- Contacts ---

export async function searchContacts(query: string, limit = 10) {
  return hsPost("/crm/v3/objects/contacts/search", {
    filterGroups: query
      ? [{ filters: [{ propertyName: "firstname", operator: "CONTAINS_TOKEN", value: `*${query}*` }] },
         { filters: [{ propertyName: "lastname", operator: "CONTAINS_TOKEN", value: `*${query}*` }] },
         { filters: [{ propertyName: "email", operator: "CONTAINS_TOKEN", value: `*${query}*` }] }]
      : [],
    properties: ["firstname", "lastname", "email", "phone", "company", "lifecyclestage", "hs_lead_status"],
    limit,
  });
}

export async function getContact(id: string) {
  return hs(`/crm/v3/objects/contacts/${id}?properties=firstname,lastname,email,phone,company,lifecyclestage,hs_lead_status,createdate,lastmodifieddate`);
}

// --- Companies ---

export async function searchCompanies(query: string, limit = 10) {
  return hsPost("/crm/v3/objects/companies/search", {
    filterGroups: query
      ? [{ filters: [{ propertyName: "name", operator: "CONTAINS_TOKEN", value: `*${query}*` }] }]
      : [],
    properties: ["name", "domain", "industry", "city", "country", "numberofemployees", "annualrevenue"],
    limit,
  });
}

export async function getCompanyHS(id: string) {
  return hs(`/crm/v3/objects/companies/${id}?properties=name,domain,industry,city,country,numberofemployees,annualrevenue,createdate`);
}

// --- Deals ---

export async function searchDeals(opts: {
  query?: string;
  pipeline?: string;
  stage?: string;
  closeDateFrom?: string;
  closeDateTo?: string;
  limit?: number;
}) {
  const filters: { propertyName: string; operator: string; value: string }[] = [];
  if (opts.pipeline) filters.push({ propertyName: "pipeline", operator: "EQ", value: opts.pipeline });
  if (opts.stage) filters.push({ propertyName: "dealstage", operator: "EQ", value: opts.stage });
  if (opts.closeDateFrom) filters.push({ propertyName: "closedate", operator: "GTE", value: opts.closeDateFrom });
  if (opts.closeDateTo) filters.push({ propertyName: "closedate", operator: "LTE", value: opts.closeDateTo });

  if (opts.query) {
    filters.push({ propertyName: "dealname", operator: "CONTAINS_TOKEN", value: `*${opts.query}*` });
  }

  return hsPost("/crm/v3/objects/deals/search", {
    filterGroups: filters.length > 0 ? [{ filters }] : [],
    properties: ["dealname", "dealstage", "amount", "closedate", "pipeline", "hubspot_owner_id"],
    sorts: [{ propertyName: "closedate", direction: "ASCENDING" }],
    limit: opts.limit || 20,
  });
}

// --- Deal Forecast (aggregated, with pagination) ---

export async function dealForecast(opts: {
  pipeline: string;
  closeDateFrom: string;
  closeDateTo: string;
  includeClosedWon?: boolean;
}) {
  // 1. Get pipeline stages for probability mapping
  const pipelines = await hs("/crm/v3/pipelines/deals");
  const pipelineData = pipelines.results?.find((p: { id: string }) => p.id === opts.pipeline);
  if (!pipelineData) throw new Error(`Pipeline "${opts.pipeline}" non trovata`);

  const stageMap: Record<string, { label: string; probability: number; isClosed: boolean }> = {};
  for (const s of pipelineData.stages) {
    stageMap[s.id] = {
      label: s.label,
      probability: parseFloat(s.metadata?.probability || "0"),
      isClosed: s.metadata?.isClosed === "true",
    };
  }

  // 2. Fetch ALL deals in date range with pagination
  const filters = [
    { propertyName: "pipeline", operator: "EQ", value: opts.pipeline },
    { propertyName: "closedate", operator: "GTE", value: opts.closeDateFrom },
    { propertyName: "closedate", operator: "LTE", value: opts.closeDateTo },
  ];

  const allDeals = await hsSearchAll("deals", {
    filterGroups: [{ filters }],
    properties: ["dealname", "dealstage", "amount", "closedate", "hubspot_owner_id"],
    sorts: [{ propertyName: "closedate", direction: "ASCENDING" }],
  });

  // 3. Aggregate by stage
  interface StageSummary {
    stageLabel: string;
    probability: number;
    count: number;
    totalAmount: number;
    weightedAmount: number;
    deals: { name: string; amount: number; closeDate: string }[];
  }
  const byStage: Record<string, StageSummary> = {};

  let totalDeals = 0;
  let totalAmount = 0;
  let totalWeighted = 0;
  let dealsWithoutAmount = 0;

  for (const deal of allDeals) {
    const p = (deal as { properties: Record<string, string> }).properties;
    const stageId = p.dealstage;
    const stageInfo = stageMap[stageId] || { label: stageId, probability: 0, isClosed: false };

    // Skip closed lost
    if (stageId === "closedlost") continue;
    // Skip closed won unless requested
    if (stageId === "closedwon" && !opts.includeClosedWon) continue;

    const amount = p.amount ? parseFloat(p.amount) : 0;
    const weighted = amount * stageInfo.probability;

    if (!byStage[stageId]) {
      byStage[stageId] = {
        stageLabel: stageInfo.label,
        probability: stageInfo.probability,
        count: 0,
        totalAmount: 0,
        weightedAmount: 0,
        deals: [],
      };
    }

    byStage[stageId].count++;
    byStage[stageId].totalAmount += amount;
    byStage[stageId].weightedAmount += weighted;
    if (byStage[stageId].deals.length < 5) {
      byStage[stageId].deals.push({
        name: p.dealname,
        amount,
        closeDate: p.closedate?.slice(0, 10) || "",
      });
    }

    totalDeals++;
    totalAmount += amount;
    totalWeighted += weighted;
    if (!p.amount) dealsWithoutAmount++;
  }

  // Sort stages by probability descending
  const stages = Object.values(byStage).sort((a, b) => b.probability - a.probability);

  return {
    pipeline: pipelineData.label,
    period: `${opts.closeDateFrom} — ${opts.closeDateTo}`,
    totalDeals,
    dealsWithoutAmount,
    totalAmount: Math.round(totalAmount),
    totalWeightedAmount: Math.round(totalWeighted),
    stages,
  };
}

export async function getDeal(id: string) {
  return hs(`/crm/v3/objects/deals/${id}?properties=dealname,dealstage,amount,closedate,pipeline,hubspot_owner_id,createdate`);
}

export async function getDealPipelines() {
  return hs("/crm/v3/pipelines/deals");
}

export async function getOwners() {
  return hs("/crm/v3/owners?limit=100");
}

// --- Tool definitions for Anthropic ---

export const TOOLS = [
  {
    name: "search_contacts",
    description: "Search HubSpot contacts by name or email.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search term (name, email). Empty = recent." },
        limit: { type: "number", description: "Max results (default 10)" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_contact",
    description: "Get a HubSpot contact by ID.",
    input_schema: {
      type: "object" as const,
      properties: { id: { type: "string", description: "Contact ID" } },
      required: ["id"],
    },
  },
  {
    name: "search_companies",
    description: "Search HubSpot companies by name.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Company name. Empty = recent." },
        limit: { type: "number", description: "Max results (default 10)" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_company",
    description: "Get a HubSpot company by ID.",
    input_schema: {
      type: "object" as const,
      properties: { id: { type: "string", description: "Company ID" } },
      required: ["id"],
    },
  },
  {
    name: "search_deals",
    description: "Search HubSpot deals with filters. Returns a page of individual deals. For aggregate forecasts, use deal_forecast instead.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Text search on deal name." },
        pipeline: { type: "string", description: "Pipeline ID ('default' = Square Marketing ITA, '19669234' = UAE)." },
        stage: { type: "string", description: "Deal stage ID." },
        closeDateFrom: { type: "string", description: "ISO date, e.g. '2026-04-01'." },
        closeDateTo: { type: "string", description: "ISO date, e.g. '2026-06-30'." },
        limit: { type: "number", description: "Max results (default 20)" },
      },
    },
  },
  {
    name: "deal_forecast",
    description: "Get an aggregated forecast for a pipeline and date range. Fetches ALL deals (with pagination), groups by stage, calculates weighted amounts (amount * stage probability), and returns a summary. Use this for questions like 'previsionale Q2', 'forecast pipeline Italia', 'weighted pipeline value'. Excludes closed-lost deals. Pipeline IDs: 'default' = Square Marketing ITA, '19669234' = Square Marketing UAE.",
    input_schema: {
      type: "object" as const,
      properties: {
        pipeline: { type: "string", description: "Pipeline ID. 'default' = Italia, '19669234' = UAE." },
        closeDateFrom: { type: "string", description: "Start date ISO, e.g. '2026-04-01'." },
        closeDateTo: { type: "string", description: "End date ISO, e.g. '2026-06-30'." },
        includeClosedWon: { type: "boolean", description: "Include closed-won deals in the forecast (default false)." },
      },
      required: ["pipeline", "closeDateFrom", "closeDateTo"],
    },
  },
  {
    name: "get_deal",
    description: "Get a single deal by ID.",
    input_schema: {
      type: "object" as const,
      properties: { id: { type: "string", description: "Deal ID" } },
      required: ["id"],
    },
  },
  {
    name: "get_deal_pipelines",
    description: "Get all deal pipelines and their stages (IDs, labels, probabilities).",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_owners",
    description: "Get all HubSpot owners (sales reps).",
    input_schema: { type: "object" as const, properties: {} },
  },
];

// Execute a tool call
export async function executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "search_contacts": return searchContacts(args.query as string, args.limit as number);
    case "get_contact": return getContact(args.id as string);
    case "search_companies": return searchCompanies(args.query as string, args.limit as number);
    case "get_company": return getCompanyHS(args.id as string);
    case "search_deals": return searchDeals(args as Parameters<typeof searchDeals>[0]);
    case "deal_forecast": return dealForecast(args as Parameters<typeof dealForecast>[0]);
    case "get_deal": return getDeal(args.id as string);
    case "get_deal_pipelines": return getDealPipelines();
    case "get_owners": return getOwners();
    default: throw new Error(`Unknown tool: ${name}`);
  }
}
