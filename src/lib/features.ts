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
  { key: "marketing.campaign-manager.report", label: "CM · Report", group: "Marketing" },
  { key: "marketing.campaign-manager.impostazioni", label: "CM · Impostazioni", group: "Marketing" },
  { key: "marketing.strategy", label: "Strategy", group: "Marketing" },
  { key: "marketing.brand-asset", label: "Brand Asset", group: "Marketing" },
  { key: "marketing.seo-cluster", label: "SEO Cluster", group: "Marketing" },
  { key: "marketing.geo-tool", label: "GEO Tool", group: "Marketing" },
  { key: "marketing.page-generator", label: "Page Generator", group: "Marketing" },
  { key: "marketing.flywheel", label: "Flywheel", group: "Marketing" },
  // Organization
  { key: "organization.people", label: "People", group: "Organization" },
  { key: "organization.organigramma", label: "Organigramma", group: "Organization" },
  { key: "organization.rituals", label: "Rituals", group: "Organization" },
  { key: "organization.tools", label: "Tools", group: "Organization" },
  { key: "organization.mcp", label: "MCP", group: "Organization" },
  // Holding Management (attivo di default solo sulle aziende type='holding')
  { key: "holding-management.overview", label: "Overview", group: "Holding Management" },
  { key: "holding-management.flywheels", label: "Flywheels", group: "Holding Management" },
  { key: "holding-management.alerts", label: "Alerts", group: "Holding Management" },
  { key: "holding-management.multiyear", label: "Multiyear", group: "Holding Management" },
  { key: "holding-management.rituals", label: "Rituals", group: "Holding Management" },
  { key: "holding-management.vision", label: "Vision", group: "Holding Management" },
  { key: "holding-management.workload", label: "Workload", group: "Holding Management" },
  { key: "holding-management.tasks", label: "Tasks", group: "Holding Management" },
];

// Feature keys che di default sono DISABILITATE (opt-in): visibili solo se
// esplicitamente abilitate in company_features per la company, oppure se
// l'utente e' SUPER_ADMIN.
export const OPT_IN_FEATURES: ReadonlySet<string> = new Set<string>([
  "holding-management.overview",
  "holding-management.flywheels",
  "holding-management.alerts",
  "holding-management.multiyear",
  "holding-management.rituals",
  "holding-management.vision",
  "holding-management.workload",
  "holding-management.tasks",
]);

// Set of "companySlug:featureKey" that are DISABLED (per feature normali)
export type DisabledFeatures = Set<string>;
// Set of "companySlug:featureKey" that are ENABLED (per feature opt-in)
export type EnabledFeatures = Set<string>;

export interface FeatureState {
  disabled: DisabledFeatures;
  enabled: EnabledFeatures;
}

function makeKey(companySlug: string, featureKey: string): string {
  return `${companySlug}:${featureKey}`;
}

export function isFeatureEnabled(
  state: FeatureState | DisabledFeatures,
  companySlug: string,
  featureKey: string,
  companyType?: "holding" | "operative" | "client",
): boolean {
  const disabled = state instanceof Set ? state : state.disabled;
  const enabled = state instanceof Set ? new Set<string>() : state.enabled;
  const k = makeKey(companySlug, featureKey);

  if (OPT_IN_FEATURES.has(featureKey)) {
    // Le opt-in features (Holding Management) sono visibili di default SOLO sulle holding.
    // Su qualsiasi altro type, richiedono abilitazione esplicita in company_features.
    if (companyType === "holding") {
      return !disabled.has(k);
    }
    return enabled.has(k);
  }
  return !disabled.has(k);
}

/** Legacy loader (solo disabled) — usato dai vecchi callsite. */
export async function fetchDisabledFeatures(): Promise<DisabledFeatures> {
  const { disabled } = await fetchFeatureState();
  return disabled;
}

/** Loader completo: separa disabled (default-on) e enabled (opt-in default-off). */
export async function fetchFeatureState(): Promise<FeatureState> {
  const disabled = new Set<string>();
  const enabled = new Set<string>();
  try {
    const { data, error } = await supabase
      .from("company_features")
      .select("company_slug, feature_key, enabled");
    if (error || !data) return { disabled, enabled };
    for (const r of data as { company_slug: string; feature_key: string; enabled: boolean }[]) {
      const k = makeKey(r.company_slug, r.feature_key);
      if (r.enabled === false) disabled.add(k);
      else if (r.enabled === true) enabled.add(k);
    }
  } catch { /* offline — return empty sets */ }
  return { disabled, enabled };
}
