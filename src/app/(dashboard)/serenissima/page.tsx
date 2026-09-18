"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { isSuperAdmin } from "@/lib/auth";
import {
  fetchCompanyMaps,
  fetchResolvedSnapshots,
  fetchCrossSell,
  aggregateRoutes,
  CURRENT_YEAR,
  YEAR_MIN, YEAR_MAX,
  type CompanyMap,
  type ResolvedSnapshot,
  type AggregatedRoute,
} from "@/lib/serenissima";
import SerenissimaMap from "@/components/serenissima/SerenissimaMap";
import CompanyPanel from "@/components/serenissima/CompanyPanel";
import YearTimeline from "@/components/serenissima/YearTimeline";
import ViewToggle from "@/components/serenissima/ViewToggle";

function clampYear(y: number): number {
  return Math.max(YEAR_MIN, Math.min(YEAR_MAX, y));
}

export default function SerenissimaPage() {
  const { session } = useAuth();
  const router = useRouter();
  const search = useSearchParams();

  const initialYear = clampYear(parseInt(search.get("year") || String(CURRENT_YEAR)) || CURRENT_YEAR);
  const initialCompany = search.get("company");
  const initialView = search.get("view") === "strategic" ? "strategic" : "world";

  const [year, setYear] = useState(initialYear);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(initialCompany);
  const [view, setView] = useState<"world" | "strategic">(initialView);

  const [companies, setCompanies] = useState<CompanyMap[]>([]);
  const [snapshots, setSnapshots] = useState<Map<string, ResolvedSnapshot>>(new Map());
  const [prevSnapshots, setPrevSnapshots] = useState<Map<string, ResolvedSnapshot>>(new Map());
  const [crossSell, setCrossSell] = useState<AggregatedRoute[]>([]);
  const [loading, setLoading] = useState(true);

  // Sync URL con stato
  useEffect(() => {
    const params = new URLSearchParams();
    if (year !== CURRENT_YEAR) params.set("year", String(year));
    if (selectedSlug) params.set("company", selectedSlug);
    if (view !== "world") params.set("view", view);
    const qs = params.toString();
    const target = qs ? `/serenissima?${qs}` : "/serenissima";
    // replace per non spammare history
    router.replace(target, { scroll: false });
  }, [year, selectedSlug, view, router]);

  // Load companies (una volta)
  useEffect(() => {
    (async () => {
      const c = await fetchCompanyMaps();
      setCompanies(c);
    })();
  }, []);

  // Load snapshots + cross-sell per year
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [snapNow, snapPrev, events] = await Promise.all([
        fetchResolvedSnapshots(year),
        fetchResolvedSnapshots(year - 1),
        fetchCrossSell(year),
      ]);
      if (cancelled) return;
      setSnapshots(snapNow);
      setPrevSnapshots(snapPrev);
      setCrossSell(aggregateRoutes(events));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [year]);

  const companyNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of companies) m.set(c.company_slug, c.name);
    return m;
  }, [companies]);

  const selectedCompany = useMemo(
    () => companies.find((c) => c.company_slug === selectedSlug) || null,
    [companies, selectedSlug]
  );
  const selectedSnapshot = selectedSlug ? snapshots.get(selectedSlug) || null : null;
  const selectedPrev = selectedSlug ? prevSnapshots.get(selectedSlug) || null : null;
  const routesOut = useMemo(() => selectedSlug ? crossSell.filter((r) => r.source_slug === selectedSlug) : [], [crossSell, selectedSlug]);
  const routesIn  = useMemo(() => selectedSlug ? crossSell.filter((r) => r.dest_slug   === selectedSlug) : [], [crossSell, selectedSlug]);

  const handleSelect = useCallback((slug: string | null) => setSelectedSlug(slug), []);
  const closePanel = useCallback(() => setSelectedSlug(null), []);

  return (
    <div style={{ position: "relative", height: "calc(100vh - 56px)", margin: -24, overflow: "hidden" }}>
      <SerenissimaMap
        companies={companies}
        snapshots={snapshots}
        routes={crossSell}
        selectedSlug={selectedSlug}
        onSelect={handleSelect}
        view={view}
      />

      <ViewToggle
        view={view}
        onChange={setView}
        showAdmin={isSuperAdmin(session)}
        onAdminClick={() => router.push("/serenissima/admin")}
      />

      <YearTimeline year={year} onChange={setYear} />

      {selectedCompany && (
        <CompanyPanel
          company={selectedCompany}
          snapshot={selectedSnapshot}
          prevSnapshot={selectedPrev}
          routesOut={routesOut}
          routesIn={routesIn}
          companyNames={companyNames}
          year={year}
          onClose={closePanel}
        />
      )}

      {loading && companies.length === 0 && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#f4e8d0", fontSize: 12, letterSpacing: 3, textTransform: "uppercase" }}>
          Caricamento mappa…
        </div>
      )}
    </div>
  );
}
