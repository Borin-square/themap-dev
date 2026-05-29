import Anthropic from "@anthropic-ai/sdk";
import type { SourceAcquisitionResult } from "@/lib/geo/types";

export const maxDuration = 60;

interface SourceRequest {
  brandName: string;
  siteUrl: string;
  services: string[];
  competitors: string[];
  industry: string;
  country: string;
  market: string;
  existingCitations: { domain: string; type: string; brandMentioned: boolean }[];
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SourceRequest;
    if (!body.brandName?.trim()) {
      return Response.json({ error: "Brand name richiesto." }, { status: 400 });
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const analysis = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [{
        role: "user",
        content: `Identifica le fonti esterne dove il brand "${body.brandName}" dovrebbe essere presente per essere citato dagli LLM.

BRAND: ${body.brandName}
SITO: ${body.siteUrl || "non specificato"}
SERVIZI: ${body.services.join(", ") || "non specificati"}
COMPETITOR: ${body.competitors.join(", ") || "non specificati"}
SETTORE: ${body.industry || "non specificato"}
PAESE: ${body.country || "Italia"}
MERCATO: ${body.market || "B2B"}

CITAZIONI GIA' TROVATE (${body.existingCitations.length}):
${body.existingCitations.map((c) => `- ${c.domain} (${c.type}) - Brand menzionato: ${c.brandMentioned}`).join("\n") || "Nessuna"}

Suggerisci fonti concrete dove il brand dovrebbe essere presente (directory, media, blog, marketplace, review, social, forum).

Per ogni target:
- domain: dominio/piattaforma
- type: owned|competitor|directory|media|blog|marketplace|forum|review|social|other
- currentStatus: non-presente|presente-debole|presente-forte
- actionRequired: azione specifica da compiere
- priority: alta/media/bassa
- difficulty: difficolta' 0-100

Rispondi ESCLUSIVAMENTE con JSON valido:
{
  "targets": [
    {"domain": "<dominio>", "type": "<tipo>", "currentStatus": "<stato>", "actionRequired": "<azione>", "priority": "<alta|media|bassa>", "difficulty": <0-100>}
  ],
  "currentCoverage": <0-100>,
  "suggestions": ["<suggerimento>"]
}`,
      }],
    });

    const text = analysis.content.find((b) => b.type === "text")?.text || "{}";
    let parsed: { targets: SourceAcquisitionResult["targets"]; currentCoverage: number; suggestions: string[] };
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch {
      return Response.json({ error: "Errore nel parsing dell'analisi" }, { status: 500 });
    }

    const result: SourceAcquisitionResult = {
      id: crypto.randomUUID(),
      scannedAt: new Date().toISOString(),
      targets: parsed.targets || [],
      currentCoverage: parsed.currentCoverage ?? 0,
      suggestions: parsed.suggestions || [],
    };

    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Errore" }, { status: 500 });
  }
}
