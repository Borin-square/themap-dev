import { supabase } from "./supabase";

export interface FeatureDef {
  key: string;
  label: string;
  group: string;
}

export const FEATURE_DEFS: FeatureDef[] = [
  // Strategy
  { key: "strategy.flywheel", label: "Flywheel", group: "Strategy" },
  { key: "strategy.economic-engine", label: "Economic Engine", group: "Strategy" },
  // Marketing
  { key: "marketing.campaigns", label: "Campaign Manager", group: "Marketing" },
  { key: "marketing.strategy", label: "Strategy", group: "Marketing" },
  { key: "marketing.brand-asset", label: "Brand Asset", group: "Marketing" },
  { key: "marketing.seo-cluster", label: "SEO Cluster", group: "Marketing" },
  { key: "marketing.geo-tool", label: "GEO Tool", group: "Marketing" },
  { key: "marketing.flywheel", label: "Flywheel", group: "Marketing" },
  // Organization
  { key: "organization.people", label: "People", group: "Organization" },
  { key: "organization.organigramma", label: "Organigramma", group: "Organization" },
  { key: "organization.rituals", label: "Rituals", group: "Organization" },
  { key: "organization.tools", label: "Tools", group: "Organization" },
  { key: "organization.mcp", label: "MCP", group: "Organization" },
];

// Set of "companySlug:featureKey" that are DISABLED
export type DisabledFeatures = Set<string>;

function makeKey(companySlug: string, featureKey: string): string {
  return `${companySlug}:${featureKey}`;
}

export function isFeatureEnabled(disabled: DisabledFeatures, companySlug: string, featureKey: string): boolean {
  return !disabled.has(makeKey(companySlug, featureKey));
}

export async function fetchDisabledFeatures(): Promise<DisabledFeatures> {
  try {
    const { data, error } = await supabase
      .from("company_features")
      .select("company_slug, feature_key")
      .eq("enabled", false);
    if (error || !data) return new Set();
    return new Set(data.map((r: { company_slug: string; feature_key: string }) => makeKey(r.company_slug, r.feature_key)));
  } catch {
    return new Set();
  }
}
