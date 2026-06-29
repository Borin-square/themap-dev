import Anthropic from "@anthropic-ai/sdk";
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

// Analisi: Haiku 4.5 + fallback OpenAI per essere resilienti agli overload di Sonnet
const ANALYSIS_MODEL = "claude-haiku-4-5";
const ANALYSIS_TIMEOUT_MS = 90_000;
const analysisAnthropicClient = () =>
  new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    timeout: ANALYSIS_TIMEOUT_MS,
    maxRetries: 2,
  });

function isRetryableErr(msg: string): boolean {
  return /\b(500|502|503|504|529)\b|overload|UNAVAILABLE|high demand|temporar|api_error|internal server/i.test(msg);
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3, initialDelayMs = 1500): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (i === attempts - 1 || !isRetryableErr(msg)) throw err;
      const delay = initialDelayMs * Math.pow(2, i);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

async function askLLM(llm: string, query: string): Promise<{ text: string; error?: string }> {
  try {
    if (llm === "Claude") {
      const r = await withRetry(() =>
        getAnthropicClient().messages.create({
          model: CLAUDE_MODEL,
          max_tokens: DEFAULT_MAX_TOKENS,
          temperature: 0.7,
          tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
          messages: [{ role: "user", content: query }],
        }),
      );
      return { text: joinAnthropicText(r.content) };
    }
    if (llm === "ChatGPT") {
      const r = await withRetry(() =>
        getOpenAIClient().responses.create({
          model: OPENAI_MODEL,
          tools: [{ type: "web_search" }],
          reasoning: { effort: "medium" },
          input: query,
        }),
      );
      const msg = r.output.find((b) => b.type === "message");
      if (msg && "content" in msg) {
        const text = msg.content.find((c: { type: string }) => c.type === "output_text");
        return { text: text && "text" in text ? (text as { text: string }).text : "" };
      }
      return { text: "" };
    }
    if (llm === "Gemini") {
      const ai = getGeminiClient();
      const r = await withRetry(() =>
        ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: query,
          config: {
            tools: [{ googleSearch: {} }],
            abortSignal: timeoutSignal(),
          },
        }),
      );
      return { text: r.text ?? "" };
    }
    return { text: "", error: `LLM "${llm}" non implementato.` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[scan/askLLM] ${llm} failed:`, msg);
    return { text: "", error: humanizeLLMError(llm, msg) };
  }
}

function humanizeLLMError(llm: string, raw: string): string {
  if (/429|RESOURCE_EXHAUSTED|rate.?limit|quota/i.test(raw)) {
    const retryMatch = raw.match(/retry in ([\d.]+)s/i) || raw.match(/"retryDelay":\s*"(\d+)s"/);
    const retryHint = retryMatch ? ` Riprova tra ${Math.ceil(Number(retryMatch[1]))}s` : "";
    const upgradeHint = llm === "Gemini" ? " (free tier 20 req/giorno — passa al piano paid su https://ai.google.dev/pricing)" : "";
    return `Quota ${llm} esaurita.${retryHint} Usa un altro LLM nel frattempo.${upgradeHint}`;
  }
  if (/529|overload/i.test(raw)) {
    return `${llm} sovraccarico (529). Riprova fra qualche minuto o usa un altro LLM.`;
  }
  if (/503|UNAVAILABLE|high demand/i.test(raw)) {
    return `${llm} in overload (503). Riprova fra qualche minuto o usa un altro LLM.`;
  }
  if (/500|api_error|internal server/i.test(raw)) {
    return `${llm} errore interno (500). Riprova fra qualche minuto.`;
  }
  if (/401|invalid.?api.?key|unauthorized/i.test(raw)) {
    return `${llm}: API key non valida o scaduta.`;
  }
  if (/404|not.?found|model/i.test(raw) && /model/i.test(raw)) {
    return `${llm}: modello non trovato o non accessibile con questa API key.`;
  }
  return raw;
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

    // Analisi: Anthropic Haiku con retry, fallback OpenAI se Anthropic giu'
    let analysisText = "";
    try {
      const analysis = await withRetry(() =>
        analysisAnthropicClient().messages.create({
          model: ANALYSIS_MODEL,
          max_tokens: DEFAULT_MAX_TOKENS,
          temperature: 0,
          system: "Rispondi ESCLUSIVAMENTE con un JSON valido, senza testo prima o dopo, senza code fences.",
          messages: [{ role: "user", content: analysisPrompt }],
        }),
      );
      analysisText = joinAnthropicText(analysis.content);
    } catch (anaErr) {
      const msg = anaErr instanceof Error ? anaErr.message : String(anaErr);
      console.error("[scan/analysis] Anthropic failed, trying OpenAI:", msg);
      if (!process.env.OPENAI_API_KEY) {
        return Response.json({ error: `Analisi fallita: ${humanizeLLMError("Claude", msg)}` }, { status: 502 });
      }
      try {
        const r = await withRetry(() =>
          getOpenAIClient().chat.completions.create({
            model: "gpt-5.4-mini",
            temperature: 0,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: "Rispondi ESCLUSIVAMENTE con un JSON valido, senza testo prima o dopo." },
              { role: "user", content: analysisPrompt },
            ],
          }),
        );
        analysisText = r.choices[0]?.message?.content ?? "";
      } catch (oaErr) {
        const omsg = oaErr instanceof Error ? oaErr.message : String(oaErr);
        return Response.json({
          error: `Analisi fallita su Claude (${humanizeLLMError("Claude", msg)}) e OpenAI fallback (${humanizeLLMError("OpenAI", omsg)}).`,
        }, { status: 502 });
      }
    }

    const parsed = extractJson<ParsedScan>(analysisText);

    if (!parsed) {
      return Response.json(
        { error: "Errore nel parsing della risposta.", raw: analysisText.slice(0, 500) },
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
