import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { type SemanticCluster, type SCConfig, generateQueries } from "@/lib/semantic-cluster";

export const maxDuration = 120;

function getAnthropicClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

function getOpenAIClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

/** Send a single query and get a text response, regardless of LLM */
async function askLLM(llm: string, query: string): Promise<string> {
  try {
    if (llm === "Claude") {
      const r = await getAnthropicClient().messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: [{ role: "user", content: query }],
      });
      const text = r.content.find((b) => b.type === "text");
      return text ? text.text : "";
    }

    if (llm === "ChatGPT") {
      const r = await getOpenAIClient().responses.create({
        model: "gpt-4o",
        tools: [{ type: "web_search_preview" }],
        input: query,
      });
      const msg = r.output.find((b) => b.type === "message");
      if (msg && "content" in msg) {
        const text = msg.content.find((c: { type: string }) => c.type === "output_text");
        return text && "text" in text ? (text as { text: string }).text : "";
      }
      return "";
    }

    return "";
  } catch {
    return "";
  }
}

interface ScanRequest {
  cluster: SemanticCluster;
  config: SCConfig;
  llm: string;
}

interface GapResult {
  type: string;
  description: string;
  severity: string;
  detail: string;
  evidence: string[];
}

interface ScanResult {
  mentioned: boolean;
  position?: number;
  confidence: "low" | "medium" | "high";
  reasoning: string;
  coMentions: string[];
  mentionRate: number;
  shortlistProb: number;
  queries: string[];
  rawResponses: string[];
  gaps: GapResult[];
}

export async function POST(req: Request) {
  try {
    const { cluster, config, llm } = (await req.json()) as ScanRequest;

    if (!config.brandName?.trim()) {
      return Response.json({ error: "Inserisci il nome del brand nella configurazione." }, { status: 400 });
    }

    if (llm === "ChatGPT" && !process.env.OPENAI_API_KEY) {
      return Response.json({ error: "OPENAI_API_KEY non configurata." }, { status: 400 });
    }

    const queries = generateQueries(cluster, config, 20);
    const brand = config.brandName.trim();

    // Phase 1: Send all queries to the selected LLM
    const allResponses: string[] = [];
    const BATCH = 5;

    for (let i = 0; i < queries.length; i += BATCH) {
      const batch = queries.slice(i, i + BATCH);
      const results = await Promise.all(batch.map((q) => askLLM(llm, q)));
      allResponses.push(...results);
    }

    // Phase 2: Analyze all responses with Claude (always the analyzer)
    const analysisPrompt = `Analizza le seguenti ${allResponses.length} risposte date da ${llm} a query di raccomandazione.

BRAND DA CERCARE: "${brand}"

Per ogni risposta, verifica se il brand "${brand}" viene menzionato (anche con varianti del nome, abbreviazioni o riferimenti chiari).

RISPOSTE:
${allResponses.map((r, i) => `--- Risposta ${i + 1} (Query: "${queries[i]}") ---\n${r}\n`).join("\n")}

Rispondi ESCLUSIVAMENTE con un JSON valido (nessun testo prima o dopo) con questa struttura:
{
  "mentionCount": <numero di risposte in cui il brand appare>,
  "totalResponses": ${allResponses.length},
  "positions": [<lista delle posizioni numeriche in cui appare nelle liste, es: [2, 4, 1]>],
  "coMentions": [<lista dei brand/aziende menzionati insieme al brand cercato, senza duplicati>],
  "confidence": "low" | "medium" | "high",
  "reasoning": "<spiegazione sintetica di come e in quali contesti il brand viene menzionato o perche' non lo e'>",
  "shortlisted": <numero di volte in cui il brand appare nelle prime 3 posizioni>
}`;

    const analysis = await getAnthropicClient().messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      messages: [{ role: "user", content: analysisPrompt }],
    });

    const analysisText = analysis.content.find((b) => b.type === "text")?.text || "{}";

    let parsed: {
      mentionCount: number;
      totalResponses: number;
      positions: number[];
      coMentions: string[];
      confidence: "low" | "medium" | "high";
      reasoning: string;
      shortlisted: number;
    };

    try {
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : analysisText);
    } catch {
      return Response.json({ error: "Errore nel parsing della risposta di analisi.", raw: analysisText }, { status: 500 });
    }

    const mentionRate = Math.round((parsed.mentionCount / parsed.totalResponses) * 100);
    const shortlistProb = Math.round((parsed.shortlisted / parsed.totalResponses) * 100);
    const avgPosition = parsed.positions.length > 0
      ? Math.round(parsed.positions.reduce((a, b) => a + b, 0) / parsed.positions.length)
      : undefined;

    // Phase 3: Gap analysis with evidence
    const gapPrompt = `Sei un analista di brand positioning nell'era degli LLM.

BRAND: "${brand}"
CLUSTER SEMANTICO: "${cluster.name}" — ${cluster.description}
COMPETITOR NOTI: ${config.competitors.join(", ") || "non specificati"}

Hai ${allResponses.length} risposte di ${llm} a query su questo cluster. Il brand "${brand}" e' stato menzionato in ${parsed.mentionCount}/${allResponses.length} risposte.

RISPOSTE:
${allResponses.map((r, i) => `--- Risposta ${i + 1} ---\n${r}\n`).join("\n")}

Identifica i GAP del brand rispetto a questo cluster. Per ogni gap, estrai EVIDENZE concrete dalle risposte (citazioni testuali che dimostrano il gap).

Tipi di gap possibili:
- "semantic": il brand non viene associato ai termini/concetti chiave del cluster
- "narrative": il brand non ha una narrativa differenziante, viene descritto genericamente o confuso con altri
- "authority": il brand non viene posizionato come autorevole/esperto, manca da liste di leader
- "proof": mancano prove concrete (case study, numeri, risultati) nelle menzioni
- "competitor_delta": i competitor vengono menzionati piu' spesso, in posizione migliore, o con attributi piu' forti

Rispondi ESCLUSIVAMENTE con un JSON valido:
{
  "gaps": [
    {
      "type": "semantic|narrative|authority|proof|competitor_delta",
      "description": "<descrizione breve del gap>",
      "severity": "low|medium|high|critical",
      "detail": "<spiegazione dettagliata del gap e del suo impatto>",
      "evidence": ["<citazione testuale dalla risposta che dimostra il gap>", "<altra citazione>"]
    }
  ]
}

Sii specifico e basa ogni gap su evidenze reali dalle risposte. Se il brand non e' menzionato affatto, evidenzia chi viene menzionato al suo posto e perche'.`;

    const gapAnalysis = await getAnthropicClient().messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [{ role: "user", content: gapPrompt }],
    });

    const gapText = gapAnalysis.content.find((b) => b.type === "text")?.text || "{}";
    let gaps: GapResult[] = [];
    try {
      const gapJson = gapText.match(/\{[\s\S]*\}/);
      const gapParsed = JSON.parse(gapJson ? gapJson[0] : gapText);
      gaps = gapParsed.gaps || [];
    } catch { /* gap analysis failed, continue without */ }

    const result: ScanResult = {
      mentioned: parsed.mentionCount > 0,
      position: avgPosition,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
      coMentions: parsed.coMentions,
      mentionRate,
      shortlistProb,
      queries,
      rawResponses: allResponses,
      gaps,
    };

    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto";
    return Response.json({ error: message }, { status: 500 });
  }
}
