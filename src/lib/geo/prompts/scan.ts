interface ScanAnalysisArgs {
  llm: string;
  prompt: string;
  brandName: string;
  siteUrl?: string;
  competitors: string[];
  rawResponse: string;
}

function safeDomain(siteUrl?: string): string {
  if (!siteUrl) return "";
  try {
    return new URL(siteUrl).hostname;
  } catch {
    return siteUrl.replace(/^https?:\/\//, "").split("/")[0];
  }
}

export function buildScanAnalysisPrompt(args: ScanAnalysisArgs): string {
  const { llm, prompt, brandName, siteUrl, competitors, rawResponse } = args;
  const competitorsStr = competitors.length > 0 ? competitors.join(", ") : "non specificati";
  const ownedNote = siteUrl ? `- Il dominio "${safeDomain(siteUrl)}" e' "owned"` : "";

  return `Analizza questa risposta data da ${llm} al prompt "${prompt}".

BRAND DA CERCARE: "${brandName}"
${siteUrl ? `SITO DEL BRAND: "${siteUrl}"` : ""}
COMPETITOR DA CERCARE: ${competitorsStr}

RISPOSTA DA ANALIZZARE:
---
${rawResponse}
---

Rispondi ESCLUSIVAMENTE con un JSON valido (nessun testo prima o dopo):
{
  "brandMentioned": true/false,
  "brandPosition": <posizione numerica nella lista se presente, null se non in lista>,
  "brandContext": "<frase esatta in cui il brand viene menzionato, o null>",
  "brandAttributes": ["<aggettivi o attributi usati per descrivere il brand>"],
  "sentiment": {
    "score": <da -1.0 a 1.0>,
    "label": "negativo" | "neutro" | "positivo",
    "phrases": ["<frasi chiave sul brand>"],
    "strengths": ["<punti di forza citati>"],
    "weaknesses": ["<punti deboli citati>"],
    "alignmentScore": <0-100, quanto la descrizione e' coerente con un posizionamento premium>
  },
  "competitorMentions": [
    {
      "name": "<nome competitor>",
      "position": <posizione in lista o null>,
      "attributes": ["<attributi associati>"],
      "sentiment": "negativo" | "neutro" | "positivo",
      "strengths": ["<punti di forza>"],
      "weaknesses": ["<debolezze o spazi scoperti>"]
    }
  ],
  "citations": [
    {
      "url": "<URL citato>",
      "title": "<titolo della pagina se menzionato>",
      "domain": "<dominio>",
      "type": "owned" | "competitor" | "directory" | "media" | "blog" | "marketplace" | "forum" | "review" | "social" | "other",
      "brandMentioned": true/false,
      "competitorMentioned": "<nome competitor o null>",
      "authority": "low" | "medium" | "high",
      "controllable": true/false
    }
  ],
  "confidence": "low" | "medium" | "high",
  "reasoning": "<spiegazione sintetica dei risultati>"
}

Nota:
- Cerca il brand "${brandName}" anche con varianti del nome
- Per i competitor, cerca solo quelli nella lista fornita piu' eventuali altri menzionati
- Per le citazioni, estrai tutti gli URL o fonti menzionate nella risposta
${ownedNote}
- Se il brand non e' menzionato, brandContext e brandAttributes possono essere vuoti/null
- Sii accurato nel sentiment: positivo solo se ci sono elogi chiari`;
}
