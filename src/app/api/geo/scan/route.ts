import { runScan } from "@/lib/geo/scanner";

export const maxDuration = 300;

interface ScanRequest {
  prompt: string;
  llm: string;
  brandName: string;
  competitors: string[];
  siteUrl?: string;
}

/**
 * LEGACY endpoint sync — usato dalla vecchia UI. Il nuovo Prompt Monitor usa
 * /api/geo/scan/enqueue (fire-and-forget) + worker.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ScanRequest;
    const r = await runScan({
      prompt: body.prompt,
      llm: body.llm,
      brandName: body.brandName,
      competitors: body.competitors || [],
      siteUrl: body.siteUrl,
    });
    if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
    return Response.json(r.scan);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto";
    return Response.json({ error: message }, { status: 500 });
  }
}
