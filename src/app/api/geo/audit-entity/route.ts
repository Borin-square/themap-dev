import Anthropic from "@anthropic-ai/sdk";
import type { EntityStrengthResult, AuditIssue, GEOAuditLog } from "@/lib/geo/types";

const MODEL = "claude-sonnet-4-6";

export const maxDuration = 120;

interface EntityRequest {
  brandName: string;
  siteUrl: string;
  services: string[];
  competitors: string[];
  country: string;
  industry: string;
  market: string;
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  const steps: GEOAuditLog["steps"] = [];
  const fetches: NonNullable<GEOAuditLog["fetches"]> = [];
  const step = (label: string, detail?: string) =>
    steps.push({ label, timestamp: new Date().toISOString(), detail });

  try {
    const { brandName, siteUrl, services, competitors, country, industry, market } = (await req.json()) as EntityRequest;
    step("Richiesta ricevuta", `brand=${brandName}, site=${siteUrl}`);

    if (!brandName?.trim()) {
      return Response.json({ error: "Brand name richiesto." }, { status: 400 });
    }

    // Fetch homepage for structured data and content
    let homepageContent = "";
    let jsonLdData: Record<string, unknown>[] = [];
    if (siteUrl) {
      const baseUrl = siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`;
      step("Fetch homepage", baseUrl);
      try {
        const res = await fetch(baseUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; GEOTool/1.0)" },
          signal: AbortSignal.timeout(15000),
          redirect: "follow",
        });
        if (res.ok) {
          const html = await res.text();
          fetches.push({ url: baseUrl, status: res.status, ok: true, contentSnippet: `HTML length: ${html.length}` });
          // Extract JSON-LD
          const jsonLdRegex = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
          let match;
          while ((match = jsonLdRegex.exec(html)) !== null) {
            try {
              const parsed = JSON.parse(match[1]);
              if (Array.isArray(parsed)) jsonLdData.push(...parsed);
              else if (parsed["@graph"]) jsonLdData.push(...(parsed["@graph"] as Record<string, unknown>[]));
              else jsonLdData.push(parsed);
            } catch { /* skip */ }
          }
          // Extract text
          homepageContent = html
            .replace(/<script[\s\S]*?<\/script>/gi, "")
            .replace(/<style[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 5000);
          step("Homepage parsata", `JSON-LD blocchi=${jsonLdData.length}, testo=${homepageContent.length} char`);
        } else {
          fetches.push({ url: baseUrl, status: res.status, ok: false });
        }
      } catch (e) {
        fetches.push({ url: baseUrl, error: e instanceof Error ? e.message : "fetch error" });
      }
    }

    // Analyze with Claude
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const prompt = `Analizza la forza dell'entita' "${brandName}" come entita' riconoscibile dagli LLM.

BRAND: ${brandName}
SITO: ${siteUrl || "non specificato"}
SERVIZI: ${services.join(", ") || "non specificati"}
COMPETITOR: ${competitors.join(", ") || "non specificati"}
PAESE: ${country || "Italia"}
SETTORE: ${industry || "non specificato"}
MERCATO: ${market || "B2B"}

DATI STRUTTURATI TROVATI:
${jsonLdData.length > 0 ? JSON.stringify(jsonLdData, null, 2).slice(0, 3000) : "Nessuno"}

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

    step("Chiamata LLM", `model=${MODEL}, prompt=${prompt.length} char`);
    const analysis = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const text = analysis.content.find((b) => b.type === "text")?.text || "{}";
    step("Risposta LLM ricevuta", `stop_reason=${analysis.stop_reason}, output=${text.length} char`);
    let parsed: {
      scores: EntityStrengthResult["scores"];
      entities: EntityStrengthResult["entities"];
      issues: AuditIssue[];
      suggestions: string[];
    };

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch {
      return Response.json({ error: "Errore nel parsing dell'analisi" }, { status: 500 });
    }

    const s = parsed.scores;
    const overallScore = Math.round(
      (s.consistency + s.externalPresence + s.structuredData + s.citations +
        s.reviews + s.serviceClarity + s.geoClarity) / 7
    );

    step("Parsing completato", `overall=${overallScore}, entities=${(parsed.entities || []).length}`);

    const result: EntityStrengthResult = {
      id: crypto.randomUUID(),
      scannedAt: new Date().toISOString(),
      scores: parsed.scores,
      overallScore,
      entities: parsed.entities || [],
      issues: parsed.issues || [],
      suggestions: parsed.suggestions || [],
      _log: {
        durationMs: Date.now() - startedAt,
        steps,
        fetches,
        llm: {
          model: MODEL,
          prompt,
          rawResponse: text,
          stopReason: analysis.stop_reason ?? undefined,
          inputTokens: analysis.usage?.input_tokens,
          outputTokens: analysis.usage?.output_tokens,
        },
      },
    };

    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Errore" }, { status: 500 });
  }
}
