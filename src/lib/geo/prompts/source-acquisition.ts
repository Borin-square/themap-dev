interface DiscoveryArgs {
  brandName: string;
  siteUrl: string;
  services: string[];
  competitors: string[];
  industry: string;
  country: string;
  market: string;
}

interface SynthesisArgs extends DiscoveryArgs {
  llmResponsesBlock: string;
  llmCount: number;
  existingCitations: { domain: string; type: string; brandMentioned: boolean }[];
}

export function buildDiscoveryPrompt(args: DiscoveryArgs): string {
  const servicesStr = args.services.join(", ") || "servizi non specificati";
  const competitorsStr = args.competitors.length > 0 ? args.competitors.join(", ") : "non specificati";

  return `Sto cercando un fornitore di ${servicesStr} per il mercato ${args.market} in ${args.country} (settore: ${args.industry}).

Ho trovato "${args.brandName}"${args.siteUrl ? ` (${args.siteUrl})` : ""}.

1. Conosci "${args.brandName}"? Cosa sai di questa azienda? È presente su directory, piattaforme di recensioni, marketplace o media di settore?
2. Quali piattaforme, directory, siti di review e media specializzati dovrei consultare per verificare la credibilità di un fornitore come questo nel settore ${args.industry} in ${args.country}?
3. I competitor di riferimento sono: ${competitorsStr}. Dove sono presenti online questi competitor?
4. Quali blog, forum, community e testate di settore sono i riferimenti principali per ${args.industry} in ${args.country}?

Rispondi in modo dettagliato. Cita piattaforme specifiche con i loro domini/URL. Per ogni piattaforma indica se "${args.brandName}" è presente o meno, se lo sai.`;
}

export function buildSynthesisPrompt(args: SynthesisArgs): string {
  const servicesStr = args.services.join(", ") || "servizi non specificati";
  const competitorsStr = args.competitors.length > 0 ? args.competitors.join(", ") : "non specificati";
  const existingBlock = args.existingCitations.length > 0
    ? args.existingCitations.map((c) => `- ${c.domain} (${c.type}) — brand menzionato: ${c.brandMentioned ? "sì" : "no"}`).join("\n")
    : "Nessuna";

  return `Sei un analista GEO (Generative Engine Optimization). Analizza le risposte di ${args.llmCount} LLM diversi per creare un report diagnostico sulle fonti dove il brand "${args.brandName}" dovrebbe essere presente per massimizzare la visibilità nelle risposte AI.

CONTESTO:
- Brand: ${args.brandName}
- Sito: ${args.siteUrl || "non specificato"}
- Servizi: ${servicesStr}
- Settore: ${args.industry}
- Paese: ${args.country}
- Mercato: ${args.market}
- Competitor: ${competitorsStr}

FONTI GIÀ TROVATE NELLE SCANSIONI PRECEDENTI DEL PROMPT MONITOR (${args.existingCitations.length}):
${existingBlock}

RISPOSTE RACCOLTE DAGLI LLM:
${args.llmResponsesBlock}

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
}
