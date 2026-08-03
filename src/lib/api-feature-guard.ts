import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { OPT_IN_FEATURES } from "@/lib/features";

/**
 * Verifica lato server che una feature sia abilitata per la company data.
 * Rispetta la stessa logica di isFeatureEnabled() lato client, usando la
 * service-role key per leggere companies + company_features senza dipendere
 * dalle RLS.
 *
 * Ritorna null se ok, altrimenti una NextResponse con lo status appropriato
 * (403 se la feature esiste ma e' spenta; 404 se la company non esiste).
 * Uso tipico nei route handler:
 *
 *   const guard = await guardFeature(company, "holding-management.tasks");
 *   if (guard) return guard;
 */
export async function guardFeature(companySlug: string, featureKey: string): Promise<NextResponse | null> {
  const svc = createServiceClient();

  const { data: company, error: cErr } = await svc
    .from("companies")
    .select("slug, type")
    .eq("slug", companySlug)
    .maybeSingle();
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  if (!company) return NextResponse.json({ error: "Company non trovata" }, { status: 404 });

  const { data: row, error: fErr } = await svc
    .from("company_features")
    .select("enabled")
    .eq("company_slug", companySlug)
    .eq("feature_key", featureKey)
    .maybeSingle();
  if (fErr) return NextResponse.json({ error: fErr.message }, { status: 500 });

  const isOptIn = OPT_IN_FEATURES.has(featureKey);

  let enabled: boolean;
  if (isOptIn) {
    // Feature opt-in: default ON solo sulle holding, altrove richiede
    // enabled=true esplicito in company_features.
    if (company.type === "holding") enabled = row?.enabled !== false;
    else enabled = row?.enabled === true;
  } else {
    // Feature normali: default ON, disattivabili con enabled=false.
    enabled = row?.enabled !== false;
  }

  if (!enabled) {
    return NextResponse.json(
      { error: `Feature '${featureKey}' non abilitata per '${companySlug}'` },
      { status: 403 },
    );
  }
  return null;
}
