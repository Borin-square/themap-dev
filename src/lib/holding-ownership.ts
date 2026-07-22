import type { SupabaseClient } from "@supabase/supabase-js";

export interface OwnershipRow {
  id: string;
  holding_slug: string;
  operative_slug: string;
  percent: number;
  valid_from: string; // ISO date YYYY-MM-DD
  note: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Restituisce la % di possesso effettiva della holding su ciascuna operativa
 * per una data data (default oggi). Se non c'e' record, ritorna 100 (default).
 */
export function ownershipAt(
  rows: OwnershipRow[],
  holdingSlug: string,
  operativeSlug: string,
  date: string,
): number {
  const candidates = rows
    .filter((r) => r.holding_slug === holdingSlug && r.operative_slug === operativeSlug && r.valid_from <= date)
    .sort((a, b) => b.valid_from.localeCompare(a.valid_from));
  if (candidates.length === 0) return 100;
  return Number(candidates[0].percent);
}

/**
 * Restituisce una mappa operativeSlug → % valida alla data indicata.
 */
export function ownershipMapAt(
  rows: OwnershipRow[],
  holdingSlug: string,
  operativeSlugs: string[],
  date: string,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of operativeSlugs) {
    out[s] = ownershipAt(rows, holdingSlug, s, date);
  }
  return out;
}

/**
 * Loader server-side (usa un client con permessi RLS o service client).
 */
export async function loadOwnership(
  client: SupabaseClient,
  holdingSlug: string,
): Promise<OwnershipRow[]> {
  const { data, error } = await client
    .from("holding_ownership")
    .select("*")
    .eq("holding_slug", holdingSlug)
    .order("valid_from", { ascending: false });
  if (error) throw error;
  return (data ?? []) as OwnershipRow[];
}
