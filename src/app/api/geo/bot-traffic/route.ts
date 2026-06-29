import type { BotTrafficCheck, AuditIssue } from "@/lib/geo/types";
import { AI_CRAWLERS, AI_CRAWLERS_CRITICAL, AI_CRAWLER_UAS } from "@/lib/geo/types";

export const maxDuration = 120;

const REQUEST_TIMEOUT_MS = 12000;
const CONCURRENCY = 5;

interface BotTrafficRequest {
  url: string;
}

type CrawlerResult = BotTrafficCheck["crawlers"][number];

export async function POST(req: Request) {
  try {
    const { url } = (await req.json()) as BotTrafficRequest;
    if (!url?.trim()) {
      return Response.json({ error: "URL richiesto." }, { status: 400 });
    }

    let baseUrl: string;
    try {
      const u = new URL(url.startsWith("http") ? url : `https://${url}`);
      baseUrl = u.origin;
    } catch {
      return Response.json({ error: "URL non valido." }, { status: 400 });
    }

    const issues: AuditIssue[] = [];

    const testCrawler = async (name: string): Promise<CrawlerResult> => {
      const ua = AI_CRAWLER_UAS[name] || `Mozilla/5.0 (compatible; ${name}/1.0)`;
      try {
        const start = Date.now();
        const res = await fetch(baseUrl, {
          headers: { "User-Agent": ua, "Accept": "text/html,*/*" },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          redirect: "follow",
        });
        const responseTime = Date.now() - start;
        const headers = Object.fromEntries(res.headers.entries());
        const server = headers["server"] || null;

        // Read a chunk of body for challenge detection (max 30KB)
        let body = "";
        try {
          const text = await res.text();
          body = text.slice(0, 30_000);
        } catch { /* ignore */ }

        const wafDetected = detectWAF(headers, body, res.status);
        const isChallenge = wafDetected !== null && (res.status === 403 || res.status === 503 || res.status === 429 || /just a moment|verifying you are human|please enable js|access denied/i.test(body));
        const accessible = res.ok && !isChallenge;

        if (!accessible) {
          const critical = AI_CRAWLERS_CRITICAL.has(name);
          const wafSuffix = wafDetected ? ` (${wafDetected} challenge/block)` : "";
          issues.push({
            type: critical ? "critical" : "warning",
            category: "bot-access",
            message: `${name}: HTTP ${res.status}${wafSuffix}`,
            detail: wafDetected ? `WAF/CDN rilevato: ${wafDetected}. Anche con robots.txt aperto, il bot non riceve il contenuto.` : undefined,
            fix: wafDetected
              ? `Aggiungi una regola di bypass per il User-Agent "${name}" nel firewall/CDN (es. Cloudflare → Security → WAF → Custom Rules → Skip per UA contains "${name}")`
              : `Verifica perché il server risponde con ${res.status} al User-Agent ${name}`,
          });
        }
        return { name, accessible, responseTime, statusCode: res.status, wafDetected, server };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const critical = AI_CRAWLERS_CRITICAL.has(name);
        issues.push({
          type: critical ? "critical" : "warning",
          category: "bot-access",
          message: `${name}: errore di connessione`,
          detail: msg.slice(0, 200),
        });
        return { name, accessible: false, wafDetected: null, server: null };
      }
    };

    // Parallel pool
    const crawlerResults: CrawlerResult[] = [];
    for (let i = 0; i < AI_CRAWLERS.length; i += CONCURRENCY) {
      const batch = AI_CRAWLERS.slice(i, i + CONCURRENCY);
      const settled = await Promise.all(batch.map(testCrawler));
      crawlerResults.push(...settled);
    }

    // Surface global WAF if ALL or most critical bots are blocked by the same WAF
    const wafBlocked = crawlerResults.filter((c) => !c.accessible && c.wafDetected);
    if (wafBlocked.length >= 3) {
      const topWaf = mostFrequent(wafBlocked.map((c) => c.wafDetected as string));
      issues.push({
        type: "critical",
        category: "waf",
        message: `${topWaf} sta bloccando ${wafBlocked.length} crawler AI`,
        detail: "Il robots.txt può anche essere permissivo, ma il WAF intercetta la richiesta prima.",
        fix: `In ${topWaf}: crea una regola che esclude dal challenge i User-Agent dei bot AI principali (GPTBot, Bingbot, PerplexityBot, ClaudeBot, Googlebot).`,
      });
    }

    const accessible = crawlerResults.filter((c) => c.accessible).length;
    const overallScore = Math.round((accessible / crawlerResults.length) * 100);

    if (overallScore < 50 && wafBlocked.length === 0) {
      issues.push({
        type: "critical",
        category: "accessibilita",
        message: `Solo ${accessible}/${crawlerResults.length} crawler AI possono accedere al sito`,
        fix: "Verifica la configurazione del server, WAF, e robots.txt",
      });
    }

    const result: BotTrafficCheck = {
      id: crypto.randomUUID(),
      url: baseUrl,
      scannedAt: new Date().toISOString(),
      crawlers: crawlerResults,
      overallScore,
      issues,
    };

    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Errore" }, { status: 500 });
  }
}

/** Riconosce CDN/WAF principali da header e body. Restituisce nome (es. "Cloudflare") o null. */
function detectWAF(headers: Record<string, string>, body: string, status: number): string | null {
  const server = (headers["server"] || "").toLowerCase();
  const has = (k: string) => headers[k.toLowerCase()] !== undefined;

  // Cloudflare
  if (server.includes("cloudflare") || has("cf-ray") || has("cf-mitigated") || /__cf_bm|cf-chl-bypass|cloudflare/i.test(body)) {
    return "Cloudflare";
  }
  // Akamai
  if (server.includes("akamai") || has("akamai-grn") || has("x-akamai-transformed") || /akamai/i.test(body)) {
    return "Akamai";
  }
  // Imperva / Incapsula
  if (has("x-iinfo") || has("x-cdn") && headers["x-cdn"]?.toLowerCase().includes("imperva") || /incapsula|imperva/i.test(body)) {
    return "Imperva";
  }
  // DataDome
  if (has("x-datadome") || has("x-dd-b") || /datadome/i.test(body)) {
    return "DataDome";
  }
  // Sucuri
  if (server.includes("sucuri") || has("x-sucuri-id") || /sucuri/i.test(body)) {
    return "Sucuri";
  }
  // Fastly
  if (server.includes("fastly") || has("fastly-debug-digest")) {
    return "Fastly";
  }
  // AWS WAF (only meaningful if blocked)
  if ((status === 403 || status === 405) && has("x-amzn-requestid") && /captcha|aws-waf/i.test(body)) {
    return "AWS WAF";
  }
  // Generic challenge keywords
  if ((status === 403 || status === 503 || status === 429) && /just a moment|verifying you are human|please enable js|access denied|captcha/i.test(body)) {
    return "WAF generico";
  }
  return null;
}

function mostFrequent<T extends string>(arr: T[]): T {
  const counts = new Map<T, number>();
  for (const v of arr) counts.set(v, (counts.get(v) || 0) + 1);
  let best: T = arr[0]; let max = 0;
  for (const [k, v] of counts) { if (v > max) { max = v; best = k; } }
  return best;
}
