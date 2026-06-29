import Anthropic from "@anthropic-ai/sdk";
import type { ContentGapsResult } from "@/lib/geo/types";

export const maxDuration = 60;

interface GapsRequest {
  brandName: string;
  siteUrl: string;
  services: string[];
  competitors: string[];
  industry: string;
  country: string;
  market: string;
  buyerPersonas: string[];
  problems: string[];
  scannedPrompts: { text: string; mentioned: boolean; sentiment: string }[];
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as GapsRequest;
    if (!body.brandName?.trim()) {
      return Response.json({ error: "Brand name richiesto." }, { status: 400 });
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const analysis = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [{
        role: "user",
        content: `Analizza le lacune di contenuto del brand "${body.brandName}" per essere meglio rappresentato nelle risposte degli LLM.

BRAND: ${body.brandName}
SITO: ${body.siteUrl || "non specificato"}
SERVIZI: ${body.services.join(", ") || "non specificati"}
COMPETITOR: ${body.competitors.join(", ") || "non specificati"}
SETTORE: ${body.industry || "non specificato"}
PAESE: ${body.country || "Italia"}
MERCATO: ${body.market || "B2B"}
BUYER PERSONAS: ${(body.buyerPersonas || []).join(", ") || "non specificate"}
PROBLEMI TARGET: ${(body.problems || []).join(", ") || "non specificati"}

PROMPT ANALIZZATI (${body.scannedPrompts.length}):
${body.scannedPrompts.map((p, i) => `${i + 1}. "${p.text}" - Menzionato: ${p.mentioned} - Sentiment: ${p.sentiment}`).join("\n")}

Identifica i contenuti che il brand dovrebbe creare o migliorare per essere citato piu' spesso e meglio dagli LLM.

Per ogni gap, specifica:
- topic: argomento mancante
- description: cosa manca e perche' e' importante
- contentType: tipo di contenuto consigliato (pagina, sezione, faq, case-study, guida, blog)
- priority: alta/media/bassa
- estimatedImpact: impatto stimato 0-100
- relatedPrompts: indici dei prompt correlati (1-based)

Rispondi ESCLUSIVAMENTE con JSON valido:
{
  "gaps": [
    {"topic": "<topic>", "description": "<desc>", "contentType": "<tipo>", "priority": "<alta|media|bassa>", "estimatedImpact": <0-100>, "relatedPrompts": [<indici>]}
  ],
  "overallCoverage": <0-100>,
  "suggestions": ["<suggerimento concreto>"]
}`,
      }],
    });

    const text = analysis.content.find((b) => b.type === "text")?.text || "{}";
    let parsed: { gaps: ContentGapsResult["gaps"]; overallCoverage: number; suggestions: string[] };
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch {
      return Response.json({ error: "Errore nel parsing dell'analisi" }, { status: 500 });
    }

    // Map relatedPrompts indices to prompt texts
    const gaps = (parsed.gaps || []).map((g) => ({
      ...g,
      relatedPrompts: (g.relatedPrompts || []).map((idx) => {
        const p = body.scannedPrompts[Number(idx) - 1];
        return p ? p.text : String(idx);
      }),
    }));

    const result: ContentGapsResult = {
      id: crypto.randomUUID(),
      scannedAt: new Date().toISOString(),
      gaps,
      overallCoverage: parsed.overallCoverage ?? 0,
      suggestions: parsed.suggestions || [],
    };

    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Errore" }, { status: 500 });
  }
}
