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

async function askLLM(llm: string, query: string): Promise<{ text: string; error?: string }> {
  try {
    if (llm === "Claude") {
      const r = await getAnthropicClient().messages.create({
        model: CLAUDE_MODEL,
        max_tokens: DEFAULT_MAX_TOKENS,
        temperature: 0.4,
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
    console.error(`[source-acquisition/askLLM] ${llm} failed:`, msg);
    return { text: "", error: msg };
  }
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

    // Filtro user-side: se l'utente sceglie un sottoinsieme, rispettiamo
    const requested = body.llms?.filter((l) => availableLLMs.includes(l));
    const llmsToUse = requested && requested.length > 0 ? requested : availableLLMs;

    const discoveryPrompt = buildDiscoveryPrompt(body);

    const discoveryResults = await Promise.all(
      llmsToUse.map(async (llm) => {
        const { text, error } = await askLLM(llm, discoveryPrompt);
        return { llm, response: text, error };
      }),
    );

    const validResults = discoveryResults.filter((r) => r.response.length > 0);
    const failures = discoveryResults.filter((r) => r.response.length === 0);

    if (validResults.length === 0) {
      const detail = failures.map((f) => `${f.llm}: ${f.error || "vuoto"}`).join(" | ");
      return Response.json(
        { error: `Nessun LLM ha restituito risultati. ${detail}` },
        { status: 500 },
      );
    }

    const llmResponsesBlock = validResults
      .map((r) => `=== ${r.llm} ===\n${r.response}`)
      .join("\n\n");

    const synthesisPrompt = buildSynthesisPrompt({
      ...body,
      llmResponsesBlock,
      llmCount: validResults.length,
      existingCitations: body.existingCitations,
    });

    const synthesis = await getAnthropicClient().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: DEFAULT_MAX_TOKENS,
      temperature: 0,
      system: "Rispondi ESCLUSIVAMENTE con un JSON valido, senza testo prima o dopo, senza code fences.",
      messages: [{ role: "user", content: synthesisPrompt }],
    });

    const text = joinAnthropicText(synthesis.content);
    const parsed = extractJson<ParsedSynthesis>(text);

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
