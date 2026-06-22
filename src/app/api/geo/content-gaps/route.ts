import type { ContentGapsResult } from "@/lib/geo/types";
import { CLAUDE_MODEL, DEFAULT_MAX_TOKENS, extractJson, getAnthropicClient, joinAnthropicText } from "@/lib/geo/llm-helpers";
import { buildContentGapsPrompt } from "@/lib/geo/prompts/content-gaps";

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

interface ParsedGaps {
  gaps: ContentGapsResult["gaps"];
  overallCoverage: number;
  suggestions: string[];
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as GapsRequest;
    if (!body.brandName?.trim()) {
      return Response.json({ error: "Brand name richiesto." }, { status: 400 });
    }

    const analysisPrompt = buildContentGapsPrompt(body);

    const analysis = await getAnthropicClient().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: DEFAULT_MAX_TOKENS,
      temperature: 0,
      system: "Rispondi ESCLUSIVAMENTE con un JSON valido, senza testo prima o dopo, senza code fences.",
      messages: [{ role: "user", content: analysisPrompt }],
    });

    const text = joinAnthropicText(analysis.content);
    const parsed = extractJson<ParsedGaps>(text);

    if (!parsed) {
      return Response.json({ error: "Errore nel parsing dell'analisi" }, { status: 500 });
    }

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
