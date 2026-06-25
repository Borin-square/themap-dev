import type { ContentReadinessResult, AuditIssue } from "@/lib/geo/types";
import { CLAUDE_MODEL, DEFAULT_MAX_TOKENS, extractJson, getAnthropicClient, joinAnthropicText } from "@/lib/geo/llm-helpers";
import { buildAuditContentPrompt } from "@/lib/geo/prompts/audit-content";
import { fetchHtml } from "@/lib/geo/fetch-html";

export const maxDuration = 120;

interface ContentRequest {
  url: string;
  brandName?: string;
  industry?: string;
  services?: string[];
}

interface ParsedReadiness {
  scores: ContentReadinessResult["scores"];
  missingBlocks: string[];
  suggestions: string[];
  issues: AuditIssue[];
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

    const textContent = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 8000);

    const headings = (html.match(/<h[1-6][^>]*>.*?<\/h[1-6]>/gi) || [])
      .map((h) => h.replace(/<[^>]+>/g, "").trim())
      .filter(Boolean)
      .slice(0, 30);

    const analysisPrompt = buildAuditContentPrompt({
      url, title, brandName, industry, services, headings, textContent,
    });

    const analysis = await getAnthropicClient().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: DEFAULT_MAX_TOKENS,
      temperature: 0,
      system: "Rispondi ESCLUSIVAMENTE con un JSON valido, senza testo prima o dopo, senza code fences.",
      messages: [{ role: "user", content: analysisPrompt }],
    });

    const text = joinAnthropicText(analysis.content);
    const parsed = extractJson<ParsedReadiness>(text);

    if (!parsed) {
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
