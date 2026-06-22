import type { GEOConfig, GEOPrompt, GEOIntent, GEOFunnel } from "@/lib/geo/types";
import { CLAUDE_MODEL, DEFAULT_MAX_TOKENS, extractJson, getAnthropicClient, joinAnthropicText } from "@/lib/geo/llm-helpers";
import { buildGeneratePromptsPrompt } from "@/lib/geo/prompts/generate-prompts";

export const maxDuration = 120;

interface GenerateRequest {
  config: GEOConfig;
  count?: number;
  focusIntent?: string;
  focusFunnel?: string;
}

interface ParsedPrompts {
  prompts: Array<{
    text: string;
    intent: string;
    funnelStage: string;
    buyerPersona: string;
    commercialValue: number;
    contentSuggestion?: string;
  }>;
}

export async function POST(req: Request) {
  try {
    const { config, count = 10, focusIntent, focusFunnel } = (await req.json()) as GenerateRequest;

    if (!config.brandName?.trim()) {
      return Response.json({ error: "Brand name richiesto." }, { status: 400 });
    }

    const prompt = buildGeneratePromptsPrompt({ config, count, focusIntent, focusFunnel });

    const response = await getAnthropicClient().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: DEFAULT_MAX_TOKENS,
      temperature: 0.9,
      system: "Rispondi ESCLUSIVAMENTE con un JSON valido, senza testo prima o dopo, senza code fences.",
      messages: [{ role: "user", content: prompt }],
    });

    const text = joinAnthropicText(response.content);
    const parsed = extractJson<ParsedPrompts>(text);

    if (!parsed) {
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
