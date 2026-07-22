import { supabase } from "./supabase";

export type CompanyType = "holding" | "operative" | "client";

export interface Company {
  slug: string;
  name: string;
  color: string;
  type: CompanyType;
}

// Fallback for SSR / initial render
export const DEFAULT_COMPANIES: Company[] = [
  { slug: "square-marketing", name: "Square Marketing", color: "#6366f1", type: "client" },
  { slug: "acme", name: "Acme Corp", color: "#4f8cff", type: "client" },
  { slug: "beta", name: "Beta Srl", color: "#22c55e", type: "client" },
  { slug: "gamma", name: "Gamma SpA", color: "#f59e0b", type: "client" },
];

// Cache for client-side
let _cache: Company[] | null = null;

export async function fetchCompanies(): Promise<Company[]> {
  try {
    const { data, error } = await supabase
      .from("companies")
      .select("slug, name, color, type")
      .order("slug");
    if (!error && data && data.length > 0) {
      _cache = data;
      return data;
    }
  } catch { /* fallback */ }
  return DEFAULT_COMPANIES;
}

export function getCachedCompanies(): Company[] {
  return _cache || DEFAULT_COMPANIES;
}

export function getCompany(slug: string): Company | undefined {
  return getCachedCompanies().find((c) => c.slug === slug);
}

// Keep COMPANIES export for backward compat (used in nav.ts initial build)
export const COMPANIES = DEFAULT_COMPANIES;
