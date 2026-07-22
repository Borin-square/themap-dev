import type { StructuredDataResult, AuditIssue, GEOAuditLog } from "@/lib/geo/types";
import { fetchHtml } from "@/lib/geo/fetch-html";

export const maxDuration = 30;

const EXPECTED_SCHEMAS = [
  { type: "Organization", requiredProps: ["name", "url", "logo", "sameAs", "description"], importance: "critical" },
  { type: "LocalBusiness", requiredProps: ["name", "address", "telephone", "geo"], importance: "warning" },
  { type: "WebSite", requiredProps: ["name", "url", "potentialAction"], importance: "warning" },
  { type: "WebPage", requiredProps: ["name", "description", "url"], importance: "info" },
  { type: "FAQPage", requiredProps: ["mainEntity"], importance: "warning" },
  { type: "Article", requiredProps: ["headline", "author", "datePublished", "publisher"], importance: "info" },
  { type: "Service", requiredProps: ["name", "description", "provider"], importance: "warning" },
  { type: "Product", requiredProps: ["name", "description", "offers"], importance: "info" },
  { type: "Person", requiredProps: ["name", "jobTitle", "worksFor"], importance: "info" },
  { type: "Review", requiredProps: ["reviewRating", "author"], importance: "info" },
  { type: "BreadcrumbList", requiredProps: ["itemListElement"], importance: "info" },
] as const;

interface SDRequest {
  url: string;
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  const steps: GEOAuditLog["steps"] = [];
  const fetches: NonNullable<GEOAuditLog["fetches"]> = [];
  const step = (label: string, detail?: string) =>
    steps.push({ label, timestamp: new Date().toISOString(), detail });

  try {
    const { url } = (await req.json()) as SDRequest;
    step("Richiesta ricevuta", `url=${url}`);
    if (!url?.trim()) {
      return Response.json({ error: "URL richiesto." }, { status: 400 });
    }

    step("Fetch HTML", url);
    const fetched = await fetchHtml(url);
    if (!fetched.ok) {
      fetches.push({ url, error: fetched.error });
      return Response.json({ error: fetched.error }, { status: 400 });
    }
    const html = fetched.html;
    fetches.push({ url, ok: true, contentSnippet: `HTML length: ${html.length}` });

    step("Estrazione JSON-LD");
    // Extract JSON-LD blocks
    const jsonLdBlocks: Record<string, unknown>[] = [];
    const jsonLdRegex = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = jsonLdRegex.exec(html)) !== null) {
      try {
        const parsed = JSON.parse(match[1]);
        if (Array.isArray(parsed)) {
          jsonLdBlocks.push(...parsed);
        } else if (parsed["@graph"]) {
          jsonLdBlocks.push(...(parsed["@graph"] as Record<string, unknown>[]));
        } else {
          jsonLdBlocks.push(parsed);
        }
      } catch { /* skip invalid JSON-LD */ }
    }

    // Check for microdata (basic)
    const hasMicrodata = html.includes('itemscope') && html.includes('itemtype');
    step("JSON-LD trovati", `${jsonLdBlocks.length} blocchi, microdata=${hasMicrodata}`);

    // Analyze each expected schema
    const issues: AuditIssue[] = [];
    const schemas = EXPECTED_SCHEMAS.map((expected) => {
      const found = jsonLdBlocks.find((block) => {
        const type = String(block["@type"] || "");
        return type === expected.type || type.endsWith(`/${expected.type}`);
      });

      if (!found) {
        return {
          type: expected.type,
          found: false,
          properties: [] as string[],
          missing: expected.requiredProps as unknown as string[],
        };
      }

      const foundProps = Object.keys(found).filter((k) => !k.startsWith("@"));
      const missingProps = expected.requiredProps.filter((p) => !(p in found));

      if (missingProps.length > 0) {
        issues.push({
          type: expected.importance as AuditIssue["type"],
          category: "structured-data",
          message: `${expected.type}: proprieta' mancanti: ${missingProps.join(", ")}`,
          fix: `Aggiungi ${missingProps.join(", ")} allo schema ${expected.type}`,
        });
      }

      return {
        type: expected.type,
        found: true,
        properties: foundProps,
        missing: missingProps as string[],
      };
    });

    const foundCount = schemas.filter((s) => s.found).length;
    const totalExpected = schemas.length;

    // Missing critical schemas
    const missingCritical = schemas.filter((s) => !s.found && EXPECTED_SCHEMAS.find((e) => e.type === s.type)?.importance === "critical");
    for (const ms of missingCritical) {
      issues.push({
        type: "critical",
        category: "structured-data",
        message: `Schema ${ms.type} assente`,
        fix: `Aggiungi JSON-LD per ${ms.type} nella homepage`,
      });
    }

    if (jsonLdBlocks.length === 0 && !hasMicrodata) {
      issues.push({
        type: "critical",
        category: "structured-data",
        message: "Nessun dato strutturato trovato nella pagina",
        fix: "Aggiungi almeno Organization e WebSite come JSON-LD",
      });
    }

    // Suggested markup for missing schemas
    const suggestedMarkup = schemas
      .filter((s) => !s.found)
      .map((s) => {
        const expected = EXPECTED_SCHEMAS.find((e) => e.type === s.type);
        if (!expected) return "";
        const obj: Record<string, string> = { "@context": "https://schema.org", "@type": expected.type };
        for (const prop of expected.requiredProps) obj[prop] = `[${prop}]`;
        return JSON.stringify(obj, null, 2);
      })
      .filter(Boolean);

    // Score
    const coverageScore = Math.round((foundCount / totalExpected) * 100);
    const completenessScore = schemas.filter((s) => s.found).length > 0
      ? Math.round(schemas.filter((s) => s.found).reduce((acc, s) => {
          const expected = EXPECTED_SCHEMAS.find((e) => e.type === s.type);
          if (!expected) return acc;
          const total = expected.requiredProps.length;
          const present = total - s.missing.length;
          return acc + (present / total) * 100;
        }, 0) / schemas.filter((s) => s.found).length)
      : 0;
    const overallScore = Math.round(coverageScore * 0.6 + completenessScore * 0.4);

    step("Score calcolato", `overall=${overallScore}, found=${foundCount}/${totalExpected}`);

    const result: StructuredDataResult = {
      id: crypto.randomUUID(),
      url,
      scannedAt: new Date().toISOString(),
      schemas,
      overallScore,
      suggestedMarkup,
      issues,
      _log: {
        durationMs: Date.now() - startedAt,
        steps,
        fetches,
      },
    };

    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Errore" }, { status: 500 });
  }
}
