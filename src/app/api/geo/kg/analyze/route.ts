import Anthropic from "@anthropic-ai/sdk";
import type { KGAnalysis, KGExtractedBlock } from "@/lib/geo/types";
import { DEFAULT_MAX_TOKENS, extractJson, joinAnthropicText } from "@/lib/geo/llm-helpers";
import { buildKGAnalyzePrompt } from "@/lib/geo/prompts/kg-analyze";

export const maxDuration = 300;

// Haiku 4.5 e' ~3x piu' rapido di Sonnet su questo task (analisi schema strutturato).
const KG_ANALYZE_MODEL = "claude-haiku-4-5";
const KG_TIMEOUT_MS = 280_000;

interface AnalyzeRequest {
  url: string;
  blocks: KGExtractedBlock[];
  brandName?: string;
  siteUrl?: string;
  industry?: string;
  services?: string[];
  country?: string;
  competitors?: string[];
}

type ParsedAnalysis = Omit<KGAnalysis, "analyzedAt">;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as AnalyzeRequest;
    const { url, blocks } = body;

    if (!url?.trim()) {
      return Response.json({ error: "URL richiesto." }, { status: 400 });
    }
    if (!Array.isArray(blocks)) {
      return Response.json({ error: "Blocchi mancanti." }, { status: 400 });
    }

    const prompt = buildKGAnalyzePrompt({
      url,
      brandName: body.brandName ?? "",
      siteUrl: body.siteUrl ?? "",
      industry: body.industry ?? "",
      services: body.services ?? [],
      country: body.country ?? "",
      competitors: body.competitors ?? [],
      blocks: blocks.map((b) => ({ index: b.index, schemaType: b.schemaType, parsed: b.parsed })),
    });

    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      timeout: KG_TIMEOUT_MS,
      maxRetries: 1,
    });

    const res = await client.messages.create({
      model: KG_ANALYZE_MODEL,
      max_tokens: DEFAULT_MAX_TOKENS * 2,
      temperature: 0,
      system: "Rispondi ESCLUSIVAMENTE con un JSON valido, senza testo prima o dopo, senza code fences.",
      messages: [{ role: "user", content: prompt }],
    });

    const text = joinAnthropicText(res.content);
    const parsed = extractJson<ParsedAnalysis>(text);

    if (!parsed) {
      return Response.json({ error: "Errore nel parsing dell'analisi.", raw: text.slice(0, 500) }, { status: 500 });
    }

    const result: KGAnalysis = {
      schemas: parsed.schemas || [],
      newSchemas: parsed.newSchemas || [],
      overallNotes: parsed.overallNotes || "",
      analyzedAt: new Date().toISOString(),
    };

    return Response.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Errore sconosciuto";
    console.error("[kg/analyze] failed:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
