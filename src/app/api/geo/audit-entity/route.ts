import type { EntityStrengthResult, AuditIssue } from "@/lib/geo/types";
import { CLAUDE_MODEL, DEFAULT_MAX_TOKENS, extractJson, getAnthropicClient, joinAnthropicText } from "@/lib/geo/llm-helpers";
import { buildAuditEntityPrompt } from "@/lib/geo/prompts/audit-entity";

export const maxDuration = 120;

interface EntityRequest {
  brandName: string;
  siteUrl: string;
  services: string[];
  competitors: string[];
  country: string;
  industry: string;
  market: string;
}

interface ParsedEntity {
  scores: EntityStrengthResult["scores"];
  entities: EntityStrengthResult["entities"];
  issues: AuditIssue[];
  suggestions: string[];
}

export async function POST(req: Request) {
  try {
    const { brandName, siteUrl, services, competitors, country, industry, market } = (await req.json()) as EntityRequest;

    if (!brandName?.trim()) {
      return Response.json({ error: "Brand name richiesto." }, { status: 400 });
    }

    let homepageContent = "";
    const jsonLdData: Record<string, unknown>[] = [];
    if (siteUrl) {
      try {
        const baseUrl = siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`;
        const res = await fetch(baseUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; GEOTool/1.0)" },
          signal: AbortSignal.timeout(15000),
          redirect: "follow",
        });
        if (res.ok) {
          const html = await res.text();
          const jsonLdRegex = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
          let match;
          while ((match = jsonLdRegex.exec(html)) !== null) {
            try {
              const parsed = JSON.parse(match[1]);
              if (Array.isArray(parsed)) jsonLdData.push(...parsed);
              else if (parsed["@graph"]) jsonLdData.push(...(parsed["@graph"] as Record<string, unknown>[]));
              else jsonLdData.push(parsed);
            } catch { /* skip */ }
          }
          homepageContent = html
            .replace(/<script[\s\S]*?<\/script>/gi, "")
            .replace(/<style[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 5000);
        }
      } catch { /* site unreachable */ }
    }

    const analysisPrompt = buildAuditEntityPrompt({
      brandName, siteUrl, services, competitors, country, industry, market, jsonLdData, homepageContent,
    });

    const analysis = await getAnthropicClient().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: DEFAULT_MAX_TOKENS,
      temperature: 0,
      system: "Rispondi ESCLUSIVAMENTE con un JSON valido, senza testo prima o dopo, senza code fences.",
      messages: [{ role: "user", content: analysisPrompt }],
    });

    const text = joinAnthropicText(analysis.content);
    const parsed = extractJson<ParsedEntity>(text);

    if (!parsed) {
      return Response.json({ error: "Errore nel parsing dell'analisi" }, { status: 500 });
    }

    const s = parsed.scores;
    const overallScore = Math.round(
      (s.consistency + s.externalPresence + s.structuredData + s.citations +
        s.reviews + s.serviceClarity + s.geoClarity) / 7
    );

    const result: EntityStrengthResult = {
      id: crypto.randomUUID(),
      scannedAt: new Date().toISOString(),
      scores: parsed.scores,
      overallScore,
      entities: parsed.entities || [],
      issues: parsed.issues || [],
      suggestions: parsed.suggestions || [],
    };

    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Errore" }, { status: 500 });
  }
}
