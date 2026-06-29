import Anthropic from "@anthropic-ai/sdk";
import type { DigitalPRResult } from "@/lib/geo/types";

export const maxDuration = 120;

interface PRRequest {
  brandName: string;
  siteUrl: string;
  services: string[];
  competitors: string[];
  industry: string;
  country: string;
  market: string;
  problems: string[];
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as PRRequest;
    if (!body.brandName?.trim()) {
      return Response.json({ error: "Brand name richiesto." }, { status: 400 });
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const analysis = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [{
        role: "user",
        content: `Sei un esperto di Digital PR e link building. Identifica i siti piu' rilevanti dove il brand "${body.brandName}" dovrebbe ottenere visibilita', menzioni e backlink per migliorare la sua authority e la citabilita' da parte degli LLM.

BRAND: ${body.brandName}
SITO: ${body.siteUrl || "non specificato"}
SERVIZI: ${body.services.join(", ") || "non specificati"}
COMPETITOR: ${body.competitors.join(", ") || "non specificati"}
SETTORE: ${body.industry || "non specificato"}
PAESE: ${body.country || "Italia"}
MERCATO: ${body.market || "B2B"}
PROBLEMI TARGET: ${body.problems.join(", ") || "non specificati"}

Suggerisci 15-25 siti concreti e reali, suddivisi tra:
- Testate di settore e media specializzati
- Blog autorevoli nel settore
- Podcast rilevanti
- Directory verticali e portali di nicchia
- Associazioni di categoria
- Newsletter di settore
- Portali generalisti ma con sezioni rilevanti

Per OGNI sito indica:
- name: nome del sito/testata
- url: URL reale del sito
- type: testata|blog|podcast|directory|associazione|portale|newsletter|altro
- relevance: rilevanza per il brand 0-100
- difficulty: difficolta' di accesso 0-100 (0=facile, 100=molto difficile)
- contentType: tipo di contenuto da proporre (guest-post|intervista|comunicato|case-study|listing|menzione|partnership)
- approach: come approcciare concretamente (chi contattare, che proporre, che angolo usare)
- why: perche' questo sito e' strategico per il brand

Ordina per rilevanza decrescente.

Rispondi ESCLUSIVAMENTE con JSON valido:
{
  "targets": [
    {"name": "<nome>", "url": "<url>", "type": "<tipo>", "relevance": <0-100>, "difficulty": <0-100>, "contentType": "<tipo>", "approach": "<come approcciare>", "why": "<perche' e' strategico>"}
  ],
  "summary": "<riassunto strategia digital PR in 2-3 frasi>",
  "suggestions": ["<suggerimento tattico>"]
}`,
      }],
    });

    const text = analysis.content.find((b) => b.type === "text")?.text || "{}";
    let parsed: { targets: DigitalPRResult["targets"]; summary: string; suggestions: string[] };
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch {
      return Response.json({ error: "Errore nel parsing dell'analisi" }, { status: 500 });
    }

    const result: DigitalPRResult = {
      id: crypto.randomUUID(),
      scannedAt: new Date().toISOString(),
      targets: parsed.targets || [],
      summary: parsed.summary || "",
      suggestions: parsed.suggestions || [],
    };

    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Errore" }, { status: 500 });
  }
}
