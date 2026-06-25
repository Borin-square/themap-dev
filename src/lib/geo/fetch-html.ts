const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const BOT_UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

export interface FetchHtmlResult {
  ok: true;
  html: string;
  status: number;
  finalUrl: string;
  usedBotFallback: boolean;
}

export interface FetchHtmlError {
  ok: false;
  status: number | null;
  error: string;
}

async function fetchOnce(url: string, userAgent: string): Promise<Response> {
  return fetch(url, {
    headers: {
      "User-Agent": userAgent,
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
}

export async function fetchHtml(url: string): Promise<FetchHtmlResult | FetchHtmlError> {
  try {
    let res = await fetchOnce(url, BROWSER_UA);
    let usedBotFallback = false;

    if (res.status === 403 || res.status === 429) {
      const retry = await fetchOnce(url, BOT_UA);
      if (retry.ok) {
        res = retry;
        usedBotFallback = true;
      }
    }

    if (!res.ok) {
      return { ok: false, status: res.status, error: `Pagina non raggiungibile (HTTP ${res.status})` };
    }

    const html = await res.text();
    return { ok: true, html, status: res.status, finalUrl: res.url, usedBotFallback };
  } catch {
    return { ok: false, status: null, error: "Impossibile raggiungere la pagina" };
  }
}
