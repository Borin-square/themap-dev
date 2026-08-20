"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";

/* ── Types ── */

type OppStatus = "in_valutazione" | "rivelata" | "decisa" | "archiviata";
type Decision = "no" | "osservazione" | "approfondimento";
type CategoryKey = "leader" | "project_quality" | "serenissima_impact" | "portfolio_coherence";
type TabKey = "attive" | "decise" | "archiviate" | "impostazioni";

interface Opportunity {
  id: string;
  holding_slug: string;
  name: string;
  description: string | null;
  leader_proponent: string | null;
  sector: string | null;
  status: OppStatus;
  revealed_at: string | null;
  revealed_by: string | null;
  decision: Decision | null;
  decided_at: string | null;
  decided_by: string | null;
  archived_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface Score {
  id: string;
  opportunity_id: string;
  user_id: string;
  category: CategoryKey;
  criterion_key: string;
  score: number;
  updated_at: string;
}

interface Attachment {
  id: string;
  opportunity_id: string;
  file_name: string;
  storage_path: string;
  public_url: string;
  size_bytes: number | null;
  uploaded_by: string | null;
  uploaded_at: string;
}

interface Settings {
  holding_slug: string;
  no_threshold: number;
  deep_dive_threshold: number;
  leader_min: number;
  partner_user_ids: string[];
}

interface Partner { id: string; email: string; nome: string }
interface UserProfile { id: string; email: string; nome: string; ruolo: string }

/* ── Scorecard ── */

// Scala di voto unificata: 1 = molto negativo … 5 = molto positivo.
// Ogni categoria ha 5 sotto-voci; il peso della sotto-voce (weight) porta il
// voto Likert dentro la scala della categoria (Leader 35, Qualità 25, Impatto
// 25, Coerenza 15). Es. Leader: weight 1.4 → voto 5 = 7 pt.
const VOTE_SCALE = 5;
const VOTE_LABELS = ["Molto negativo", "Negativo", "Neutro", "Positivo", "Molto positivo"];

interface Criterion { key: string; label: string; weight: number }
interface Category { key: CategoryKey; label: string; total: number; criteria: Criterion[] }

const SCORECARD: Category[] = [
  {
    key: "leader", label: "Leader", total: 35,
    criteria: [
      { key: "leader.value_alignment",    label: "Allineamento valoriale",                              weight: 1.4 },
      { key: "leader.responsibility",     label: "Capacità di assumersi responsabilità",                weight: 1.4 },
      { key: "leader.energy_ambition",    label: "Energia e ambizione",                                 weight: 1.4 },
      { key: "leader.learning_ability",   label: "Capacità di imparare",                                weight: 1.4 },
      { key: "leader.dedication",         label: "Possibilità concreta di dedicarsi al progetto",       weight: 1.4 },
    ],
  },
  {
    key: "project_quality", label: "Qualità del progetto", total: 25,
    criteria: [
      { key: "project_quality.market",                label: "Mercato interessante",           weight: 1.0 },
      { key: "project_quality.economic_model",        label: "Modello economico",              weight: 1.0 },
      { key: "project_quality.margin_potential",      label: "Potenziale di marginalità",      weight: 1.0 },
      { key: "project_quality.competitive_advantage", label: "Vantaggio competitivo",          weight: 1.0 },
      { key: "project_quality.cash_generation",       label: "Capacità di generare cassa",     weight: 1.0 },
    ],
  },
  {
    key: "serenissima_impact", label: "Impatto Serenissima", total: 25,
    criteria: [
      { key: "serenissima_impact.useful_skills",           label: "Competenze realmente utili", weight: 1.0 },
      { key: "serenissima_impact.network",                 label: "Network",                    weight: 1.0 },
      { key: "serenissima_impact.commercial_distribution", label: "Distribuzione commerciale",  weight: 1.0 },
      { key: "serenissima_impact.technology",              label: "Tecnologia",                 weight: 1.0 },
      { key: "serenissima_impact.recruiting_organization", label: "Recruiting e organizzazione", weight: 1.0 },
    ],
  },
  {
    key: "portfolio_coherence", label: "Coerenza di portafoglio", total: 15,
    criteria: [
      { key: "portfolio_coherence.risk_concentration",  label: "Concentrazione del rischio",       weight: 0.6 },
      { key: "portfolio_coherence.capital_absorption",  label: "Assorbimento di capitale",         weight: 0.6 },
      { key: "portfolio_coherence.partners_absorption", label: "Assorbimento dei soci",            weight: 0.6 },
      { key: "portfolio_coherence.assets_correlation",  label: "Correlazione con gli altri asset", weight: 0.6 },
      { key: "portfolio_coherence.time_horizon",        label: "Orizzonte temporale",              weight: 0.6 },
    ],
  },
];

const TOTAL_MAX = 100;

/* ── Helpers ── */

async function bearer(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || "";
}

function categoryFor(criterionKey: string): CategoryKey | null {
  const cat = SCORECARD.find((c) => c.criteria.some((cr) => cr.key === criterionKey));
  return cat?.key ?? null;
}

function scoresByUser(scores: Score[], opportunityId: string): Map<string, Map<string, number>> {
  const m = new Map<string, Map<string, number>>();
  for (const s of scores) {
    if (s.opportunity_id !== opportunityId) continue;
    const inner = m.get(s.user_id) ?? new Map<string, number>();
    inner.set(s.criterion_key, s.score);
    m.set(s.user_id, inner);
  }
  return m;
}

function categoryScoreForUser(scores: Score[], opportunityId: string, userId: string, catKey: CategoryKey): number {
  const cat = SCORECARD.find((c) => c.key === catKey);
  if (!cat) return 0;
  let sum = 0;
  for (const cr of cat.criteria) {
    const found = scores.find((s) => s.opportunity_id === opportunityId && s.user_id === userId && s.criterion_key === cr.key);
    if (found) sum += found.score * cr.weight;
  }
  return sum;
}

function totalScoreForUser(scores: Score[], opportunityId: string, userId: string): number {
  let sum = 0;
  for (const cat of SCORECARD) sum += categoryScoreForUser(scores, opportunityId, userId, cat.key);
  return sum;
}

function criteriaCountForUser(scores: Score[], opportunityId: string, userId: string): number {
  const set = new Set<string>();
  for (const s of scores) {
    if (s.opportunity_id === opportunityId && s.user_id === userId) set.add(s.criterion_key);
  }
  return set.size;
}

interface Aggregate {
  hasAll: boolean;
  totals: { userId: string; total: number; complete: boolean }[];
  avgTotal: number | null;
  avgLeader: number | null;
  avgByCategory: Record<CategoryKey, number | null>;
}

function aggregate(scores: Score[], opportunityId: string, partners: Partner[]): Aggregate {
  const totals = partners.map((p) => {
    const total = totalScoreForUser(scores, opportunityId, p.id);
    const complete = criteriaCountForUser(scores, opportunityId, p.id) === 20;
    return { userId: p.id, total, complete };
  });
  const complete = totals.filter((t) => t.complete);
  const hasAll = partners.length === 3 && complete.length === 3;
  const avgTotal = hasAll ? complete.reduce((a, b) => a + b.total, 0) / complete.length : null;

  const avgByCategory: Record<CategoryKey, number | null> = {
    leader: null, project_quality: null, serenissima_impact: null, portfolio_coherence: null,
  };
  for (const cat of SCORECARD) {
    if (hasAll) {
      const sums = partners.map((p) => categoryScoreForUser(scores, opportunityId, p.id, cat.key));
      avgByCategory[cat.key] = sums.reduce((a, b) => a + b, 0) / sums.length;
    }
  }
  return { hasAll, totals, avgTotal, avgLeader: avgByCategory.leader, avgByCategory };
}

function suggestDecision(agg: Aggregate, settings: Settings): { decision: Decision; reason: string } | null {
  if (agg.avgTotal == null) return null;
  if (agg.avgLeader != null && agg.avgLeader < settings.leader_min) {
    return { decision: "no", reason: `Leader medio ${agg.avgLeader.toFixed(1)} sotto soglia (${settings.leader_min})` };
  }
  if (agg.avgTotal < settings.no_threshold) return { decision: "no", reason: `Score ${agg.avgTotal.toFixed(1)} sotto ${settings.no_threshold}` };
  if (agg.avgTotal >= settings.deep_dive_threshold) return { decision: "approfondimento", reason: `Score ${agg.avgTotal.toFixed(1)} ≥ ${settings.deep_dive_threshold}` };
  return { decision: "osservazione", reason: `Score ${agg.avgTotal.toFixed(1)} tra ${settings.no_threshold} e ${settings.deep_dive_threshold}` };
}

function fmtBytes(b: number | null): string {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}

/* ── Page ── */

const DEFAULT_SETTINGS: Settings = {
  holding_slug: "", no_threshold: 60, deep_dive_threshold: 75, leader_min: 20, partner_user_ids: [],
};

export default function OpportunitiesPage() {
  const params = useParams();
  const holdingSlug = params.company as string;
  const { session } = useAuth();

  const [uid, setUid] = useState<string | null>(null);
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS, holding_slug: holdingSlug });
  const [partners, setPartners] = useState<Partner[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("attive");
  const [selectedOppId, setSelectedOppId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [confirmDlg, setConfirmDlg] = useState<{
    title: string; body: string; okLabel?: string; danger?: boolean; onOk: () => void;
  } | null>(null);

  function showMsg(text: string, ok: boolean = true) {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 3000);
  }

  // Recupera auth.uid
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUid(data.user?.id ?? null));
  }, []);

  // Fetch iniziale
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const token = await bearer();
      const res = await fetch(`/api/holding-management/opportunities?holding=${holdingSlug}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (cancelled) return;
      if (!res.ok) { showMsg("Errore caricamento", false); setLoading(false); return; }
      const j = await res.json();
      setOpps(j.opportunities || []);
      setScores(j.scores || []);
      setAttachments(j.attachments || []);
      setSettings({ ...DEFAULT_SETTINGS, ...j.settings, holding_slug: holdingSlug });
      setPartners(j.partners || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [holdingSlug]);

  // Lista utenti (per selettore soci)
  useEffect(() => {
    if (session?.ruolo !== "SUPER_ADMIN" && session?.ruolo !== "ADMIN") return;
    (async () => {
      const token = await bearer();
      const res = await fetch(`/api/users`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const list = await res.json();
      setUsers(Array.isArray(list) ? list : []);
    })();
  }, [session]);

  // Realtime opps + scores + attachments + settings
  useEffect(() => {
    const chOpps = supabase.channel(`hm_opportunities:${holdingSlug}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "hm_opportunities", filter: `holding_slug=eq.${holdingSlug}` }, (payload) => {
        const row = (payload.new ?? payload.old) as Opportunity | null;
        if (!row) return;
        setOpps((prev) => {
          if (payload.eventType === "DELETE") return prev.filter((x) => x.id !== row.id);
          const idx = prev.findIndex((x) => x.id === row.id);
          if (idx === -1) return [row, ...prev];
          const next = prev.slice(); next[idx] = row; return next;
        });
      }).subscribe();

    const chScores = supabase.channel(`hm_opp_scores:${holdingSlug}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "hm_opportunity_scores" }, (payload) => {
        const row = (payload.new ?? payload.old) as Score | null;
        if (!row) return;
        setScores((prev) => {
          if (payload.eventType === "DELETE") return prev.filter((x) => x.id !== row.id);
          const idx = prev.findIndex((x) => x.id === row.id);
          if (idx === -1) return [...prev, row];
          const next = prev.slice(); next[idx] = row; return next;
        });
      }).subscribe();

    const chAtts = supabase.channel(`hm_opp_atts:${holdingSlug}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "hm_opportunity_attachments" }, (payload) => {
        const row = (payload.new ?? payload.old) as Attachment | null;
        if (!row) return;
        setAttachments((prev) => {
          if (payload.eventType === "DELETE") return prev.filter((x) => x.id !== row.id);
          const idx = prev.findIndex((x) => x.id === row.id);
          if (idx === -1) return [row, ...prev];
          const next = prev.slice(); next[idx] = row; return next;
        });
      }).subscribe();

    const chSettings = supabase.channel(`hm_opp_settings:${holdingSlug}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "hm_opportunity_settings", filter: `holding_slug=eq.${holdingSlug}` }, (payload) => {
        const row = payload.new as Settings | null;
        if (!row) return;
        setSettings((prev) => ({ ...prev, ...row }));
      }).subscribe();

    return () => {
      supabase.removeChannel(chOpps);
      supabase.removeChannel(chScores);
      supabase.removeChannel(chAtts);
      supabase.removeChannel(chSettings);
    };
  }, [holdingSlug]);

  const filteredOpps = useMemo(() => {
    if (tab === "attive") return opps.filter((o) => o.status === "in_valutazione" || o.status === "rivelata");
    if (tab === "decise") return opps.filter((o) => o.status === "decisa");
    if (tab === "archiviate") return opps.filter((o) => o.status === "archiviata");
    return [];
  }, [opps, tab]);

  const selectedOpp = useMemo(() => opps.find((o) => o.id === selectedOppId) ?? null, [opps, selectedOppId]);

  const isPartner = uid != null && settings.partner_user_ids.includes(uid);
  const isAdmin = session?.ruolo === "SUPER_ADMIN" || session?.ruolo === "ADMIN";

  /* ── Actions ── */

  async function callAction(payload: object): Promise<{ ok: boolean; err?: string; data?: unknown }> {
    const token = await bearer();
    const res = await fetch(`/api/holding-management/opportunities/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, err: j.error || "Errore" };
    return { ok: true, data: j };
  }

  async function createOpportunity(fields: { name: string; description: string; leader_proponent: string; sector: string }) {
    const token = await bearer();
    const res = await fetch(`/api/holding-management/opportunities`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ holding_slug: holdingSlug, ...fields }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); showMsg(j.error || "Errore creazione", false); return; }
    const j = await res.json();
    setShowNew(false);
    setSelectedOppId(j.row.id);
    showMsg("Opportunità creata");
  }

  async function updateOpportunityFields(id: string, fields: Partial<Opportunity>) {
    const token = await bearer();
    const res = await fetch(`/api/holding-management/opportunities`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id, holding_slug: holdingSlug, ...fields }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); showMsg(j.error || "Errore salvataggio", false); return; }
    showMsg("Salvato");
  }

  async function deleteOpportunity(id: string) {
    const token = await bearer();
    const res = await fetch(`/api/holding-management/opportunities?id=${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); showMsg(j.error || "Errore eliminazione", false); return; }
    if (selectedOppId === id) setSelectedOppId(null);
    showMsg("Eliminata");
  }

  async function saveVote(oppId: string, criterionKey: string, score: number) {
    const catKey = categoryFor(criterionKey);
    if (!catKey) return;
    const token = await bearer();
    const res = await fetch(`/api/holding-management/opportunities/scores`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ opportunity_id: oppId, criterion_key: criterionKey, category: catKey, score }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); showMsg(j.error || "Errore voto", false); }
  }

  async function reveal(oppId: string) {
    const r = await callAction({ action: "reveal", opportunity_id: oppId });
    if (!r.ok) showMsg(r.err || "Errore reveal", false);
    else showMsg("Voti rivelati");
  }
  async function unreveal(oppId: string) {
    const r = await callAction({ action: "unreveal", opportunity_id: oppId });
    if (!r.ok) showMsg(r.err || "Errore", false);
  }
  async function decide(oppId: string, decision: Decision) {
    const r = await callAction({ action: "decide", opportunity_id: oppId, decision });
    if (!r.ok) showMsg(r.err || "Errore", false);
    else showMsg(`Decisione: ${decision}`);
  }
  async function archive(oppId: string) {
    const r = await callAction({ action: "archive", opportunity_id: oppId });
    if (!r.ok) showMsg(r.err || "Errore", false);
  }
  async function unarchive(oppId: string) {
    const r = await callAction({ action: "unarchive", opportunity_id: oppId });
    if (!r.ok) showMsg(r.err || "Errore", false);
  }
  async function saveSettings(patch: Partial<Settings>) {
    const r = await callAction({ action: "settings", holding_slug: holdingSlug, ...patch });
    if (!r.ok) { showMsg(r.err || "Errore", false); return; }
    showMsg("Impostazioni salvate");
    // Refresh partners
    const token = await bearer();
    const res = await fetch(`/api/holding-management/opportunities?holding=${holdingSlug}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) { const j = await res.json(); setPartners(j.partners || []); setSettings({ ...DEFAULT_SETTINGS, ...j.settings, holding_slug: holdingSlug }); }
  }

  async function uploadPdf(oppId: string, file: File) {
    const token = await bearer();
    const fd = new FormData();
    fd.append("file", file);
    fd.append("opportunity_id", oppId);
    const res = await fetch(`/api/holding-management/opportunities/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { showMsg(`Upload fallito: ${j.error || "errore"}`, false); return; }
    showMsg("PDF caricato");
  }

  async function deleteAttachment(id: string) {
    const att = attachments.find((a) => a.id === id);
    setConfirmDlg({
      title: "Elimina PDF",
      body: att ? `Vuoi eliminare "${att.file_name}"?` : "Eliminare questo PDF?",
      okLabel: "Elimina",
      danger: true,
      onOk: async () => {
        const r = await callAction({ action: "attachment_delete", attachment_id: id });
        if (!r.ok) { showMsg(r.err || "Errore", false); return; }
        setAttachments((prev) => prev.filter((x) => x.id !== id));
        showMsg("PDF eliminato");
      },
    });
  }

  /* ── Render ── */

  if (loading) return <div style={{ color: "var(--fg3)", padding: 30 }}>Caricamento…</div>;

  return (
    <div style={{ maxWidth: 1200 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Opportunità</h1>
          <p style={{ fontSize: 12, color: "var(--fg3)", margin: "4px 0 0" }}>
            Scorecard collegiale a 3 soci · voti nascosti fino al reveal · esito suggerito da soglie configurabili
          </p>
        </div>
        {tab !== "impostazioni" && !selectedOppId && (
          <button
            onClick={() => setShowNew(true)}
            style={{ padding: "8px 14px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 }}
          >+ Nuova opportunità</button>
        )}
      </div>

      {msg && (
        <div style={{ position: "fixed", top: 16, right: 16, padding: "10px 16px", background: msg.ok ? "#22c55e" : "#ef4444", color: "#fff", borderRadius: 6, fontSize: 13, zIndex: 1000 }}>
          {msg.text}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--bd)", marginBottom: 20 }}>
        {([
          ["attive", `Attive (${opps.filter((o) => o.status === "in_valutazione" || o.status === "rivelata").length})`],
          ["decise", `Decise (${opps.filter((o) => o.status === "decisa").length})`],
          ["archiviate", `Archiviate (${opps.filter((o) => o.status === "archiviata").length})`],
          ["impostazioni", "Impostazioni"],
        ] as [TabKey, string][]).map(([k, label]) => (
          <button
            key={k}
            onClick={() => { setTab(k); setSelectedOppId(null); }}
            style={{
              padding: "8px 14px", border: "none", background: tab === k ? "var(--cd)" : "transparent",
              color: tab === k ? "var(--fg)" : "var(--fg3)", borderBottom: tab === k ? "2px solid var(--accent)" : "2px solid transparent",
              cursor: "pointer", fontSize: 13, fontWeight: tab === k ? 600 : 400,
            }}
          >{label}</button>
        ))}
      </div>

      {tab === "impostazioni" ? (
        <SettingsPanel
          settings={settings}
          users={users}
          isAdmin={isAdmin}
          onSave={saveSettings}
        />
      ) : selectedOpp ? (
        <OpportunityDetail
          opp={selectedOpp}
          scores={scores}
          attachments={attachments.filter((a) => a.opportunity_id === selectedOpp.id)}
          partners={partners}
          settings={settings}
          currentUid={uid}
          isPartner={isPartner}
          isAdmin={isAdmin}
          onBack={() => setSelectedOppId(null)}
          onUpdate={(patch) => updateOpportunityFields(selectedOpp.id, patch)}
          onDelete={() => deleteOpportunity(selectedOpp.id)}
          onVote={(criterionKey, score) => saveVote(selectedOpp.id, criterionKey, score)}
          onReveal={() => reveal(selectedOpp.id)}
          onUnreveal={() => unreveal(selectedOpp.id)}
          onDecide={(d) => decide(selectedOpp.id, d)}
          onArchive={() => archive(selectedOpp.id)}
          onUnarchive={() => unarchive(selectedOpp.id)}
          onUploadPdf={(file) => uploadPdf(selectedOpp.id, file)}
          onDeleteAttachment={deleteAttachment}
        />
      ) : (
        <OpportunitiesList
          opps={filteredOpps}
          scores={scores}
          partners={partners}
          settings={settings}
          onOpen={setSelectedOppId}
        />
      )}

      {showNew && <NewOpportunityDialog onCancel={() => setShowNew(false)} onCreate={createOpportunity} />}
      {confirmDlg && (
        <ConfirmDialog
          title={confirmDlg.title}
          body={confirmDlg.body}
          okLabel={confirmDlg.okLabel}
          danger={confirmDlg.danger}
          onCancel={() => setConfirmDlg(null)}
          onOk={async () => { const fn = confirmDlg.onOk; setConfirmDlg(null); await fn(); }}
        />
      )}
    </div>
  );
}

/* ── Sub-components ── */

function OpportunitiesList({
  opps, scores, partners, settings, onOpen,
}: {
  opps: Opportunity[]; scores: Score[]; partners: Partner[]; settings: Settings; onOpen: (id: string) => void;
}) {
  if (opps.length === 0) {
    return <div style={{ padding: 40, textAlign: "center", color: "var(--fg3)", fontSize: 13 }}>Nessuna opportunità.</div>;
  }
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {opps.map((opp) => {
        const agg = aggregate(scores, opp.id, partners);
        const suggested = agg.avgTotal != null ? suggestDecision(agg, settings) : null;
        const votedCount = agg.totals.filter((t) => t.complete).length;
        const total = partners.length || 3;
        return (
          <button
            key={opp.id}
            onClick={() => onOpen(opp.id)}
            style={{
              display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 16, alignItems: "center",
              padding: "14px 16px", background: "var(--cd)", border: "1px solid var(--bd)", borderRadius: 8,
              cursor: "pointer", textAlign: "left", color: "var(--fg)",
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{opp.name}</div>
              <div style={{ fontSize: 11, color: "var(--fg3)", marginTop: 2 }}>
                {opp.sector && <>{opp.sector} · </>}
                {opp.leader_proponent && <>Leader: {opp.leader_proponent} · </>}
                {fmtDate(opp.created_at)}
              </div>
            </div>
            <StatusBadge status={opp.status} decision={opp.decision} />
            <div style={{ fontSize: 12, color: "var(--fg3)", minWidth: 90, textAlign: "right" }}>
              {opp.status === "in_valutazione"
                ? `${votedCount}/${total} soci`
                : agg.avgTotal != null
                  ? `${agg.avgTotal.toFixed(1)} / ${TOTAL_MAX}`
                  : "—"}
            </div>
            <div style={{ minWidth: 130, textAlign: "right" }}>
              {opp.decision ? (
                <DecisionBadge decision={opp.decision} />
              ) : suggested && opp.status === "rivelata" ? (
                <span style={{ fontSize: 11, color: "var(--fg3)" }}>Sugg: <DecisionBadge decision={suggested.decision} inline /></span>
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function StatusBadge({ status, decision }: { status: OppStatus; decision: Decision | null }) {
  const label: Record<OppStatus, string> = {
    in_valutazione: "In valutazione", rivelata: "Rivelata", decisa: `Decisa`, archiviata: "Archiviata",
  };
  const color: Record<OppStatus, string> = {
    in_valutazione: "#4f8cff", rivelata: "#f59e0b", decisa: "#22c55e", archiviata: "#6b7280",
  };
  return (
    <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 4, background: color[status] + "22", color: color[status], textTransform: "uppercase", letterSpacing: 0.4 }}>
      {label[status]}{status === "decisa" && decision ? ` · ${decision}` : ""}
    </span>
  );
}

function DecisionBadge({ decision, inline = false }: { decision: Decision; inline?: boolean }) {
  const map: Record<Decision, { label: string; color: string }> = {
    no: { label: "No", color: "#ef4444" },
    osservazione: { label: "Osservazione", color: "#f59e0b" },
    approfondimento: { label: "Approfondimento", color: "#22c55e" },
  };
  const m = map[decision];
  return (
    <span style={{ fontSize: inline ? 11 : 12, fontWeight: 600, padding: inline ? "2px 6px" : "4px 10px", borderRadius: 4, background: m.color + "22", color: m.color }}>
      {m.label}
    </span>
  );
}

function OpportunityDetail(props: {
  opp: Opportunity;
  scores: Score[];
  attachments: Attachment[];
  partners: Partner[];
  settings: Settings;
  currentUid: string | null;
  isPartner: boolean;
  isAdmin: boolean;
  onBack: () => void;
  onUpdate: (patch: Partial<Opportunity>) => void;
  onDelete: () => void;
  onVote: (criterionKey: string, score: number) => void;
  onReveal: () => void;
  onUnreveal: () => void;
  onDecide: (d: Decision) => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onUploadPdf: (file: File) => void;
  onDeleteAttachment: (id: string) => void;
}) {
  const { opp, scores, attachments, partners, settings, currentUid, isPartner, isAdmin } = props;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(opp.name);
  const [description, setDescription] = useState(opp.description || "");
  const [leader, setLeader] = useState(opp.leader_proponent || "");
  const [sector, setSector] = useState(opp.sector || "");
  const [confirmDel, setConfirmDel] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setName(opp.name); setDescription(opp.description || ""); setLeader(opp.leader_proponent || ""); setSector(opp.sector || "");
    setEditing(false);
  }, [opp.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const agg = useMemo(() => aggregate(scores, opp.id, partners), [scores, opp.id, partners]);
  const revealed = opp.status === "rivelata" || opp.status === "decisa" || opp.status === "archiviata";
  const suggested = agg.avgTotal != null ? suggestDecision(agg, settings) : null;

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 16 }}>
        <button onClick={props.onBack} style={{ background: "transparent", border: "1px solid var(--bd)", color: "var(--fg2)", padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>← Indietro</button>
        <StatusBadge status={opp.status} decision={opp.decision} />
      </div>

      {/* Info card */}
      <div style={{ background: "var(--cd)", border: "1px solid var(--bd)", borderRadius: 8, padding: 20, marginBottom: 16 }}>
        {editing ? (
          <div style={{ display: "grid", gap: 10 }}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome opportunità" style={inputStyle} />
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrizione breve" rows={3} style={{ ...inputStyle, resize: "vertical" }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <input value={leader} onChange={(e) => setLeader(e.target.value)} placeholder="Leader proponente" style={inputStyle} />
              <input value={sector} onChange={(e) => setSector(e.target.value)} placeholder="Settore" style={inputStyle} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { props.onUpdate({ name, description, leader_proponent: leader, sector }); setEditing(false); }} style={btnPrimary}>Salva</button>
              <button onClick={() => setEditing(false)} style={btnSecondary}>Annulla</button>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{opp.name}</h2>
                <div style={{ fontSize: 12, color: "var(--fg3)", marginTop: 4 }}>
                  {opp.sector && <>{opp.sector}</>}
                  {opp.leader_proponent && <> · Leader: {opp.leader_proponent}</>}
                  {" · Creata "}{fmtDate(opp.created_at)}
                  {opp.created_by && <> da {opp.created_by}</>}
                </div>
                {opp.description && <p style={{ fontSize: 13, color: "var(--fg2)", margin: "12px 0 0", whiteSpace: "pre-wrap" }}>{opp.description}</p>}
              </div>
              {isAdmin && opp.status !== "archiviata" && (
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => setEditing(true)} style={btnSecondary}>Modifica</button>
                  {confirmDel ? (
                    <>
                      <button onClick={props.onDelete} style={{ ...btnPrimary, background: "#ef4444" }}>Conferma</button>
                      <button onClick={() => setConfirmDel(false)} style={btnSecondary}>Annulla</button>
                    </>
                  ) : (
                    <button onClick={() => setConfirmDel(true)} style={{ ...btnSecondary, color: "#ef4444", borderColor: "#ef4444" }}>Elimina</button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Allegati */}
      <div style={{ background: "var(--cd)", border: "1px solid var(--bd)", borderRadius: 8, padding: 20, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Allegati PDF ({attachments.length})</div>
          {opp.status !== "archiviata" && (
            <label style={{ ...btnSecondary, cursor: uploading ? "wait" : "pointer" }}>
              {uploading ? "Caricamento…" : "+ Carica PDF"}
              <input
                type="file"
                accept="application/pdf"
                style={{ display: "none" }}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setUploading(true);
                  await props.onUploadPdf(f);
                  setUploading(false);
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </div>
        {attachments.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--fg3)" }}>Nessun PDF caricato.</div>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {attachments.map((a) => (
              <div key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "var(--bg)", border: "1px solid var(--bd)", borderRadius: 6 }}>
                <a href={a.public_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--fg)", fontSize: 13, textDecoration: "none" }}>
                  📄 {a.file_name}{a.size_bytes ? <span style={{ color: "var(--fg3)", marginLeft: 6, fontSize: 11 }}>({fmtBytes(a.size_bytes)})</span> : null}
                </a>
                {opp.status !== "archiviata" && (
                  <button onClick={() => props.onDeleteAttachment(a.id)} style={{ background: "transparent", border: "none", color: "var(--fg3)", cursor: "pointer", fontSize: 12 }} title="Elimina">✕</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Scorecard */}
      <div style={{ background: "var(--cd)", border: "1px solid var(--bd)", borderRadius: 8, padding: 20, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Scorecard</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {opp.status === "in_valutazione" && (
              <>
                <div style={{ fontSize: 11, color: "var(--fg3)" }}>
                  {agg.totals.filter((t) => t.complete).length} / {partners.length || 3} soci hanno completato
                </div>
                {isAdmin && (
                  <button
                    onClick={props.onReveal}
                    disabled={!agg.hasAll}
                    style={{ ...btnPrimary, opacity: agg.hasAll ? 1 : 0.5, cursor: agg.hasAll ? "pointer" : "not-allowed" }}
                    title={agg.hasAll ? "Rivela i voti" : "Attendi che tutti i soci votino"}
                  >Rivela voti</button>
                )}
              </>
            )}
            {(opp.status === "rivelata" || opp.status === "decisa") && isAdmin && (
              <button onClick={props.onUnreveal} style={btnSecondary}>Riapri voti</button>
            )}
          </div>
        </div>

        {partners.length < 3 && (
          <div style={{ background: "#f59e0b22", color: "#f59e0b", padding: "10px 14px", borderRadius: 6, fontSize: 12, marginBottom: 12 }}>
            Configura 3 soci nella tab Impostazioni per abilitare la scorecard.
          </div>
        )}

        {revealed ? (
          <RevealedScorecard scores={scores} opp={opp} partners={partners} agg={agg} />
        ) : isPartner && currentUid ? (
          <MyScorecard scores={scores} opportunityId={opp.id} currentUid={currentUid} onVote={props.onVote} />
        ) : (
          <div style={{ fontSize: 12, color: "var(--fg3)", padding: 20, textAlign: "center" }}>
            {isPartner ? "Effettua il login come socio per votare." : "I voti sono visibili solo ai soci configurati. Attendi il reveal."}
          </div>
        )}
      </div>

      {/* Esito + decisione */}
      {revealed && (
        <div style={{ background: "var(--cd)", border: "1px solid var(--bd)", borderRadius: 8, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Esito</div>
          {agg.avgTotal != null && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 32, fontWeight: 700, lineHeight: 1 }}>
                {agg.avgTotal.toFixed(1)}<span style={{ fontSize: 14, color: "var(--fg3)", fontWeight: 400 }}> / {TOTAL_MAX}</span>
              </div>
              {suggested && (
                <div style={{ marginTop: 8, fontSize: 12, color: "var(--fg3)" }}>
                  Suggerimento: <DecisionBadge decision={suggested.decision} inline /> <span style={{ marginLeft: 6 }}>{suggested.reason}</span>
                </div>
              )}
            </div>
          )}
          {opp.status === "decisa" && opp.decision ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 12, color: "var(--fg3)" }}>Decisione:</span>
              <DecisionBadge decision={opp.decision} />
              {opp.decided_by && <span style={{ fontSize: 11, color: "var(--fg3)" }}>({opp.decided_by}, {fmtDate(opp.decided_at)})</span>}
              {isAdmin && opp.status === "decisa" && (
                <button onClick={props.onArchive} style={{ ...btnSecondary, marginLeft: "auto" }}>Archivia</button>
              )}
            </div>
          ) : isAdmin && (opp.status === "rivelata") ? (
            <div style={{ display: "flex", gap: 8 }}>
              {(["no", "osservazione", "approfondimento"] as Decision[]).map((d) => (
                <button
                  key={d}
                  onClick={() => props.onDecide(d)}
                  style={{
                    padding: "8px 14px", border: "1px solid var(--bd)", background: "var(--bg)", color: "var(--fg)",
                    borderRadius: 6, fontSize: 13, cursor: "pointer", textTransform: "capitalize",
                  }}
                >{d}</button>
              ))}
            </div>
          ) : null}
          {opp.status === "archiviata" && isAdmin && (
            <button onClick={props.onUnarchive} style={btnSecondary}>Ripristina</button>
          )}
        </div>
      )}
    </div>
  );
}

function MyScorecard({
  scores, opportunityId, currentUid, onVote,
}: {
  scores: Score[]; opportunityId: string; currentUid: string; onVote: (criterionKey: string, score: number) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ fontSize: 11, color: "var(--fg3)", padding: "6px 10px", background: "var(--bg)", borderRadius: 4 }}>
        Scala: 1 = molto negativo · 2 = negativo · 3 = neutro · 4 = positivo · 5 = molto positivo. Il peso della sotto-voce viene applicato dietro le quinte.
      </div>
      {SCORECARD.map((cat) => {
        const catScore = categoryScoreForUser(scores, opportunityId, currentUid, cat.key);
        return (
          <div key={cat.key}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{cat.label}</div>
              <div style={{ fontSize: 12, color: "var(--fg3)" }}>{catScore.toFixed(1)} / {cat.total}</div>
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {cat.criteria.map((cr) => {
                const currentScore = scores.find((s) => s.opportunity_id === opportunityId && s.user_id === currentUid && s.criterion_key === cr.key)?.score;
                return (
                  <div key={cr.key} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center", padding: "8px 12px", background: "var(--bg)", border: "1px solid var(--bd)", borderRadius: 6 }}>
                    <div style={{ fontSize: 12 }}>{cr.label}</div>
                    <VoteButtons value={currentScore} onChange={(v) => onVote(cr.key, v)} />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function VoteButtons({ value, onChange }: { value: number | undefined; onChange: (v: number) => void }) {
  return (
    <div style={{ display: "flex", gap: 3 }}>
      {Array.from({ length: VOTE_SCALE }, (_, i) => i + 1).map((n) => {
        const selected = value === n;
        return (
          <button
            key={n}
            onClick={() => onChange(n)}
            title={VOTE_LABELS[n - 1]}
            style={{
              width: 32, height: 32, border: "1px solid var(--bd)", borderRadius: 4,
              background: selected ? "var(--accent)" : "var(--cd)", color: selected ? "#fff" : "var(--fg2)",
              cursor: "pointer", fontSize: 13, fontWeight: 600,
            }}
          >{n}</button>
        );
      })}
    </div>
  );
}

function RevealedScorecard({
  scores, opp, partners, agg,
}: {
  scores: Score[]; opp: Opportunity; partners: Partner[]; agg: Aggregate;
}) {
  if (partners.length === 0) return <div style={{ fontSize: 12, color: "var(--fg3)" }}>Nessun socio configurato.</div>;
  return (
    <div>
      {/* Header totali soci */}
      <div style={{ display: "grid", gridTemplateColumns: `1fr repeat(${partners.length}, 60px) 60px`, gap: 8, padding: "8px 12px", background: "var(--bg)", borderRadius: 6, marginBottom: 8, fontSize: 11, fontWeight: 600, color: "var(--fg3)" }}>
        <div></div>
        {partners.map((p) => <div key={p.id} style={{ textAlign: "center" }} title={p.email}>{initials(p.nome || p.email)}</div>)}
        <div style={{ textAlign: "center" }}>Media</div>
      </div>

      {SCORECARD.map((cat) => (
        <div key={cat.key} style={{ marginBottom: 16 }}>
          {/* Riepilogo categoria (punti pesati / totale) */}
          <div style={{ display: "grid", gridTemplateColumns: `1fr repeat(${partners.length}, 60px) 60px`, gap: 8, padding: "8px 12px", background: "var(--cd)", border: "1px solid var(--bd)", borderRadius: 6, marginBottom: 4, alignItems: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{cat.label} <span style={{ color: "var(--fg3)", fontWeight: 400 }}>/ {cat.total} pt</span></div>
            {partners.map((p) => {
              const s = categoryScoreForUser(scores, opp.id, p.id, cat.key);
              return <div key={p.id} style={{ textAlign: "center", fontSize: 12, fontWeight: 600 }}>{s.toFixed(1)}</div>;
            })}
            <div style={{ textAlign: "center", fontSize: 12, fontWeight: 700, color: "var(--accent)" }}>
              {agg.avgByCategory[cat.key]?.toFixed(1) ?? "—"}
            </div>
          </div>

          {/* Sotto-voci: mostra il voto Likert (1-5) di ogni socio + media Likert */}
          {cat.criteria.map((cr) => {
            const per = partners.map((p) => scores.find((s) => s.opportunity_id === opp.id && s.user_id === p.id && s.criterion_key === cr.key)?.score);
            const valid = per.filter((v): v is number => v != null);
            const avg = valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
            return (
              <div key={cr.key} style={{ display: "grid", gridTemplateColumns: `1fr repeat(${partners.length}, 60px) 60px`, gap: 8, padding: "6px 12px", fontSize: 12, color: "var(--fg2)", alignItems: "center", borderBottom: "1px solid var(--bd)" }}>
                <div>
                  {cr.label} <span style={{ color: "var(--fg3)" }}>· peso ×{cr.weight}</span>
                </div>
                {per.map((v, i) => (
                  <div key={i} style={{ textAlign: "center", color: v == null ? "var(--fg3)" : "var(--fg)" }} title={v != null ? `${VOTE_LABELS[v - 1]} → ${(v * cr.weight).toFixed(1)} pt` : "—"}>
                    {v ?? "—"}
                  </div>
                ))}
                <div style={{ textAlign: "center", fontWeight: 600, color: "var(--accent)" }} title={avg != null ? `Media Likert · ${(avg * cr.weight).toFixed(1)} pt` : ""}>
                  {avg != null ? avg.toFixed(1) : "—"}
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {/* Totali finali */}
      <div style={{ display: "grid", gridTemplateColumns: `1fr repeat(${partners.length}, 60px) 60px`, gap: 8, padding: "12px", background: "var(--accent)", color: "#fff", borderRadius: 6, marginTop: 12, alignItems: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Totale / {TOTAL_MAX}</div>
        {agg.totals.map((t) => <div key={t.userId} style={{ textAlign: "center", fontSize: 13, fontWeight: 700 }}>{t.total}</div>)}
        <div style={{ textAlign: "center", fontSize: 14, fontWeight: 800 }}>{agg.avgTotal?.toFixed(1) ?? "—"}</div>
      </div>
    </div>
  );
}

function SettingsPanel({
  settings, users, isAdmin, onSave,
}: {
  settings: Settings; users: UserProfile[]; isAdmin: boolean; onSave: (patch: Partial<Settings>) => void;
}) {
  const [noT, setNoT] = useState(settings.no_threshold);
  const [ddT, setDdT] = useState(settings.deep_dive_threshold);
  const [lm, setLm] = useState(settings.leader_min);
  const [partnerIds, setPartnerIds] = useState<string[]>(settings.partner_user_ids);

  useEffect(() => {
    setNoT(settings.no_threshold); setDdT(settings.deep_dive_threshold); setLm(settings.leader_min);
    setPartnerIds(settings.partner_user_ids);
  }, [settings.holding_slug, settings.no_threshold, settings.deep_dive_threshold, settings.leader_min, settings.partner_user_ids]);

  if (!isAdmin) {
    return <div style={{ padding: 30, color: "var(--fg3)", fontSize: 13 }}>Le impostazioni sono modificabili solo dagli admin.</div>;
  }

  const availableUsers = users.filter((u) => u.ruolo === "SUPER_ADMIN" || u.ruolo === "ADMIN");

  function togglePartner(id: string) {
    setPartnerIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return prev; // cap 3
      return [...prev, id];
    });
  }

  const dirty = noT !== settings.no_threshold || ddT !== settings.deep_dive_threshold || lm !== settings.leader_min
    || JSON.stringify(partnerIds) !== JSON.stringify(settings.partner_user_ids);

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 700 }}>
      <div style={{ background: "var(--cd)", border: "1px solid var(--bd)", borderRadius: 8, padding: 20 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700 }}>Soglie di suggerimento</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <NumField label={`Sotto "${settings.no_threshold}" → No`} value={noT} onChange={setNoT} min={0} max={100} />
          <NumField label={`Sopra "${settings.deep_dive_threshold}" → Approfondimento`} value={ddT} onChange={setDdT} min={0} max={100} />
          <NumField label={`Leader min (su ${SCORECARD[0].total})`} value={lm} onChange={setLm} min={0} max={SCORECARD[0].total} />
        </div>
        <div style={{ fontSize: 11, color: "var(--fg3)", marginTop: 8 }}>
          Tra le due soglie principali = Osservazione. Se il Leader medio è sotto la soglia minima, esito suggerito è sempre No.
        </div>
      </div>

      <div style={{ background: "var(--cd)", border: "1px solid var(--bd)", borderRadius: 8, padding: 20 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700 }}>Soci votanti ({partnerIds.length}/3)</h3>
        <div style={{ fontSize: 12, color: "var(--fg3)", marginBottom: 10 }}>
          Seleziona i 3 utenti abilitati a votare. Solo super-admin/admin sono selezionabili.
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          {availableUsers.length === 0 && <div style={{ fontSize: 12, color: "var(--fg3)" }}>Nessun utente admin trovato.</div>}
          {availableUsers.map((u) => {
            const selected = partnerIds.includes(u.id);
            return (
              <label key={u.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: selected ? "var(--accent)22" : "var(--bg)", border: `1px solid ${selected ? "var(--accent)" : "var(--bd)"}`, borderRadius: 6, cursor: "pointer" }}>
                <input type="checkbox" checked={selected} onChange={() => togglePartner(u.id)} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{u.nome || u.email}</div>
                  <div style={{ fontSize: 11, color: "var(--fg3)" }}>{u.email} · {u.ruolo}</div>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => onSave({ no_threshold: noT, deep_dive_threshold: ddT, leader_min: lm, partner_user_ids: partnerIds })}
          disabled={!dirty}
          style={{ ...btnPrimary, opacity: dirty ? 1 : 0.5, cursor: dirty ? "pointer" : "not-allowed" }}
        >Salva impostazioni</button>
      </div>
    </div>
  );
}

function NumField({ label, value, onChange, min, max }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number }) {
  return (
    <label style={{ display: "grid", gap: 4 }}>
      <span style={{ fontSize: 11, color: "var(--fg3)" }}>{label}</span>
      <input type="number" value={value} min={min} max={max} step={0.5} onChange={(e) => onChange(Number(e.target.value))} style={inputStyle} />
    </label>
  );
}

function NewOpportunityDialog({ onCancel, onCreate }: { onCancel: () => void; onCreate: (fields: { name: string; description: string; leader_proponent: string; sector: string }) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [leader, setLeader] = useState("");
  const [sector, setSector] = useState("");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500 }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--bg)", border: "1px solid var(--bd)", borderRadius: 10, padding: 24, width: 500, maxWidth: "90vw" }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>Nuova opportunità</h3>
        <div style={{ display: "grid", gap: 10 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome opportunità *" style={inputStyle} autoFocus />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrizione breve" rows={3} style={{ ...inputStyle, resize: "vertical" }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <input value={leader} onChange={(e) => setLeader(e.target.value)} placeholder="Leader proponente" style={inputStyle} />
            <input value={sector} onChange={(e) => setSector(e.target.value)} placeholder="Settore" style={inputStyle} />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
            <button onClick={onCancel} style={btnSecondary}>Annulla</button>
            <button
              onClick={() => name.trim() && onCreate({ name, description, leader_proponent: leader, sector })}
              disabled={!name.trim()}
              style={{ ...btnPrimary, opacity: name.trim() ? 1 : 0.5, cursor: name.trim() ? "pointer" : "not-allowed" }}
            >Crea</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfirmDialog({ title, body, okLabel = "Conferma", danger = false, onCancel, onOk }: {
  title: string; body: string; okLabel?: string; danger?: boolean;
  onCancel: () => void; onOk: () => void;
}) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 600 }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--bg)", border: "1px solid var(--bd)", borderRadius: 10, padding: 24, width: 420, maxWidth: "90vw" }}>
        <h3 style={{ margin: "0 0 10px", fontSize: 16 }}>{title}</h3>
        <p style={{ margin: "0 0 20px", fontSize: 13, color: "var(--fg2)", lineHeight: 1.5 }}>{body}</p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onCancel} style={btnSecondary}>Annulla</button>
          <button
            onClick={onOk}
            style={{ ...btnPrimary, background: danger ? "#ef4444" : "var(--accent)" }}
            autoFocus
          >{okLabel}</button>
        </div>
      </div>
    </div>
  );
}

function initials(s: string): string {
  const parts = s.split(/[\s@.]+/).filter(Boolean);
  const chars = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() || "").join("");
  return chars || s.slice(0, 2).toUpperCase();
}

/* ── Styles ── */
const inputStyle: React.CSSProperties = {
  padding: "8px 12px", background: "var(--bg)", border: "1px solid var(--bd)", borderRadius: 6,
  color: "var(--fg)", fontSize: 13, fontFamily: "inherit",
};
const btnPrimary: React.CSSProperties = {
  padding: "8px 14px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 6,
  fontSize: 13, fontWeight: 600, cursor: "pointer",
};
const btnSecondary: React.CSSProperties = {
  padding: "8px 14px", background: "transparent", color: "var(--fg2)", border: "1px solid var(--bd)", borderRadius: 6,
  fontSize: 13, cursor: "pointer",
};
