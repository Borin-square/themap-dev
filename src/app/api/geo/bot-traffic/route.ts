import type { BotTrafficCheck, AuditIssue } from "@/lib/geo/types";
import { AI_CRAWLERS } from "@/lib/geo/types";

export const maxDuration = 30;

interface BotTrafficRequest {
  url: string;
}

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
    const crawlerResults: BotTrafficCheck["crawlers"] = [];

    // Test accessibility for each AI crawler by simulating their user-agent
    const crawlerUAs: Record<string, string> = {
      GPTBot: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.0; +https://openai.com/gptbot)",
      "ChatGPT-User": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ChatGPT-User/1.0; +https://openai.com/bot)",
      ClaudeBot: "Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
      PerplexityBot: "Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
      Googlebot: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Google-Extended": "Mozilla/5.0 (compatible; Google-Extended)",
      "OAI-SearchBot": "Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)",
      "Applebot-Extended": "Mozilla/5.0 (compatible; Applebot-Extended/0.3; +http://www.apple.com/go/applebot)",
      "Meta-ExternalAgent": "Mozilla/5.0 (compatible; Meta-ExternalAgent/1.0; +https://developers.facebook.com/docs/sharing/bot)",
      CCBot: "CCBot/2.0 (https://commoncrawl.org/faq/)",
    };

    // Test each crawler in parallel (limited to 5 concurrent)
    const testCrawler = async (name: string): Promise<BotTrafficCheck["crawlers"][0]> => {
      const ua = crawlerUAs[name] || `Mozilla/5.0 (compatible; ${name}/1.0)`;
      try {
        const start = Date.now();
        const res = await fetch(baseUrl, {
          headers: { "User-Agent": ua },
          signal: AbortSignal.timeout(10000),
          redirect: "follow",
        });
        const responseTime = Date.now() - start;
        const accessible = res.ok;
        if (!accessible) {
          issues.push({
            type: res.status === 403 ? "critical" : "warning",
            category: "bot-access",
            message: `${name} riceve HTTP ${res.status}`,
            fix: `Verifica che il server non blocchi il user-agent di ${name}`,
          });
        }
        return { name, accessible, responseTime, statusCode: res.status };
      } catch {
        issues.push({
          type: "warning",
          category: "bot-access",
          message: `${name}: timeout o errore di connessione`,
        });
        return { name, accessible: false };
      }
    };

    // Run tests (sequential to avoid overwhelming the target)
    for (const name of AI_CRAWLERS) {
      crawlerResults.push(await testCrawler(name));
    }

    const accessible = crawlerResults.filter((c) => c.accessible).length;
    const overallScore = Math.round((accessible / crawlerResults.length) * 100);

    if (overallScore < 50) {
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
