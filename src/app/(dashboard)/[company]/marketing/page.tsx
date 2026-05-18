"use client";

import { useState, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getCompany } from "@/lib/companies";
import { useLocalState } from "@/lib/useLocalState";
import { dataVersion } from "@/lib/square-marketing-data";
import {
  MKTG_STATI, MKTG_PIATTAFORME, MKTG_CANALI, MKTG_MONTHS,
  MKTG_MET_EDIT, MKTG_MET_LABELS,
  mktgFmt, mktgStatoColor, campTotals, emptyCampaign, getMockCampaignsForCompany,
  type Campaign, type MktgStato,
} from "@/lib/marketing";

type ViewMode = "table" | "timeline";

export default function MarketingPage() {
  const params = useParams();
  const company = getCompany(params.company as string);
  const slug = params.company as string;

  const dv = dataVersion(slug);
  const [campaigns, setCampaigns] = useLocalState<Campaign[]>(
    `themap:${slug}:mktgCampaigns`, () => getMockCampaignsForCompany(slug), dv,
  );
  const [filterStato, setFilterStato] = useState("");
  const [filterPiatt, setFilterPiatt] = useState("");
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<Campaign | "new" | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [showImport, setShowImport] = useState(false);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000); }

  const filtered = campaigns.filter((c) => {
    if (filterStato && c.stato !== filterStato) return false;
    if (filterPiatt && c.piattaforma !== filterPiatt) return false;
    return true;
  });

  // Aggregate KPIs
  const kpi = useMemo(() => {
    let bFc = 0, bRe = 0, lFc = 0, lRe = 0, impr = 0, click = 0;
    filtered.forEach((c) => {
      const t = campTotals(c);
      bFc += t.budgetFc; bRe += t.budgetRe;
      lFc += t.leadFc; lRe += t.leadRe;
      impr += t.impressioni; click += t.click;
    });
    const cplFc = lFc > 0 ? bFc / lFc : 0;
    const cplRe = lRe > 0 ? bRe / lRe : 0;
    const ctr = impr > 0 ? (click / impr) * 100 : 0;
    return { bFc, bRe, lFc, lRe, impr, click, cplFc, cplRe, ctr };
  }, [filtered]);

  // Platform breakdown
  const platformData = useMemo(() => {
    const map = new Map<string, { budgetRe: number; leadRe: number }>();
    filtered.forEach((c) => {
      const p = c.piattaforma || "Altro";
      const t = campTotals(c);
      const cur = map.get(p) || { budgetRe: 0, leadRe: 0 };
      cur.budgetRe += t.budgetRe;
      cur.leadRe += t.leadRe;
      map.set(p, cur);
    });
    return [...map.entries()]
      .filter(([, v]) => v.budgetRe > 0 || v.leadRe > 0)
      .sort((a, b) => b[1].budgetRe - a[1].budgetRe);
  }, [filtered]);

  function toggleAccordion(id: string) { setOpenIds((p) => ({ ...p, [id]: !p[id] })); }

  function saveCampaign(c: Campaign) {
    setCampaigns((prev) => {
      const idx = prev.findIndex((x) => x.id === c.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = c; return next; }
      return [...prev, c];
    });
    setEditing(null);
    showToast("Campagna salvata");
  }

  function deleteCampaign(id: string) {
    setCampaigns((prev) => prev.filter((c) => c.id !== id));
    setConfirmDel(null);
    showToast("Campagna eliminata");
  }

  function handleImport(imported: Campaign[]) {
    setCampaigns((prev) => [...prev, ...imported]);
    setShowImport(false);
    showToast(`${imported.length} campagn${imported.length === 1 ? "a importata" : "e importate"}`);
  }

  function updatePeriodo(campId: string, met: string, month: number, value: number | null) {
    setCampaigns((prev) => prev.map((c) => {
      if (c.id !== campId) return c;
      const periodi = { ...c.periodi };
      if (!periodi[met]) periodi[met] = Array(12).fill(null);
      else periodi[met] = [...periodi[met]];
      periodi[met][month] = value;
      return { ...c, periodi };
    }));
  }

  return (
    <div>
      <div className="ee-subnav">
        <span className="ee-tab active">Campaign Manager</span>
        <Link href={`/${slug}/marketing/strategy`} className="ee-tab">Strategy</Link>
        <Link href={`/${slug}/marketing/brand-asset`} className="ee-tab">Brand Asset</Link>
        <Link href={`/${slug}/marketing/seo-cluster`} className="ee-tab">SEO Cluster</Link>
      </div>

      {toast && <div className="fws-toast">{toast}</div>}

      <div className="mktg-page">
        <div className="mktg-head">
          <div className="mktg-title">
            {company && <span style={{ color: company.color }}>{"\u25A0"}</span>}
            {company?.name || slug} — Campaign Manager
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="mk-import-btn" onClick={() => setShowImport(true)}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v8M4 6l3 3 3-3M2 11h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Importa da Sheets
            </button>
            <button className="comp-add" onClick={() => setEditing("new")}>+ Campagna</button>
          </div>
        </div>

        {/* ── KPI Cards with FC/RE delta ── */}
        <div className="mk-kpi-grid">
          <KpiDual label="Budget" fc={kpi.bFc} re={kpi.bRe} fmt="eur" good="down" />
          <KpiDual label="Lead" fc={kpi.lFc} re={kpi.lRe} fmt="num" good="up" />
          <KpiDual label="CPL" fc={kpi.cplFc} re={kpi.cplRe} fmt="eur" good="down" />
          <KpiSingle label="Impressioni" val={kpi.impr} fmt="num" />
          <KpiSingle label="Click" val={kpi.click} fmt="num" />
          <KpiSingle label="CTR" val={kpi.ctr} fmt="pct" />
        </div>

        {/* ── Platform Breakdown ── */}
        {platformData.length > 0 && <PlatformBreakdown data={platformData} />}

        {/* ── Filters + View Toggle ── */}
        <div className="mktg-filters">
          <select value={filterStato} onChange={(e) => setFilterStato(e.target.value)}>
            <option value="">Tutti gli stati</option>
            {MKTG_STATI.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select value={filterPiatt} onChange={(e) => setFilterPiatt(e.target.value)}>
            <option value="">Tutte le piattaforme</option>
            {MKTG_PIATTAFORME.map((p) => <option key={p}>{p}</option>)}
          </select>
          <span className="mktg-count">{filtered.length} campagn{filtered.length === 1 ? "a" : "e"}</span>
          <div className="mk-view-toggle">
            <button className={viewMode === "table" ? "act" : ""} onClick={() => setViewMode("table")} title="Tabella">
              <svg width="14" height="14" viewBox="0 0 14 14"><rect x="1" y="1" width="5" height="3" rx=".5" fill="currentColor"/><rect x="8" y="1" width="5" height="3" rx=".5" fill="currentColor"/><rect x="1" y="5.5" width="5" height="3" rx=".5" fill="currentColor"/><rect x="8" y="5.5" width="5" height="3" rx=".5" fill="currentColor"/><rect x="1" y="10" width="5" height="3" rx=".5" fill="currentColor"/><rect x="8" y="10" width="5" height="3" rx=".5" fill="currentColor"/></svg>
            </button>
            <button className={viewMode === "timeline" ? "act" : ""} onClick={() => setViewMode("timeline")} title="Timeline">
              <svg width="14" height="14" viewBox="0 0 14 14"><rect x="2" y="1.5" width="8" height="2.5" rx=".5" fill="currentColor"/><rect x="4" y="5.5" width="9" height="2.5" rx=".5" fill="currentColor"/><rect x="1" y="9.5" width="6" height="2.5" rx=".5" fill="currentColor"/></svg>
            </button>
          </div>
        </div>

        {/* ── Content ── */}
        {filtered.length === 0 ? (
          <div className="comp-empty">
            Nessuna campagna{(filterStato || filterPiatt) ? " con i filtri selezionati" : ""}. Aggiungine una per iniziare.
          </div>
        ) : viewMode === "table" ? (
          <div className="mktg-table-wrap">
            <table className="mktg-table">
              <thead>
                <tr>
                  <th style={{ width: 24 }}></th>
                  <th>Nome</th><th>Piattaforma</th><th>Stato</th>
                  <th>Pacing</th>
                  <th>Trend</th>
                  <th className="mktg-th-right">Budget FC</th><th className="mktg-th-right">Budget RE</th>
                  <th className="mktg-th-right">Lead FC</th><th className="mktg-th-right">Lead RE</th>
                  <th className="mktg-th-right">CPL RE</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const t = campTotals(c);
                  const isOpen = !!openIds[c.id];
                  return (
                    <CampaignRow
                      key={c.id} campaign={c} totals={t} isOpen={isOpen}
                      onToggle={() => toggleAccordion(c.id)}
                      onEdit={() => setEditing(c)}
                      onDelete={() => setConfirmDel(c.id)}
                      confirmDel={confirmDel === c.id}
                      onConfirmYes={() => deleteCampaign(c.id)}
                      onConfirmNo={() => setConfirmDel(null)}
                      onUpdatePeriodo={(met, m, v) => updatePeriodo(c.id, met, m, v)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <GanttTimeline campaigns={filtered} onEdit={setEditing} />
        )}
      </div>

      {editing && (
        <CampaignForm
          campaign={editing === "new" ? emptyCampaign() : editing}
          isNew={editing === "new"}
          onSave={saveCampaign}
          onClose={() => setEditing(null)}
        />
      )}

      {showImport && (
        <ImportSheetModal
          onImport={handleImport}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  );
}

/* ── KPI Card with FC / RE / Delta ── */

function KpiDual({ label, fc, re, fmt, good }: {
  label: string; fc: number; re: number;
  fmt: "eur" | "num" | "pct";
  good: "up" | "down";
}) {
  const delta = fc > 0 ? ((re - fc) / fc) * 100 : 0;
  const isGood = good === "up" ? delta >= 0 : delta <= 0;
  const fmtV = (v: number) =>
    fmt === "eur" ? `\u20AC${mktgFmt(v)}` : fmt === "pct" ? `${v.toFixed(1)}%` : mktgFmt(v);

  return (
    <div className="mk-kpi-card">
      <div className="mk-kpi-label">{label}</div>
      <div className="mk-kpi-dual">
        <div className="mk-kpi-col">
          <span className="mk-kpi-sub">FC</span>
          <span className="mk-kpi-val">{fmtV(fc)}</span>
        </div>
        <div className="mk-kpi-col">
          <span className="mk-kpi-sub">RE</span>
          <span className="mk-kpi-val">{fmtV(re)}</span>
        </div>
      </div>
      {fc > 0 && (
        <div className={`mk-kpi-delta ${isGood ? "good" : "bad"}`}>
          <span>{delta > 0 ? "\u2191" : delta < 0 ? "\u2193" : ""}</span>
          {Math.abs(delta).toFixed(1)}%
        </div>
      )}
    </div>
  );
}

function KpiSingle({ label, val, fmt }: {
  label: string; val: number; fmt: "eur" | "num" | "pct";
}) {
  const fmtV = fmt === "eur" ? `\u20AC${mktgFmt(val)}` : fmt === "pct" ? `${val.toFixed(1)}%` : mktgFmt(val);
  return (
    <div className="mk-kpi-card mk-kpi-single">
      <div className="mk-kpi-label">{label}</div>
      <div className="mk-kpi-bigval">{fmtV}</div>
    </div>
  );
}

/* ── Platform Breakdown (horizontal bars) ── */

function PlatformBreakdown({ data }: { data: [string, { budgetRe: number; leadRe: number }][] }) {
  const maxBudget = Math.max(...data.map(([, v]) => v.budgetRe), 1);
  const maxLead = Math.max(...data.map(([, v]) => v.leadRe), 1);
  const COLORS = ["var(--acc)", "#8b5cf6", "#f59e0b", "#06b6d4", "#ec4899", "#10b981", "#f97316", "#6366f1"];

  return (
    <div className="mk-breakdown">
      <div className="mk-breakdown-title">Budget & Lead per piattaforma</div>
      <div className="mk-breakdown-grid">
        {data.map(([name, v], i) => (
          <div key={name} className="mk-bk-row">
            <div className="mk-bk-name">{name}</div>
            <div className="mk-bk-bars">
              <div className="mk-bk-bar-wrap">
                <div className="mk-bk-bar" style={{ width: `${(v.budgetRe / maxBudget) * 100}%`, background: COLORS[i % COLORS.length] }} />
                <span className="mk-bk-val">{"\u20AC"}{mktgFmt(v.budgetRe)}</span>
              </div>
              <div className="mk-bk-bar-wrap mk-bk-lead">
                <div className="mk-bk-bar" style={{ width: `${(v.leadRe / maxLead) * 100}%`, background: COLORS[i % COLORS.length], opacity: 0.5 }} />
                <span className="mk-bk-val">{mktgFmt(v.leadRe)} lead</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Sparkline (CSS mini bars) ── */

function Sparkline({ values, color }: { values: (number | null)[]; color?: string }) {
  const nums = values.filter((v): v is number => v != null && v > 0);
  if (nums.length === 0) return <span className="mk-spark-empty">{"\u2014"}</span>;
  const max = Math.max(...nums);
  return (
    <div className="mk-spark">
      {values.map((v, i) => (
        <div
          key={i}
          className="mk-spark-bar"
          style={{
            height: v != null && v > 0 ? `${Math.max((v / max) * 100, 8)}%` : "0%",
            background: color || "var(--acc)",
            opacity: v != null && v > 0 ? 1 : 0.15,
          }}
        />
      ))}
    </div>
  );
}

/* ── Budget Pacing Bar ── */

function PacingBar({ campaign: c }: { campaign: Campaign }) {
  const t = campTotals(c);
  if (t.budgetFc <= 0) return <span style={{ color: "var(--fg3)", fontSize: 10 }}>{"\u2014"}</span>;

  const spentPct = Math.min((t.budgetRe / t.budgetFc) * 100, 100);

  // Time pacing
  const now = new Date();
  const start = c.data_inizio ? new Date(c.data_inizio) : null;
  const end = c.data_fine ? new Date(c.data_fine) : null;
  let timePct = 50; // default
  if (start && end && end > start) {
    const total = end.getTime() - start.getTime();
    const elapsed = Math.max(0, Math.min(now.getTime() - start.getTime(), total));
    timePct = (elapsed / total) * 100;
  }

  const diff = spentPct - timePct;
  const status = diff > 10 ? "over" : diff < -10 ? "under" : "ok";

  return (
    <div className="mk-pacing">
      <div className="mk-pacing-track">
        <div className={`mk-pacing-fill mk-pacing-${status}`} style={{ width: `${spentPct}%` }} />
        <div className="mk-pacing-marker" style={{ left: `${Math.min(timePct, 100)}%` }} />
      </div>
      <span className={`mk-pacing-label mk-pacing-${status}`}>{Math.round(spentPct)}%</span>
    </div>
  );
}

/* ── Campaign Row + Accordion ── */

function CampaignRow({
  campaign: c, totals: t, isOpen, onToggle, onEdit, onDelete,
  confirmDel, onConfirmYes, onConfirmNo, onUpdatePeriodo,
}: {
  campaign: Campaign;
  totals: ReturnType<typeof campTotals>;
  isOpen: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  confirmDel: boolean;
  onConfirmYes: () => void;
  onConfirmNo: () => void;
  onUpdatePeriodo: (met: string, month: number, value: number | null) => void;
}) {
  // Get lead RE values for sparkline
  const leadVals = c.periodi["LEAD_RE"] || Array(12).fill(null);

  return (
    <>
      <tr className={`mktg-row${isOpen ? " mktg-row-open" : ""}`}>
        <td className="mktg-td-chev" onClick={onToggle}>
          <span className={`mktg-chev${isOpen ? " mktg-chev-open" : ""}`}>&#9654;</span>
        </td>
        <td className="mktg-td-name">
          {c.nome}
          {c.landing_page && <a href={c.landing_page} target="_blank" rel="noreferrer" className="mktg-lp-link">&#8599;</a>}
        </td>
        <td><span className="mktg-piatt">{c.piattaforma || "\u2014"}</span></td>
        <td>
          <span className="mk-badge" style={{ background: mktgStatoColor(c.stato) }}>
            {c.stato}
          </span>
        </td>
        <td><PacingBar campaign={c} /></td>
        <td><Sparkline values={leadVals} /></td>
        <td className="mktg-td-right">{t.budgetFc ? `\u20AC${mktgFmt(t.budgetFc)}` : "\u2014"}</td>
        <td className="mktg-td-right">{t.budgetRe ? `\u20AC${mktgFmt(t.budgetRe)}` : "\u2014"}</td>
        <td className="mktg-td-right">{t.leadFc ? mktgFmt(t.leadFc) : "\u2014"}</td>
        <td className="mktg-td-right">{t.leadRe ? mktgFmt(t.leadRe) : "\u2014"}</td>
        <td className="mktg-td-right">{t.cplRe != null ? `\u20AC${mktgFmt(t.cplRe)}` : "\u2014"}</td>
        <td className="mktg-td-actions">
          <button onClick={onEdit} title="Modifica">&#9998;</button>
          {confirmDel ? (
            <span className="fws-confirm">
              <button className="fws-confirm-yes" onClick={onConfirmYes}>Si</button>
              <button className="fws-confirm-no" onClick={onConfirmNo}>No</button>
            </span>
          ) : (
            <button className="comp-del" onClick={onDelete} title="Elimina">&#10005;</button>
          )}
        </td>
      </tr>
      {isOpen && (
        <tr className="mktg-periodi-row">
          <td colSpan={12}>
            <PeriodiGrid campaign={c} onUpdate={onUpdatePeriodo} />
          </td>
        </tr>
      )}
    </>
  );
}

/* ── Monthly Grid ── */

function PeriodiGrid({
  campaign: c, onUpdate,
}: {
  campaign: Campaign;
  onUpdate: (met: string, month: number, value: number | null) => void;
}) {
  const start = c.data_inizio ? parseInt(c.data_inizio.split("-")[1], 10) - 1 : 0;
  const end = c.data_fine ? parseInt(c.data_fine.split("-")[1], 10) - 1 : 11;
  const months = Array.from({ length: end - start + 1 }, (_, i) => start + i);

  function calcDiv(numMet: string, denMet: string, m: number): string {
    const n = c.periodi[numMet]?.[m] ?? 0;
    const d = c.periodi[denMet]?.[m] ?? 0;
    return d > 0 ? `\u20AC${mktgFmt(n / d)}` : "\u2014";
  }

  function calcPct(numMet: string, denMet: string, m: number): string {
    const n = c.periodi[numMet]?.[m] ?? 0;
    const d = c.periodi[denMet]?.[m] ?? 0;
    return d > 0 ? ((n / d) * 100).toFixed(1) + "%" : "\u2014";
  }

  function metTotal(met: string): number {
    return months.reduce((s, m) => s + (c.periodi[met]?.[m] ?? 0), 0);
  }

  function calcDivTotal(numMet: string, denMet: string): string {
    const n = metTotal(numMet), d = metTotal(denMet);
    return d > 0 ? `\u20AC${mktgFmt(n / d)}` : "\u2014";
  }

  function calcPctTotal(numMet: string, denMet: string): string {
    const n = metTotal(numMet), d = metTotal(denMet);
    return d > 0 ? ((n / d) * 100).toFixed(1) + "%" : "\u2014";
  }

  return (
    <div className="mktg-periodi-wrap">
      <div className="mktg-per-head">
        <span className="mktg-per-title">Dati mensili 2026</span>
      </div>
      <div className="mktg-per-tbl-wrap">
        <table className="mktg-per-tbl">
          <thead>
            <tr>
              <th></th>
              {months.map((m) => <th key={m}>{MKTG_MONTHS[m]}</th>)}
              <th>TOT</th>
            </tr>
          </thead>
          <tbody>
            {MKTG_MET_EDIT.map((met) => {
              const tot = metTotal(met);
              return (
                <tr key={met}>
                  <td className="mktg-per-label">{MKTG_MET_LABELS[met]}</td>
                  {months.map((m) => (
                    <td key={m}>
                      <input
                        className="mktg-per-inp"
                        type="number"
                        step="any"
                        defaultValue={c.periodi[met]?.[m] ?? ""}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          onUpdate(met, m, v !== "" ? Number(v) : null);
                        }}
                      />
                    </td>
                  ))}
                  <td className="mktg-per-tot">{mktgFmt(tot)}</td>
                </tr>
              );
            })}
            <CalcRow label="CPL FC" months={months} render={(m) => calcDiv("BUDGET_FC", "LEAD_FC", m)} total={calcDivTotal("BUDGET_FC", "LEAD_FC")} />
            <CalcRow label="CPL RE" months={months} render={(m) => calcDiv("BUDGET_RE", "LEAD_RE", m)} total={calcDivTotal("BUDGET_RE", "LEAD_RE")} />
            <CalcRow label="CPC" months={months} render={(m) => calcDiv("BUDGET_RE", "CLICK", m)} total={calcDivTotal("BUDGET_RE", "CLICK")} />
            <CalcRow label="CTR" months={months} render={(m) => calcPct("CLICK", "IMPRESSIONI", m)} total={calcPctTotal("CLICK", "IMPRESSIONI")} />
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CalcRow({ label, months, render, total }: { label: string; months: number[]; render: (m: number) => string; total: string }) {
  return (
    <tr className="mktg-per-calc-row">
      <td className="mktg-per-label mktg-per-calc-label">{label}</td>
      {months.map((m) => <td key={m} className="mktg-per-calc">{render(m)}</td>)}
      <td className="mktg-per-calc mktg-per-tot">{total}</td>
    </tr>
  );
}

/* ── Gantt Timeline ── */

function GanttTimeline({ campaigns, onEdit }: { campaigns: Campaign[]; onEdit: (c: Campaign) => void }) {
  // Year range: full year 2026 (or derive from data)
  const yearStart = new Date("2026-01-01").getTime();
  const yearEnd = new Date("2026-12-31").getTime();
  const totalMs = yearEnd - yearStart;

  const now = new Date();
  const nowPct = Math.max(0, Math.min(((now.getTime() - yearStart) / totalMs) * 100, 100));

  return (
    <div className="mk-gantt">
      {/* Month headers */}
      <div className="mk-gantt-header">
        <div className="mk-gantt-label-col" />
        <div className="mk-gantt-bar-col">
          {MKTG_MONTHS.map((m, i) => (
            <div key={i} className="mk-gantt-month" style={{ left: `${(i / 12) * 100}%`, width: `${100 / 12}%` }}>
              {m}
            </div>
          ))}
          <div className="mk-gantt-now" style={{ left: `${nowPct}%` }} />
        </div>
      </div>
      {/* Campaign rows */}
      {campaigns.map((c) => {
        const start = c.data_inizio ? new Date(c.data_inizio).getTime() : yearStart;
        const end = c.data_fine ? new Date(c.data_fine).getTime() : yearEnd;
        const leftPct = Math.max(0, ((start - yearStart) / totalMs) * 100);
        const widthPct = Math.max(2, Math.min(((end - start) / totalMs) * 100, 100 - leftPct));
        const t = campTotals(c);

        return (
          <div key={c.id} className="mk-gantt-row" onClick={() => onEdit(c)}>
            <div className="mk-gantt-label-col">
              <span className="mk-gantt-name">{c.nome}</span>
              <span className="mk-gantt-meta">{c.piattaforma}</span>
            </div>
            <div className="mk-gantt-bar-col">
              {/* Grid lines */}
              {MKTG_MONTHS.map((_, i) => (
                <div key={i} className="mk-gantt-gridline" style={{ left: `${(i / 12) * 100}%` }} />
              ))}
              <div className="mk-gantt-now mk-gantt-now-row" style={{ left: `${nowPct}%` }} />
              <div
                className="mk-gantt-bar"
                style={{
                  left: `${leftPct}%`,
                  width: `${widthPct}%`,
                  background: mktgStatoColor(c.stato),
                }}
              >
                <span className="mk-gantt-bar-label">
                  {t.budgetRe > 0 ? `\u20AC${mktgFmt(t.budgetRe)}` : ""}
                  {t.leadRe > 0 ? ` \u00B7 ${mktgFmt(t.leadRe)} lead` : ""}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Campaign Form ── */

function CampaignForm({
  campaign, isNew, onSave, onClose,
}: {
  campaign: Campaign; isNew: boolean;
  onSave: (c: Campaign) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState<Campaign>({ ...campaign });

  function upd<K extends keyof Campaign>(k: K, v: Campaign[K]) {
    setDraft((p) => ({ ...p, [k]: v }));
  }

  function handleSave() {
    if (!draft.nome.trim()) return;
    onSave(draft);
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 600 }}>
        <h3>{isNew ? "Nuova" : "Modifica"} Campagna</h3>

        <label>Nome campagna *</label>
        <input value={draft.nome} onChange={(e) => upd("nome", e.target.value)} autoFocus />

        <div className="modal-row">
          <div>
            <label>Piattaforma</label>
            <select value={draft.piattaforma} onChange={(e) => upd("piattaforma", e.target.value)}>
              {MKTG_PIATTAFORME.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label>Canale</label>
            <select value={draft.canale} onChange={(e) => upd("canale", e.target.value)}>
              <option value="">{"\u2014"}</option>
              {MKTG_CANALI.map((ch) => <option key={ch}>{ch}</option>)}
            </select>
          </div>
        </div>

        <div className="modal-row">
          <div>
            <label>Obiettivo</label>
            <input value={draft.obiettivo} onChange={(e) => upd("obiettivo", e.target.value)} placeholder="Lead Gen, Brand..." />
          </div>
          <div>
            <label>Stato</label>
            <select value={draft.stato} onChange={(e) => upd("stato", e.target.value as MktgStato)}>
              {MKTG_STATI.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div className="modal-row">
          <div><label>Data inizio</label><input type="date" value={draft.data_inizio} onChange={(e) => upd("data_inizio", e.target.value)} /></div>
          <div><label>Data fine</label><input type="date" value={draft.data_fine} onChange={(e) => upd("data_fine", e.target.value)} /></div>
        </div>

        <label>Target / Audience</label>
        <input value={draft.target} onChange={(e) => upd("target", e.target.value)} placeholder="Es: PMI 10-500 dip, Italia" />

        <label>Landing page</label>
        <input value={draft.landing_page} onChange={(e) => upd("landing_page", e.target.value)} placeholder="https://..." />

        <label>Note</label>
        <textarea rows={3} value={draft.note} onChange={(e) => upd("note", e.target.value)} />

        <div className="modal-foot">
          <button className="btn-cancel" onClick={onClose}>Annulla</button>
          <button className="btn-save" onClick={handleSave}>Salva</button>
        </div>
      </div>
    </div>
  );
}

/* ── Import from Google Sheets ── */

function ImportSheetModal({ onImport, onClose }: {
  onImport: (campaigns: Campaign[]) => void;
  onClose: () => void;
}) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleImport() {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/import-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Errore di importazione");
        setLoading(false);
        return;
      }
      onImport(data.campaigns);
    } catch {
      setError("Errore di connessione");
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <h3>Importa da Google Sheets</h3>

        <label>URL del foglio Google</label>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://docs.google.com/spreadsheets/d/..."
          autoFocus
        />

        {error && <div className="mk-import-error">{error}</div>}

        <div className="mk-import-format">
          <div className="mk-import-format-title">Formato richiesto</div>
          <p>Il foglio deve essere <strong>condiviso</strong> (chiunque con il link) e avere due tab:</p>
          <div className="mk-import-tab-info">
            <div>
              <strong>Tab &quot;Campagne&quot;</strong>
              <span>Nome | Piattaforma | Canale | Obiettivo | Stato | Inizio | Fine | Target | Landing Page | Note</span>
            </div>
            <div>
              <strong>Tab &quot;Dati&quot;</strong> <em>(opzionale)</em>
              <span>Campagna | Metrica | Gen | Feb | Mar | ... | Dic</span>
              <span style={{ fontSize: 10, color: "var(--fg3)" }}>
                Metriche: Budget FC, Budget RE, Lead FC, Lead RE, Impressioni, Click, ROAS
              </span>
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn-cancel" onClick={onClose}>Annulla</button>
          <button className="btn-save" onClick={handleImport} disabled={loading || !url.trim()}>
            {loading ? "Importazione..." : "Importa"}
          </button>
        </div>
      </div>
    </div>
  );
}
