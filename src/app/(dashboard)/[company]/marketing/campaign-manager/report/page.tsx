"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getCompany } from "@/lib/companies";
import {
  emptyMktgConfig, defaultLayoutFor, SECTION_TITLES,
  type MktgConfig, type ReportLayout, type ReportSectionId, type SiteType,
} from "@/lib/marketing-config";
import { ReportChat } from "./ReportChat";

// Square Marketing palette (blue mono)
const B = {
  b900: "#1E3A8A", b700: "#1D4ED8", b600: "#2563EB", b500: "#3B82F6",
  b400: "#60A5FA", b300: "#93C5FD", b200: "#BFDBFE", b100: "#DBEAFE",
  slate: "#94A3B8", slate2: "#CBD5E1",
};

const MONTHS = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];

interface RangeOpt { key: string; label: string; }

function buildRangeOpts(): RangeOpt[] {
  const now = new Date();
  const year = now.getFullYear();
  const monthIdx = now.getMonth();
  const opts: RangeOpt[] = [
    { key: "u7", label: "Ultimi 7 giorni" },
    { key: "u30", label: "Ultimi 30 giorni" },
    { key: "mese", label: MONTHS[monthIdx] + " " + year },
    { key: "mese_prec", label: MONTHS[(monthIdx + 11) % 12] + " " + (monthIdx === 0 ? year - 1 : year) },
    { key: "ytd", label: "YTD " + year },
  ];
  // Mesi individuali dell'anno in corso da gen fino al mese corrente
  for (let i = 0; i <= monthIdx; i++) {
    if (i === monthIdx) continue; // già in "mese"
    opts.push({ key: `m${i}`, label: MONTHS[i] });
  }
  return opts;
}

// Deterministic pseudo-random per generare numeri stabili per (companySlug, rangeKey)
function seedRand(seed: string) {
  let s = 0;
  for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function mockKpis(seed: string, range: string, siteType: SiteType): Kpis {
  const rand = seedRand(seed + "|" + range);
  const factor = range === "u7" ? 0.25 : range === "u30" ? 1 : range === "mese" ? 1.1 : range === "mese_prec" ? 1.0 : range === "ytd" ? 6.5 : 1.0;
  const base = 100 * factor;
  const sessions = Math.round(base * (300 + rand() * 700));
  const users = Math.round(sessions * (0.65 + rand() * 0.2));
  const formSubmits = Math.max(0, Math.round(base * (rand() * 6)));
  const engagement = 0.55 + rand() * 0.35;
  const adsCost = Math.round(base * (200 + rand() * 500));
  const adsClicks = Math.round(base * (150 + rand() * 400));
  const adsImpr = Math.round(base * (5000 + rand() * 20000));
  const adsConv = Math.max(0, Math.round(base * (4 + rand() * 12)));
  const metaCost = Math.round(base * (80 + rand() * 300));
  const metaLeads = Math.max(0, Math.round(base * (1 + rand() * 6)));
  const investAdv = adsCost + metaCost;
  const contattiAdv = adsConv + metaLeads;
  const cplBlended = contattiAdv > 0 ? investAdv / contattiAdv : 0;
  // Ecommerce KPIs
  const transactions = Math.max(0, Math.round(base * (2 + rand() * 40)));
  const revenue = Math.round(transactions * (60 + rand() * 200));
  const aov = transactions > 0 ? revenue / transactions : 0;
  const convRate = sessions > 0 ? transactions / sessions : 0;
  const roas = adsCost > 0 ? revenue / adsCost : 0;
  return {
    sessions, users, formSubmits, engagement,
    adsCost, adsClicks, adsImpr, adsConv,
    metaCost, metaLeads, investAdv, contattiAdv, cplBlended,
    transactions, revenue, aov, convRate, roas,
    siteType,
    _source: "mock",
  };
}

interface Kpis {
  sessions: number; users: number; formSubmits: number; engagement: number;
  adsCost: number; adsClicks: number; adsImpr: number; adsConv: number;
  metaCost: number; metaLeads: number;
  investAdv: number; contattiAdv: number; cplBlended: number;
  transactions: number; revenue: number; aov: number; convRate: number; roas: number;
  siteType: SiteType;
  _source?: "mock" | "markifact";
  _period?: string;
  _range?: string;
  _channels?: { name: string; sessions: number; contacts?: number }[];
  _landingPages?: { url: string; sessions: number; contacts?: number }[];
  _contactEvent?: string;
}

const fmtInt = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 0 });
const fmtDec = (n: number, d = 1) => n.toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtCur = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const fmtPct = (n: number) => fmtDec(n * 100, Math.abs(n * 100) < 1 ? 2 : 1) + "%";

interface Snapshot { data: unknown; fetched_at: string; }
interface SyncRequest { id: string; range_keys: string[]; status: string; requested_at: string; completed_at: string | null; error: string | null; }

export default function ReportPage() {
  const params = useParams();
  const slug = params.company as string;
  const company = getCompany(slug);
  const [config, setConfig] = useState<MktgConfig>(emptyMktgConfig());
  const [layout, setLayout] = useState<ReportLayout | null>(null);
  const [snapshots, setSnapshots] = useState<Record<string, Snapshot>>({});
  const [lastRequest, setLastRequest] = useState<SyncRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);
  const rangeOpts = useMemo(() => buildRangeOpts(), []);
  const [range, setRange] = useState<string>("u7");

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token || "";
    const [cfgRes, snapRes, reqRes] = await Promise.all([
      fetch(`/api/marketing/config?company=${slug}`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`/api/marketing/snapshot?company=${slug}`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`/api/marketing/sync-request?company=${slug}`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    if (cfgRes.ok) {
      const j = await cfgRes.json();
      const cfg: MktgConfig = j.config
        ? { ...emptyMktgConfig(), ...j.config, accounts: { ...emptyMktgConfig().accounts, ...(j.config.accounts || {}) }, logo: { ...emptyMktgConfig().logo, ...(j.config.logo || {}) } }
        : emptyMktgConfig();
      setConfig(cfg);
      const lay: ReportLayout = j.layout ?? defaultLayoutFor(cfg.siteType);
      setLayout(lay);
      if (cfg.siteType === "ecommerce") setRange("mese");
    }
    if (snapRes.ok) {
      const j = await snapRes.json();
      setSnapshots(j.snapshots || {});
    }
    if (reqRes.ok) {
      const j = await reqRes.json();
      setLastRequest((j.requests && j.requests[0]) || null);
    }
    setLoading(false);
  }, [slug]);

  useEffect(() => { loadData(); }, [loadData]);

  const currentSnapshot = snapshots[range];
  const kpis = useMemo(
    () => (currentSnapshot ? (currentSnapshot.data as Kpis) : mockKpis(slug, range, config.siteType)),
    [currentSnapshot, slug, range, config.siteType],
  );

  async function requestRefresh() {
    setRefreshing(true);
    setRefreshMsg(null);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token || "";
    const res = await fetch(`/api/marketing/sync-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ company: slug, range_keys: rangeOpts.map((o) => o.key) }),
    });
    setRefreshing(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setRefreshMsg("Errore: " + (j.error || res.status));
      return;
    }
    const j = await res.json();
    setLastRequest(j.request);
    setRefreshMsg("Sync richiesto — verrà eseguito alla prossima sessione Claude Code o cron");
    setTimeout(() => setRefreshMsg(null), 6000);
  }

  const logoNode = useMemo(() => {
    if (config.logo.kind === "upload" && config.logo.ref) {
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={config.logo.ref} alt="logo" style={{ height: 38, maxWidth: 170, objectFit: "contain" }} />;
    }
    // Fallback: nome azienda in testo bianco su navy
    return (
      <span style={{ fontFamily: "Georgia, serif", fontSize: 22, fontWeight: 700, color: "#fff", letterSpacing: 0.5 }}>
        {company?.name || slug}
      </span>
    );
  }, [config.logo, company, slug]);

  if (loading || !layout) return <div style={{ color: "var(--fg3)", padding: 30 }}>Caricamento…</div>;

  const visibleSections = layout.sections.filter((s) => s.visible);

  return (
    <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Header dual-brand banda navy */}
        <div style={{ background: B.b900, padding: "20px 24px", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            {logoNode}
            <span style={{ color: "#c9b877", fontSize: 18, opacity: 0.7 }}>×</span>
            <span style={{ fontFamily: "Georgia, serif", fontSize: 15, fontWeight: 500, color: "#fff", letterSpacing: 3 }}>
              SQUARE MARKETING
            </span>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {rangeOpts.map((o) => {
              const active = range === o.key;
              return (
                <button
                  key={o.key}
                  onClick={() => setRange(o.key)}
                  style={{
                    padding: "5px 10px",
                    fontSize: 11,
                    borderRadius: 4,
                    border: `1px solid ${active ? "#c9b877" : "rgba(255,255,255,0.2)"}`,
                    background: active ? "#c9b877" : "transparent",
                    color: active ? B.b900 : "#fff",
                    cursor: "pointer",
                    fontWeight: active ? 700 : 500,
                  }}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Info banner */}
        {!config.accounts.ga4PropertyId && (
          <div style={{ padding: 12, marginBottom: 16, borderRadius: 8, background: "rgba(234, 179, 8, 0.1)", border: "1px solid rgba(234, 179, 8, 0.3)", fontSize: 12, color: "#eab308" }}>
            Nessun ID account configurato. Vai in <Link href={`/${slug}/marketing/campaign-manager/impostazioni`} style={{ color: "#eab308", textDecoration: "underline" }}>Impostazioni</Link> per collegare GA4, Google Ads e Meta.
          </div>
        )}

        {/* Data status + refresh button */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, padding: 10, marginBottom: 16, borderRadius: 6, background: currentSnapshot ? "rgba(34, 197, 94, 0.08)" : "rgba(59, 130, 246, 0.08)", border: `1px solid ${currentSnapshot ? "rgba(34, 197, 94, 0.25)" : "rgba(59, 130, 246, 0.25)"}` }}>
          <div style={{ fontSize: 11, color: currentSnapshot ? "#22c55e" : B.b300 }}>
            {currentSnapshot ? (
              <>
                <b>Dati reali</b> · aggiornati il {new Date(currentSnapshot.fetched_at).toLocaleString("it-IT")}
              </>
            ) : (
              <>
                <b>Dati dimostrativi</b> — nessuno snapshot Markifact per questo range. Clicca <b>Refresh</b> per richiedere il sync.
              </>
            )}
            {lastRequest && lastRequest.status === "pending" && (
              <> · <span style={{ color: "#eab308" }}>sync richiesto {new Date(lastRequest.requested_at).toLocaleString("it-IT")} — in coda</span></>
            )}
            {lastRequest && lastRequest.status === "running" && (
              <> · <span style={{ color: "#eab308" }}>sync in esecuzione…</span></>
            )}
            {lastRequest && lastRequest.status === "error" && lastRequest.error && (
              <> · <span style={{ color: "#ef4444" }}>ultimo sync errore: {lastRequest.error}</span></>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {refreshMsg && <span style={{ fontSize: 11, color: refreshMsg.startsWith("Errore") ? "#ef4444" : "#22c55e" }}>{refreshMsg}</span>}
            <button
              onClick={requestRefresh}
              disabled={refreshing || !config.accounts.ga4PropertyId}
              title={!config.accounts.ga4PropertyId ? "Configura prima gli ID in Impostazioni" : "Richiedi sync dei dati da Markifact"}
              style={{
                padding: "6px 14px",
                fontSize: 11,
                fontWeight: 700,
                borderRadius: 4,
                border: "1px solid " + (config.accounts.ga4PropertyId ? "#22c55e" : "var(--bd)"),
                background: refreshing ? "rgba(34, 197, 94, 0.15)" : (config.accounts.ga4PropertyId ? "#22c55e" : "transparent"),
                color: refreshing ? "#22c55e" : (config.accounts.ga4PropertyId ? "#052e16" : "var(--fg3)"),
                cursor: refreshing || !config.accounts.ga4PropertyId ? "not-allowed" : "pointer",
              }}
            >
              {refreshing ? "…" : "↻ Refresh"}
            </button>
          </div>
        </div>

        {/* Sezioni */}
        {visibleSections.map((sec) => (
          <ReportSection
            key={sec.id}
            id={sec.id}
            title={sec.title ?? SECTION_TITLES[sec.id]}
            kpis={kpis}
            range={range}
            rangeLabel={rangeOpts.find((r) => r.key === range)?.label || ""}
            slug={slug}
          />
        ))}

        {layout.customNotes && (
          <div style={{ padding: 12, borderRadius: 8, background: "rgba(30, 58, 138, 0.15)", border: `1px solid ${B.b700}55`, fontSize: 12, color: B.b200, marginTop: 20 }}>
            <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: B.b300, marginBottom: 6 }}>Note personalizzate</div>
            {layout.customNotes}
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 24, padding: 14, borderTop: "1px solid var(--bd)", fontSize: 10, color: "var(--fg3)", lineHeight: 1.6 }}>
          <div>Square Marketing · Report generato il {new Date().toLocaleDateString("it-IT")}</div>
          <div>Property GA4: {config.accounts.ga4PropertyId || "—"} · Google Ads: {config.accounts.googleAdsValue || "—"} · Meta: {config.accounts.metaAccountId || "—"}</div>
          {config.notes && <div style={{ marginTop: 6, fontStyle: "italic" }}>{config.notes}</div>}
        </div>
      </div>

      {/* Chat */}
      <ReportChat
        company={slug}
        layout={layout}
        siteType={config.siteType}
        onLayoutChange={async (nextLayout) => {
          setLayout(nextLayout);
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token || "";
          await fetch(`/api/marketing/config`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ company: slug, layout: nextLayout }),
          });
        }}
      />
    </div>
  );
}

function ReportSection({
  id, title, kpis, range, rangeLabel, slug,
}: {
  id: ReportSectionId;
  title: string;
  kpis: Kpis;
  range: string;
  rangeLabel: string;
  slug: string;
}) {
  return (
    <div style={{ background: "#fff", color: "#0f172a", borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: "0 1px 3px rgba(15,23,42,0.06)" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: B.b900, letterSpacing: 0.3 }}>{title}</h2>
        <span style={{ fontSize: 10, color: B.slate, letterSpacing: 1.5, textTransform: "uppercase" }}>{rangeLabel}</span>
      </div>
      {renderSection(id, kpis, range, slug)}
    </div>
  );
}

function renderSection(id: ReportSectionId, k: Kpis, range: string, slug: string) {
  switch (id) {
    case "summary-bar":
      return (
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <Cell label="Investimento ADV" value={fmtCur(k.investAdv)} big />
          <Cell label="Google Ads" value={fmtCur(k.adsCost)} />
          <Cell label="Meta" value={fmtCur(k.metaCost)} />
        </div>
      );
    case "kpi-sito":
      return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
          <Cell label="Sessioni" value={fmtInt(k.sessions)} />
          <Cell label="Utenti attivi" value={fmtInt(k.users)} />
          <Cell label={`Contatti (${k._contactEvent || "form_submit"})`} value={fmtInt(k.formSubmits)} star />
          <Cell label="Conv rate sito" value={fmtPct(k.sessions > 0 ? k.formSubmits / k.sessions : 0)} />
          <Cell label="Engagement rate" value={fmtPct(k.engagement)} />
        </div>
      );
    case "kpi-campagne":
      return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
          <Cell label="Contatti da ADV" value={fmtInt(k.contattiAdv)} />
          <Cell label="Investimento" value={fmtCur(k.investAdv)} star />
          <Cell label="CPL medio" value={k.contattiAdv > 0 ? fmtCur(k.cplBlended) : "—"} />
        </div>
      );
    case "session-overview":
      return <TrendChart seed={slug + ":sess:" + range} label="Sessioni giornaliere" />;
    case "contatti-overview":
      return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "center" }}>
          <div style={{ flex: "2 1 320px" }}>
            <TrendChart seed={slug + ":conv:" + range} label="Conversioni giornaliere" />
          </div>
          <div style={{ flex: "1 1 200px" }}>
            <DonutChart data={[
              { name: "Calls from ads", value: Math.round(k.adsConv * 0.35) },
              { name: "Click Tel", value: Math.round(k.adsConv * 0.25) },
              { name: "Submit Form", value: Math.round(k.adsConv * 0.20) },
              { name: "Click Email", value: Math.round(k.adsConv * 0.20) },
            ]} />
          </div>
        </div>
      );
    case "channel-overview":
      return <ChannelTable seed={slug + ":ch:" + range} sessions={k.sessions} formSubmits={k.formSubmits} channels={k._channels} />;
    case "landing-pages":
      return <LandingTable seed={slug + ":lp:" + range} sessions={k.sessions} formSubmits={k.formSubmits} landings={k._landingPages} />;
    case "platform-overview":
      return (
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ flex: "1 1 200px" }}>
            <DonutChart data={[
              { name: "Google Ads", value: k.adsCost },
              { name: "Meta", value: k.metaCost },
            ]} />
          </div>
          <div style={{ flex: "2 1 320px" }}>
            <SimpleTable
              cols={["Piattaforma", "Spesa", "Contatti", "CPL"]}
              rows={[
                ["Google Ads", fmtCur(k.adsCost), fmtInt(k.adsConv), k.adsConv > 0 ? fmtCur(k.adsCost / k.adsConv) : "—"],
                ["Meta", fmtCur(k.metaCost), fmtInt(k.metaLeads), k.metaLeads > 0 ? fmtCur(k.metaCost / k.metaLeads) : "—"],
              ]}
            />
          </div>
        </div>
      );
    case "objective-overview":
      return (
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ flex: "1 1 200px" }}>
            <DonutChart data={[
              { name: "Lead · Ricerca (Google Ads)", value: k.adsCost },
              { name: "Lead Gen (Meta)", value: Math.round(k.metaCost * 0.55) },
              { name: "Traffico (Meta)", value: Math.round(k.metaCost * 0.30) },
              { name: "Awareness (Meta)", value: Math.round(k.metaCost * 0.15) },
            ]} />
          </div>
          <div style={{ flex: "2 1 320px" }}>
            <SimpleTable
              cols={["Obiettivo", "Spesa", "Lead"]}
              rows={[
                ["Lead · Ricerca", fmtCur(k.adsCost), fmtInt(k.adsConv)],
                ["Lead Gen (Meta)", fmtCur(Math.round(k.metaCost * 0.55)), fmtInt(k.metaLeads)],
                ["Traffico (Meta)", fmtCur(Math.round(k.metaCost * 0.30)), "0"],
                ["Awareness (Meta)", fmtCur(Math.round(k.metaCost * 0.15)), "0"],
              ]}
            />
          </div>
        </div>
      );
    case "trend-globale":
      return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
          <div style={{ flex: "1 1 260px" }}><TrendChart seed={slug + ":histS"} label="Sessioni · storico" bars={12} /></div>
          <div style={{ flex: "1 1 260px" }}><TrendChart seed={slug + ":histF"} label="Contatti · storico" bars={12} /></div>
        </div>
      );
    case "kpi-website-ec":
      return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
          <Cell label="Sessioni" value={fmtInt(k.sessions)} />
          <Cell label="Conversioni" value={fmtInt(k.transactions)} />
          <Cell label="Entrate" value={fmtCur(k.revenue)} star />
          <Cell label="AOV" value={fmtCur(k.aov)} />
          <Cell label="Conv rate" value={fmtPct(k.convRate)} />
          <Cell label="ROAS" value={fmtDec(k.roas, 2) + "x"} />
        </div>
      );
    case "revenue-trend":
      return <TrendChart seed={slug + ":rev:" + range} label="Entrate giornaliere" />;
    case "funnel":
      return <Funnel steps={[
        { label: "View item", value: Math.round(k.sessions * 1.4) },
        { label: "Add to cart", value: Math.round(k.sessions * 0.28) },
        { label: "Begin checkout", value: Math.round(k.sessions * 0.09) },
        { label: "Add payment info", value: Math.round(k.sessions * 0.05) },
        { label: "Purchase", value: k.transactions },
      ]} />;
    case "top-products":
      return <SimpleTable
        cols={["Prodotto", "Entrate", "Q.tà vendute", "Q.tà viste"]}
        rows={mockProducts(slug + ":" + range).map((p) => [p.name, fmtCur(p.revenue), fmtInt(p.sold), fmtInt(p.viewed)])}
      />;
    case "channels-ec":
      return <SimpleTable
        cols={["Canale", "Sessioni", "Entrate", "Conv rate"]}
        rows={mockChannels(slug + ":ec:" + range, k.sessions, k.revenue).map((c) => [c.name, fmtInt(c.sessions), fmtCur(c.revenue), fmtPct(c.rate)])}
      />;
    case "devices":
      return <SimpleTable
        cols={["Device", "Sessioni", "Entrate"]}
        rows={[
          ["Mobile", fmtInt(Math.round(k.sessions * 0.62)), fmtCur(Math.round(k.revenue * 0.52))],
          ["Desktop", fmtInt(Math.round(k.sessions * 0.32)), fmtCur(Math.round(k.revenue * 0.42))],
          ["Tablet", fmtInt(Math.round(k.sessions * 0.06)), fmtCur(Math.round(k.revenue * 0.06))],
        ]}
      />;
    case "new-vs-returning":
      return <SimpleTable
        cols={["Tipo", "Sessioni", "Entrate", "Conv rate"]}
        rows={[
          ["New", fmtInt(Math.round(k.sessions * 0.72)), fmtCur(Math.round(k.revenue * 0.58)), fmtPct(k.convRate * 0.85)],
          ["Returning", fmtInt(Math.round(k.sessions * 0.28)), fmtCur(Math.round(k.revenue * 0.42)), fmtPct(k.convRate * 1.35)],
        ]}
      />;
    case "geo-country":
      return <SimpleTable
        cols={["Paese", "Sessioni", "Entrate"]}
        rows={[
          ["Italia", fmtInt(Math.round(k.sessions * 0.68)), fmtCur(Math.round(k.revenue * 0.72))],
          ["Germania", fmtInt(Math.round(k.sessions * 0.09)), fmtCur(Math.round(k.revenue * 0.08))],
          ["Francia", fmtInt(Math.round(k.sessions * 0.08)), fmtCur(Math.round(k.revenue * 0.07))],
          ["Spagna", fmtInt(Math.round(k.sessions * 0.06)), fmtCur(Math.round(k.revenue * 0.05))],
          ["Regno Unito", fmtInt(Math.round(k.sessions * 0.05)), fmtCur(Math.round(k.revenue * 0.04))],
        ]}
      />;
    case "platform-ec":
      return (
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ flex: "1 1 200px" }}>
            <DonutChart data={[
              { name: "Google Ads", value: k.adsCost },
              { name: "Meta", value: k.metaCost },
            ]} />
          </div>
          <div style={{ flex: "2 1 320px" }}>
            <SimpleTable
              cols={["Piattaforma", "Spesa", "Entrate", "ROAS"]}
              rows={[
                ["Google Ads", fmtCur(k.adsCost), fmtCur(Math.round(k.revenue * 0.6)), fmtDec((k.revenue * 0.6) / (k.adsCost || 1), 2) + "x"],
                ["Meta", fmtCur(k.metaCost), fmtCur(Math.round(k.revenue * 0.4)), fmtDec((k.revenue * 0.4) / (k.metaCost || 1), 2) + "x"],
              ]}
            />
          </div>
        </div>
      );
    case "objective-ec":
      return <SimpleTable
        cols={["Obiettivo", "Spesa", "Entrate", "ROAS"]}
        rows={[
          ["Performance Max (GAds)", fmtCur(Math.round(k.adsCost * 0.6)), fmtCur(Math.round(k.revenue * 0.4)), fmtDec(0, 2) + "x"],
          ["Search (GAds)", fmtCur(Math.round(k.adsCost * 0.4)), fmtCur(Math.round(k.revenue * 0.2)), fmtDec(0, 2) + "x"],
          ["Conversioni (Meta)", fmtCur(k.metaCost), fmtCur(Math.round(k.revenue * 0.4)), fmtDec(0, 2) + "x"],
        ]}
      />;
  }
}

function Cell({ label, value, big, star }: { label: string; value: string; big?: boolean; star?: boolean }) {
  return (
    <div style={{ flex: "1 1 120px", minWidth: 108 }}>
      <div style={{ fontSize: 10, color: B.slate, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
        {label} {star && <span style={{ color: "#c9b877" }}>★</span>}
      </div>
      <div style={{ fontSize: big ? 26 : 20, fontWeight: 700, color: "#0f172a", fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

function SimpleTable({ cols, rows }: { cols: string[]; rows: (string | number)[][] }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
      <thead>
        <tr>
          {cols.map((c, i) => (
            <th key={i} style={{ textAlign: i === 0 ? "left" : "right", padding: 8, fontSize: 10, color: B.slate, textTransform: "uppercase", letterSpacing: 1, borderBottom: `1px solid ${B.slate2}` }}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} style={{ borderBottom: `1px solid ${B.b100}` }}>
            {r.map((cell, j) => (
              <td key={j} style={{ padding: "8px 8px", textAlign: j === 0 ? "left" : "right", fontWeight: j === 0 ? 600 : 500, color: "#0f172a", fontVariantNumeric: j === 0 ? "normal" : "tabular-nums" }}>{String(cell)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TrendChart({ seed, label, bars = 30 }: { seed: string; label: string; bars?: number }) {
  const rand = seedRand(seed);
  const data = Array.from({ length: bars }, () => rand());
  const maxV = Math.max(...data, 0.001);
  const W = 600, H = 120;
  return (
    <div>
      <div style={{ fontSize: 10, color: B.slate, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 120 }}>
        <polyline
          fill="none"
          stroke={B.b600}
          strokeWidth={2}
          points={data.map((v, i) => `${(i / (bars - 1)) * W},${H - (v / maxV) * (H - 10) - 5}`).join(" ")}
        />
        {data.map((v, i) => (
          <circle
            key={i}
            cx={(i / (bars - 1)) * W}
            cy={H - (v / maxV) * (H - 10) - 5}
            r={2.5}
            fill={B.b700}
          />
        ))}
      </svg>
    </div>
  );
}

function DonutChart({ data }: { data: { name: string; value: number }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <div style={{ color: B.slate, fontSize: 12 }}>Nessun dato</div>;
  const R = 70, r = 45, cx = 100, cy = 100;
  const palette = [B.b900, B.b700, B.b500, B.b400, B.b300, B.b200];

  let cumAngle = -Math.PI / 2;
  const arcs = data.map((d, i) => {
    const a = (d.value / total) * 2 * Math.PI;
    const start = cumAngle;
    const end = cumAngle + a;
    cumAngle = end;
    const x1 = cx + R * Math.cos(start), y1 = cy + R * Math.sin(start);
    const x2 = cx + R * Math.cos(end), y2 = cy + R * Math.sin(end);
    const ix1 = cx + r * Math.cos(start), iy1 = cy + r * Math.sin(start);
    const ix2 = cx + r * Math.cos(end), iy2 = cy + r * Math.sin(end);
    const large = a > Math.PI ? 1 : 0;
    const path = `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${r} ${r} 0 ${large} 0 ${ix1} ${iy1} Z`;
    return <path key={i} d={path} fill={palette[i % palette.length]} />;
  });

  return (
    <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
      <svg viewBox="0 0 200 200" style={{ width: 160, height: 160 }}>{arcs}</svg>
      <div style={{ fontSize: 11 }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, color: "#0f172a" }}>
            <span style={{ width: 10, height: 10, background: palette[i % palette.length], borderRadius: 2 }} />
            <span>{d.name}</span>
            <span style={{ color: B.slate, fontVariantNumeric: "tabular-nums" }}>{Math.round((d.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const max = Math.max(...steps.map((s) => s.value), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {steps.map((s, i) => {
        const pct = (s.value / max) * 100;
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 130, fontSize: 12, color: "#0f172a" }}>{s.label}</div>
            <div style={{ flex: 1, position: "relative", height: 22, background: B.b100, borderRadius: 4, overflow: "hidden" }}>
              <div style={{ position: "absolute", inset: 0, width: `${pct}%`, background: `linear-gradient(90deg, ${B.b700}, ${B.b500})`, borderRadius: 4 }} />
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", padding: "0 10px", fontSize: 11, fontWeight: 700, color: pct > 30 ? "#fff" : B.b900, fontVariantNumeric: "tabular-nums" }}>
                {s.value.toLocaleString("it-IT")}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function mockProducts(seed: string) {
  const rand = seedRand(seed);
  const names = ["T-shirt Basic", "Sneakers Pro", "Jeans Slim", "Giacca Softshell", "Cappellino Logo", "Zaino Urban", "Felpa Classic", "Occhiali Sun"];
  return names.map((name) => ({
    name,
    revenue: Math.round(2000 + rand() * 12000),
    sold: Math.round(20 + rand() * 200),
    viewed: Math.round(500 + rand() * 4000),
  })).sort((a, b) => b.revenue - a.revenue);
}

function mockChannels(seed: string, sessions: number, revenue: number) {
  const rand = seedRand(seed);
  const channels = ["Organic Search", "Paid Search", "Paid Social", "Direct", "Referral", "Email", "Organic Social"];
  const weights = channels.map(() => 0.05 + rand());
  const total = weights.reduce((s, w) => s + w, 0);
  return channels.map((name, i) => ({
    name,
    sessions: Math.round(sessions * (weights[i] / total)),
    revenue: Math.round(revenue * (weights[i] / total) * (0.7 + rand() * 0.6)),
    rate: 0.005 + rand() * 0.05,
  })).sort((a, b) => b.sessions - a.sessions);
}

function ChannelTable({ seed, sessions, formSubmits, channels }: { seed: string; sessions: number; formSubmits: number; channels?: { name: string; sessions: number; contacts?: number }[] }) {
  if (channels && channels.length > 0) {
    const totalSess = channels.reduce((s, c) => s + c.sessions, 0) || 1;
    return (
      <SimpleTable
        cols={["Canale", "Sessioni", "Contatti (stima)", "Conv rate"]}
        rows={channels.map((c) => {
          const share = c.sessions / totalSess;
          const contacts = typeof c.contacts === "number" ? c.contacts : Math.round(formSubmits * share);
          const rate = c.sessions > 0 ? contacts / c.sessions : 0;
          return [c.name, fmtInt(c.sessions), fmtInt(contacts), fmtPct(rate)];
        })}
      />
    );
  }
  const chans = mockChannels(seed, sessions, formSubmits * 1000);
  return (
    <SimpleTable
      cols={["Canale", "Sessioni", "Contatti", "Conv rate"]}
      rows={chans.map((c) => [c.name, fmtInt(c.sessions), fmtInt(Math.round(c.sessions * 0.015)), fmtPct(0.015)])}
    />
  );
}

function LandingTable({ seed, sessions, formSubmits, landings }: { seed: string; sessions: number; formSubmits: number; landings?: { url: string; sessions: number; contacts?: number }[] }) {
  if (landings && landings.length > 0) {
    return (
      <SimpleTable
        cols={["Landing", "Sessioni", "Contatti"]}
        rows={landings.map((l) => [l.url, fmtInt(l.sessions), fmtInt(l.contacts ?? 0)])}
      />
    );
  }
  const rand = seedRand(seed);
  const urls = ["/", "/servizi", "/contatti", "/prodotti", "/chi-siamo", "/blog", "/preventivo", "/gallery"];
  const rows = urls.map((u) => {
    const w = 0.05 + rand();
    return {
      url: u,
      sessions: Math.round(sessions * w * 0.1),
      form: Math.round(formSubmits * w * 0.1),
    };
  }).sort((a, b) => b.sessions - a.sessions);
  return (
    <SimpleTable
      cols={["Landing", "Sessioni", "Contatti"]}
      rows={rows.map((r) => [r.url, fmtInt(r.sessions), fmtInt(r.form)])}
    />
  );
}
