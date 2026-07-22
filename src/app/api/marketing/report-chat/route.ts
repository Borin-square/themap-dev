import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { SECTION_TITLES, type ReportLayout, type ReportSectionId } from "@/lib/marketing-config";

async function authOk(req: NextRequest): Promise<boolean> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7);
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data: { user }, error } = await supabase.auth.getUser(token);
  return !!user && !error;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT = `Sei un assistente che aiuta a personalizzare il layout di un report di marketing per un cliente specifico.

Il layout è un JSON con questa forma:
{
  "sections": [{"id": string, "visible": boolean, "title"?: string}],
  "customNotes": string
}

Le sezioni disponibili sono identificate da id fisso. Titoli disponibili:
${Object.entries(SECTION_TITLES).map(([id, t]) => `  - ${id}: ${t}`).join("\n")}

Puoi:
1. Nascondere/mostrare sezioni (toggle visible)
2. Riordinare sezioni (l'ordine dell'array è l'ordine di rendering)
3. Rinominare titoli sezioni (proprietà title)
4. Aggiungere/modificare customNotes (blocco note in fondo al report)

DEVI rispondere SEMPRE in italiano.
Rispondi in modo naturale e conciso spiegando cosa proponi.
Alla fine della tua risposta, se proponi modifiche al layout, includi UN SOLO blocco JSON tra i marker <layout> e </layout> con il nuovo layout completo. Se non proponi modifiche (solo domanda/chiarimento), NON includere il blocco.

Esempio:
"Nascondo la sezione Landing page e sposto i KPI Sito web sopra.
<layout>{"sections":[...],"customNotes":"..."}</layout>"`;

export async function POST(req: NextRequest) {
  if (!(await authOk(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY non configurata" }, { status: 500 });

  const body = await req.json();
  const { history, currentLayout, siteType } = body as {
    history: ChatMessage[];
    currentLayout: ReportLayout;
    siteType: "vetrina" | "ecommerce";
  };

  const anthropic = new Anthropic({ apiKey });

  const userMsg = `TIPO SITO: ${siteType}
LAYOUT ATTUALE:
${JSON.stringify(currentLayout, null, 2)}

Ultima richiesta utente:
${history[history.length - 1]?.content ?? ""}`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [
        ...history.slice(0, -1).map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: userMsg },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const text = textBlock && textBlock.type === "text" ? textBlock.text : "";

    // Extract <layout>...</layout> if present
    let proposedLayout: ReportLayout | null = null;
    const match = text.match(/<layout>([\s\S]*?)<\/layout>/);
    let visibleText = text;
    if (match) {
      try {
        const parsed = JSON.parse(match[1].trim());
        // Validate minimally
        if (parsed && Array.isArray(parsed.sections)) {
          const validIds = new Set(Object.keys(SECTION_TITLES) as ReportSectionId[]);
          const sections = parsed.sections
            .filter((s: unknown) => s && typeof s === "object" && typeof (s as { id?: unknown }).id === "string" && validIds.has((s as { id: string }).id as ReportSectionId))
            .map((s: { id: string; visible?: boolean; title?: string }) => ({
              id: s.id as ReportSectionId,
              visible: s.visible !== false,
              title: typeof s.title === "string" ? s.title : undefined,
            }));
          proposedLayout = {
            sections,
            customNotes: typeof parsed.customNotes === "string" ? parsed.customNotes : (currentLayout.customNotes || ""),
          };
        }
      } catch { /* ignore parse errors */ }
      visibleText = text.replace(/<layout>[\s\S]*?<\/layout>/, "").trim();
    }

    return NextResponse.json({ reply: visibleText, proposedLayout });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Errore Claude API" }, { status: 500 });
  }
}
