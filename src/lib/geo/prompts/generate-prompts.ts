import type { GEOConfig } from "@/lib/geo/types";

interface GeneratePromptsArgs {
  config: GEOConfig;
  count: number;
  focusIntent?: string;
  focusFunnel?: string;
}

export function buildGeneratePromptsPrompt(args: GeneratePromptsArgs): string {
  const { config, count, focusIntent, focusFunnel } = args;

  return `Genera ${count} prompt realistici che un utente potrebbe fare a un LLM (ChatGPT, Perplexity, Gemini, Claude) relativi al settore e ai servizi di questa azienda.

AZIENDA: ${config.brandName}
SITO: ${config.siteUrl || "non specificato"}
SETTORE: ${config.industry || "non specificato"}
MERCATO: ${config.market || "B2B"}
PAESE: ${config.country || "Italia"}
LINGUA: ${config.language || "it"}
SERVIZI: ${config.services.join(", ") || "non specificati"}
BUYER PERSONAS: ${config.buyerPersonas.join(", ") || "non specificate"}
PROBLEMI DEL CLIENTE: ${config.problems.join(", ") || "non specificati"}
COMPETITOR: ${config.competitors.join(", ") || "non specificati"}
${focusIntent ? `FOCUS INTENT: ${focusIntent}` : ""}
${focusFunnel ? `FOCUS FUNNEL: ${focusFunnel}` : ""}

Ogni prompt deve essere una domanda o richiesta realistica che un potenziale cliente farebbe a un assistente AI.

Genera un mix di:
- Prompt informativi (come fare X, cos'e' Y)
- Prompt comparativi (migliori agenzie per X, confronto tra Y e Z)
- Prompt transazionali (quanto costa X, chi offre Y a Verona)
- Prompt locali (agenzia di marketing a [citta'])
- Prompt verticali per settore

Rispondi ESCLUSIVAMENTE con un JSON valido:
{
  "prompts": [
    {
      "text": "<testo del prompt>",
      "intent": "informativo" | "comparativo" | "transazionale" | "locale" | "verticale",
      "funnelStage": "TOFU" | "MOFU" | "BOFU",
      "buyerPersona": "<persona piu' probabile>",
      "commercialValue": <0-100, valore commerciale stimato>,
      "contentSuggestion": "<tipo di contenuto necessario per presidiare questo prompt>"
    }
  ]
}

Scrivi i prompt in ${config.language === "en" ? "inglese" : "italiano"}.
Sii specifico e realistico. Non prompt generici.`;
}
