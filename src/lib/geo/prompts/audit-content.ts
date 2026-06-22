interface AuditContentArgs {
  url: string;
  title: string;
  brandName?: string;
  industry?: string;
  services?: string[];
  headings: string[];
  textContent: string;
}

export function buildAuditContentPrompt(args: AuditContentArgs): string {
  const { url, title, brandName, industry, services, headings, textContent } = args;

  return `Analizza questa pagina web per capire se e' adatta a essere citata dagli LLM.

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
}
