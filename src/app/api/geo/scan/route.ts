import type { GEOScan, GEOSentimentData, GEOCompetitorMention, GEOCitation, GEOSentimentLabel, GEOSourceType } from "@/lib/geo/types";
import {
  CLAUDE_MODEL,
  GEMINI_MODEL,
  OPENAI_MODEL,
  DEFAULT_MAX_TOKENS,
  extractJson,
  getAnthropicClient,
  getGeminiClient,
  getOpenAIClient,
  joinAnthropicText,
  timeoutSignal,
} from "@/lib/geo/llm-helpers";
import { buildScanAnalysisPrompt } from "@/lib/geo/prompts/scan";

export const maxDuration = 120;

async function askLLM(llm: string, query: string): Promise<{ text: string; error?: string }> {
  try {
    if (llm === "Claude") {
      const r = await getAnthropicClient().messages.create({
        model: CLAUDE_MODEL,
        max_tokens: DEFAULT_MAX_TOKENS,
        temperature: 0.7,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
        messages: [{ role: "user", content: query }],
      });
      return { text: joinAnthropicText(r.content) };
    }
    if (llm === "ChatGPT") {
      const r = await getOpenAIClient().responses.create({
        model: OPENAI_MODEL,
        tools: [{ type: "web_search_preview" }],
        input: query,
      });
      const msg = r.output.find((b) => b.type === "message");
      if (msg && "content" in msg) {
        const text = msg.content.find((c: { type: string }) => c.type === "output_text");
        return { text: text && "text" in text ? (text as { text: string }).text : "" };
      }
      return { text: "" };
    }
    if (llm === "Gemini") {
      const ai = getGeminiClient();
      const r = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: query,
        config: {
          tools: [{ googleSearch: {} }],
          abortSignal: timeoutSignal(),
        },
      });
      return { text: r.text ?? "" };
    }
    return { text: "", error: `LLM "${llm}" non implementato.` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[scan/askLLM] ${llm} failed:`, msg);
    return { text: "", error: msg };
  }
}

interface ScanRequest {
  prompt: string;
  llm: string;
  brandName: string;
  competitors: string[];
  siteUrl?: string;
}

interface ParsedScan {
  brandMentioned: boolean;
  brandPosition?: number | null;
  brandContext?: string | null;
  brandAttributes: string[];
  sentiment: GEOSentimentData;
  competitorMentions: GEOCompetitorMention[];
  citations: GEOCitation[];
  confidence: "low" | "medium" | "high";
  reasoning: string;
}

export async function POST(req: Request) {
  try {
    const { prompt, llm, brandName, competitors, siteUrl } = (await req.json()) as ScanRequest;

    if (!brandName?.trim()) {
      return Response.json({ error: "Brand name richiesto." }, { status: 400 });
    }
    if (!prompt?.trim()) {
      return Response.json({ error: "Prompt richiesto." }, { status: 400 });
    }
    if (llm === "ChatGPT" && !process.env.OPENAI_API_KEY) {
      return Response.json({ error: "OPENAI_API_KEY non configurata." }, { status: 400 });
    }
    if (llm === "Claude" && !process.env.ANTHROPIC_API_KEY) {
      return Response.json({ error: "ANTHROPIC_API_KEY non configurata." }, { status: 400 });
    }
    if (llm === "Gemini" && !process.env.GEMINI_API_KEY) {
      return Response.json({ error: "GEMINI_API_KEY non configurata." }, { status: 400 });
    }

    const askResult = await askLLM(llm, prompt);

    if (!askResult.text) {
      return Response.json(
        { error: askResult.error ? `${llm}: ${askResult.error}` : `LLM "${llm}" ha restituito una risposta vuota.` },
        { status: 400 },
      );
    }

    const rawResponse = askResult.text;
    const analysisPrompt = buildScanAnalysisPrompt({
      llm, prompt, brandName, siteUrl, competitors, rawResponse,
    });

    const analysis = await getAnthropicClient().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: DEFAULT_MAX_TOKENS,
      temperature: 0,
      system: "Rispondi ESCLUSIVAMENTE con un JSON valido, senza testo prima o dopo, senza code fences.",
      messages: [{ role: "user", content: analysisPrompt }],
    });

    const analysisText = joinAnthropicText(analysis.content);
    const parsed = extractJson<ParsedScan>(analysisText);

    if (!parsed) {
      return Response.json(
        { error: "Errore nel parsing della risposta.", raw: analysisText },
        { status: 500 },
      );
    }

    const result: GEOScan = {
      id: crypto.randomUUID(),
      llm,
      scannedAt: new Date().toISOString(),
      rawResponse,
      brandMentioned: parsed.brandMentioned,
      brandPosition: parsed.brandPosition ?? undefined,
      brandContext: parsed.brandContext ?? undefined,
      brandAttributes: parsed.brandAttributes || [],
      sentiment: {
        score: parsed.sentiment?.score ?? 0,
        label: (parsed.sentiment?.label as GEOSentimentLabel) || "neutro",
        phrases: parsed.sentiment?.phrases || [],
        strengths: parsed.sentiment?.strengths || [],
        weaknesses: parsed.sentiment?.weaknesses || [],
        alignmentScore: parsed.sentiment?.alignmentScore ?? 0,
      },
      competitorMentions: (parsed.competitorMentions || []).map((c) => ({
        name: c.name,
        position: c.position ?? undefined,
        attributes: c.attributes || [],
        sentiment: (c.sentiment as GEOSentimentLabel) || "neutro",
        strengths: c.strengths || [],
        weaknesses: c.weaknesses || [],
      })),
      citations: (parsed.citations || []).map((c) => ({
        url: c.url,
        title: c.title,
        domain: c.domain,
        type: (c.type as GEOSourceType) || "other",
        brandMentioned: c.brandMentioned ?? false,
        competitorMentioned: c.competitorMentioned ?? undefined,
        authority: c.authority || "low",
        controllable: c.controllable ?? false,
      })),
      confidence: parsed.confidence || "low",
      reasoning: parsed.reasoning || "",
    };

    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto";
    return Response.json({ error: message }, { status: 500 });
  }
}
