import type { KGAnalysis, KGExtractedBlock } from "@/lib/geo/types";
import { CLAUDE_MODEL, DEFAULT_MAX_TOKENS, extractJson, getAnthropicClient, joinAnthropicText } from "@/lib/geo/llm-helpers";
import { buildKGAnalyzePrompt } from "@/lib/geo/prompts/kg-analyze";

export const maxDuration = 120;

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

    const res = await getAnthropicClient().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: DEFAULT_MAX_TOKENS * 2,
      temperature: 0,
      system: "Rispondi ESCLUSIVAMENTE con un JSON valido, senza testo prima o dopo, senza code fences.",
      messages: [{ role: "user", content: prompt }],
    });

    const text = joinAnthropicText(res.content);
    const parsed = extractJson<ParsedAnalysis>(text);

    if (!parsed) {
      return Response.json({ error: "Errore nel parsing dell'analisi.", raw: text }, { status: 500 });
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
    return Response.json({ error: msg }, { status: 500 });
  }
}
