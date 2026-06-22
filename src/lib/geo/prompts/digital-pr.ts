interface DigitalPRArgs {
  brandName: string;
  siteUrl: string;
  services: string[];
  competitors: string[];
  industry: string;
  country: string;
  market: string;
  problems: string[];
}

export function buildDigitalPRPrompt(args: DigitalPRArgs): string {
  return `Sei un esperto di Digital PR e link building. Identifica i siti piu' rilevanti dove il brand "${args.brandName}" dovrebbe ottenere visibilita', menzioni e backlink per migliorare la sua authority e la citabilita' da parte degli LLM.

BRAND: ${args.brandName}
SITO: ${args.siteUrl || "non specificato"}
SERVIZI: ${args.services.join(", ") || "non specificati"}
COMPETITOR: ${args.competitors.join(", ") || "non specificati"}
SETTORE: ${args.industry || "non specificato"}
PAESE: ${args.country || "Italia"}
MERCATO: ${args.market || "B2B"}
PROBLEMI TARGET: ${args.problems.join(", ") || "non specificati"}

Suggerisci 15-25 siti concreti e reali, suddivisi tra:
- Testate di settore e media specializzati
- Blog autorevoli nel settore
- Podcast rilevanti
- Directory verticali e portali di nicchia
- Associazioni di categoria
- Newsletter di settore
- Portali generalisti ma con sezioni rilevanti

Per OGNI sito indica:
- name: nome del sito/testata
- url: URL reale del sito
- type: testata|blog|podcast|directory|associazione|portale|newsletter|altro
- relevance: rilevanza per il brand 0-100
- difficulty: difficolta' di accesso 0-100 (0=facile, 100=molto difficile)
- contentType: tipo di contenuto da proporre (guest-post|intervista|comunicato|case-study|listing|menzione|partnership)
- approach: come approcciare concretamente (chi contattare, che proporre, che angolo usare)
- why: perche' questo sito e' strategico per il brand

Ordina per rilevanza decrescente.

Rispondi ESCLUSIVAMENTE con JSON valido:
{
  "targets": [
    {"name": "<nome>", "url": "<url>", "type": "<tipo>", "relevance": <0-100>, "difficulty": <0-100>, "contentType": "<tipo>", "approach": "<come approcciare>", "why": "<perche' e' strategico>"}
  ],
  "summary": "<riassunto strategia digital PR in 2-3 frasi>",
  "suggestions": ["<suggerimento tattico>"]
}`;
}
