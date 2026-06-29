import type { CrawlabilityResult, CrawlerStatus, AuditIssue } from "@/lib/geo/types";
import { AI_CRAWLERS, AI_CRAWLERS_CRITICAL } from "@/lib/geo/types";

export const maxDuration = 30;

interface CrawlRequest {
  siteUrl: string;
}

export async function POST(req: Request) {
  try {
    const { siteUrl } = (await req.json()) as CrawlRequest;
    if (!siteUrl?.trim()) {
      return Response.json({ error: "URL del sito richiesto." }, { status: 400 });
    }

    let baseUrl: string;
    try {
      const u = new URL(siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`);
      baseUrl = u.origin;
    } catch {
      return Response.json({ error: "URL non valido." }, { status: 400 });
    }

    const issues: AuditIssue[] = [];

    // Fetch robots.txt
    let robotsTxt = "";
    try {
      const res = await fetch(`${baseUrl}/robots.txt`, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        robotsTxt = await res.text();
      } else {
        issues.push({
          type: "warning", category: "robots.txt",
          message: `robots.txt non trovato (HTTP ${res.status})`,
          fix: "Crea un file robots.txt nella root del sito",
        });
      }
    } catch {
      issues.push({
        type: "critical", category: "robots.txt",
        message: "Impossibile raggiungere robots.txt",
        detail: "Il sito potrebbe essere offline o bloccare le richieste",
      });
    }

    // Parse robots.txt for each AI crawler
    const crawlers = AI_CRAWLERS.map((name) => {
      const result = checkCrawlerAccess(robotsTxt, name);
      if (result.status === "blocked") {
        issues.push({
          type: AI_CRAWLERS_CRITICAL.has(name) ? "critical" : "warning",
          category: "crawler",
          message: `${name} e' bloccato`,
          detail: result.rule ? `Regola: ${result.rule}` : undefined,
          fix: `Rimuovi il blocco per ${name} nel robots.txt`,
        });
      }
      return result;
    });

    // Check sitemap
    let sitemap = { found: false as boolean, url: undefined as string | undefined, entries: undefined as number | undefined };
    const sitemapUrl = extractSitemapUrl(robotsTxt) || `${baseUrl}/sitemap.xml`;
    try {
      const res = await fetch(sitemapUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const text = await res.text();
        const entries = (text.match(/<url>/gi) || []).length || (text.match(/<loc>/gi) || []).length;
        sitemap = { found: true, url: sitemapUrl, entries };
      } else {
        issues.push({
          type: "warning", category: "sitemap",
          message: "Sitemap non trovata",
          fix: "Crea una sitemap.xml e dichiarala nel robots.txt",
        });
      }
    } catch {
      issues.push({
        type: "warning", category: "sitemap",
        message: "Impossibile raggiungere la sitemap",
      });
    }

    // Check main page headers
    try {
      const res = await fetch(baseUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(10000),
        redirect: "follow",
      });
      const xRobotsTag = res.headers.get("x-robots-tag");
      if (xRobotsTag && (xRobotsTag.includes("noindex") || xRobotsTag.includes("nofollow"))) {
        issues.push({
          type: "critical", category: "headers",
          message: `X-Robots-Tag contiene: ${xRobotsTag}`,
          fix: "Rimuovi noindex/nofollow dall'header X-Robots-Tag",
        });
      }
    } catch {
      issues.push({
        type: "critical", category: "accessibilita",
        message: "Il sito non risponde",
      });
    }

    // Score
    const blocked = crawlers.filter((c) => c.status === "blocked").length;
    const allowed = crawlers.filter((c) => c.status === "allowed").length;
    const crawlerScore = Math.round((allowed / crawlers.length) * 100);
    const sitemapScore = sitemap.found ? 100 : 0;
    const robotsScore = robotsTxt ? 100 : 50;
    const criticals = issues.filter((i) => i.type === "critical").length;
    const penalty = criticals * 15;
    const score = Math.max(0, Math.round(crawlerScore * 0.5 + sitemapScore * 0.25 + robotsScore * 0.25 - penalty));

    const result: CrawlabilityResult = {
      id: crypto.randomUUID(),
      url: baseUrl,
      scannedAt: new Date().toISOString(),
      robotsTxt,
      crawlers,
      sitemap,
      issues,
      score,
    };

    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Errore" }, { status: 500 });
  }
}

function checkCrawlerAccess(robotsTxt: string, crawler: string): { name: string; status: CrawlerStatus; rule?: string } {
  if (!robotsTxt) return { name: crawler, status: "unknown" };

  const lines = robotsTxt.split("\n").map((l) => l.trim());
  let inBlock = false;
  let inWildcard = false;
  let specificAllow = false;
  let specificBlock = false;
  let wildcardBlock = false;
  let rule: string | undefined;

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.startsWith("user-agent:")) {
      const agent = lower.replace("user-agent:", "").trim();
      if (agent === crawler.toLowerCase()) {
        inBlock = true;
        inWildcard = false;
      } else if (agent === "*") {
        inWildcard = true;
        inBlock = false;
      } else {
        inBlock = false;
        inWildcard = false;
      }
    } else if (inBlock && lower.startsWith("disallow:")) {
      const path = lower.replace("disallow:", "").trim();
      if (path === "/" || path === "/*") {
        specificBlock = true;
        rule = line;
      }
    } else if (inBlock && lower.startsWith("allow:")) {
      specificAllow = true;
    } else if (inWildcard && lower.startsWith("disallow:")) {
      const path = lower.replace("disallow:", "").trim();
      if (path === "/" || path === "/*") {
        wildcardBlock = true;
        if (!rule) rule = line;
      }
    }
  }

  if (specificBlock && !specificAllow) return { name: crawler, status: "blocked", rule };
  if (specificAllow) return { name: crawler, status: "allowed" };
  if (wildcardBlock) return { name: crawler, status: "blocked", rule };
  return { name: crawler, status: "allowed" };
}

function extractSitemapUrl(robotsTxt: string): string | undefined {
  const match = robotsTxt.match(/^sitemap:\s*(.+)$/im);
  return match ? match[1].trim() : undefined;
}
