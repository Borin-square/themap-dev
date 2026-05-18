"use client";

import { useState, useRef, useEffect } from "react";
import { useLocalState } from "@/lib/useLocalState";
import { getCachedCompanies, type Company } from "@/lib/companies";
import { PE_FUNZIONI, peFnColor } from "@/lib/people";
import {
  WL_MAX_EFFORT, WL_LIVELLI, WL_FUNZIONI,
  effortColor, groupByPerson, emptyMission,
  getMockMissions, DEFAULT_FOUNDERS,
  type Mission, type PersonCard,
} from "@/lib/workload";

export default function WorkloadPage() {
  const companies = getCachedCompanies();
  const [missions, setMissions] = useLocalState<Mission[]>("themap:holding:workload", getMockMissions);
  const [founders] = useLocalState<string[]>("themap:holding:founders", () => DEFAULT_FOUNDERS);
  const [filterAz, setFilterAz] = useState("ALL");
  const [filterFn, setFilterFn] = useState("ALL");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(emptyMission);
  const [editId, setEditId] = useState<string | null>(null);
  const [editField, setEditField] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000); }

  // All unique people names for the add form
  const allPeople = Array.from(new Set(missions.map((m) => m.persona))).sort();

  // Filter missions
  const filtered = missions.filter((m) => {
    if (filterAz !== "ALL" && m.azienda !== filterAz) return false;
    if (filterFn !== "ALL" && m.funzione !== filterFn) return false;
    return true;
  });

  // Group into person cards
  const cards = groupByPerson(filtered, founders);

  // Split into founders and by-company groups
  const founderCards = cards.filter((c) => c.isFounder);
  const nonFounderCards = cards.filter((c) => !c.isFounder);

  // Group non-founders by their primary company (most effort)
  const byCompany: Record<string, PersonCard[]> = {};
  nonFounderCards.forEach((card) => {
    let maxEff = 0, primary = card.entries[0]?.azienda || "";
    card.entries.forEach((e) => { if (e.effort > maxEff) { maxEff = e.effort; primary = e.azienda; } });
    if (!byCompany[primary]) byCompany[primary] = [];
    byCompany[primary].push(card);
  });

  // Add mission
  function handleAdd() {
    if (!draft.persona.trim() || !draft.azienda) return;
    // Check duplicate
    const dup = missions.find((m) => m.persona === draft.persona.trim() && m.azienda === draft.azienda);
    if (dup) { showToast("Missione gia' esistente per questa persona/azienda"); return; }
    setMissions((p) => [...p, { ...draft, id: crypto.randomUUID(), persona: draft.persona.trim() }]);
    setAdding(false);
    setDraft(emptyMission());
    showToast("Missione aggiunta");
  }

  // Delete mission
  function handleDelete(id: string) {
    setMissions((p) => p.filter((m) => m.id !== id));
    setConfirmDel(null);
    showToast("Missione rimossa");
  }

  // Inline edit effort
  function saveEffort(id: string, value: string) {
    const v = parseFloat(value);
    if (isNaN(v) || v < 0) { setEditId(null); setEditField(null); return; }
    setMissions((p) => p.map((m) => m.id === id ? { ...m, effort: v } : m));
    setEditId(null);
    setEditField(null);
  }

  // Inline edit funzione
  function saveFunzione(id: string, value: string) {
    setMissions((p) => p.map((m) => m.id === id ? { ...m, funzione: value } : m));
    setEditId(null);
    setEditField(null);
  }

  // Inline edit livello
  function saveLivello(id: string, value: string) {
    setMissions((p) => p.map((m) => m.id === id ? { ...m, livello: value } : m));
    setEditId(null);
    setEditField(null);
  }

  function compColor(slug: string): string {
    return companies.find((c) => c.slug === slug)?.color || "var(--fg2)";
  }

  function compName(slug: string): string {
    return companies.find((c) => c.slug === slug)?.name || slug;
  }

  return (
    <div>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Workload</h1>

      {toast && <div className="fws-toast">{toast}</div>}

      {/* Filters + Add */}
      <div className="wl-top-bar">
        <div className="wl-filters">
          <div className="wl-filter-group">
            <button className={`wl-filter-btn${filterAz === "ALL" ? " act" : ""}`} onClick={() => setFilterAz("ALL")}>Tutte</button>
            {companies.map((c) => (
              <button key={c.slug} className={`wl-filter-btn${filterAz === c.slug ? " act" : ""}`} onClick={() => setFilterAz(c.slug)}>
                {c.name}
              </button>
            ))}
          </div>
          <div className="wl-filter-group">
            {WL_FUNZIONI.map((f) => (
              <button key={f} className={`wl-filter-btn${filterFn === f ? " act" : ""}`} onClick={() => setFilterFn(f)}>
                {f}
              </button>
            ))}
            <button className={`wl-filter-btn${filterFn === "ALL" ? " act" : ""}`} onClick={() => setFilterFn("ALL")}>Tutte</button>
          </div>
        </div>
        <button className="wl-add-btn" onClick={() => setAdding(!adding)}>+ Missione</button>
      </div>

      {/* Add form */}
      {adding && (
        <div className="wl-add-row">
          <input
            className="wl-add-inp"
            value={draft.persona}
            onChange={(e) => setDraft({ ...draft, persona: e.target.value })}
            placeholder="Persona..."
            list="wl-people-list"
            autoFocus
          />
          <datalist id="wl-people-list">
            {allPeople.map((n) => <option key={n} value={n} />)}
          </datalist>
          <select className="wl-add-sel" value={draft.azienda} onChange={(e) => setDraft({ ...draft, azienda: e.target.value })}>
            <option value="">Azienda...</option>
            {companies.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
          <select className="wl-add-sel" value={draft.funzione} onChange={(e) => setDraft({ ...draft, funzione: e.target.value })}>
            {WL_FUNZIONI.map((f) => <option key={f}>{f}</option>)}
          </select>
          <button className="wl-add-save" onClick={handleAdd}>Aggiungi</button>
          <button className="wl-add-cancel" onClick={() => { setAdding(false); setDraft(emptyMission()); }}>Annulla</button>
        </div>
      )}

      {/* Founders section */}
      {founderCards.length > 0 && (
        <div className="wl-section">
          <div className="wl-section-title" style={{ color: "#f59e0b" }}>FOUNDERS</div>
          <div className="wl-grid">
            {founderCards.map((card) => (
              <WlCard
                key={card.name}
                card={card}
                companies={companies}
                compColor={compColor}
                compName={compName}
                editId={editId}
                editField={editField}
                confirmDel={confirmDel}
                onEditStart={(id, field) => { setEditId(id); setEditField(field); }}
                onEditCancel={() => { setEditId(null); setEditField(null); }}
                onSaveEffort={saveEffort}
                onSaveFunzione={saveFunzione}
                onSaveLivello={saveLivello}
                onDelete={handleDelete}
                onConfirmDel={setConfirmDel}
                onCancelDel={() => setConfirmDel(null)}
              />
            ))}
          </div>
        </div>
      )}

      {/* By-company sections */}
      {companies.map((c) => {
        const items = byCompany[c.slug];
        if (!items || items.length === 0) return null;
        return (
          <div key={c.slug} className="wl-section">
            <div className="wl-section-title" style={{ color: c.color }}>{c.name.toUpperCase()}</div>
            <div className="wl-grid">
              {items.map((card) => (
                <WlCard
                  key={card.name}
                  card={card}
                  companies={companies}
                  compColor={compColor}
                  compName={compName}
                  editId={editId}
                  editField={editField}
                  confirmDel={confirmDel}
                  onEditStart={(id, field) => { setEditId(id); setEditField(field); }}
                  onEditCancel={() => { setEditId(null); setEditField(null); }}
                  onSaveEffort={saveEffort}
                  onSaveFunzione={saveFunzione}
                  onSaveLivello={saveLivello}
                  onDelete={handleDelete}
                  onConfirmDel={setConfirmDel}
                  onCancelDel={() => setConfirmDel(null)}
                />
              ))}
            </div>
          </div>
        );
      })}

      {cards.length === 0 && (
        <div style={{ color: "var(--fg3)", textAlign: "center", padding: 60 }}>
          Nessuna missione trovata con i filtri selezionati.
        </div>
      )}
    </div>
  );
}

/* ── Person Card ── */

function WlCard({ card, companies, compColor, compName, editId, editField, confirmDel, onEditStart, onEditCancel, onSaveEffort, onSaveFunzione, onSaveLivello, onDelete, onConfirmDel, onCancelDel }: {
  card: PersonCard;
  companies: Company[];
  compColor: (slug: string) => string;
  compName: (slug: string) => string;
  editId: string | null;
  editField: string | null;
  confirmDel: string | null;
  onEditStart: (id: string, field: string) => void;
  onEditCancel: () => void;
  onSaveEffort: (id: string, value: string) => void;
  onSaveFunzione: (id: string, value: string) => void;
  onSaveLivello: (id: string, value: string) => void;
  onDelete: (id: string) => void;
  onConfirmDel: (id: string | null) => void;
  onCancelDel: () => void;
}) {
  const pct = Math.min(card.total / WL_MAX_EFFORT * 100, 100);
  const bc = effortColor(card.total);
  const overload = card.total > WL_MAX_EFFORT;

  return (
    <div className={`wl-card${overload ? " overload" : ""}`}>
      <div className="wl-card-top">
        <span className="wl-name">{card.name}</span>
        <span className="wl-bar-text" style={{ color: bc }}>
          {card.total.toFixed(1)}/{WL_MAX_EFFORT}{overload ? " \u26A0" : ""}
        </span>
      </div>
      <div className="wl-bar-bg">
        <div className="wl-bar" style={{ width: `${pct}%`, background: bc }} />
      </div>
      <div className="wl-breakdown">
        {card.entries.map((e) => (
          <div key={e.id} className="wl-entry">
            <span className="wl-entry-az" style={{ color: compColor(e.azienda) }}>
              {compName(e.azienda)}
            </span>

            {/* Funzione — inline edit */}
            {editId === e.id && editField === "funzione" ? (
              <InlineSelect
                value={e.funzione}
                options={WL_FUNZIONI as unknown as string[]}
                onSave={(v) => onSaveFunzione(e.id, v)}
                onCancel={onEditCancel}
              />
            ) : (
              <span className="wl-fn wl-ed" onClick={() => onEditStart(e.id, "funzione")} title="Clicca per modificare">
                {e.funzione}
              </span>
            )}

            {/* Livello — inline edit */}
            {editId === e.id && editField === "livello" ? (
              <InlineSelect
                value={e.livello}
                options={["", ...WL_LIVELLI as unknown as string[]]}
                onSave={(v) => onSaveLivello(e.id, v)}
                onCancel={onEditCancel}
              />
            ) : (
              <span className="wl-badge wl-ed" onClick={() => onEditStart(e.id, "livello")} title="Clicca per modificare">
                {e.livello || "\u2014"}
              </span>
            )}

            {/* Effort — inline edit */}
            {editId === e.id && editField === "effort" ? (
              <InlineNumber
                value={e.effort}
                onSave={(v) => onSaveEffort(e.id, v)}
                onCancel={onEditCancel}
              />
            ) : (
              <span className="wl-eff wl-ed" onClick={() => onEditStart(e.id, "effort")} title="Clicca per modificare">
                {e.effort.toFixed(1)}gg
              </span>
            )}

            {/* Delete */}
            {confirmDel === e.id ? (
              <span className="wl-del-confirm">
                <button className="fws-confirm-yes" onClick={() => onDelete(e.id)}>Si</button>
                <button className="fws-confirm-no" onClick={onCancelDel}>No</button>
              </span>
            ) : (
              <button className="wl-del-btn" onClick={() => onConfirmDel(e.id)} title="Rimuovi missione">&times;</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Inline Editors ── */

function InlineSelect({ value, options, onSave, onCancel }: {
  value: string; options: string[]; onSave: (v: string) => void; onCancel: () => void;
}) {
  return (
    <select
      className="wl-edit-sel"
      defaultValue={value}
      onChange={(e) => onSave(e.target.value)}
      onBlur={onCancel}
      autoFocus
    >
      {options.map((o) => <option key={o} value={o}>{o || "\u2014"}</option>)}
    </select>
  );
}

function InlineNumber({ value, onSave, onCancel }: {
  value: number; onSave: (v: string) => void; onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      className="wl-edit-inp"
      type="number"
      step="0.5"
      min="0"
      defaultValue={value}
      onKeyDown={(e) => {
        if (e.key === "Enter") ref.current?.blur();
        if (e.key === "Escape") onCancel();
      }}
      onBlur={(e) => onSave(e.target.value)}
      autoFocus
    />
  );
}
