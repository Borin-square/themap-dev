import type { StructuredDataResult, AuditIssue } from "@/lib/geo/types";

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
  try {
    const { url } = (await req.json()) as SDRequest;
    if (!url?.trim()) {
      return Response.json({ error: "URL richiesto." }, { status: 400 });
    }

    let html = "";
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
          "Accept-Encoding": "gzip, deflate, br",
          "Upgrade-Insecure-Requests": "1",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
          "Sec-Fetch-User": "?1",
        },
        signal: AbortSignal.timeout(15000),
        redirect: "follow",
      });
      if (!res.ok) {
        return Response.json({ error: `Pagina non raggiungibile (HTTP ${res.status})` }, { status: 400 });
      }
      html = await res.text();
    } catch {
      return Response.json({ error: "Impossibile raggiungere la pagina" }, { status: 400 });
    }

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

    const result: StructuredDataResult = {
      id: crypto.randomUUID(),
      url,
      scannedAt: new Date().toISOString(),
      schemas,
      overallScore,
      suggestedMarkup,
      issues,
    };

    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Errore" }, { status: 500 });
  }
}
