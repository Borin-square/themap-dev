import Anthropic from "@anthropic-ai/sdk";
import type { GEOConfig, GEOPrompt, GEOIntent, GEOFunnel } from "@/lib/geo/types";

export const maxDuration = 120;

interface GenerateRequest {
  config: GEOConfig;
  count?: number;
  focusIntent?: string;
  focusFunnel?: string;
}

export async function POST(req: Request) {
  try {
    const { config, count = 10, focusIntent, focusFunnel } = (await req.json()) as GenerateRequest;

    if (!config.brandName?.trim()) {
      return Response.json({ error: "Brand name richiesto." }, { status: 400 });
    }

    const prompt = `Genera ${count} prompt realistici che un utente potrebbe fare a un LLM (ChatGPT, Perplexity, Gemini, Claude) relativi al settore e ai servizi di questa azienda.

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

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content.find((b) => b.type === "text")?.text || "{}";

    let parsed: {
      prompts: Array<{
        text: string;
        intent: string;
        funnelStage: string;
        buyerPersona: string;
        commercialValue: number;
        contentSuggestion?: string;
      }>;
    };

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch {
      return Response.json({ error: "Errore nel parsing.", raw: text }, { status: 500 });
    }

    const prompts: GEOPrompt[] = (parsed.prompts || []).map((p) => ({
      id: crypto.randomUUID(),
      text: p.text,
      intent: (p.intent as GEOIntent) || "informativo",
      funnelStage: (p.funnelStage as GEOFunnel) || "TOFU",
      buyerPersona: p.buyerPersona || "",
      commercialValue: p.commercialValue ?? 50,
      source: "generated" as const,
      scans: [],
    }));

    return Response.json({ prompts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto";
    return Response.json({ error: message }, { status: 500 });
  }
}
