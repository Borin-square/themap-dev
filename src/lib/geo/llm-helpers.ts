import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";

export const CLAUDE_MODEL = "claude-sonnet-4-6";
export const OPENAI_MODEL = "gpt-4o";
export const GEMINI_MODEL = "gemini-2.0-flash";

export const LLM_TIMEOUT_MS = 110_000;
export const DEFAULT_MAX_TOKENS = 4096;

export function getAnthropicClient() {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    timeout: LLM_TIMEOUT_MS,
    maxRetries: 1,
  });
}

export function getOpenAIClient() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: LLM_TIMEOUT_MS,
    maxRetries: 1,
  });
}

export function getGeminiClient() {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
}

export function timeoutSignal(ms: number = LLM_TIMEOUT_MS): AbortSignal {
  return AbortSignal.timeout(ms);
}

export function extractJson<T = unknown>(text: string): T | null {
  if (!text) return null;

  let cleaned = text.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) cleaned = fenceMatch[1].trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch { /* fall through */ }

  const start = cleaned.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(cleaned.slice(start, i + 1)) as T;
        } catch { return null; }
      }
    }
  }
  return null;
}

type AnthropicContentBlock = { type: string; text?: string };

export function joinAnthropicText(blocks: AnthropicContentBlock[]): string {
  return blocks
    .filter((b): b is AnthropicContentBlock & { text: string } => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

interface AnthropicAnalysisOptions {
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

export async function callClaudeJson<T>(opts: AnthropicAnalysisOptions): Promise<T | null> {
  const client = getAnthropicClient();
  const res = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
    temperature: opts.temperature ?? 0,
    system: opts.systemPrompt ?? "Rispondi ESCLUSIVAMENTE con un JSON valido, senza testo prima o dopo, senza code fences.",
    messages: [{ role: "user", content: opts.prompt }],
  });
  const text = joinAnthropicText(res.content as AnthropicContentBlock[]);
  return extractJson<T>(text);
}
