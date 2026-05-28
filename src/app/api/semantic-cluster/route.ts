import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { type SemanticCluster, type SCConfig, generateQueries } from "@/lib/semantic-cluster";

export const maxDuration = 120;

function getAnthropicClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

function getOpenAIClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

/** Send a single query and get a text response, regardless of LLM */
async function askLLM(llm: string, query: string): Promise<string> {
  try {
    if (llm === "Claude") {
      const r = await getAnthropicClient().messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: [{ role: "user", content: query }],
      });
      const text = r.content.find((b) => b.type === "text");
      return text ? text.text : "";
    }

    if (llm === "ChatGPT") {
      const r = await getOpenAIClient().chat.completions.create({
        model: "gpt-4o",
        max_tokens: 4096,
        messages: [{ role: "user", content: query }],
      });
      return r.choices[0]?.message?.content || "";
    }

    return "";
  } catch {
    return "";
  }
}

interface ScanRequest {
  cluster: SemanticCluster;
  config: SCConfig;
  llm: string;
}

interface ScanResult {
  mentioned: boolean;
  position?: number;
  confidence: "low" | "medium" | "high";
  reasoning: string;
  coMentions: string[];
  mentionRate: number;
  shortlistProb: number;
  queries: string[];
  rawResponses: string[];
}

export async function POST(req: Request) {
  try {
    const { cluster, config, llm } = (await req.json()) as ScanRequest;

    if (!config.brandName?.trim()) {
      return Response.json({ error: "Inserisci il nome del brand nella configurazione." }, { status: 400 });
    }

    if (llm === "ChatGPT" && !process.env.OPENAI_API_KEY) {
      return Response.json({ error: "OPENAI_API_KEY non configurata." }, { status: 400 });
    }

    const queries = generateQueries(cluster, config, 20);
    const brand = config.brandName.trim();

    // Phase 1: Send all queries to the selected LLM
    const allResponses: string[] = [];
    const BATCH = 5;

    for (let i = 0; i < queries.length; i += BATCH) {
      const batch = queries.slice(i, i + BATCH);
      const results = await Promise.all(batch.map((q) => askLLM(llm, q)));
      allResponses.push(...results);
    }

    // Phase 2: Analyze all responses with Claude (always the analyzer)
    const analysisPrompt = `Analizza le seguenti ${allResponses.length} risposte date da ${llm} a query di raccomandazione.

BRAND DA CERCARE: "${brand}"

Per ogni risposta, verifica se il brand "${brand}" viene menzionato (anche con varianti del nome, abbreviazioni o riferimenti chiari).

RISPOSTE:
${allResponses.map((r, i) => `--- Risposta ${i + 1} (Query: "${queries[i]}") ---\n${r}\n`).join("\n")}

Rispondi ESCLUSIVAMENTE con un JSON valido (nessun testo prima o dopo) con questa struttura:
{
  "mentionCount": <numero di risposte in cui il brand appare>,
  "totalResponses": ${allResponses.length},
  "positions": [<lista delle posizioni numeriche in cui appare nelle liste, es: [2, 4, 1]>],
  "coMentions": [<lista dei brand/aziende menzionati insieme al brand cercato, senza duplicati>],
  "confidence": "low" | "medium" | "high",
  "reasoning": "<spiegazione sintetica di come e in quali contesti il brand viene menzionato o perche' non lo e'>",
  "shortlisted": <numero di volte in cui il brand appare nelle prime 3 posizioni>
}`;

    const analysis = await getAnthropicClient().messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      messages: [{ role: "user", content: analysisPrompt }],
    });

    const analysisText = analysis.content.find((b) => b.type === "text")?.text || "{}";

    let parsed: {
      mentionCount: number;
      totalResponses: number;
      positions: number[];
      coMentions: string[];
      confidence: "low" | "medium" | "high";
      reasoning: string;
      shortlisted: number;
    };

    try {
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : analysisText);
    } catch {
      return Response.json({ error: "Errore nel parsing della risposta di analisi.", raw: analysisText }, { status: 500 });
    }

    const mentionRate = Math.round((parsed.mentionCount / parsed.totalResponses) * 100);
    const shortlistProb = Math.round((parsed.shortlisted / parsed.totalResponses) * 100);
    const avgPosition = parsed.positions.length > 0
      ? Math.round(parsed.positions.reduce((a, b) => a + b, 0) / parsed.positions.length)
      : undefined;

    const result: ScanResult = {
      mentioned: parsed.mentionCount > 0,
      position: avgPosition,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
      coMentions: parsed.coMentions,
      mentionRate,
      shortlistProb,
      queries,
      rawResponses: allResponses,
    };

    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto";
    return Response.json({ error: message }, { status: 500 });
  }
}
