interface ContentGapsArgs {
  brandName: string;
  siteUrl: string;
  services: string[];
  competitors: string[];
  industry: string;
  country: string;
  market: string;
  buyerPersonas: string[];
  problems: string[];
  scannedPrompts: { text: string; mentioned: boolean; sentiment: string }[];
}

export function buildContentGapsPrompt(args: ContentGapsArgs): string {
  return `Analizza le lacune di contenuto del brand "${args.brandName}" per essere meglio rappresentato nelle risposte degli LLM.

BRAND: ${args.brandName}
SITO: ${args.siteUrl || "non specificato"}
SERVIZI: ${args.services.join(", ") || "non specificati"}
COMPETITOR: ${args.competitors.join(", ") || "non specificati"}
SETTORE: ${args.industry || "non specificato"}
PAESE: ${args.country || "Italia"}
MERCATO: ${args.market || "B2B"}
BUYER PERSONAS: ${(args.buyerPersonas || []).join(", ") || "non specificate"}
PROBLEMI TARGET: ${(args.problems || []).join(", ") || "non specificati"}

PROMPT ANALIZZATI (${args.scannedPrompts.length}):
${args.scannedPrompts.map((p, i) => `${i + 1}. "${p.text}" - Menzionato: ${p.mentioned} - Sentiment: ${p.sentiment}`).join("\n")}

Identifica i contenuti che il brand dovrebbe creare o migliorare per essere citato piu' spesso e meglio dagli LLM.

Per ogni gap, specifica:
- topic: argomento mancante
- description: cosa manca e perche' e' importante
- contentType: tipo di contenuto consigliato (pagina, sezione, faq, case-study, guida, blog)
- priority: alta/media/bassa
- estimatedImpact: impatto stimato 0-100
- relatedPrompts: indici dei prompt correlati (1-based)

Rispondi ESCLUSIVAMENTE con JSON valido:
{
  "gaps": [
    {"topic": "<topic>", "description": "<desc>", "contentType": "<tipo>", "priority": "<alta|media|bassa>", "estimatedImpact": <0-100>, "relatedPrompts": [<indici>]}
  ],
  "overallCoverage": <0-100>,
  "suggestions": ["<suggerimento concreto>"]
}`;
}
