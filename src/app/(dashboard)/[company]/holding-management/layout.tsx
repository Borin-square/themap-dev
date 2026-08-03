"use client";

import { useEffect, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import Link from "next/link";
import { fetchCompanies, type Company } from "@/lib/companies";
import { fetchFeatureState, isFeatureEnabled, type FeatureState } from "@/lib/features";

/**
 * Guard client-side: rispetta i feature flag anche per accesso via URL diretto.
 * Deriva la feature key dal segmento dopo /holding-management/ (es. "alerts" →
 * "holding-management.alerts") e blocca il render se la feature e' disabilitata
 * per questa company.
 *
 * Nota: non e' una barriera di sicurezza (i dati sono protetti lato API),
 * serve a garantire coerenza UX con la Sidebar filtrata.
 */
export default function HoldingManagementGuardLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const pathname = usePathname() || "";
  const slug = params.company as string;

  const [company, setCompany] = useState<Company | null>(null);
  const [featureState, setFeatureState] = useState<FeatureState | null>(null);
  const [ready, setReady] = useState(false);

  // Estrae il segmento dopo /holding-management/ (primo path segment).
  const match = pathname.match(/\/holding-management\/([^/?#]+)/);
  const sub = match?.[1] || "";
  const featureKey = sub ? `holding-management.${sub}` : null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [companies, state] = await Promise.all([fetchCompanies(), fetchFeatureState()]);
      if (cancelled) return;
      setCompany(companies.find((c) => c.slug === slug) ?? null);
      setFeatureState(state);
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, [slug]);

  // Se non c'e' un sub-path riconosciuto (es. /holding-management senza pagina)
  // lasciamo passare — il router mostrera' l'errore 404 nativo.
  if (!featureKey) return <>{children}</>;
  // Finche' non abbiamo caricato lo stato features/companies, non renderizziamo
  // il contenuto (evita flash del content prima del check).
  if (!ready) return null;

  const enabled = company
    ? isFeatureEnabled(featureState!, slug, featureKey, company.type)
    : false;

  if (!enabled) {
    return (
      <div style={{
        maxWidth: 520, margin: "60px auto", padding: 28, textAlign: "center",
        border: "1px solid var(--bd)", borderRadius: 12, background: "var(--cd)",
      }}>
        <div style={{ fontSize: 34, opacity: 0.4, marginBottom: 12 }}>{"\uD83D\uDD12"}</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Feature non abilitata</div>
        <div style={{ fontSize: 12, color: "var(--fg2)", marginBottom: 4 }}>
          <code style={{ fontSize: 11 }}>{featureKey}</code> non e&#39; attiva per <b>{company?.name || slug}</b>.
        </div>
        <div style={{ fontSize: 12, color: "var(--fg3)", marginBottom: 20 }}>
          Un super admin puo&#39; abilitarla da <Link href="/settings" style={{ color: "var(--fg)" }}>Settings → Features</Link>.
        </div>
        <Link href={`/${slug}`} style={{
          display: "inline-block", padding: "8px 16px", fontSize: 12, fontWeight: 600,
          border: "1px solid var(--bd)", borderRadius: 6, textDecoration: "none", color: "var(--fg)",
        }}>← Torna alla home</Link>
      </div>
    );
  }

  return <>{children}</>;
}
