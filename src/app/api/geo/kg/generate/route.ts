import type { KGExtractedBlock, KGSuggestion } from "@/lib/geo/types";

export const maxDuration = 30;

interface GenerateRequest {
  blocks: KGExtractedBlock[];
  acceptedSuggestions: KGSuggestion[];
}

function setByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".").filter(Boolean);
  if (parts.length === 0) return;
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const next = cur[key];
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      cur[key] = {};
    }
    cur = cur[key] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

function removeByPath(obj: Record<string, unknown>, path: string): void {
  const parts = path.split(".").filter(Boolean);
  if (parts.length === 0) return;
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const next = cur[key];
    if (!next || typeof next !== "object") return;
    cur = next as Record<string, unknown>;
  }
  delete cur[parts[parts.length - 1]];
}

export async function POST(req: Request) {
  try {
    const { blocks, acceptedSuggestions } = (await req.json()) as GenerateRequest;
    if (!Array.isArray(blocks) || !Array.isArray(acceptedSuggestions)) {
      return Response.json({ error: "Input non valido." }, { status: 400 });
    }

    // Deep-clone original blocks so we don't mutate input
    const workingBlocks: Record<string, unknown>[] = blocks.map((b) => JSON.parse(JSON.stringify(b.parsed)));

    for (const sug of acceptedSuggestions) {
      if (sug.op === "add-schema") {
        if (sug.proposedValue && typeof sug.proposedValue === "object") {
          workingBlocks.push(sug.proposedValue as Record<string, unknown>);
        }
        continue;
      }

      const idx = sug.schemaIndex;
      if (idx === null || idx === undefined || idx < 0 || idx >= workingBlocks.length) continue;
      if (!sug.fieldPath) continue;

      const target = workingBlocks[idx];
      if (sug.op === "remove") {
        removeByPath(target, sug.fieldPath);
      } else {
        // add / modify
        setByPath(target, sug.fieldPath, sug.proposedValue);
      }
    }

    const finalMarkup = workingBlocks
      .map((b) => `<script type="application/ld+json">\n${JSON.stringify(b, null, 2)}\n</script>`)
      .join("\n\n");

    return Response.json({ finalMarkup, blocks: workingBlocks });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Errore" }, { status: 500 });
  }
}
