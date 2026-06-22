import type { DigitalPRResult } from "@/lib/geo/types";
import { CLAUDE_MODEL, DEFAULT_MAX_TOKENS, extractJson, getAnthropicClient, joinAnthropicText } from "@/lib/geo/llm-helpers";
import { buildDigitalPRPrompt } from "@/lib/geo/prompts/digital-pr";

export const maxDuration = 60;

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

interface ParsedPR {
  targets: DigitalPRResult["targets"];
  summary: string;
  suggestions: string[];
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as PRRequest;
    if (!body.brandName?.trim()) {
      return Response.json({ error: "Brand name richiesto." }, { status: 400 });
    }

    const analysisPrompt = buildDigitalPRPrompt(body);

    const analysis = await getAnthropicClient().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: DEFAULT_MAX_TOKENS,
      temperature: 0.3,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
      system: "Rispondi ESCLUSIVAMENTE con un JSON valido, senza testo prima o dopo, senza code fences.",
      messages: [{ role: "user", content: analysisPrompt }],
    });

    const text = joinAnthropicText(analysis.content);
    const parsed = extractJson<ParsedPR>(text);

    if (!parsed) {
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
