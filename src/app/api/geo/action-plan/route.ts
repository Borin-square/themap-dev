import type { ActionPlanResult, AuditIssue } from "@/lib/geo/types";
import { CLAUDE_MODEL, extractJson, getAnthropicClient, joinAnthropicText } from "@/lib/geo/llm-helpers";
import { buildActionPlanPrompt } from "@/lib/geo/prompts/action-plan";

export const maxDuration = 120;

interface PlanRequest {
  brandName: string;
  siteUrl: string;
  industry: string;
  country: string;
  market: string;
  services: string[];
  problems: string[];
  auditIssues: AuditIssue[];
  contentGaps: { topic: string; priority: string }[];
  sourceTargets: { domain: string; priority: string; actionRequired: string }[];
  auditScores: { crawlability?: number; contentReadiness?: number; structuredData?: number; entityStrength?: number };
}

interface ParsedPlan {
  items: ActionPlanResult["items"];
  summary: string;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as PlanRequest;
    if (!body.brandName?.trim()) {
      return Response.json({ error: "Brand name richiesto." }, { status: 400 });
    }

    const analysisPrompt = buildActionPlanPrompt(body);

    const analysis = await getAnthropicClient().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 8192,
      temperature: 0,
      system: "Rispondi ESCLUSIVAMENTE con un JSON valido, senza testo prima o dopo, senza code fences.",
      messages: [{ role: "user", content: analysisPrompt }],
    });

    const text = joinAnthropicText(analysis.content);
    const parsed = extractJson<ParsedPlan>(text);

    if (!parsed) {
      console.error("[action-plan] JSON parse failed", { stopReason: analysis.stop_reason, raw: text.slice(0, 2000) });
      return Response.json({ error: "Errore nel parsing dell'analisi", stopReason: analysis.stop_reason, raw: text.slice(0, 2000) }, { status: 500 });
    }

    const items = (parsed.items || []).map((item) => ({
      ...item,
      id: item.id || crypto.randomUUID(),
      status: item.status || "da-fare" as const,
    }));

    const result: ActionPlanResult = {
      id: crypto.randomUUID(),
      generatedAt: new Date().toISOString(),
      items,
      summary: parsed.summary || "",
    };

    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Errore" }, { status: 500 });
  }
}
