import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import type { GEOScan, GEOSentimentData, GEOCompetitorMention, GEOCitation, GEOSentimentLabel, GEOSourceType } from "@/lib/geo/types";

export const maxDuration = 120;

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
    // Perplexity, AI Overviews: placeholder
    return "";
  } catch {
    return "";
  }
}

interface ScanRequest {
  prompt: string;
  llm: string;
  brandName: string;
  competitors: string[];
  siteUrl?: string;
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

    // Phase 1: Send the prompt to the selected LLM
    const rawResponse = await askLLM(llm, prompt);

    if (!rawResponse) {
      return Response.json({
        error: `LLM "${llm}" non supportato o risposta vuota.`,
      }, { status: 400 });
    }

    // Phase 2: Analyze the response with Claude
    const analysisPrompt = `Analizza questa risposta data da ${llm} al prompt "${prompt}".

BRAND DA CERCARE: "${brandName}"
${siteUrl ? `SITO DEL BRAND: "${siteUrl}"` : ""}
COMPETITOR DA CERCARE: ${competitors.length > 0 ? competitors.join(", ") : "non specificati"}

RISPOSTA DA ANALIZZARE:
---
${rawResponse}
---

Rispondi ESCLUSIVAMENTE con un JSON valido (nessun testo prima o dopo):
{
  "brandMentioned": true/false,
  "brandPosition": <posizione numerica nella lista se presente, null se non in lista>,
  "brandContext": "<frase esatta in cui il brand viene menzionato, o null>",
  "brandAttributes": ["<aggettivi o attributi usati per descrivere il brand>"],
  "sentiment": {
    "score": <da -1.0 a 1.0>,
    "label": "negativo" | "neutro" | "positivo",
    "phrases": ["<frasi chiave sul brand>"],
    "strengths": ["<punti di forza citati>"],
    "weaknesses": ["<punti deboli citati>"],
    "alignmentScore": <0-100, quanto la descrizione e' coerente con un posizionamento premium>
  },
  "competitorMentions": [
    {
      "name": "<nome competitor>",
      "position": <posizione in lista o null>,
      "attributes": ["<attributi associati>"],
      "sentiment": "negativo" | "neutro" | "positivo",
      "strengths": ["<punti di forza>"],
      "weaknesses": ["<debolezze o spazi scoperti>"]
    }
  ],
  "citations": [
    {
      "url": "<URL citato>",
      "title": "<titolo della pagina se menzionato>",
      "domain": "<dominio>",
      "type": "owned" | "competitor" | "directory" | "media" | "blog" | "marketplace" | "forum" | "review" | "social" | "other",
      "brandMentioned": true/false,
      "competitorMentioned": "<nome competitor o null>",
      "authority": "low" | "medium" | "high",
      "controllable": true/false
    }
  ],
  "confidence": "low" | "medium" | "high",
  "reasoning": "<spiegazione sintetica dei risultati>"
}

Nota:
- Cerca il brand "${brandName}" anche con varianti del nome
- Per i competitor, cerca solo quelli nella lista fornita piu' eventuali altri menzionati
- Per le citazioni, estrai tutti gli URL o fonti menzionate nella risposta
- ${siteUrl ? `Il dominio "${(() => { try { return new URL(siteUrl).hostname; } catch { return siteUrl.replace(/^https?:\/\//, "").split("/")[0]; } })()}" e' "owned"` : ""}
- Se il brand non e' menzionato, brandContext e brandAttributes possono essere vuoti/null
- Sii accurato nel sentiment: positivo solo se ci sono elogi chiari`;

    const analysis = await getAnthropicClient().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [{ role: "user", content: analysisPrompt }],
    });

    const analysisText = analysis.content.find((b) => b.type === "text")?.text || "{}";

    let parsed: {
      brandMentioned: boolean;
      brandPosition?: number | null;
      brandContext?: string | null;
      brandAttributes: string[];
      sentiment: GEOSentimentData;
      competitorMentions: GEOCompetitorMention[];
      citations: GEOCitation[];
      confidence: "low" | "medium" | "high";
      reasoning: string;
    };

    try {
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : analysisText);
    } catch {
      return Response.json({ error: "Errore nel parsing della risposta.", raw: analysisText }, { status: 500 });
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
