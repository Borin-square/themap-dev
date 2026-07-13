import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase-server";
import { requireAuth } from "../_auth";

export const maxDuration = 60;

/* GET /api/page-generator/media?page=uuid */
export async function GET(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const page = req.nextUrl.searchParams.get("page");
  if (!page) return NextResponse.json({ error: "page richiesto" }, { status: 400 });

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("pg_media")
    .select("*")
    .eq("page_id", page)
    .order("position", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ media: data ?? [] });
}

/* POST /api/page-generator/media
   Body: { page_id, url, media_type?, alt_text?, caption?, auto_alt?: boolean, kw_context?: string } */
export async function POST(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await req.json() as {
    page_id?: string; url?: string; media_type?: string;
    alt_text?: string; caption?: string;
    auto_alt?: boolean; kw_context?: string;
  };
  if (!body.page_id || !body.url) {
    return NextResponse.json({ error: "page_id e url richiesti" }, { status: 400 });
  }

  let altText = body.alt_text ?? "";
  if (!altText && body.auto_alt) {
    // Genera alt text con Claude a partire dalla caption e dal contesto KW
    try {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const prompt = [
        `Genera un ALT TEXT SEO-friendly in italiano per un'immagine.`,
        body.kw_context ? `Contesto pagina (keyword): ${body.kw_context}` : "",
        body.caption ? `Didascalia: ${body.caption}` : "",
        `URL immagine: ${body.url}`,
        ``,
        `REGOLE:`,
        `- Max 125 caratteri`,
        `- Descrittivo e specifico, non generico`,
        `- Includi la keyword quando naturale, mai forzata`,
        `- Nessuna virgoletta, nessun prefisso "Immagine di..."`,
        ``,
        `Rispondi SOLO con il testo alt, nient'altro.`,
      ].filter(Boolean).join("\n");
      const resp = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 150,
        messages: [{ role: "user", content: prompt }],
      });
      const textBlock = resp.content.find((b) => b.type === "text");
      if (textBlock && textBlock.type === "text") {
        altText = textBlock.text.trim().replace(/^["']|["']$/g, "").slice(0, 200);
      }
    } catch (e) {
      console.error("Alt text generation failed:", (e as Error).message);
    }
  }

  // Calcola position = ultimo + 1
  const svc = createServiceClient();
  const { data: last } = await svc
    .from("pg_media")
    .select("position")
    .eq("page_id", body.page_id)
    .order("position", { ascending: false })
    .limit(1);
  const position = (last?.[0]?.position ?? -1) + 1;

  const { data, error } = await svc.from("pg_media").insert({
    page_id: body.page_id,
    url: body.url,
    media_type: body.media_type || "image",
    alt_text: altText,
    caption: body.caption ?? "",
    position,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ media: data });
}
