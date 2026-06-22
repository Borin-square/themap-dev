import type { AuditIssue } from "@/lib/geo/types";

interface ActionPlanArgs {
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

export function buildActionPlanPrompt(args: ActionPlanArgs): string {
  const scoresBlock = Object.entries(args.auditScores)
    .filter(([, v]) => v != null)
    .map(([k, v]) => `- ${k}: ${v}/100`)
    .join("\n") || "Non disponibili";

  const issuesBlock = args.auditIssues.slice(0, 20)
    .map((i) => `- [${i.type}] ${i.message}${i.fix ? ` → ${i.fix}` : ""}`)
    .join("\n") || "Nessuno";

  const gapsBlock = args.contentGaps.slice(0, 10)
    .map((g) => `- [${g.priority}] ${g.topic}`)
    .join("\n") || "Nessuno";

  const sourcesBlock = args.sourceTargets.slice(0, 10)
    .map((s) => `- [${s.priority}] ${s.domain}: ${s.actionRequired}`)
    .join("\n") || "Nessuno";

  return `Genera un piano d'azione prioritizzato per migliorare la visibilita' AI del brand "${args.brandName}".

BRAND: ${args.brandName}
SITO: ${args.siteUrl || "non specificato"}
SETTORE: ${args.industry || "non specificato"}
PAESE: ${args.country || "Italia"}
MERCATO: ${args.market || "B2B"}
SERVIZI: ${(args.services || []).join(", ") || "non specificati"}
PROBLEMI TARGET: ${(args.problems || []).join(", ") || "non specificati"}

PUNTEGGI AUDIT:
${scoresBlock}

PROBLEMI RILEVATI (${args.auditIssues.length}):
${issuesBlock}

CONTENT GAPS (${args.contentGaps.length}):
${gapsBlock}

SOURCE TARGETS (${args.sourceTargets.length}):
${sourcesBlock}

Crea un piano d'azione con max 20 item, ordinati per priorita' e impatto. Ogni item deve avere:
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
}`;
}
