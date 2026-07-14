import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase-server";
import { requireAuth } from "../../../_auth";

export const maxDuration = 60;

const BUCKET = "brand-assets";
const MAX_SIZE = 15 * 1024 * 1024;
let bucketReady = false;

async function ensureBucket() {
  if (bucketReady) return;
  const sb = createServiceClient();
  const { error } = await sb.storage.createBucket(BUCKET, { public: true });
  if (error && !error.message.includes("already exists")) {
    console.warn("[upload-source] bucket:", error.message);
  }
  bucketReady = true;
}

/* POST /api/page-generator/pages/[id]/upload-source
   Body: FormData { file: File }  (PDF | TXT | MD, max 15MB)
   - Carica il file su Supabase Storage (brand-assets/page-generator/{pageId}/{uuid}.{ext})
   - Estrae il testo (PDF via Claude Haiku, TXT/MD direttamente)
   - Aggiorna pg_pages: source_doc_url + source_doc_extracted */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await ctx.params;

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "File mancante" }, { status: 400 });

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File troppo grande (max 15MB)" }, { status: 400 });
  }

  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const mime = (file.type || "").toLowerCase();
  const isPdf = ext === "pdf" || mime === "application/pdf";
  const isText = ["txt", "md", "markdown"].includes(ext) || mime.startsWith("text/");
  if (!isPdf && !isText) {
    return NextResponse.json({ error: "Formato non supportato. Usa PDF, TXT o MD." }, { status: 400 });
  }

  await ensureBucket();
  const svc = createServiceClient();

  const path = `page-generator/${id}/${crypto.randomUUID()}.${ext || "bin"}`;
  const { error: upErr } = await svc.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || (isPdf ? "application/pdf" : "text/plain"),
    upsert: false,
  });
  if (upErr) {
    return NextResponse.json({ error: `Upload fallito: ${upErr.message}` }, { status: 500 });
  }
  const { data: { publicUrl } } = svc.storage.from(BUCKET).getPublicUrl(path);

  let extracted = "";
  try {
    if (isText) {
      extracted = (await file.text()).trim();
    } else {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const b64 = Buffer.from(bytes).toString("base64");
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const resp = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 8000,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: { type: "base64", media_type: "application/pdf", data: b64 },
              },
              {
                type: "text",
                text: "Estrai TUTTO il testo del documento come plain text. Preserva la struttura logica: heading come righe con `## Titolo`, paragrafi separati da riga vuota, elenchi come righe puntate `- item`. Nessun commento, nessuna introduzione, nessun code fence. Solo il testo estratto, così com'è nel documento. Se il documento è vuoto o illeggibile, rispondi con stringa vuota.",
              },
            ],
          },
        ],
      });
      const first = resp.content.find((b) => b.type === "text");
      extracted = first && first.type === "text" ? first.text.trim() : "";
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "errore estrazione";
    console.error("[upload-source] extraction:", msg);
    return NextResponse.json({ error: `Estrazione fallita: ${msg}` }, { status: 500 });
  }

  const { error: updErr } = await svc
    .from("pg_pages")
    .update({
      source_doc_url: publicUrl,
      source_doc_extracted: extracted,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ url: publicUrl, extracted, name: file.name });
}
