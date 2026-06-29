import Anthropic from "@anthropic-ai/sdk";
import type { ActionPlanResult, AuditIssue } from "@/lib/geo/types";

export const maxDuration = 120;

function extractJson<T>(text: string): T | null {
  if (!text) return null;
  let cleaned = text.trim();
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) cleaned = fence[1].trim();
  try { return JSON.parse(cleaned) as T; } catch { /* fall through */ }
  const start = cleaned.indexOf("{");
  if (start === -1) return null;
  let depth = 0, inString = false, escape = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(cleaned.slice(start, i + 1)) as T; } catch { return null; }
      }
    }
  }
  return null;
}

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
  brandKPIs?: {
    totalPrompts: number;
    scannedPrompts: number;
    mentionRate: number;
    avgPosition: number | null;
    avgSentiment: number;
    topAttributes: string[];
    topStrengths: string[];
    topWeaknesses: string[];
  };
  topCompetitors?: { name: string; mentions: number; sentiment: string }[];
  citationsSummary?: {
    ownedShare: number;
    topDomains: { domain: string; count: number; type: string }[];
  };
  completedActions?: { title: string; category: string }[];
  inProgressActions?: { title: string; category: string }[];
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as PlanRequest;
    if (!body.brandName?.trim()) {
      return Response.json({ error: "Brand name richiesto." }, { status: 400 });
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const analysis = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      temperature: 0,
      system: "Rispondi ESCLUSIVAMENTE con un JSON valido, senza testo prima o dopo, senza code fences.",
      messages: [{
        role: "user",
        content: `Genera un piano d'azione prioritizzato per migliorare la visibilita' AI del brand "${body.brandName}".

BRAND: ${body.brandName}
SITO: ${body.siteUrl || "non specificato"}
SETTORE: ${body.industry || "non specificato"}
PAESE: ${body.country || "Italia"}
MERCATO: ${body.market || "B2B"}
SERVIZI: ${(body.services || []).join(", ") || "non specificati"}
PROBLEMI TARGET: ${(body.problems || []).join(", ") || "non specificati"}

PUNTEGGI AUDIT:
${Object.entries(body.auditScores).filter(([, v]) => v != null).map(([k, v]) => `- ${k}: ${v}/100`).join("\n") || "Non disponibili"}

PROBLEMI RILEVATI (${body.auditIssues.length}):
${body.auditIssues.slice(0, 20).map((i) => `- [${i.type}] ${i.message}${i.fix ? ` → ${i.fix}` : ""}`).join("\n") || "Nessuno"}

CONTENT GAPS (${body.contentGaps.length}):
${body.contentGaps.slice(0, 10).map((g) => `- [${g.priority}] ${g.topic}`).join("\n") || "Nessuno"}

SOURCE TARGETS (${body.sourceTargets.length}):
${body.sourceTargets.slice(0, 10).map((s) => `- [${s.priority}] ${s.domain}: ${s.actionRequired}`).join("\n") || "Nessuno"}

${body.brandKPIs ? `STATO VISIBILITA' BRAND NELLE RISPOSTE LLM:
- Prompt monitorati: ${body.brandKPIs.scannedPrompts}/${body.brandKPIs.totalPrompts} scansionati
- Brand Mention Rate: ${body.brandKPIs.mentionRate}% (quanto spesso il brand viene citato dagli LLM)
- Posizione media nelle risposte: ${body.brandKPIs.avgPosition != null ? `#${body.brandKPIs.avgPosition}` : "n/d"}
- Sentiment medio: ${body.brandKPIs.avgSentiment.toFixed(2)} (-1 negativo, +1 positivo)
- Attributi associati al brand: ${body.brandKPIs.topAttributes.slice(0, 8).join(", ") || "nessuno"}
- Punti di forza percepiti: ${body.brandKPIs.topStrengths.slice(0, 5).join(", ") || "nessuno"}
- Debolezze percepite: ${body.brandKPIs.topWeaknesses.slice(0, 5).join(", ") || "nessuna"}` : ""}

${body.topCompetitors && body.topCompetitors.length > 0 ? `TOP COMPETITOR MENZIONATI DAGLI LLM (${body.topCompetitors.length}):
${body.topCompetitors.slice(0, 10).map((c) => `- ${c.name}: ${c.mentions} menzioni, sentiment ${c.sentiment}`).join("\n")}` : ""}

${body.citationsSummary ? `CITAZIONI / FONTI:
- Quota citazioni owned (sito brand): ${body.citationsSummary.ownedShare}%
- Top domini citati: ${body.citationsSummary.topDomains.slice(0, 8).map((d) => `${d.domain} (${d.count}, ${d.type})`).join(", ") || "nessuno"}` : ""}

${body.completedActions && body.completedActions.length > 0 ? `AZIONI GIA' COMPLETATE (NON RI-SUGGERIRE QUESTE):
${body.completedActions.slice(0, 30).map((a) => `- [${a.category}] ${a.title}`).join("\n")}` : ""}

${body.inProgressActions && body.inProgressActions.length > 0 ? `AZIONI IN CORSO (NON RI-SUGGERIRE, EVENTUALMENTE PROPONI NEXT STEP CORRELATI):
${body.inProgressActions.slice(0, 30).map((a) => `- [${a.category}] ${a.title}`).join("\n")}` : ""}

Crea un piano d'azione con max 20 item, ordinati per priorita' e impatto. Considera lo stato attuale di visibilita' brand, i competitor che vincono, le debolezze percepite e le fonti che già funzionano (o mancano). NON ri-suggerire azioni già completate o in corso elencate sopra. Ogni item deve avere:
- category: content|technical|source|entity|structured-data
- title: titolo breve
- description: cosa fare concretamente
- priority: alta|media|bassa
- effort: basso|medio|alto
- impact: basso|medio|alto

Rispondi ESCLUSIVAMENTE con JSON valido:
{
  "items": [
    {"id": "<uuid>", "category": "<cat>", "title": "<titolo>", "description": "<desc>", "priority": "<p>", "effort": "<e>", "impact": "<i>", "status": "da-fare"}
  ],
  "summary": "<riassunto del piano in 2-3 frasi>"
}`,
      }],
    });

    const text = analysis.content.find((b) => b.type === "text")?.text || "{}";
    const parsed = extractJson<{ items: ActionPlanResult["items"]; summary: string }>(text);
    if (!parsed) {
      console.error("[action-plan] JSON parse failed", { stopReason: analysis.stop_reason, raw: text.slice(0, 1000) });
      return Response.json({
        error: "Errore nel parsing dell'analisi",
        stopReason: analysis.stop_reason,
      }, { status: 500 });
    }

    // Ensure IDs
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
