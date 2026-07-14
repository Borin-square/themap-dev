import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { requireAuth } from "../../../_auth";
import type { PgPage } from "@/lib/page-generator";

export const maxDuration = 30;

/* GET /api/page-generator/pages/[id]/example-media
   Fetcha le URL "esempi di design" (page.reference_urls), estrae le <img>
   dall'HTML, restituisce un pool di media candidati per l'aggiunta manuale
   al MediaPanel. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await ctx.params;
  const svc = createServiceClient();

  const { data: page } = await svc.from("pg_pages").select("*").eq("id", id).single<PgPage>();
  if (!page) return NextResponse.json({ error: "Pagina non trovata" }, { status: 404 });

  const urls = page.reference_urls ?? [];
  if (urls.length === 0) {
    return NextResponse.json({ items: [], sources: [] });
  }

  const results = await Promise.all(
    urls.map(async (url) => {
      try {
        const base = new URL(url);
        const res = await fetch(base.toString(), {
          headers: { "User-Agent": "Mozilla/5.0 (the-map-app example-media)" },
          redirect: "follow",
        });
        if (!res.ok) return { url, ok: false, error: `HTTP ${res.status}`, items: [] as ExtractedImg[] };
        const html = await res.text();
        return { url, ok: true, error: null as string | null, items: extractImages(html, base) };
      } catch (e) {
        return { url, ok: false, error: (e as Error).message, items: [] as ExtractedImg[] };
      }
    }),
  );

  // Flatten + dedup by src
  const seen = new Set<string>();
  const items: (ExtractedImg & { sourceUrl: string })[] = [];
  for (const r of results) {
    for (const img of r.items) {
      if (seen.has(img.src)) continue;
      seen.add(img.src);
      items.push({ ...img, sourceUrl: r.url });
    }
  }

  return NextResponse.json({
    items,
    sources: results.map((r) => ({ url: r.url, ok: r.ok, error: r.error, count: r.items.length })),
  });
}

interface ExtractedImg {
  src: string;
  alt: string;
  caption: string;
  width: string | null;
  height: string | null;
}

/** Estrae <img> dall'HTML: src, alt, width/height, e figcaption vicina (se dentro <figure>).
 *  Salta data:URIs, tracking pixel (1x1), URL non http(s). */
function extractImages(html: string, base: URL): ExtractedImg[] {
  const out: ExtractedImg[] = [];

  // Estrai <figure> per catturare figcaption associata
  const figures: { figHtml: string; caption: string }[] = [];
  const figRe = /<figure\b[^>]*>([\s\S]*?)<\/figure>/gi;
  let fm: RegExpExecArray | null;
  while ((fm = figRe.exec(html)) !== null) {
    const inner = fm[1];
    const capM = inner.match(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i);
    figures.push({ figHtml: inner, caption: capM ? stripTags(capM[1]).trim() : "" });
  }

  const imgRe = /<img\b[^>]*>/gi;
  const srcRe = /\bsrc\s*=\s*["']([^"']+)["']/i;
  const dataSrcRe = /\bdata-src\s*=\s*["']([^"']+)["']/i;
  const altRe = /\balt\s*=\s*["']([^"']*)["']/i;
  const widthRe = /\bwidth\s*=\s*["']?(\d+)["']?/i;
  const heightRe = /\bheight\s*=\s*["']?(\d+)["']?/i;

  for (const tag of html.match(imgRe) ?? []) {
    const srcM = tag.match(srcRe) ?? tag.match(dataSrcRe);
    if (!srcM) continue;
    const rawSrc = srcM[1].trim();
    if (rawSrc.startsWith("data:")) continue;
    let src: string;
    try {
      src = new URL(rawSrc, base).toString();
    } catch {
      continue;
    }
    if (!src.startsWith("http://") && !src.startsWith("https://")) continue;

    const alt = (tag.match(altRe)?.[1] ?? "").trim();
    const width = tag.match(widthRe)?.[1] ?? null;
    const height = tag.match(heightRe)?.[1] ?? null;

    // Skip tracking pixel
    if (width === "1" && height === "1") continue;

    // Cerca la figcaption se questo tag è dentro una <figure>
    let caption = "";
    for (const fig of figures) {
      if (fig.figHtml.includes(tag)) {
        caption = fig.caption;
        break;
      }
    }

    out.push({ src, alt, caption, width, height });
  }

  return out;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}
