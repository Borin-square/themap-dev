import Anthropic from "@anthropic-ai/sdk";
import { TOOLS, executeTool } from "@/lib/hubspot";

// Max duration for Vercel serverless (60s on Hobby, 300s on Pro)
export const maxDuration = 60;

function getClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

const SYSTEM_PROMPT = `Sei un assistente integrato in "The Map", un cruscotto di direzione aziendale.
Hai accesso in sola lettura ai dati HubSpot dell'azienda (contatti, aziende, deal, pipeline, owner).
Rispondi sempre in italiano. Sii conciso e formatta i dati in modo leggibile (usa tabelle quando appropriato).
NON INVENTARE MAI dati, numeri o importi: usa SOLO i dati restituiti dai tool.
Oggi e' ${new Date().toISOString().slice(0, 10)}.

REGOLE:
- Per previsioni/forecast/previsionali sui deal: usa SEMPRE il tool deal_forecast. Aggrega server-side con paginazione.
- Pipeline IDs: "default" = Square Marketing ITA, "19669234" = Square Marketing UAE.
- Trimestri (anno corrente se non specificato): Q1=gen-mar, Q2=apr-giu, Q3=lug-set, Q4=ott-dic.
- Per singoli deal o ricerche per nome: usa search_deals.
- Presenta i numeri in formato italiano (1.234,56 EUR).`;

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    const anthropicMessages: Anthropic.MessageParam[] = messages.map(
      (m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })
    );

    const MAX_ITERATIONS = 5;
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response = await getClient().messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: anthropicMessages,
        tools: TOOLS as Anthropic.Tool[],
      });

      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
      );

      if (toolUseBlocks.length === 0) {
        const textBlock = response.content.find(
          (block): block is Anthropic.TextBlock => block.type === "text"
        );
        return Response.json({ content: textBlock?.text || "" });
      }

      // Add assistant response (may contain both text + tool_use blocks)
      anthropicMessages.push({ role: "assistant", content: response.content });

      // Execute tools and send results back
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const tc of toolUseBlocks) {
        let result: unknown;
        try {
          result = await executeTool(tc.name, tc.input as Record<string, unknown>);
        } catch (e) {
          result = { error: (e as Error).message };
        }
        toolResults.push({
          type: "tool_result",
          tool_use_id: tc.id,
          content: JSON.stringify(result),
        });
      }
      anthropicMessages.push({ role: "user", content: toolResults });
    }

    return Response.json({ content: "Troppe iterazioni. Riprova con una domanda più specifica." });
  } catch (e) {
    console.error("Chat API error:", e);
    const msg = e instanceof Error ? e.message : "Errore sconosciuto";
    return Response.json({ content: `Errore: ${msg}` }, { status: 500 });
  }
}
