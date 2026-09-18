"use client";

import {
  type CompanyMap,
  type ResolvedSnapshot,
  type AggregatedRoute,
  PORTFOLIO_LABELS,
  MATURITY_LABELS,
  formatEuro,
  formatInt,
  revenuePerPerson,
} from "@/lib/serenissima";

interface Props {
  company: CompanyMap | null;
  snapshot: ResolvedSnapshot | null;
  prevSnapshot: ResolvedSnapshot | null;
  routesOut: AggregatedRoute[];
  routesIn: AggregatedRoute[];
  companyNames: Map<string, string>;
  year: number;
  onClose: () => void;
}

export default function CompanyPanel({
  company, snapshot, prevSnapshot, routesOut, routesIn, companyNames, year, onClose,
}: Props) {
  if (!company) return null;

  const rpp = revenuePerPerson(snapshot?.revenue ?? null, snapshot?.headcount ?? null);
  const prevRpp = revenuePerPerson(prevSnapshot?.revenue ?? null, prevSnapshot?.headcount ?? null);
  const ebitdaMargin = snapshot?.revenue && snapshot?.ebitda ? snapshot.ebitda / snapshot.revenue : null;

  const outWon = routesOut.reduce((s, r) => s + r.won_revenue, 0);
  const outClients = routesOut.reduce((s, r) => s + r.distinct_clients, 0);
  const outOpen = routesOut.reduce((s, r) => s + r.open_pipeline, 0);
  const inWon = routesIn.reduce((s, r) => s + r.won_revenue, 0);
  const inClients = routesIn.reduce((s, r) => s + r.distinct_clients, 0);
  const inOpen = routesIn.reduce((s, r) => s + r.open_pipeline, 0);

  return (
    <aside
      style={{
        position: "absolute", top: 0, right: 0, bottom: 0,
        width: 360, maxWidth: "90vw",
        background: "rgba(13,17,23,0.94)",
        backdropFilter: "blur(8px)",
        borderLeft: "1px solid var(--bd)",
        padding: "20px 22px 28px",
        overflowY: "auto",
        color: "var(--fg)",
        boxShadow: "-8px 0 30px rgba(0,0,0,0.4)",
        zIndex: 10,
      }}
      aria-label={`Dettagli ${company.name}`}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 6, background: company.color,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontWeight: 700, fontSize: 15,
          }}>{company.name.charAt(0).toUpperCase()}</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: -0.3 }}>{company.name}</div>
            <div style={{ fontSize: 10, color: "var(--fg3)", letterSpacing: 1.5, textTransform: "uppercase" }}>
              {PORTFOLIO_LABELS[company.portfolio_status]}
              {snapshot?.maturity_stage && ` · ${MATURITY_LABELS[snapshot.maturity_stage]}`}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Chiudi pannello"
          style={{
            background: "transparent", border: "1px solid var(--bd)", color: "var(--fg2)",
            width: 30, height: 30, borderRadius: 6, cursor: "pointer", fontSize: 16,
          }}
        >×</button>
      </div>

      <Section title={`Snapshot ${year}`}>
        <Row label="Persone" value={formatInt(snapshot?.headcount ?? null)} delta={deltaInt(snapshot?.headcount, prevSnapshot?.headcount)} source={snapshot?.source.headcount} />
        <Row label="Fatturato" value={formatEuroOrPre(snapshot)} delta={deltaEuro(snapshot?.revenue, prevSnapshot?.revenue)} source={snapshot?.source.revenue} />
        <Row label="Revenue / persona" value={rpp ? formatEuro(rpp) : "—"} delta={deltaEuro(rpp, prevRpp)} />
        <Row label="EBITDA" value={formatEuro(snapshot?.ebitda ?? null)} delta={deltaEuro(snapshot?.ebitda, prevSnapshot?.ebitda)} source={snapshot?.source.ebitda} />
        <Row label="EBITDA margin" value={ebitdaMargin != null ? `${(ebitdaMargin * 100).toFixed(1)}%` : "—"} />
      </Section>

      <Section title="Profilo strategico">
        <Row label="Expandability" value={company.expandability_score != null ? `${company.expandability_score} / 5` : "—"} />
        <Row label="Confidence" value={company.confidence_score != null ? `${company.confidence_score} / 5` : "—"} />
        <Row label="Ownership" value={company.ownership_pct != null ? `${company.ownership_pct}%` : "—"} />
        <Row label="Business model" value={company.business_model || "—"} />
      </Section>

      <Section title={`Cross-sell in uscita (${year})`}>
        {routesOut.length === 0 ? (
          <Empty text="Nessuna rotta di cross-sell in uscita per questo periodo." />
        ) : (
          <>
            <Row label="Won revenue" value={formatEuro(outWon)} />
            <Row label="Distinct clients" value={formatInt(outClients)} />
            <Row label="Open pipeline" value={formatEuro(outOpen)} />
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
              {routesOut.map((r) => (
                <RouteRow key={`out-${r.dest_slug}`} label={`→ ${companyNames.get(r.dest_slug) || r.dest_slug}`} r={r} />
              ))}
            </div>
          </>
        )}
      </Section>

      <Section title={`Cross-sell in entrata (${year})`}>
        {routesIn.length === 0 ? (
          <Empty text="Nessuna rotta di cross-sell in entrata per questo periodo." />
        ) : (
          <>
            <Row label="Won revenue" value={formatEuro(inWon)} />
            <Row label="Distinct clients" value={formatInt(inClients)} />
            <Row label="Open pipeline" value={formatEuro(inOpen)} />
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
              {routesIn.map((r) => (
                <RouteRow key={`in-${r.source_slug}`} label={`← ${companyNames.get(r.source_slug) || r.source_slug}`} r={r} />
              ))}
            </div>
          </>
        )}
      </Section>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--fg3)", marginBottom: 10 }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{children}</div>
    </div>
  );
}

function Row({ label, value, delta, source }: { label: string; value: string; delta?: string | null; source?: "override" | "app_state" | "missing" }) {
  const sourceDot = source === "override" ? { color: "#f2c14e", title: "Override manuale" }
                  : source === "app_state" ? { color: "#4f8cff", title: "Da economic engine / people" }
                  : source === "missing" ? { color: "#6e7681", title: "Dato mancante" }
                  : null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "6px 0", borderBottom: "1px solid var(--bd2)" }}>
      <span style={{ fontSize: 12, color: "var(--fg2)", display: "flex", alignItems: "center", gap: 6 }}>
        {sourceDot && <span title={sourceDot.title} style={{ width: 5, height: 5, borderRadius: "50%", background: sourceDot.color }} />}
        {label}
      </span>
      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--fg)" }}>
        {value}
        {delta && <span style={{ marginLeft: 8, fontSize: 11, color: delta.startsWith("+") ? "var(--grn)" : delta.startsWith("−") ? "var(--red)" : "var(--fg3)" }}>{delta}</span>}
      </span>
    </div>
  );
}

function RouteRow({ label, r }: { label: string; r: AggregatedRoute }) {
  return (
    <div style={{ padding: "8px 10px", background: "rgba(255,255,255,0.03)", borderRadius: 6, border: "1px solid var(--bd2)" }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--fg)", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 10, color: "var(--fg3)", letterSpacing: 0.5 }}>
        Won {formatEuro(r.won_revenue)} · {r.distinct_clients} clienti · Pipeline {formatEuro(r.open_pipeline)}
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div style={{ fontSize: 11, color: "var(--fg3)", padding: 12, border: "1px dashed var(--bd)", borderRadius: 6 }}>{text}</div>
  );
}

function formatEuroOrPre(s: ResolvedSnapshot | null): string {
  if (!s) return "—";
  if (s.revenue_status === "pre_revenue") return "pre-revenue";
  return formatEuro(s.revenue);
}

function deltaInt(cur: number | null | undefined, prev: number | null | undefined): string | null {
  if (cur == null || prev == null) return null;
  const d = cur - prev;
  if (d === 0) return "=";
  return `${d > 0 ? "+" : "−"}${Math.abs(d)}`;
}

function deltaEuro(cur: number | null | undefined, prev: number | null | undefined): string | null {
  if (cur == null || prev == null || prev === 0) return null;
  const d = cur - prev;
  if (Math.abs(d) < 1) return "=";
  const pct = (d / Math.abs(prev)) * 100;
  return `${d > 0 ? "+" : "−"}${Math.abs(pct).toFixed(0)}%`;
}
