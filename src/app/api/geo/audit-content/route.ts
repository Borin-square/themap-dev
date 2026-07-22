import Anthropic from "@anthropic-ai/sdk";
import type { ContentReadinessResult, AuditIssue, GEOAuditLog } from "@/lib/geo/types";
import { fetchHtml } from "@/lib/geo/fetch-html";

const MODEL = "claude-sonnet-4-6";

export const maxDuration = 120;

interface ContentRequest {
  url: string;
  brandName?: string;
  industry?: string;
  services?: string[];
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  const steps: GEOAuditLog["steps"] = [];
  const fetches: NonNullable<GEOAuditLog["fetches"]> = [];
  const step = (label: string, detail?: string) =>
    steps.push({ label, timestamp: new Date().toISOString(), detail });

  try {
    const { url, brandName, industry, services } = (await req.json()) as ContentRequest;
    step("Richiesta ricevuta", `url=${url}`);
    if (!url?.trim()) {
      return Response.json({ error: "URL richiesto." }, { status: 400 });
    }

    step("Fetch HTML", url);
    const fetched = await fetchHtml(url);
    if (!fetched.ok) {
      fetches.push({ url, error: fetched.error });
      return Response.json({ error: fetched.error }, { status: 400 });
    }
    const html = fetched.html;
    fetches.push({ url, ok: true, contentSnippet: `HTML length: ${html.length}` });
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : url;

    // Extract text content (strip HTML tags, scripts, styles)
    const textContent = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 8000); // Limit for LLM context

    // Extract headings
    const headings = (html.match(/<h[1-6][^>]*>.*?<\/h[1-6]>/gi) || [])
      .map((h) => h.replace(/<[^>]+>/g, "").trim())
      .filter(Boolean)
      .slice(0, 30);

    // Check for FAQ schema or FAQ section
    const hasFaq = html.includes("FAQPage") || html.toLowerCase().includes("faq") ||
      html.toLowerCase().includes("domande frequenti");

    step("Contenuto estratto", `text=${textContent.length} char, headings=${headings.length}, faq=${hasFaq}`);

    // Analyze with Claude
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const prompt = `Analizza questa pagina web per capire se e' adatta a essere citata dagli LLM.

URL: ${url}
TITOLO: ${title}
${brandName ? `BRAND: ${brandName}` : ""}
${industry ? `SETTORE: ${industry}` : ""}
${services && services.length > 0 ? `SERVIZI: ${services.join(", ")}` : ""}

HEADINGS:
${headings.map((h, i) => `${i + 1}. ${h}`).join("\n")}

CONTENUTO (estratto):
${textContent}

Valuta CIASCUN criterio da 0 a 100:

1. CLARITY (chiarezza): il contenuto e' chiaro, diretto, senza ambiguita'?
2. COMPLETENESS (completezza): copre l'argomento in modo esaustivo?
3. STRUCTURE (struttura): ha heading logici, paragrafi ben organizzati, progressione chiara?
4. SPECIFICITY (specificita'): contiene informazioni specifiche, non generiche?
5. PROOF_PRESENCE (prove): ci sono dati, numeri, case study, esempi concreti, citazioni?
6. FAQ_PRESENCE (FAQ): ci sono domande e risposte, sezioni FAQ o Q&A?
7. DATA_PRESENCE (dati): ci sono statistiche, percentuali, metriche, tabelle?
8. EXTRACTABILITY (estraibilita'): un LLM potrebbe facilmente estrarre una risposta utile da questo contenuto?

Rispondi ESCLUSIVAMENTE con JSON valido:
{
  "scores": {
    "clarity": <0-100>,
    "completeness": <0-100>,
    "structure": <0-100>,
    "specificity": <0-100>,
    "proofPresence": <0-100>,
    "faqPresence": <0-100>,
    "dataPresence": <0-100>,
    "extractability": <0-100>
  },
  "missingBlocks": ["<blocchi di contenuto mancanti che renderebbero la pagina piu' citabile>"],
  "suggestions": ["<suggerimenti concreti per migliorare la citabilita'>"],
  "issues": [
    {
      "type": "critical" | "warning" | "info",
      "category": "<categoria>",
      "message": "<problema>",
      "fix": "<come risolverlo>"
    }
  ]
}`;

    step("Chiamata LLM", `model=${MODEL}, prompt=${prompt.length} char`);
    const analysis = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const text = analysis.content.find((b) => b.type === "text")?.text || "{}";
    step("Risposta LLM ricevuta", `stop_reason=${analysis.stop_reason}, output=${text.length} char`);
    let parsed: {
      scores: ContentReadinessResult["scores"];
      missingBlocks: string[];
      suggestions: string[];
      issues: AuditIssue[];
    };

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch {
      return Response.json({ error: "Errore nel parsing dell'analisi" }, { status: 500 });
    }

    const scores = parsed.scores;
    const overallScore = Math.round(
      (scores.clarity + scores.completeness + scores.structure + scores.specificity +
        scores.proofPresence + scores.faqPresence + scores.dataPresence + scores.extractability) / 8
    );

    step("Parsing completato", `overall=${overallScore}`);

    const result: ContentReadinessResult = {
      id: crypto.randomUUID(),
      url,
      title,
      scannedAt: new Date().toISOString(),
      scores,
      overallScore,
      missingBlocks: parsed.missingBlocks || [],
      suggestions: parsed.suggestions || [],
      issues: parsed.issues || [],
      _log: {
        durationMs: Date.now() - startedAt,
        steps,
        fetches,
        llm: {
          model: MODEL,
          prompt,
          rawResponse: text,
          stopReason: analysis.stop_reason ?? undefined,
          inputTokens: analysis.usage?.input_tokens,
          outputTokens: analysis.usage?.output_tokens,
        },
      },
    };

    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Errore" }, { status: 500 });
  }
}
