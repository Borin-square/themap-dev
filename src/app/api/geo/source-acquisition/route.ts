import Anthropic from "@anthropic-ai/sdk";
import type { SourceAcquisitionResult } from "@/lib/geo/types";
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
import { buildDiscoveryPrompt, buildSynthesisPrompt } from "@/lib/geo/prompts/source-acquisition";

export const maxDuration = 300;

// Sintesi: Haiku 4.5 — piu' disponibile e veloce di Sonnet su task di JSON shaping
const SYNTH_MODEL = "claude-haiku-4-5";
const SYNTH_TIMEOUT_MS = 90_000;
const synthClient = () =>
  new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    timeout: SYNTH_TIMEOUT_MS,
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
      const delay = initialDelayMs * Math.pow(2, i); // 1.5s, 3s, 6s
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
          temperature: 0.4,
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
    console.error(`[source-acquisition/askLLM] ${llm} failed:`, msg);
    return { text: "", error: humanizeProviderErr(llm, msg) };
  }
}

function humanizeProviderErr(llm: string, raw: string): string {
  if (/529|overload/i.test(raw)) return `${llm} sovraccarico (529). Riprova fra qualche minuto.`;
  if (/503|UNAVAILABLE|high demand/i.test(raw)) return `${llm} in overload (503). Riprova fra qualche minuto.`;
  if (/500|api_error|internal server/i.test(raw)) return `${llm} errore interno (500). Riprova.`;
  if (/429|quota|rate.?limit/i.test(raw)) return `${llm} quota esaurita. Cambia LLM o aspetta il reset.`;
  if (/401|invalid.?api.?key|unauthorized/i.test(raw)) return `${llm} API key non valida.`;
  return raw.slice(0, 200);
}

interface SourceRequest {
  brandName: string;
  siteUrl: string;
  services: string[];
  competitors: string[];
  industry: string;
  country: string;
  market: string;
  existingCitations: { domain: string; type: string; brandMentioned: boolean }[];
  /** Filtra quali LLM usare per la discovery. Se omesso usa tutti quelli con API key. */
  llms?: string[];
}

interface ParsedSynthesis {
  targets: SourceAcquisitionResult["targets"];
  currentCoverage: number;
  suggestions: string[];
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SourceRequest;
    if (!body.brandName?.trim()) {
      return Response.json({ error: "Brand name richiesto." }, { status: 400 });
    }

    const availableLLMs: string[] = [];
    if (process.env.OPENAI_API_KEY) availableLLMs.push("ChatGPT");
    if (process.env.ANTHROPIC_API_KEY) availableLLMs.push("Claude");
    if (process.env.GEMINI_API_KEY) availableLLMs.push("Gemini");

    if (availableLLMs.length === 0) {
      return Response.json({ error: "Nessuna API key LLM configurata." }, { status: 400 });
    }

    // Filtro user-side + fallback chain: se l'LLM scelto fallisce, prova gli altri disponibili
    const requested = body.llms?.filter((l) => availableLLMs.includes(l)) ?? [];
    const primary = requested.length > 0 ? requested : availableLLMs;
    const fallbacks = availableLLMs.filter((l) => !primary.includes(l));
    const llmsToTry = [...primary, ...fallbacks];

    const discoveryPrompt = buildDiscoveryPrompt(body);

    // Prima passata: prova tutti i primary in parallelo
    const primaryResults = await Promise.all(
      primary.map(async (llm) => {
        const { text, error } = await askLLM(llm, discoveryPrompt);
        return { llm, response: text, error };
      }),
    );

    let validResults = primaryResults.filter((r) => r.response.length > 0);
    const failures = [...primaryResults.filter((r) => r.response.length === 0)];
    const fallbackTried: string[] = [];

    // Se nessun primary risponde, tenta i fallback uno alla volta (sequenziale per non sprecare quota)
    if (validResults.length === 0 && fallbacks.length > 0) {
      for (const llm of fallbacks) {
        fallbackTried.push(llm);
        const { text, error } = await askLLM(llm, discoveryPrompt);
        if (text.length > 0) {
          validResults = [{ llm, response: text, error: undefined }];
          break;
        }
        failures.push({ llm, response: "", error });
      }
    }

    if (validResults.length === 0) {
      const detail = failures.map((f) => `${f.llm}: ${f.error || "vuoto"}`).join(" | ");
      const triedSummary = `Tentativi: primary [${primary.join(", ")}]${fallbackTried.length > 0 ? `, fallback [${fallbackTried.join(", ")}]` : ""}.`;
      return Response.json(
        { error: `Nessun LLM ha restituito risultati. ${triedSummary} ${detail}` },
        { status: 503 },
      );
    }
    void llmsToTry; // tracking

    const llmResponsesBlock = validResults
      .map((r) => `=== ${r.llm} ===\n${r.response}`)
      .join("\n\n");

    const synthesisPrompt = buildSynthesisPrompt({
      ...body,
      llmResponsesBlock,
      llmCount: validResults.length,
      existingCitations: body.existingCitations,
    });

    // Synthesis: Anthropic Haiku con retry, fallback OpenAI se anche dopo retry e' giu'
    let synthesisText = "";
    let synthLLM: "Claude" | "OpenAI" = "Claude";
    try {
      const synthesis = await withRetry(() =>
        synthClient().messages.create({
          model: SYNTH_MODEL,
          max_tokens: DEFAULT_MAX_TOKENS,
          temperature: 0,
          system: "Rispondi ESCLUSIVAMENTE con un JSON valido, senza testo prima o dopo, senza code fences.",
          messages: [{ role: "user", content: synthesisPrompt }],
        }),
      );
      synthesisText = joinAnthropicText(synthesis.content);
    } catch (synthErr) {
      const msg = synthErr instanceof Error ? synthErr.message : String(synthErr);
      console.error("[source-acquisition/synth] Anthropic failed, trying OpenAI fallback:", msg);
      if (!process.env.OPENAI_API_KEY) {
        return Response.json({ error: `Synthesis fallita: ${humanizeProviderErr("Claude", msg)} (OpenAI fallback non configurato)` }, { status: 502 });
      }
      try {
        const r = await withRetry(() =>
          getOpenAIClient().chat.completions.create({
            model: "gpt-5.4-mini",
            temperature: 0,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: "Rispondi ESCLUSIVAMENTE con un JSON valido, senza testo prima o dopo." },
              { role: "user", content: synthesisPrompt },
            ],
          }),
        );
        synthesisText = r.choices[0]?.message?.content ?? "";
        synthLLM = "OpenAI";
      } catch (oaErr) {
        const omsg = oaErr instanceof Error ? oaErr.message : String(oaErr);
        return Response.json({ error: `Synthesis fallita su Claude (${humanizeProviderErr("Claude", msg)}) e OpenAI fallback (${humanizeProviderErr("OpenAI", omsg)}).` }, { status: 502 });
      }
    }

    const parsed = extractJson<ParsedSynthesis>(synthesisText);
    void synthLLM; // tracciato in console se serve debugging

    if (!parsed) {
      return Response.json({ error: "Errore nel parsing dell'analisi." }, { status: 500 });
    }

    const targets = (parsed.targets || []).map((t) => ({
      ...t,
      citedBy: t.citedBy || [],
      brandFoundBy: t.brandFoundBy || [],
      evidence: t.evidence || "",
    }));

    const result: SourceAcquisitionResult = {
      id: crypto.randomUUID(),
      scannedAt: new Date().toISOString(),
      targets,
      currentCoverage: parsed.currentCoverage ?? 0,
      suggestions: parsed.suggestions || [],
      llmsScanned: validResults.map((r) => r.llm),
      fromExistingScans: body.existingCitations.length,
    };

    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Errore" },
      { status: 500 },
    );
  }
}
