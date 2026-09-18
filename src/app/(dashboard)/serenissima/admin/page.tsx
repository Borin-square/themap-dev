"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { isSuperAdmin } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import {
  fetchCompanyMaps,
  fetchSnapshotOverrides,
  fetchCrossSell,
  PORTFOLIO_LABELS,
  MATURITY_LABELS,
  MATURITY_ORDER,
  YEAR_MIN, YEAR_MAX, CURRENT_YEAR,
  type CompanyMap,
  type SnapshotOverride,
  type CrossSellEvent,
  type PortfolioStatus,
  type MaturityStage,
  type RevenueStatus,
  type CrossSellStatus,
} from "@/lib/serenissima";

type Tab = "companies" | "snapshots" | "crosssell";

export default function SerenissimaAdminPage() {
  const { session } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (session && !isSuperAdmin(session)) router.replace("/serenissima");
  }, [session, router]);

  const [tab, setTab] = useState<Tab>("companies");

  return (
    <div style={{ padding: "24px 32px 60px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: 3, color: "var(--fg3)", textTransform: "uppercase" }}>Serenissima</div>
          <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: -0.5, margin: 0, color: "#fff" }}>Admin</h1>
        </div>
        <button onClick={() => router.push("/serenissima")} style={btnGhost}>← Mappa</button>
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--bd)", paddingBottom: 0 }}>
        <TabBtn active={tab === "companies"} onClick={() => setTab("companies")} label="Aziende" />
        <TabBtn active={tab === "snapshots"} onClick={() => setTab("snapshots")} label="Snapshot" />
        <TabBtn active={tab === "crosssell"} onClick={() => setTab("crosssell")} label="Cross-sell" />
      </div>

      {tab === "companies" && <CompaniesTab />}
      {tab === "snapshots" && <SnapshotsTab />}
      {tab === "crosssell" && <CrossSellTab />}
    </div>
  );
}

// ============================================================
// COMPANIES TAB
// ============================================================
function CompaniesTab() {
  const [rows, setRows] = useState<CompanyMap[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    const r = await fetchCompanyMaps();
    setRows(r);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save(row: CompanyMap) {
    setSaving(row.company_slug);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch("/api/serenissima/company-map", {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(row),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Errore");
      setToast({ text: `${row.name} salvata`, ok: true });
      await load();
    } catch (e) {
      setToast({ text: (e as Error).message, ok: false });
    } finally {
      setSaving(null);
      setTimeout(() => setToast(null), 2500);
    }
  }

  function update(slug: string, patch: Partial<CompanyMap>) {
    setRows((rs) => rs.map((r) => r.company_slug === slug ? { ...r, ...patch } : r));
  }

  return (
    <div>
      {rows.length === 0 && <Empty text="Nessuna azienda 'operative' presente. Aggiungile da /settings → Aziende con type='operative'." />}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.map((r) => (
          <div key={r.company_slug} style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{ width: 28, height: 28, borderRadius: 4, background: r.color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 13 }}>
                {r.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{r.name}</div>
                <div style={{ fontSize: 10, color: "var(--fg3)", letterSpacing: 1 }}>{r.company_slug}</div>
              </div>
              <button onClick={() => save(r)} disabled={saving === r.company_slug} style={{ ...btnPrimary, marginLeft: "auto" }}>
                {saving === r.company_slug ? "Salvando…" : "Salva"}
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
              <Field label="Portfolio status">
                <select value={r.portfolio_status} onChange={(e) => update(r.company_slug, { portfolio_status: e.target.value as PortfolioStatus })} style={inputStyle}>
                  {(Object.keys(PORTFOLIO_LABELS) as PortfolioStatus[]).map((k) => <option key={k} value={k}>{PORTFOLIO_LABELS[k]}</option>)}
                </select>
              </Field>
              <Field label="Position X (0..1)">
                <input type="number" step={0.01} min={0} max={1} value={r.position_x} onChange={(e) => update(r.company_slug, { position_x: parseFloat(e.target.value) || 0 })} style={inputStyle} />
              </Field>
              <Field label="Position Y (0..1)">
                <input type="number" step={0.01} min={0} max={1} value={r.position_y} onChange={(e) => update(r.company_slug, { position_y: parseFloat(e.target.value) || 0 })} style={inputStyle} />
              </Field>
              <Field label="Expandability (1..5)">
                <input type="number" step={1} min={1} max={5} value={r.expandability_score ?? ""} onChange={(e) => update(r.company_slug, { expandability_score: e.target.value ? parseInt(e.target.value) : null })} style={inputStyle} />
              </Field>
              <Field label="Confidence (1..5)">
                <input type="number" step={1} min={1} max={5} value={r.confidence_score ?? ""} onChange={(e) => update(r.company_slug, { confidence_score: e.target.value ? parseInt(e.target.value) : null })} style={inputStyle} />
              </Field>
              <Field label="Ownership %">
                <input type="number" step={0.1} min={0} max={100} value={r.ownership_pct ?? ""} onChange={(e) => update(r.company_slug, { ownership_pct: e.target.value ? parseFloat(e.target.value) : null })} style={inputStyle} />
              </Field>
              <Field label="Business model">
                <input type="text" value={r.business_model ?? ""} onChange={(e) => update(r.company_slug, { business_model: e.target.value || null })} style={inputStyle} />
              </Field>
              <Field label="Emblem path">
                <input type="text" placeholder="/logos/xxx.svg" value={r.emblem_path ?? ""} onChange={(e) => update(r.company_slug, { emblem_path: e.target.value || null })} style={inputStyle} />
              </Field>
            </div>
            <Field label="Note" full>
              <textarea rows={2} value={r.notes ?? ""} onChange={(e) => update(r.company_slug, { notes: e.target.value || null })} style={{ ...inputStyle, resize: "vertical" }} />
            </Field>
          </div>
        ))}
      </div>
      <Toast t={toast} />
    </div>
  );
}

// ============================================================
// SNAPSHOTS TAB
// ============================================================
function SnapshotsTab() {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [companies, setCompanies] = useState<CompanyMap[]>([]);
  const [overrides, setOverrides] = useState<SnapshotOverride[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    const [c, o] = await Promise.all([fetchCompanyMaps(), fetchSnapshotOverrides(year)]);
    setCompanies(c);
    setOverrides(o);
  }, [year]);
  useEffect(() => { load(); }, [load]);

  const byCompany = useMemo(() => {
    const m = new Map<string, SnapshotOverride>();
    for (const o of overrides) {
      const cur = m.get(o.company_slug);
      if (!cur || (cur.data_type === "forecast" && o.data_type === "actual")) m.set(o.company_slug, o);
    }
    return m;
  }, [overrides]);

  const rows = companies.map((c) => {
    const ov = byCompany.get(c.company_slug);
    return {
      company_slug: c.company_slug,
      name: c.name,
      color: c.color,
      year,
      headcount: ov?.headcount ?? null,
      revenue: ov?.revenue ?? null,
      ebitda: ov?.ebitda ?? null,
      revenue_status: (ov?.revenue_status ?? "unknown") as RevenueStatus,
      maturity_stage: (ov?.maturity_stage ?? null) as MaturityStage | null,
      data_type: ov?.data_type ?? "actual",
      notes: ov?.notes ?? null,
    };
  });

  const [drafts, setDrafts] = useState<Record<string, typeof rows[number]>>({});
  useEffect(() => {
    const d: Record<string, typeof rows[number]> = {};
    for (const r of rows) d[r.company_slug] = r;
    setDrafts(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companies, overrides, year]);

  function update(slug: string, patch: Partial<typeof rows[number]>) {
    setDrafts((d) => ({ ...d, [slug]: { ...d[slug], ...patch } }));
  }

  async function save(slug: string) {
    const row = drafts[slug];
    if (!row) return;
    setSaving(slug);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch("/api/serenissima/snapshots", {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(row),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Errore");
      setToast({ text: `${row.name} salvato`, ok: true });
      await load();
    } catch (e) {
      setToast({ text: (e as Error).message, ok: false });
    } finally {
      setSaving(null);
      setTimeout(() => setToast(null), 2500);
    }
  }

  async function del(slug: string) {
    if (!confirm(`Eliminare override ${slug} anno ${year}?`)) return;
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const res = await fetch(`/api/serenissima/snapshots?company_slug=${slug}&year=${year}&data_type=${drafts[slug]?.data_type || "actual"}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      setToast({ text: "Eliminato", ok: true });
      await load();
    } else {
      setToast({ text: "Errore eliminazione", ok: false });
    }
    setTimeout(() => setToast(null), 2500);
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <label style={{ fontSize: 11, color: "var(--fg3)", letterSpacing: 2, textTransform: "uppercase" }}>Anno</label>
        <select value={year} onChange={(e) => setYear(parseInt(e.target.value))} style={inputStyle}>
          {Array.from({ length: YEAR_MAX - YEAR_MIN + 1 }, (_, i) => YEAR_MIN + i).map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <div style={{ fontSize: 11, color: "var(--fg3)" }}>Vuoto = usa fallback da app_state (eeForecast + people)</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map((r) => {
          const d = drafts[r.company_slug] || r;
          return (
            <div key={r.company_slug} style={card}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{ width: 24, height: 24, borderRadius: 4, background: r.color }} />
                <div style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{r.name}</div>
                <button onClick={() => del(r.company_slug)} style={btnGhost}>Reset</button>
                <button onClick={() => save(r.company_slug)} disabled={saving === r.company_slug} style={btnPrimary}>
                  {saving === r.company_slug ? "…" : "Salva"}
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>
                <Field label="Persone"><input type="number" value={d.headcount ?? ""} onChange={(e) => update(r.company_slug, { headcount: e.target.value ? parseInt(e.target.value) : null })} style={inputStyle} /></Field>
                <Field label="Revenue (€)"><input type="number" value={d.revenue ?? ""} onChange={(e) => update(r.company_slug, { revenue: e.target.value ? parseFloat(e.target.value) : null })} style={inputStyle} /></Field>
                <Field label="EBITDA (€)"><input type="number" value={d.ebitda ?? ""} onChange={(e) => update(r.company_slug, { ebitda: e.target.value ? parseFloat(e.target.value) : null })} style={inputStyle} /></Field>
                <Field label="Revenue status">
                  <select value={d.revenue_status} onChange={(e) => update(r.company_slug, { revenue_status: e.target.value as RevenueStatus })} style={inputStyle}>
                    <option value="unknown">unknown</option>
                    <option value="revenue">revenue</option>
                    <option value="pre_revenue">pre-revenue</option>
                  </select>
                </Field>
                <Field label="Maturity">
                  <select value={d.maturity_stage ?? ""} onChange={(e) => update(r.company_slug, { maturity_stage: (e.target.value || null) as MaturityStage | null })} style={inputStyle}>
                    <option value="">—</option>
                    {MATURITY_ORDER.map((m) => <option key={m} value={m}>{MATURITY_LABELS[m]}</option>)}
                  </select>
                </Field>
                <Field label="Tipo dato">
                  <select value={d.data_type} onChange={(e) => update(r.company_slug, { data_type: e.target.value as "actual" | "forecast" })} style={inputStyle}>
                    <option value="actual">actual</option>
                    <option value="forecast">forecast</option>
                  </select>
                </Field>
              </div>
            </div>
          );
        })}
      </div>
      <Toast t={toast} />
    </div>
  );
}

// ============================================================
// CROSS-SELL TAB
// ============================================================
function CrossSellTab() {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [events, setEvents] = useState<CrossSellEvent[]>([]);
  const [companies, setCompanies] = useState<CompanyMap[]>([]);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Partial<CrossSellEvent>>({ status: "open" });

  const load = useCallback(async () => {
    const [c, e] = await Promise.all([fetchCompanyMaps(), fetchCrossSell(year)]);
    setCompanies(c);
    setEvents(e);
  }, [year]);
  useEffect(() => { load(); }, [load]);

  async function saveNew() {
    if (!draft.source_slug || !draft.dest_slug) { setToast({ text: "Source e dest richiesti", ok: false }); return; }
    setCreating(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch("/api/serenissima/cross-sell", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, year }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Errore");
      setToast({ text: "Evento creato", ok: true });
      setDraft({ status: "open" });
      await load();
    } catch (e) {
      setToast({ text: (e as Error).message, ok: false });
    } finally {
      setCreating(false);
      setTimeout(() => setToast(null), 2500);
    }
  }

  async function updateEvent(ev: CrossSellEvent) {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const res = await fetch("/api/serenissima/cross-sell", {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(ev),
    });
    if (res.ok) { setToast({ text: "Aggiornato", ok: true }); await load(); }
    else setToast({ text: "Errore", ok: false });
    setTimeout(() => setToast(null), 2500);
  }

  async function delEvent(id: string) {
    if (!confirm("Eliminare evento?")) return;
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const res = await fetch(`/api/serenissima/cross-sell?id=${id}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) { setToast({ text: "Eliminato", ok: true }); await load(); }
    else setToast({ text: "Errore", ok: false });
    setTimeout(() => setToast(null), 2500);
  }

  const nameOf = (slug: string) => companies.find((c) => c.company_slug === slug)?.name || slug;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <label style={{ fontSize: 11, color: "var(--fg3)", letterSpacing: 2, textTransform: "uppercase" }}>Anno</label>
        <select value={year} onChange={(e) => setYear(parseInt(e.target.value))} style={inputStyle}>
          {Array.from({ length: YEAR_MAX - YEAR_MIN + 1 }, (_, i) => YEAR_MIN + i).map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "var(--fg3)", letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>Nuovo evento</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
          <Field label="Da">
            <select value={draft.source_slug ?? ""} onChange={(e) => setDraft({ ...draft, source_slug: e.target.value })} style={inputStyle}>
              <option value="">—</option>
              {companies.map((c) => <option key={c.company_slug} value={c.company_slug}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="A">
            <select value={draft.dest_slug ?? ""} onChange={(e) => setDraft({ ...draft, dest_slug: e.target.value })} style={inputStyle}>
              <option value="">—</option>
              {companies.map((c) => <option key={c.company_slug} value={c.company_slug}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select value={draft.status ?? "open"} onChange={(e) => setDraft({ ...draft, status: e.target.value as CrossSellStatus })} style={inputStyle}>
              <option value="open">open</option><option value="won">won</option>
              <option value="lost">lost</option><option value="cancelled">cancelled</option>
            </select>
          </Field>
          <Field label="Client ref"><input type="text" value={draft.client_reference ?? ""} onChange={(e) => setDraft({ ...draft, client_reference: e.target.value })} style={inputStyle} /></Field>
          <Field label="Expected €"><input type="number" value={draft.expected_revenue ?? ""} onChange={(e) => setDraft({ ...draft, expected_revenue: e.target.value ? parseFloat(e.target.value) : null })} style={inputStyle} /></Field>
          <Field label="Won €"><input type="number" value={draft.won_revenue ?? ""} onChange={(e) => setDraft({ ...draft, won_revenue: e.target.value ? parseFloat(e.target.value) : null })} style={inputStyle} /></Field>
          <Field label="Won margin €"><input type="number" value={draft.won_margin ?? ""} onChange={(e) => setDraft({ ...draft, won_margin: e.target.value ? parseFloat(e.target.value) : null })} style={inputStyle} /></Field>
        </div>
        <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
          <button onClick={saveNew} disabled={creating} style={btnPrimary}>{creating ? "…" : "Crea"}</button>
        </div>
      </div>

      {events.length === 0 ? (
        <Empty text={`Nessun evento cross-sell per il ${year}.`} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {events.map((ev) => (
            <div key={ev.id} style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{nameOf(ev.source_slug)} → {nameOf(ev.dest_slug)}</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <StatusPill s={ev.status} />
                  <button onClick={() => delEvent(ev.id)} style={btnDanger}>×</button>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>
                <Field label="Status">
                  <select value={ev.status} onChange={(e) => updateEvent({ ...ev, status: e.target.value as CrossSellStatus })} style={inputStyle}>
                    <option value="open">open</option><option value="won">won</option>
                    <option value="lost">lost</option><option value="cancelled">cancelled</option>
                  </select>
                </Field>
                <Field label="Client ref"><input type="text" defaultValue={ev.client_reference ?? ""} onBlur={(e) => e.target.value !== (ev.client_reference ?? "") && updateEvent({ ...ev, client_reference: e.target.value || null })} style={inputStyle} /></Field>
                <Field label="Expected €"><input type="number" defaultValue={ev.expected_revenue ?? ""} onBlur={(e) => updateEvent({ ...ev, expected_revenue: e.target.value ? parseFloat(e.target.value) : null })} style={inputStyle} /></Field>
                <Field label="Won €"><input type="number" defaultValue={ev.won_revenue ?? ""} onBlur={(e) => updateEvent({ ...ev, won_revenue: e.target.value ? parseFloat(e.target.value) : null })} style={inputStyle} /></Field>
                <Field label="Won margin €"><input type="number" defaultValue={ev.won_margin ?? ""} onBlur={(e) => updateEvent({ ...ev, won_margin: e.target.value ? parseFloat(e.target.value) : null })} style={inputStyle} /></Field>
              </div>
            </div>
          ))}
        </div>
      )}
      <Toast t={toast} />
    </div>
  );
}

// ============================================================
// UI PRIMITIVES
// ============================================================
function TabBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} style={{
      padding: "8px 14px", border: "none", background: "transparent",
      color: active ? "#fff" : "var(--fg3)",
      borderBottom: active ? "2px solid #c1443a" : "2px solid transparent",
      fontSize: 12, letterSpacing: 2, textTransform: "uppercase", fontWeight: 600, cursor: "pointer",
      marginBottom: -1,
    }}>{label}</button>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: full ? "1 / -1" : undefined, marginTop: full ? 10 : 0 }}>
      <label style={{ fontSize: 10, color: "var(--fg3)", letterSpacing: 1.5, textTransform: "uppercase" }}>{label}</label>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div style={{ fontSize: 12, color: "var(--fg3)", padding: 20, border: "1px dashed var(--bd)", borderRadius: 8, textAlign: "center" }}>{text}</div>;
}

function StatusPill({ s }: { s: CrossSellStatus }) {
  const colors: Record<CrossSellStatus, string> = { open: "#f59e0b", won: "#22c55e", lost: "#ef4444", cancelled: "#6e7681" };
  return <span style={{ padding: "2px 8px", fontSize: 10, borderRadius: 4, background: colors[s], color: "#fff", letterSpacing: 1, textTransform: "uppercase", fontWeight: 700 }}>{s}</span>;
}

function Toast({ t }: { t: { text: string; ok: boolean } | null }) {
  if (!t) return null;
  return (
    <div style={{ position: "fixed", bottom: 20, right: 20, padding: "10px 16px", borderRadius: 6, background: t.ok ? "#22c55e" : "#ef4444", color: "#fff", fontSize: 12, fontWeight: 600, zIndex: 100 }}>
      {t.text}
    </div>
  );
}

const card: React.CSSProperties = { padding: 16, background: "var(--bg2)", border: "1px solid var(--bd)", borderRadius: 8 };
const inputStyle: React.CSSProperties = { padding: "7px 10px", background: "var(--bg3)", border: "1px solid var(--bd)", borderRadius: 4, color: "var(--fg)", fontSize: 12, width: "100%", boxSizing: "border-box", fontFamily: "inherit" };
const btnPrimary: React.CSSProperties = { padding: "7px 14px", background: "#c1443a", border: "none", borderRadius: 4, color: "#fff", fontSize: 11, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", cursor: "pointer" };
const btnGhost: React.CSSProperties = { padding: "7px 14px", background: "transparent", border: "1px solid var(--bd)", borderRadius: 4, color: "var(--fg2)", fontSize: 11, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", cursor: "pointer" };
const btnDanger: React.CSSProperties = { padding: "4px 8px", background: "transparent", border: "1px solid #ef4444", borderRadius: 4, color: "#ef4444", fontSize: 12, cursor: "pointer" };
