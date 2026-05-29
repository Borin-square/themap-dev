/* ── GEO Tool Suite — Mock Data ── */

import type { GEOProject } from "./types";
import { emptyAudits, emptyActions, emptyMonitoring } from "./types";
import { enrichPromptScores } from "./scoring";

export function getMockGEOProject(): GEOProject {
  const p: GEOProject = {
    id: crypto.randomUUID(),
    config: {
      brandName: "Square Marketing",
      siteUrl: "https://squaremarketing.it",
      country: "Italia",
      language: "it",
      industry: "Marketing B2B",
      market: "B2B",
      buyerPersonas: ["CEO PMI", "Responsabile Marketing", "Founder SaaS"],
      services: ["Marketing strategy", "Marketing execution", "AI operations", "Growth systems"],
      competitors: ["HubSpot Agency Partner", "Boraso", "DigitalMDE", "Intesys", "Digital360"],
      competitorDomains: { "Boraso": "boraso.com", "Intesys": "intesys.it", "Digital360": "digital360.it" },
      problems: ["Mancanza di execution", "Marketing senza strategia", "Adozione AI", "Lead generation"],
    },
    prompts: [
      {
        id: crypto.randomUUID(),
        text: "Consigliami le migliori 5 agenzie di marketing B2B in Italia",
        intent: "comparativo", funnelStage: "MOFU", buyerPersona: "CEO PMI",
        commercialValue: 80, source: "generated", scans: [],
      },
      {
        id: crypto.randomUUID(),
        text: "Qual e' la migliore agenzia per marketing execution in Italia?",
        intent: "transazionale", funnelStage: "BOFU", buyerPersona: "Responsabile Marketing",
        commercialValue: 90, source: "generated", scans: [],
      },
      {
        id: crypto.randomUUID(),
        text: "Come strutturare un team marketing per una PMI B2B",
        intent: "informativo", funnelStage: "TOFU", buyerPersona: "CEO PMI",
        commercialValue: 40, source: "generated", scans: [],
      },
      {
        id: crypto.randomUUID(),
        text: "Agenzie che usano AI per il marketing B2B in Italia",
        intent: "comparativo", funnelStage: "MOFU", buyerPersona: "Founder SaaS",
        commercialValue: 75, source: "generated", scans: [],
      },
      {
        id: crypto.randomUUID(),
        text: "Quanto costa un'agenzia di marketing B2B in Italia?",
        intent: "transazionale", funnelStage: "BOFU", buyerPersona: "CEO PMI",
        commercialValue: 85, source: "manual", scans: [],
      },
    ],
    clusters: [],
    audits: emptyAudits(),
    actions: emptyActions(),
    monitoring: emptyMonitoring(),
  };

  // Enrich with scores
  p.prompts = p.prompts.map(enrichPromptScores);
  return p;
}
