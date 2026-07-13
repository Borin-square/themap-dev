import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "../_auth";

export const maxDuration = 30;

/* GET /api/page-generator/preview-styles?url=https://sito.it
   Fetcha la homepage, estrae gli <link rel="stylesheet">, scarica il loro
   contenuto, riscrive gli url() relativi in assoluti e restituisce un unico
   blob CSS che l'iframe di preview inietta inline. Evita cross-origin/CSP
   issues del <link> cross-origin in un iframe sandbox. */
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

  const stylesheetUrls: string[] = [];
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
      if (!stylesheetUrls.includes(abs)) stylesheetUrls.push(abs);
    } catch { /* ignore */ }
  }

  // Estrai anche <style>...</style> inline dalla home (spesso il tema mette
  // regole critiche direttamente nel head)
  const inlineStyles: string[] = [];
  const styleTagRe = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let styleMatch: RegExpExecArray | null;
  while ((styleMatch = styleTagRe.exec(html)) !== null) {
    if (styleMatch[1].trim()) inlineStyles.push(styleMatch[1]);
  }

  // Scarica in parallelo tutti i CSS
  const cssBlobs = await Promise.all(
    stylesheetUrls.map(async (u) => {
      try {
        const r = await fetch(u, {
          headers: { "User-Agent": "Mozilla/5.0 (the-map-app preview)" },
          redirect: "follow",
        });
        if (!r.ok) return { url: u, css: "", error: `HTTP ${r.status}` };
        const css = await r.text();
        // Riscrive url() relativi in assoluti rispetto all'URL dello stylesheet
        const rewritten = rewriteCssUrls(css, u);
        return { url: u, css: rewritten, error: null as string | null };
      } catch (e) {
        return { url: u, css: "", error: (e as Error).message };
      }
    }),
  );

  const combined = [
    ...inlineStyles,
    ...cssBlobs.map((b) => b.css).filter(Boolean),
  ].join("\n\n/* --- next stylesheet --- */\n\n");

  return NextResponse.json({
    baseHref: base.origin + "/",
    stylesheetsFound: stylesheetUrls.length,
    inlineStylesFound: inlineStyles.length,
    stylesheetsLoaded: cssBlobs.filter((b) => !b.error).length,
    stylesheetErrors: cssBlobs.filter((b) => b.error).map((b) => ({ url: b.url, error: b.error })),
    css: combined,
    cssBytes: combined.length,
  });
}

/** Riscrive `url(...)` relativi in URL assoluti rispetto allo stylesheet sorgente.
 *  Es. in style.css caricato da https://sito.it/wp-content/themes/x/style.css:
 *    url(fonts/xxx.woff2) → url(https://sito.it/wp-content/themes/x/fonts/xxx.woff2)
 *  Salta data:, http:, https:, // */
function rewriteCssUrls(css: string, sheetUrl: string): string {
  const sheet = new URL(sheetUrl);
  // url("..."), url('...'), url(...)
  return css.replace(/url\(\s*(['"]?)([^'")\s]+)\1\s*\)/g, (_, q, path) => {
    if (
      path.startsWith("data:") ||
      path.startsWith("http://") ||
      path.startsWith("https://") ||
      path.startsWith("//") ||
      path.startsWith("#")
    ) {
      return `url(${q}${path}${q})`;
    }
    try {
      const abs = new URL(path, sheet).toString();
      return `url(${q}${abs}${q})`;
    } catch {
      return `url(${q}${path}${q})`;
    }
  });
}
