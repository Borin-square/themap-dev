"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useYear } from "@/components/YearProvider";
import { Skeleton } from "@/components/Skeleton";

/* ── Types ── */

type Kind = "bhag" | "medium" | "march";
type MarchStatus = "hit" | "ontrack" | "risk" | "miss";

interface Objective {
  id: string;
  holding_slug: string;
  kind: Kind;
  title: string;
  description: string | null;
  target_year: number | null;
  year: number | null;
  metric_name: string | null;
  metric_target: number | null;
  metric_current: number | null;
  metric_unit: string | null;
  status: MarchStatus | null;
  parent_id: string | null;
  order_index: number;
  owner: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const MARCH_STATUS_LABEL: Record<MarchStatus, string> = {
  hit: "Raggiunta", ontrack: "On track", risk: "A rischio", miss: "Mancata",
};
const MARCH_STATUS_COLOR: Record<MarchStatus, string> = {
  hit: "#22c55e", ontrack: "#4f8cff", risk: "#f59e0b", miss: "#ef4444",
};
const MARCH_STATUS_ICON: Record<MarchStatus, string> = {
  hit: "\u2713", ontrack: "\u25CF", risk: "\u26A0", miss: "\u2715",
};

/* ── Helpers ── */

async function bearer(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || "";
}

function fmtMetric(v: number | null, unit: string | null): string {
  if (v == null) return "—";
  const s = Number.isInteger(v) ? v.toString() : v.toFixed(1);
  return unit ? `${s} ${unit}` : s;
}

function progressPct(cur: number | null, tgt: number | null): number | null {
  if (cur == null || tgt == null || tgt === 0) return null;
  return Math.max(0, Math.min(100, Math.round((cur / tgt) * 100)));
}

/* ── Page ── */

export default function ObjectivesPage() {
  const params = useParams();
  const holdingSlug = params.company as string;
  const { year } = useYear();

  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<Objective> | null>(null);
  const [confirmDelId, setConfirmDelId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const token = await bearer();
      const res = await fetch(`/api/holding-management/objectives?holding=${holdingSlug}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (cancelled) return;
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || "Errore caricamento");
        setLoading(false);
        return;
      }
      const j = await res.json();
      setObjectives(j.rows);
      setError(null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [holdingSlug]);

  useEffect(() => {
    const channel = supabase
      .channel(`hm_objectives:${holdingSlug}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "hm_objectives", filter: `holding_slug=eq.${holdingSlug}` }, (payload) => {
        const row = (payload.new ?? payload.old) as Objective | null;
        if (!row) return;
        setObjectives((prev) => {
          if (payload.eventType === "DELETE") return prev.filter((x) => x.id !== row.id);
          const idx = prev.findIndex((x) => x.id === row.id);
          if (idx === -1) return [...prev, row];
          const next = prev.slice(); next[idx] = row; return next;
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [holdingSlug]);

  /* ── Buckets ── */

  const bhag = useMemo(() => objectives.find((o) => o.kind === "bhag") ?? null, [objectives]);
  const mediums = useMemo(() => objectives.filter((o) => o.kind === "medium").sort((a, b) => a.order_index - b.order_index || a.created_at.localeCompare(b.created_at)), [objectives]);
  const marches = useMemo(() => objectives.filter((o) => o.kind === "march" && o.year === year).sort((a, b) => a.order_index - b.order_index || a.created_at.localeCompare(b.created_at)), [objectives, year]);

  const marchYears = useMemo(() => {
    const s = new Set<number>();
    for (const o of objectives) if (o.kind === "march" && o.year != null) s.add(o.year);
    return Array.from(s).sort((a, b) => b - a);
  }, [objectives]);

  /* ── Mutations ── */

  async function save(patch: Partial<Objective>) {
    const token = await bearer();
    const body = { ...patch, holding_slug: holdingSlug };
    const res = await fetch("/api/holding-management/objectives", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Errore salvataggio");
      return;
    }
    const j = await res.json();
    setObjectives((prev) => {
      const idx = prev.findIndex((x) => x.id === j.row.id);
      if (idx === -1) return [...prev, j.row];
      const next = prev.slice(); next[idx] = j.row; return next;
    });
    setEditing(null);
  }

  async function remove(id: string) {
    const token = await bearer();
    const res = await fetch(`/api/holding-management/objectives?id=${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    setObjectives((prev) => prev.filter((x) => x.id !== id));
    setConfirmDelId(null);
  }

  /* ── Render ── */

  if (loading) return <Skeleton height={300} />;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
          Obiettivi <span style={{ color: "var(--fg3)", fontWeight: 400 }}>· holding</span>
        </h1>
      </div>

      {error && (
        <div style={{ padding: 10, marginBottom: 12, background: "rgba(239,68,68,.12)", color: "#ef4444", borderRadius: 6, fontSize: 12 }}>
          {error}
        </div>
      )}

      {/* ─── BHAG ─── */}
      <Section
        title="BHAG"
        subtitle="La trasformazione strutturale che vuoi realizzare"
        badge={bhag?.target_year ? String(bhag.target_year) : undefined}
        action={!bhag && !editing ? (
          <button onClick={() => setEditing({ kind: "bhag", target_year: new Date().getFullYear() + 10 })} style={btnPrimary}>
            + Definisci il BHAG
          </button>
        ) : null}
      >
        {editing?.kind === "bhag" && (
          <ObjectiveForm
            value={editing}
            allObjectives={objectives}
            onCancel={() => setEditing(null)}
            onSave={save}
          />
        )}
        {bhag && editing?.id !== bhag.id && (
          <BhagCard
            objective={bhag}
            onEdit={() => setEditing(bhag)}
            onDelete={() => setConfirmDelId(bhag.id)}
            confirmDel={confirmDelId === bhag.id}
            cancelDel={() => setConfirmDelId(null)}
            confirmDelete={() => remove(bhag.id)}
          />
        )}
      </Section>

      {/* ─── Traguardi 3-5 anni ─── */}
      <Section
        title="Traguardi medio termine"
        subtitle="Pochissimi risultati intermedi che aprono la strada al BHAG"
        badge={`${mediums.length}`}
        action={!editing ? (
          <button onClick={() => setEditing({ kind: "medium", target_year: new Date().getFullYear() + 3, parent_id: bhag?.id ?? null })} style={btnPrimary}>
            + Nuovo traguardo
          </button>
        ) : null}
      >
        {editing?.kind === "medium" && !editing.id && (
          <ObjectiveForm value={editing} allObjectives={objectives} onCancel={() => setEditing(null)} onSave={save} />
        )}
        {mediums.length === 0 && !editing && (
          <div style={empty}>Nessun traguardo medio-termine. Aggiungi 3-5 traguardi che portano al BHAG.</div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {mediums.map((m) => (
            editing?.id === m.id ? (
              <div key={m.id} style={{ gridColumn: "1 / -1" }}>
                <ObjectiveForm value={editing} allObjectives={objectives} onCancel={() => setEditing(null)} onSave={save} />
              </div>
            ) : (
              <MediumCard
                key={m.id}
                objective={m}
                parent={objectives.find((x) => x.id === m.parent_id) ?? null}
                onEdit={() => setEditing(m)}
                onDelete={() => setConfirmDelId(m.id)}
                confirmDel={confirmDelId === m.id}
                cancelDel={() => setConfirmDelId(null)}
                confirmDelete={() => remove(m.id)}
              />
            )
          ))}
        </div>
      </Section>

      {/* ─── 20 Mile March ─── */}
      <Section
        title={`20 Mile March`}
        subtitle="5-6 soglie da rispettare quest'anno, anche nei momenti difficili"
        badge={`${year} · ${marches.length}`}
        action={!editing ? (
          <button onClick={() => setEditing({ kind: "march", year, status: "ontrack", parent_id: null })} style={btnPrimary}>
            + Nuova soglia
          </button>
        ) : null}
      >
        {editing?.kind === "march" && !editing.id && (
          <ObjectiveForm value={editing} allObjectives={objectives} onCancel={() => setEditing(null)} onSave={save} />
        )}
        {marches.length === 0 && !editing && (
          <div style={empty}>Nessuna soglia annuale per il {year}. Aggiungi 5-6 traguardi minimi da rispettare.</div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {marches.map((m) => (
            editing?.id === m.id ? (
              <ObjectiveForm key={m.id} value={editing} allObjectives={objectives} onCancel={() => setEditing(null)} onSave={save} />
            ) : (
              <MarchRow
                key={m.id}
                objective={m}
                parent={objectives.find((x) => x.id === m.parent_id) ?? null}
                onEdit={() => setEditing(m)}
                onDelete={() => setConfirmDelId(m.id)}
                onStatusChange={(s) => save({ ...m, status: s })}
                confirmDel={confirmDelId === m.id}
                cancelDel={() => setConfirmDelId(null)}
                confirmDelete={() => remove(m.id)}
              />
            )
          ))}
        </div>

        {marchYears.filter((y) => y !== year).length > 0 && (
          <div style={{ marginTop: 16, padding: 10, border: "1px dashed var(--bd)", borderRadius: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, color: "var(--fg3)", marginBottom: 8 }}>STORICO</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {marchYears.filter((y) => y !== year).map((y) => {
                const rows = objectives.filter((o) => o.kind === "march" && o.year === y);
                const hits = rows.filter((r) => r.status === "hit").length;
                return (
                  <div key={y} style={{
                    fontSize: 11, padding: "4px 10px", borderRadius: 999, border: "1px solid var(--bd)",
                    background: "var(--cd)", color: "var(--fg2)",
                  }}>
                    {y} · {hits}/{rows.length} raggiunte
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}

/* ═══════════════════════════════════════════
   SECTION WRAPPER
   ═══════════════════════════════════════════ */

function Section({ title, subtitle, badge, action, children }: {
  title: string;
  subtitle?: string;
  badge?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0, letterSpacing: 0.5 }}>
            {title}
            {badge && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 500, color: "var(--fg3)" }}>· {badge}</span>}
          </h2>
          {subtitle && <div style={{ fontSize: 11, color: "var(--fg3)", marginTop: 2 }}>{subtitle}</div>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════
   BHAG CARD
   ═══════════════════════════════════════════ */

function BhagCard({ objective, onEdit, onDelete, confirmDel, cancelDel, confirmDelete }: {
  objective: Objective;
  onEdit: () => void;
  onDelete: () => void;
  confirmDel: boolean;
  cancelDel: () => void;
  confirmDelete: () => void;
}) {
  return (
    <div style={{
      padding: 24, border: "1px solid var(--bd)", borderRadius: 12,
      background: "linear-gradient(135deg, rgba(79,140,255,.06), rgba(168,85,247,.06))",
      position: "relative",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: "var(--fg3)" }}>
          BHAG · {objective.target_year ?? "—"}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={onEdit} style={btnGhost}>Modifica</button>
          {confirmDel ? (
            <span className="fws-confirm">
              <span className="fws-confirm-text">Eliminare BHAG?</span>
              <button className="fws-confirm-yes" onClick={confirmDelete}>Elimina</button>
              <button className="fws-confirm-no" onClick={cancelDel}>Annulla</button>
            </span>
          ) : (
            <button onClick={onDelete} style={btnGhostDanger}>Elimina</button>
          )}
        </div>
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.3, marginBottom: 6 }}>{objective.title}</div>
      {objective.description && (
        <div style={{ fontSize: 13, color: "var(--fg2)", lineHeight: 1.5 }}>{objective.description}</div>
      )}
      {objective.owner && (
        <div style={{ fontSize: 11, color: "var(--fg3)", marginTop: 10 }}>Owner: {objective.owner}</div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   MEDIUM CARD (3-5 anni)
   ═══════════════════════════════════════════ */

function MediumCard({ objective, parent, onEdit, onDelete, confirmDel, cancelDel, confirmDelete }: {
  objective: Objective;
  parent: Objective | null;
  onEdit: () => void;
  onDelete: () => void;
  confirmDel: boolean;
  cancelDel: () => void;
  confirmDelete: () => void;
}) {
  const pct = progressPct(objective.metric_current, objective.metric_target);
  return (
    <div style={{ padding: 14, border: "1px solid var(--bd)", borderRadius: 10, background: "var(--cd)", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, color: "var(--fg3)" }}>
          {objective.target_year ? `→ ${objective.target_year}` : "MEDIO TERMINE"}
        </div>
        {parent && (
          <div style={{ fontSize: 10, color: "var(--fg3)", fontStyle: "italic" }} title={parent.title}>
            ↑ BHAG
          </div>
        )}
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.25 }}>{objective.title}</div>
      {objective.description && <div style={{ fontSize: 12, color: "var(--fg2)", lineHeight: 1.4 }}>{objective.description}</div>}
      {objective.metric_name && (
        <div style={{ fontSize: 11, color: "var(--fg2)", marginTop: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span>{objective.metric_name}</span>
            <span>
              <b style={{ color: "var(--fg)" }}>{fmtMetric(objective.metric_current, objective.metric_unit)}</b>
              {" / "}
              <span style={{ color: "var(--fg3)" }}>{fmtMetric(objective.metric_target, objective.metric_unit)}</span>
            </span>
          </div>
          {pct != null && (
            <div style={{ height: 4, background: "var(--bd)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: pct >= 100 ? "#22c55e" : "#4f8cff" }} />
            </div>
          )}
        </div>
      )}
      {objective.owner && <div style={{ fontSize: 10, color: "var(--fg3)" }}>Owner: {objective.owner}</div>}
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 4 }}>
        <button onClick={onEdit} style={btnGhost}>Modifica</button>
        {confirmDel ? (
          <span className="fws-confirm">
            <span className="fws-confirm-text">Eliminare?</span>
            <button className="fws-confirm-yes" onClick={confirmDelete}>Elimina</button>
            <button className="fws-confirm-no" onClick={cancelDel}>Annulla</button>
          </span>
        ) : (
          <button onClick={onDelete} style={btnGhostDanger}>Elimina</button>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   MARCH ROW (20 Mile March)
   ═══════════════════════════════════════════ */

function MarchRow({ objective, parent, onEdit, onDelete, onStatusChange, confirmDel, cancelDel, confirmDelete }: {
  objective: Objective;
  parent: Objective | null;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (s: MarchStatus) => void;
  confirmDel: boolean;
  cancelDel: () => void;
  confirmDelete: () => void;
}) {
  const st = objective.status ?? "ontrack";
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "auto 1fr auto auto auto",
      gap: 12, alignItems: "center",
      padding: "10px 14px", border: "1px solid var(--bd)", borderRadius: 8, background: "var(--cd)",
      borderLeft: `4px solid ${MARCH_STATUS_COLOR[st]}`,
    }}>
      <select
        value={st}
        onChange={(e) => onStatusChange(e.target.value as MarchStatus)}
        style={{
          fontSize: 11, padding: "3px 6px", borderRadius: 4,
          border: `1px solid ${MARCH_STATUS_COLOR[st]}55`,
          background: `${MARCH_STATUS_COLOR[st]}18`,
          color: MARCH_STATUS_COLOR[st], fontWeight: 700, cursor: "pointer",
        }}
      >
        {(Object.keys(MARCH_STATUS_LABEL) as MarchStatus[]).map((s) => (
          <option key={s} value={s}>{MARCH_STATUS_ICON[s]} {MARCH_STATUS_LABEL[s]}</option>
        ))}
      </select>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{objective.title}</div>
        <div style={{ fontSize: 11, color: "var(--fg3)", marginTop: 2, display: "flex", gap: 10, flexWrap: "wrap" }}>
          {objective.description && <span>{objective.description}</span>}
          {parent && <span style={{ fontStyle: "italic" }}>↑ {parent.title}</span>}
          {objective.owner && <span>Owner: {objective.owner}</span>}
        </div>
      </div>
      <div style={{ fontSize: 11, color: "var(--fg2)", minWidth: 100, textAlign: "right" }}>
        {objective.metric_name && (
          <div>
            <div style={{ fontSize: 10, color: "var(--fg3)" }}>{objective.metric_name}</div>
            <div>
              <b style={{ color: "var(--fg)" }}>{fmtMetric(objective.metric_current, objective.metric_unit)}</b>
              {" / "}
              <span style={{ color: "var(--fg3)" }}>{fmtMetric(objective.metric_target, objective.metric_unit)}</span>
            </div>
          </div>
        )}
      </div>
      <button onClick={onEdit} style={btnGhost}>Modifica</button>
      {confirmDel ? (
        <span className="fws-confirm">
          <span className="fws-confirm-text">Eliminare?</span>
          <button className="fws-confirm-yes" onClick={confirmDelete}>Elimina</button>
          <button className="fws-confirm-no" onClick={cancelDel}>Annulla</button>
        </span>
      ) : (
        <button onClick={onDelete} style={btnGhostDanger}>{"\u2715"}</button>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   FORM (unico per bhag/medium/march)
   ═══════════════════════════════════════════ */

function ObjectiveForm({ value, allObjectives, onCancel, onSave }: {
  value: Partial<Objective>;
  allObjectives: Objective[];
  onCancel: () => void;
  onSave: (p: Partial<Objective>) => void;
}) {
  const [form, setForm] = useState<Partial<Objective>>(value);
  const set = (k: keyof Objective, v: unknown) => setForm((p) => ({ ...p, [k]: v as never }));
  const kind = form.kind as Kind;

  // Candidate parents in base al livello:
  // - medium ⇒ parent puo' essere bhag
  // - march  ⇒ parent puo' essere medium
  const parentCandidates = useMemo(() => {
    if (kind === "medium") return allObjectives.filter((o) => o.kind === "bhag");
    if (kind === "march") return allObjectives.filter((o) => o.kind === "medium");
    return [];
  }, [allObjectives, kind]);

  function submit() {
    if (!form.title || !form.kind) return;
    onSave(form);
  }

  const isBhag = kind === "bhag";
  const isMarch = kind === "march";
  const showMetric = !isBhag; // BHAG e' qualitativo, medium e march hanno metrica

  return (
    <div style={{
      padding: 14, border: "1px solid var(--bd)", borderRadius: 10, background: "var(--cd)",
      marginBottom: 14, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10,
    }}>
      <div style={{ gridColumn: "1 / -1", fontSize: 12, fontWeight: 700, color: "var(--fg2)" }}>
        {form.id ? "Modifica" : "Nuovo"} · {isBhag ? "BHAG" : isMarch ? "20 Mile March" : "Traguardo medio termine"}
      </div>

      <label style={{ ...fld, gridColumn: "1 / -1" }}>
        <span style={lbl}>Titolo *</span>
        <input value={form.title || ""} onChange={(e) => set("title", e.target.value)} style={inp} />
      </label>

      <label style={{ ...fld, gridColumn: "1 / -1" }}>
        <span style={lbl}>Descrizione</span>
        <textarea value={form.description || ""} onChange={(e) => set("description", e.target.value)} rows={2} style={inp} />
      </label>

      <label style={fld}>
        <span style={lbl}>Owner</span>
        <input value={form.owner || ""} onChange={(e) => set("owner", e.target.value)} placeholder="Nome persona" style={inp} />
      </label>

      {isBhag && (
        <label style={fld}>
          <span style={lbl}>Anno target</span>
          <input type="number" value={form.target_year ?? ""} onChange={(e) => set("target_year", e.target.value ? parseInt(e.target.value, 10) : null)} placeholder="es. 2035" style={inp} />
        </label>
      )}

      {!isBhag && !isMarch && (
        <label style={fld}>
          <span style={lbl}>Anno target</span>
          <input type="number" value={form.target_year ?? ""} onChange={(e) => set("target_year", e.target.value ? parseInt(e.target.value, 10) : null)} placeholder="es. 2028" style={inp} />
        </label>
      )}

      {isMarch && (
        <>
          <label style={fld}>
            <span style={lbl}>Anno del piano</span>
            <input type="number" value={form.year ?? ""} onChange={(e) => set("year", e.target.value ? parseInt(e.target.value, 10) : null)} style={inp} />
          </label>
          <label style={fld}>
            <span style={lbl}>Status</span>
            <select value={form.status ?? "ontrack"} onChange={(e) => set("status", e.target.value as MarchStatus)} style={inp}>
              {(Object.keys(MARCH_STATUS_LABEL) as MarchStatus[]).map((s) => (
                <option key={s} value={s}>{MARCH_STATUS_LABEL[s]}</option>
              ))}
            </select>
          </label>
        </>
      )}

      {parentCandidates.length > 0 && (
        <label style={{ ...fld, gridColumn: "1 / -1" }}>
          <span style={lbl}>Collegato a (parent)</span>
          <select value={form.parent_id ?? ""} onChange={(e) => set("parent_id", e.target.value || null)} style={inp}>
            <option value="">— nessuno —</option>
            {parentCandidates.map((p) => (
              <option key={p.id} value={p.id}>{p.title}{p.target_year ? ` (${p.target_year})` : ""}</option>
            ))}
          </select>
        </label>
      )}

      {showMetric && (
        <>
          <label style={fld}>
            <span style={lbl}>Nome metrica</span>
            <input value={form.metric_name || ""} onChange={(e) => set("metric_name", e.target.value)} placeholder="es. EBITDA consolidato" style={inp} />
          </label>
          <label style={fld}>
            <span style={lbl}>Unita&#39; (opz.)</span>
            <input value={form.metric_unit || ""} onChange={(e) => set("metric_unit", e.target.value)} placeholder="es. M€, %, punti" style={inp} />
          </label>
          <label style={fld}>
            <span style={lbl}>Valore corrente</span>
            <input type="number" step="any" value={form.metric_current ?? ""} onChange={(e) => set("metric_current", e.target.value ? parseFloat(e.target.value) : null)} style={inp} />
          </label>
          <label style={fld}>
            <span style={lbl}>Target</span>
            <input type="number" step="any" value={form.metric_target ?? ""} onChange={(e) => set("metric_target", e.target.value ? parseFloat(e.target.value) : null)} style={inp} />
          </label>
        </>
      )}

      <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
        <button onClick={onCancel} style={btnGhost}>Annulla</button>
        <button onClick={submit} style={btnPrimary} disabled={!form.title}>Salva</button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   STYLES
   ═══════════════════════════════════════════ */

const btnPrimary: React.CSSProperties = { fontSize: 12, padding: "6px 14px", borderRadius: 6, border: 0, background: "var(--fg)", color: "var(--bg)", cursor: "pointer", fontWeight: 700 };
const btnGhost: React.CSSProperties = { fontSize: 11, padding: "4px 10px", borderRadius: 4, border: "1px solid var(--bd)", background: "transparent", color: "var(--fg2)", cursor: "pointer" };
const btnGhostDanger: React.CSSProperties = { ...btnGhost, color: "#ef4444", borderColor: "rgba(239,68,68,.3)" };
const empty: React.CSSProperties = { padding: 30, textAlign: "center", color: "var(--fg3)", fontSize: 13, border: "1px dashed var(--bd)", borderRadius: 8 };
const fld: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4 };
const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: 0.5 };
const inp: React.CSSProperties = { fontSize: 12, padding: "6px 8px", borderRadius: 4, border: "1px solid var(--bd)", background: "var(--bg)", color: "var(--fg)", fontFamily: "inherit" };
