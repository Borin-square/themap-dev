import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Verifica Bearer token e restituisce l'utente Supabase o null.
 * Estratto da rituals/route.ts + holding-management/alerts/route.ts per non
 * duplicare la logica in ogni nuovo endpoint.
 */
export async function authUser(req: NextRequest): Promise<{ id: string; email?: string | null } | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return { id: user.id, email: user.email };
}
