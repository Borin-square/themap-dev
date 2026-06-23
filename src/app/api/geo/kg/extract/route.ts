import type { KGExtractedUrl, KGExtractedBlock } from "@/lib/geo/types";

export const maxDuration = 60;

const MAX_URLS = 10;

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
  "Accept-Encoding": "gzip, deflate, br",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
};

interface ExtractRequest {
  urls: string[];
}

interface ExtractResponse {
  results: KGExtractedUrl[];
}

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withScheme).toString();
  } catch {
    return null;
  }
}

function extractJsonLdBlocks(html: string): KGExtractedBlock[] {
  const blocks: KGExtractedBlock[] = [];
  const regex = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  let index = 0;

  const pushBlock = (obj: unknown) => {
    if (!obj || typeof obj !== "object") return;
    const parsed = obj as Record<string, unknown>;
    const schemaType = pickSchemaType(parsed);
    blocks.push({
      index: index++,
      schemaType,
      raw: JSON.stringify(parsed, null, 2),
      parsed,
    });
  };

  while ((match = regex.exec(html)) !== null) {
    try {
      const parsed: unknown = JSON.parse(match[1]);
      if (Array.isArray(parsed)) {
        for (const item of parsed) pushBlock(item);
      } else if (parsed && typeof parsed === "object" && Array.isArray((parsed as { "@graph"?: unknown[] })["@graph"])) {
        for (const item of (parsed as { "@graph": unknown[] })["@graph"]) pushBlock(item);
      } else {
        pushBlock(parsed);
      }
    } catch {
      // skip invalid JSON-LD block
    }
  }
  return blocks;
}

function pickSchemaType(block: Record<string, unknown>): string {
  const t = block["@type"];
  if (typeof t === "string") return t.replace(/^.*\//, "");
  if (Array.isArray(t) && t.length > 0 && typeof t[0] === "string") return (t[0] as string).replace(/^.*\//, "");
  return "Unknown";
}

function looksJsRendered(html: string): boolean {
  if (!html) return false;
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const body = bodyMatch ? bodyMatch[1] : html;
  const textWithoutTags = body.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, "").trim();
  const hasNextRoot = /__next|__NEXT_DATA__|id=["']root["']|id=["']app["']|id=["']__nuxt["']/i.test(body);
  return hasNextRoot && textWithoutTags.length < 500;
}

export async function POST(req: Request) {
  try {
    const { urls: rawUrls } = (await req.json()) as ExtractRequest;
    if (!Array.isArray(rawUrls) || rawUrls.length === 0) {
      return Response.json({ error: "Fornire almeno un URL." }, { status: 400 });
    }

    const normalized = rawUrls.map(normalizeUrl).filter((u): u is string => !!u);
    const unique = Array.from(new Set(normalized)).slice(0, MAX_URLS);

    if (unique.length === 0) {
      return Response.json({ error: "Nessun URL valido fornito." }, { status: 400 });
    }

    const results = await Promise.all(unique.map(async (url): Promise<KGExtractedUrl> => {
      const extractedAt = new Date().toISOString();
      try {
        const res = await fetch(url, {
          headers: BROWSER_HEADERS,
          signal: AbortSignal.timeout(15000),
          redirect: "follow",
        });
        if (!res.ok) {
          return {
            url,
            status: "fetch-error",
            httpStatus: res.status,
            error: `HTTP ${res.status}`,
            blocks: [],
            extractedAt,
          };
        }
        const html = await res.text();
        const blocks = extractJsonLdBlocks(html);
        const hasMicrodata = html.includes("itemscope") && html.includes("itemtype");
        const jsRenderedHint = blocks.length === 0 && looksJsRendered(html);
        return {
          url,
          status: blocks.length === 0 ? "no-jsonld" : "ok",
          httpStatus: res.status,
          blocks,
          hasMicrodata,
          jsRenderedHint,
          extractedAt,
        };
      } catch (err) {
        return {
          url,
          status: "fetch-error",
          error: err instanceof Error ? err.message : "Errore sconosciuto",
          blocks: [],
          extractedAt,
        };
      }
    }));

    const payload: ExtractResponse = { results };
    return Response.json(payload);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Errore" }, { status: 500 });
  }
}
