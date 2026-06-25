import Anthropic from "@anthropic-ai/sdk";
import type { ContentReadinessResult, AuditIssue } from "@/lib/geo/types";
import { fetchHtml } from "@/lib/geo/fetch-html";

export const maxDuration = 60;

interface ContentRequest {
  url: string;
  brandName?: string;
  industry?: string;
  services?: string[];
}

export async function POST(req: Request) {
  try {
    const { url, brandName, industry, services } = (await req.json()) as ContentRequest;
    if (!url?.trim()) {
      return Response.json({ error: "URL richiesto." }, { status: 400 });
    }

    const fetched = await fetchHtml(url);
    if (!fetched.ok) {
      return Response.json({ error: fetched.error }, { status: 400 });
    }
    const html = fetched.html;
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

    // Analyze with Claude
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const analysis = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [{
        role: "user",
        content: `Analizza questa pagina web per capire se e' adatta a essere citata dagli LLM.

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
}`,
      }],
    });

    const text = analysis.content.find((b) => b.type === "text")?.text || "{}";
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
    };

    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Errore" }, { status: 500 });
  }
}
