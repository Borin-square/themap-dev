import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "../_auth";

export const maxDuration = 15;

/* GET /api/page-generator/preview-styles?url=https://sito.it
   Fetcha la homepage e restituisce gli URL assoluti degli <link rel="stylesheet">.
   Usato dalla preview iframe del Page Generator per replicare gli stili del sito WP. */
export async function GET(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const rawUrl = req.nextUrl.searchParams.get("url");
  if (!rawUrl) return NextResponse.json({ error: "url mancante" }, { status: 400 });

  let base: URL;
  try {
    base = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: "URL non valido" }, { status: 400 });
  }
  if (base.protocol !== "http:" && base.protocol !== "https:") {
    return NextResponse.json({ error: "Solo http/https" }, { status: 400 });
  }

  let html: string;
  try {
    const res = await fetch(base.toString(), {
      headers: { "User-Agent": "Mozilla/5.0 (the-map-app preview)" },
      redirect: "follow",
    });
    if (!res.ok) {
      return NextResponse.json({ error: `Fetch fallito (${res.status})` }, { status: 502 });
    }
    html = await res.text();
  } catch (e) {
    return NextResponse.json({ error: `Fetch errore: ${(e as Error).message}` }, { status: 502 });
  }

  const stylesheets: string[] = [];
  const linkRe = /<link\b[^>]*>/gi;
  const relRe = /\brel\s*=\s*["']?([^"'\s>]+)/i;
  const hrefRe = /\bhref\s*=\s*["']([^"']+)["']/i;

  for (const tag of html.match(linkRe) ?? []) {
    const relMatch = tag.match(relRe);
    if (!relMatch || !/stylesheet/i.test(relMatch[1])) continue;
    const hrefMatch = tag.match(hrefRe);
    if (!hrefMatch) continue;
    try {
      const abs = new URL(hrefMatch[1], base).toString();
      if (!stylesheets.includes(abs)) stylesheets.push(abs);
    } catch { /* ignore */ }
  }

  return NextResponse.json({
    baseHref: base.origin + "/",
    stylesheets,
  });
}
