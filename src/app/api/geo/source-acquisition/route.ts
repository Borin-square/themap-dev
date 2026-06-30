import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import type { SourceAcquisitionResult } from "@/lib/geo/types";

export const maxDuration = 120;

/* ── LLM clients (same pattern as scan route) ── */

function getAnthropicClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}
function getOpenAIClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}
function getGeminiClient() {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
}

async function askLLM(llm: string, query: string): Promise<string> {
  try {
    if (llm === "Claude") {
      const r = await getAnthropicClient().messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        messages: [{ role: "user", content: query }],
      });
      const text = r.content.find((b) => b.type === "text");
      return text ? text.text : "";
    }
    if (llm === "ChatGPT") {
      const r = await getOpenAIClient().responses.create({
        model: "gpt-4o",
        tools: [{ type: "web_search_preview" }],
        input: query,
      });
      const msg = r.output.find((b) => b.type === "message");
      if (msg && "content" in msg) {
        const text = msg.content.find((c: { type: string }) => c.type === "output_text");
        return text && "text" in text ? (text as { text: string }).text : "";
      }
      return "";
    }
    if (llm === "Gemini") {
      const ai = getGeminiClient();
      const r = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: query,
        config: { tools: [{ googleSearch: {} }] },
      });
      return r.text ?? "";
    }
    return "";
  } catch {
    return "";
  }
}

/* ── Request type ── */

interface SourceRequest {
  brandName: string;
  siteUrl: string;
  services: string[];
  competitors: string[];
  industry: string;
  country: string;
  market: string;
  existingCitations: { domain: string; type: string; brandMentioned: boolean }[];
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SourceRequest;
    if (!body.brandName?.trim()) {
      return Response.json({ error: "Brand name richiesto." }, { status: 400 });
    }

    // Step 1: Determine available LLMs
    const availableLLMs: string[] = [];
    if (process.env.OPENAI_API_KEY) availableLLMs.push("ChatGPT");
    if (process.env.ANTHROPIC_API_KEY) availableLLMs.push("Claude");
    if (process.env.GEMINI_API_KEY) availableLLMs.push("Gemini");

    if (availableLLMs.length === 0) {
      return Response.json({ error: "Nessuna API key LLM configurata." }, { status: 400 });
    }

    // Step 2: Build discovery prompt — designed to surface real sources
    const servicesStr = body.services.join(", ") || "servizi non specificati";
    const competitorsStr = body.competitors.length > 0 ? body.competitors.join(", ") : "non specificati";

    const discoveryPrompt = `Sto cercando un fornitore di ${servicesStr} per il mercato ${body.market} in ${body.country} (settore: ${body.industry}).

Ho trovato "${body.brandName}"${body.siteUrl ? ` (${body.siteUrl})` : ""}.

1. Conosci "${body.brandName}"? Cosa sai di questa azienda? È presente su directory, piattaforme di recensioni, marketplace o media di settore?
2. Quali piattaforme, directory, siti di review e media specializzati dovrei consultare per verificare la credibilità di un fornitore come questo nel settore ${body.industry} in ${body.country}?
3. I competitor di riferimento sono: ${competitorsStr}. Dove sono presenti online questi competitor?
4. Quali blog, forum, community e testate di settore sono i riferimenti principali per ${body.industry} in ${body.country}?

Rispondi in modo dettagliato. Cita piattaforme specifiche con i loro domini/URL. Per ogni piattaforma indica se "${body.brandName}" è presente o meno, se lo sai.`;

    // Step 3: Query all LLMs in parallel
    const discoveryResults = await Promise.all(
      availableLLMs.map(async (llm) => {
        const response = await askLLM(llm, discoveryPrompt);
        return { llm, response };
      }),
    );

    const validResults = discoveryResults.filter((r) => r.response.length > 0);
    if (validResults.length === 0) {
      return Response.json({ error: "Nessun LLM ha restituito risultati." }, { status: 500 });
    }

    // Step 4: Synthesize everything with Claude
    const existingCitationsBlock = body.existingCitations.length > 0
      ? body.existingCitations.map((c) => `- ${c.domain} (${c.type}) — brand menzionato: ${c.brandMentioned ? "sì" : "no"}`).join("\n")
      : "Nessuna";

    const llmResponsesBlock = validResults
      .map((r) => `=== ${r.llm} ===\n${r.response}`)
      .join("\n\n");

    const synthesisPrompt = `Sei un analista GEO (Generative Engine Optimization). Analizza le risposte di ${validResults.length} LLM diversi per creare un report diagnostico sulle fonti dove il brand "${body.brandName}" dovrebbe essere presente per massimizzare la visibilità nelle risposte AI.

CONTESTO:
- Brand: ${body.brandName}
- Sito: ${body.siteUrl || "non specificato"}
- Servizi: ${servicesStr}
- Settore: ${body.industry}
- Paese: ${body.country}
- Mercato: ${body.market}
- Competitor: ${competitorsStr}

FONTI GIÀ TROVATE NELLE SCANSIONI PRECEDENTI DEL PROMPT MONITOR (${body.existingCitations.length}):
${existingCitationsBlock}

RISPOSTE RACCOLTE DAGLI LLM:
${llmResponsesBlock}

ISTRUZIONI:
Estrai TUTTE le fonti/piattaforme/siti menzionati dalle risposte degli LLM e dalle citazioni esistenti.
Per ciascuna fonte determina:
- Se è effettivamente citata da uno o più LLM (citedBy)
- Se qualche LLM ha confermato che il brand è presente su quella fonte (brandFoundBy)
- Lo stato reale della presenza del brand BASATO SOLO sulle evidenze degli LLM
- Un'azione concreta e specifica

REGOLE CRITICHE:
- citedBy: SOLO gli LLM che hanno EFFETTIVAMENTE menzionato quella fonte nella loro risposta
- brandFoundBy: SOLO gli LLM che hanno CONFERMATO la presenza del brand. Se un LLM dice "non risulta presente" o non menziona il brand su quella fonte, NON includerlo
- currentStatus: "presente-forte" solo se almeno 1 LLM conferma presenza attiva; "presente-debole" se menzionata ma con dubbi; "non-presente" se nessun LLM conferma o se dichiarano assenza
- priority: "alta" se citata da 2+ LLM o se è strategica per il settore; "media" se citata da 1 LLM; "bassa" se marginale
- evidence: sintetizza cosa hanno detto gli LLM su questa fonte (max 1-2 frasi), citando quale LLM ha detto cosa
- NON inventare fonti che non appaiono nelle risposte degli LLM o nelle citazioni esistenti
- Includi le fonti dalle citazioni degli scan precedenti anche se non menzionate dagli LLM (con citedBy vuoto, nota in evidence "Fonte emersa dagli scan precedenti")

Rispondi ESCLUSIVAMENTE con JSON valido:
{
  "targets": [
    {
      "domain": "<dominio>",
      "type": "owned|competitor|directory|media|blog|marketplace|forum|review|social|other",
      "currentStatus": "non-presente|presente-debole|presente-forte",
      "actionRequired": "<azione specifica>",
      "priority": "alta|media|bassa",
      "difficulty": <0-100>,
      "citedBy": ["<nome LLM>"],
      "brandFoundBy": ["<nome LLM>"],
      "evidence": "<sintesi evidenze>"
    }
  ],
  "currentCoverage": <0-100, basata sul rapporto tra fonti con presenza confermata e fonti totali>,
  "suggestions": ["<suggerimento strategico basato sui dati raccolti>"]
}`;

    const synthesis = await getAnthropicClient().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [{ role: "user", content: synthesisPrompt }],
    });

    const text = synthesis.content.find((b) => b.type === "text")?.text || "{}";
    let parsed: {
      targets: SourceAcquisitionResult["targets"];
      currentCoverage: number;
      suggestions: string[];
    };
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch {
      return Response.json({ error: "Errore nel parsing dell'analisi." }, { status: 500 });
    }

    // Ensure new fields have defaults for safety
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
