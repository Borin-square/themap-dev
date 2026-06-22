interface AuditEntityArgs {
  brandName: string;
  siteUrl: string;
  services: string[];
  competitors: string[];
  country: string;
  industry: string;
  market: string;
  jsonLdData: Record<string, unknown>[];
  homepageContent: string;
}

export function buildAuditEntityPrompt(args: AuditEntityArgs): string {
  const { brandName, siteUrl, services, competitors, country, industry, market, jsonLdData, homepageContent } = args;
  const jsonLdStr = jsonLdData.length > 0 ? JSON.stringify(jsonLdData, null, 2).slice(0, 3000) : "Nessuno";

  return `Analizza la forza dell'entita' "${brandName}" come entita' riconoscibile dagli LLM.

BRAND: ${brandName}
SITO: ${siteUrl || "non specificato"}
SERVIZI: ${services.join(", ") || "non specificati"}
COMPETITOR: ${competitors.join(", ") || "non specificati"}
PAESE: ${country || "Italia"}
SETTORE: ${industry || "non specificato"}
MERCATO: ${market || "B2B"}

DATI STRUTTURATI TROVATI:
${jsonLdStr}

CONTENUTO HOMEPAGE (estratto):
${homepageContent || "Non disponibile"}

Valuta questi aspetti da 0 a 100:

1. CONSISTENCY: coerenza del brand tra sito, descrizioni, servizi dichiarati
2. EXTERNAL_PRESENCE: presenza stimata su fonti esterne (directory, media, articoli)
3. STRUCTURED_DATA: qualita' dei dati strutturati per l'identita' dell'entita'
4. CITATIONS: probabilita' che il brand venga citato da fonti autorevoli
5. REVIEWS: presenza stimata di recensioni e social proof
6. SERVICE_CLARITY: chiarezza dei servizi offerti
7. GEO_CLARITY: chiarezza della localizzazione geografica e mercato servito

Per le entita', elenca le principali entita' che il brand dovrebbe avere riconosciute:
- Nome azienda
- Servizi principali
- Sede/localita'
- Fondatori/team
- Settori serviti
- Clienti/case study
- Certificazioni/premi

Rispondi ESCLUSIVAMENTE con JSON valido:
{
  "scores": {
    "consistency": <0-100>,
    "externalPresence": <0-100>,
    "structuredData": <0-100>,
    "citations": <0-100>,
    "reviews": <0-100>,
    "serviceClarity": <0-100>,
    "geoClarity": <0-100>
  },
  "entities": [
    {"name": "<nome entita'>", "type": "<tipo: brand|service|location|person|industry|client|certification>", "status": "strong|weak|missing", "description": "<breve descrizione dello stato attuale dell'entita' e perche'>", "confidence": "low|medium|high"}
  ],
  "issues": [
    {"type": "critical|warning|info", "category": "<cat>", "message": "<problema>", "fix": "<soluzione>"}
  ],
  "suggestions": ["<suggerimento concreto>"]
}`;
}
