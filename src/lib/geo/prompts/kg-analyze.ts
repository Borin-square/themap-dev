interface KGAnalyzeArgs {
  url: string;
  brandName: string;
  siteUrl: string;
  industry: string;
  services: string[];
  country: string;
  competitors: string[];
  blocks: { index: number; schemaType: string; parsed: Record<string, unknown> }[];
}

export function buildKGAnalyzePrompt(args: KGAnalyzeArgs): string {
  const { url, brandName, siteUrl, industry, services, country, competitors, blocks } = args;

  const blocksStr = blocks.length > 0
    ? blocks.map((b) => `--- BLOCCO #${b.index} (${b.schemaType}) ---\n${JSON.stringify(b.parsed, null, 2).slice(0, 2500)}`).join("\n\n")
    : "Nessun blocco JSON-LD trovato.";

  return `Sei un esperto di structured data per knowledge graph e ottimizzazione per LLM (ChatGPT, Claude, Gemini, AI Overviews).

PAGINA ANALIZZATA: ${url}
BRAND: ${brandName || "non specificato"}
SITO: ${siteUrl || "non specificato"}
SETTORE: ${industry || "non specificato"}
PAESE: ${country || "Italia"}
SERVIZI: ${services.join(", ") || "non specificati"}
COMPETITOR: ${competitors.join(", ") || "non specificati"}

JSON-LD ATTUALMENTE PRESENTE NELLA PAGINA:
${blocksStr}

Analizza ogni blocco JSON-LD e produci suggerimenti CONCRETI E APPLICABILI in 3 categorie con priorita' crescente:

1. **schema-org**: validita' sintattica, @type corretto, required fields, formati validi (date ISO, URL assoluti, ecc.)
2. **rich-results**: compliance Google Rich Results (campi richiesti per ottenere snippet ricchi nei SERP)
3. **knowledge-graph** (PRIORITA' MASSIMA — questo e' l'obiettivo principale): ottimizzazione per essere riconosciuti come ENTITA' dal Knowledge Graph e dagli LLM:
   - Completezza \`sameAs\` verso fonti autorevoli (Wikipedia, Wikidata, profili social ufficiali, registri aziendali, LinkedIn company, Crunchbase)
   - Disambiguazione esplicita dell'entita' (\`identifier\`, \`alternateName\`, \`url\` canonico)
   - Relazioni esplicite tra entita' (\`parentOrganization\`, \`subOrganization\`, \`member\`, \`founder\`, \`brand\`, \`employee\`)
   - Descrizioni semantiche ricche e specifiche del settore (non generiche)
   - Localizzazione strutturata (\`address\` completo con \`addressLocality\`, \`addressRegion\`, \`postalCode\`, \`addressCountry\`)
   - Coerenza tra blocchi (stesso brand → stesso \`@id\` o \`url\`)

Suggerisci anche eventuali NUOVI BLOCCHI da aggiungere se mancano per il knowledge graph (es. Organization assente, FAQPage utile per l'intent della pagina, BreadcrumbList).

Rispondi ESCLUSIVAMENTE con JSON valido, nessun testo prima o dopo:
{
  "schemas": [
    {
      "schemaIndex": <numero blocco>,
      "schemaType": "<tipo>",
      "summary": "<1-2 frasi: stato generale e priorita' di intervento>",
      "suggestions": [
        {
          "id": "<uuid stringa univoca>",
          "category": "schema-org|rich-results|knowledge-graph",
          "severity": "critical|warning|info",
          "op": "add|modify|remove",
          "schemaIndex": <stesso numero blocco>,
          "fieldPath": "<es. 'sameAs' o 'address.addressLocality'>",
          "currentValue": <valore attuale o null>,
          "proposedValue": <valore proposto pronto da applicare>,
          "why": "<spiegazione concisa del perche' migliora KG/LLM>"
        }
      ]
    }
  ],
  "newSchemas": [
    {
      "id": "<uuid>",
      "category": "knowledge-graph|schema-org|rich-results",
      "severity": "critical|warning|info",
      "op": "add-schema",
      "schemaIndex": null,
      "targetSchemaType": "<es. Organization>",
      "proposedValue": { "@context": "https://schema.org", "@type": "...", "...": "..." },
      "why": "<perche' aggiungerlo>"
    }
  ],
  "overallNotes": "<2-3 frasi sullo stato KG complessivo e prossimi passi>"
}

IMPORTANTE:
- Ogni \`proposedValue\` deve essere VALIDO JSON, non placeholder
- Usa dati reali dal contesto brand sopra (es. se ti do siteUrl=https://example.com usa quello, non [siteUrl])
- Per \`sameAs\` proponi URL REALI plausibili (es. https://www.linkedin.com/company/<slug-brand>), non placeholder
- Massimo 8 suggestion per blocco, prioritizzando knowledge-graph
- Massimo 3 newSchemas
- Genera \`id\` univoci tipo "s-<n>" (s-1, s-2, ...) — devono essere stringhe stabili per accept/reject lato UI`;
}
