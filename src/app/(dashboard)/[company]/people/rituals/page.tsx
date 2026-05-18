"use client";

import { useState, useRef, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getCompany, COMPANIES } from "@/lib/companies";
import { useLocalState } from "@/lib/useLocalState";
import { dataVersion } from "@/lib/square-marketing-data";
import { getMockPeopleForCompany, type Persona } from "@/lib/people";

interface Evento {
  id: number;
  azienda: string;
  tipologia: string;
  titolo: string;
  data: string; // dd/mm/yyyy
  dataFine: string; // dd/mm/yyyy (vuoto se giorno singolo)
  ora: string;
  luogo: string;
  confermato: boolean;
  partecipanti: string;
  odg: string;
}

const MESI = ["GEN", "FEB", "MAR", "APR", "MAG", "GIU", "LUG", "AGO", "SET", "OTT", "NOV", "DIC"];
const TIPOLOGIE = ["WORKSHOP", "REVIEW", "PLANNING", "MEETING", "EVENTO", "FORMAZIONE", "ALTRO"];

function parseDate(s: string): Date | null {
  if (!s) return null;
  const p = s.split("/");
  if (p.length !== 3) return null;
  return new Date(+p[2], +p[1] - 1, +p[0]);
}

function today(): Date {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d;
}

function fmtDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/** dd/mm/yyyy → yyyy-mm-dd per input[type=date] */
function toIso(s: string): string {
  if (!s) return "";
  const p = s.split("/");
  if (p.length !== 3) return "";
  return `${p[2]}-${p[1].padStart(2, "0")}-${p[0].padStart(2, "0")}`;
}

/** yyyy-mm-dd → dd/mm/yyyy */
function fromIso(s: string): string {
  if (!s) return "";
  const p = s.split("-");
  if (p.length !== 3) return "";
  return `${p[2]}/${p[1]}/${p[0]}`;
}

function azColor(slug: string): string {
  return COMPANIES.find((c) => c.slug === slug || c.name.toUpperCase() === slug.toUpperCase())?.color || "var(--accent)";
}

let _nextId = 100;
function getMockEvents(): Evento[] {
  const y = 2026;
  return [
    { id: 1, azienda: "acme", tipologia: "PLANNING", titolo: "Q1 Planning Session", data: `15/01/${y}`, dataFine: "", ora: "09:00", luogo: "Ufficio Milano", confermato: true, partecipanti: "Marco Rossi, Anna Neri, Roberto Sala", odg: "1. Review Q4\n2. OKR Q1\n3. Budget allocation" },
    { id: 2, azienda: "acme", tipologia: "WORKSHOP", titolo: "Product Strategy Workshop", data: `22/02/${y}`, dataFine: `23/02/${y}`, ora: "10:00", luogo: "Coworking Roma", confermato: true, partecipanti: "Silvia Rizzo", odg: "Roadmap H1, Feature prioritization" },
    { id: 3, azienda: "acme", tipologia: "REVIEW", titolo: "Q1 Business Review", data: `28/03/${y}`, dataFine: "", ora: "14:00", luogo: "Sala Riunioni A", confermato: true, partecipanti: "Marco Rossi, Roberto Sala", odg: "" },
    { id: 4, azienda: "acme", tipologia: "MEETING", titolo: "Sales Kickoff H2", data: `10/04/${y}`, dataFine: "", ora: "09:30", luogo: "", confermato: true, partecipanti: "Roberto Sala, Chiara Monti, Luca Barbieri", odg: "Targets H2, Nuovi territori" },
    { id: 5, azienda: "acme", tipologia: "FORMAZIONE", titolo: "AI Tools Training", data: `05/05/${y}`, dataFine: "", ora: "15:00", luogo: "Online", confermato: false, partecipanti: "Marco Rossi, Silvia Rizzo, Federico Gallo", odg: "Claude, Cursor, Automazioni" },
    { id: 6, azienda: "acme", tipologia: "PLANNING", titolo: "Q2 Planning Session", data: `20/05/${y}`, dataFine: "", ora: "09:00", luogo: "Ufficio Milano", confermato: false, partecipanti: "Marco Rossi, Giuseppe Verdi, Roberto Sala, Silvia Rizzo", odg: "" },
    { id: 7, azienda: "acme", tipologia: "EVENTO", titolo: "Team Building Estate", data: `15/06/${y}`, dataFine: `16/06/${y}`, ora: "10:00", luogo: "Lago di Garda", confermato: false, partecipanti: "", odg: "" },
    { id: 8, azienda: "acme", tipologia: "REVIEW", titolo: "Mid-Year Review", data: `05/07/${y}`, dataFine: "", ora: "14:00", luogo: "Sala Board", confermato: false, partecipanti: "Marco Rossi, Laura Bianchi", odg: "P&L H1, Forecast H2" },
    { id: 9, azienda: "acme", tipologia: "WORKSHOP", titolo: "OKR Setting Q3-Q4", data: `10/09/${y}`, dataFine: "", ora: "09:00", luogo: "", confermato: false, partecipanti: "", odg: "" },
    { id: 10, azienda: "acme", tipologia: "EVENTO", titolo: "Christmas Party", data: `18/12/${y}`, dataFine: "", ora: "19:00", luogo: "Da definire", confermato: false, partecipanti: "", odg: "" },
  ];
}

export default function RitualsPage() {
  const params = useParams();
  const company = getCompany(params.company as string);
  const slug = params.company as string;
  const dv = dataVersion(slug);
  const [events, setEvents] = useLocalState<Evento[]>(`themap:${slug}:events`, getMockEvents, dv);
  const [people] = useLocalState<Persona[]>(`themap:${slug}:people`, () => getMockPeopleForCompany(slug), dv);
  const [editId, setEditId] = useState<number | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [draft, setDraft] = useState<Evento | null>(null);
  const [confirmDel, setConfirmDel] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const todayMarkerRef = useRef<HTMLDivElement>(null);

  const now = today();

  const sorted = [...events].sort((a, b) => {
    const da = parseDate(a.data), db = parseDate(b.data);
    if (!da) return 1; if (!db) return -1;
    return da.getTime() - db.getTime();
  });

  const upcoming = sorted.filter((e) => { const d = parseDate(e.data); return d && d >= now; });
  const past = sorted.filter((e) => { const d = parseDate(e.data); return !d || d < now; }).reverse();

  const monthCounts = Array.from({ length: 12 }, () => 0);
  events.forEach((e) => {
    const d = parseDate(e.data);
    if (d) monthCounts[d.getMonth()]++;
  });
  const currentMonth = now.getMonth();

  useEffect(() => {
    setTimeout(() => todayMarkerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
  }, []);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000); }

  function startEdit(ev: Evento) {
    setEditId(ev.id);
    setDraft({ ...ev });
    setAddingNew(false);
  }

  function startAdd() {
    const ev: Evento = {
      id: 0, azienda: params.company as string, tipologia: "MEETING",
      titolo: "", data: fmtDate(now), dataFine: "", ora: "", luogo: "",
      confermato: false, partecipanti: "", odg: "",
    };
    setDraft(ev);
    setAddingNew(true);
    setEditId(null);
  }

  function cancelEdit() {
    setEditId(null);
    setAddingNew(false);
    setDraft(null);
  }

  function saveDraft() {
    if (!draft || !draft.titolo.trim()) return;
    if (addingNew) {
      draft.id = _nextId++;
      setEvents((p) => [...p, { ...draft, titolo: draft.titolo.trim() }]);
      showToast("Evento aggiunto");
    } else if (editId) {
      setEvents((p) => p.map((e) => (e.id === editId ? { ...draft, titolo: draft.titolo.trim() } : e)));
      showToast("Evento aggiornato");
    }
    cancelEdit();
  }

  function deleteEvent(id: number) {
    setEvents((p) => p.filter((e) => e.id !== id));
    setConfirmDel(null);
    showToast("Evento eliminato");
  }

  function updateDraft(field: keyof Evento, value: string | boolean) {
    if (!draft) return;
    setDraft({ ...draft, [field]: value });
  }

  const todayStr = fmtDate(now);

  return (
    <div>
      <div className="ee-subnav">
        <Link href={`/${params.company}/people`} className="ee-tab">People</Link>
        <Link href={`/${params.company}/people/organization`} className="ee-tab">Organigramma</Link>
        <span className="ee-tab active">Rituals</span>
        <Link href={`/${params.company}/organization/tools`} className="ee-tab">Tools</Link>
      </div>

      {toast && <div className="fws-toast">{toast}</div>}

      {/* Month strip */}
      <div className="ev-month-strip" ref={stripRef}>
        {MESI.map((m, i) => (
          <div
            key={m}
            className={`ev-month-cell${i === currentMonth ? " current" : ""}${monthCounts[i] > 0 ? " has" : ""}`}
            onClick={() => {
              const first = sorted.find((e) => { const d = parseDate(e.data); return d && d.getMonth() === i; });
              if (first) document.getElementById(`ev-${first.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
          >
            <span className="ev-month-label">{m}</span>
            {monthCounts[i] > 0 && (
              <div className="ev-month-dots">
                {Array.from({ length: Math.min(monthCounts[i], 5) }, (_, j) => (
                  <span key={j} className="ev-month-dot" />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="ev-controls">
        <button className="pe-add-btn" onClick={startAdd}>+ Nuovo evento</button>
        <span className="ev-count">{events.length} eventi &middot; {upcoming.length} prossimi</span>
      </div>

      {/* New event inline form */}
      {addingNew && draft && (
        <div className="ev-card ev-card-editing" style={{ marginBottom: 16, marginLeft: 40 }}>
          <EventEditForm draft={draft} updateDraft={updateDraft} onSave={saveDraft} onCancel={cancelEdit} people={people} />
        </div>
      )}

      {/* Timeline */}
      <div className="ev-timeline">
        {upcoming.length > 0 && (
          <>
            <div className="ev-section-badge upcoming">PROSSIMI</div>
            <div className="ev-today-marker" ref={todayMarkerRef}>
              <span className="ev-today-line" />
              <span className="ev-today-label">OGGI &mdash; {todayStr}</span>
              <span className="ev-today-line" />
            </div>
            {upcoming.map((e) => (
              <EventCard
                key={e.id}
                evento={e}
                isPast={false}
                companyColor={company?.color}
                isEditing={editId === e.id}
                draft={editId === e.id ? draft : null}
                confirmDel={confirmDel === e.id}
                onEdit={() => startEdit(e)}
                onDelete={() => deleteEvent(e.id)}
                onConfirmDel={() => setConfirmDel(e.id)}
                onCancelDel={() => setConfirmDel(null)}
                updateDraft={editId === e.id ? updateDraft : undefined}
                onSave={editId === e.id ? saveDraft : undefined}
                onCancel={editId === e.id ? cancelEdit : undefined}
                people={people}
              />
            ))}
          </>
        )}

        {past.length > 0 && (
          <>
            <div className="ev-section-badge past">PASSATI</div>
            {past.map((e) => (
              <EventCard
                key={e.id}
                evento={e}
                isPast={true}
                companyColor={company?.color}
                isEditing={editId === e.id}
                draft={editId === e.id ? draft : null}
                confirmDel={confirmDel === e.id}
                onEdit={() => startEdit(e)}
                onDelete={() => deleteEvent(e.id)}
                onConfirmDel={() => setConfirmDel(e.id)}
                onCancelDel={() => setConfirmDel(null)}
                updateDraft={editId === e.id ? updateDraft : undefined}
                onSave={editId === e.id ? saveDraft : undefined}
                onCancel={editId === e.id ? cancelEdit : undefined}
                people={people}
              />
            ))}
          </>
        )}

        {events.length === 0 && (
          <div className="ev-empty">Nessun evento. Clicca &quot;+ Nuovo evento&quot; per iniziare.</div>
        )}
      </div>
    </div>
  );
}

/* ── Event Edit Form (inline) ── */

function EventEditForm({
  draft, updateDraft, onSave, onCancel, people,
}: {
  draft: Evento;
  updateDraft: (field: keyof Evento, value: string | boolean) => void;
  onSave: () => void;
  onCancel: () => void;
  people: Persona[];
}) {
  const [multiDay, setMultiDay] = useState(!!draft.dataFine);
  const [partOpen, setPartOpen] = useState(false);
  const partRef = useRef<HTMLDivElement>(null);

  const selected = draft.partecipanti ? draft.partecipanti.split(", ").filter(Boolean) : [];

  function togglePerson(nome: string) {
    const set = new Set(selected);
    if (set.has(nome)) set.delete(nome); else set.add(nome);
    updateDraft("partecipanti", Array.from(set).join(", "));
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (partRef.current && !partRef.current.contains(e.target as Node)) setPartOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="ev-edit-form">
      <div className="ev-edit-row">
        <input className="ev-edit-input ev-edit-title" value={draft.titolo} onChange={(e) => updateDraft("titolo", e.target.value)} placeholder="Titolo evento..." autoFocus />
        <select className="ev-edit-select" value={draft.tipologia} onChange={(e) => updateDraft("tipologia", e.target.value)}>
          {TIPOLOGIE.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select className="ev-edit-select" value={draft.confermato ? "si" : "no"} onChange={(e) => updateDraft("confermato", e.target.value === "si")}>
          <option value="no">Da confermare</option>
          <option value="si">Confermato</option>
        </select>
      </div>
      <div className="ev-edit-row" style={{ alignItems: "center" }}>
        <input className="ev-edit-input" type="date" value={toIso(draft.data)} onChange={(e) => updateDraft("data", fromIso(e.target.value))} />
        {multiDay && (
          <>
            <span style={{ color: "var(--fg3)", fontSize: 12 }}>&mdash;</span>
            <input className="ev-edit-input" type="date" value={toIso(draft.dataFine)} onChange={(e) => updateDraft("dataFine", fromIso(e.target.value))} min={toIso(draft.data)} />
          </>
        )}
        <label className="ev-multiday-toggle">
          <input type="checkbox" checked={multiDay} onChange={(e) => {
            setMultiDay(e.target.checked);
            if (!e.target.checked) updateDraft("dataFine", "");
          }} />
          <span>Piu giorni</span>
        </label>
        <input className="ev-edit-input" type="time" value={draft.ora} onChange={(e) => updateDraft("ora", e.target.value)} />
        <input className="ev-edit-input ev-edit-place" value={draft.luogo} onChange={(e) => updateDraft("luogo", e.target.value)} placeholder="Luogo..." />
      </div>
      <div className="ev-edit-row">
        <div className="ev-part-picker" ref={partRef}>
          <div className="ev-part-field" onClick={() => setPartOpen(!partOpen)}>
            {selected.length > 0 ? (
              <div className="ev-part-tags">
                {selected.map((n) => (
                  <span key={n} className="ev-part-tag">
                    {n}
                    <button type="button" onClick={(e) => { e.stopPropagation(); togglePerson(n); }}>&times;</button>
                  </span>
                ))}
              </div>
            ) : (
              <span className="ev-part-placeholder">Seleziona partecipanti...</span>
            )}
            <span className="ev-part-arrow">{partOpen ? "\u25B2" : "\u25BC"}</span>
          </div>
          {partOpen && (
            <div className="ev-part-dropdown">
              {people.length === 0 && <div className="ev-part-empty">Nessuna persona in People</div>}
              {people.map((p) => (
                <label key={p.nome} className="ev-part-option">
                  <input type="checkbox" checked={selected.includes(p.nome)} onChange={() => togglePerson(p.nome)} />
                  <span>{p.nome}</span>
                  <span className="ev-part-fn">{p.funzione}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="ev-edit-row">
        <textarea className="ev-edit-ta" value={draft.odg} onChange={(e) => updateDraft("odg", e.target.value)} placeholder="Ordine del giorno..." />
      </div>
      <div className="ev-edit-actions">
        <button className="pe-act-save" onClick={onSave}>Salva</button>
        <button className="pe-act-cancel" onClick={onCancel}>Annulla</button>
      </div>
    </div>
  );
}

/* ── Event Card ── */
function EventCard({ evento: e, isPast, companyColor, isEditing, draft, confirmDel, onEdit, onDelete, onConfirmDel, onCancelDel, updateDraft, onSave, onCancel, people }: {
  evento: Evento; isPast: boolean; companyColor?: string;
  isEditing: boolean; draft: Evento | null; confirmDel: boolean;
  onEdit: () => void; onDelete: () => void;
  onConfirmDel: () => void; onCancelDel: () => void;
  updateDraft?: (field: keyof Evento, value: string | boolean) => void;
  onSave?: () => void; onCancel?: () => void;
  people: Persona[];
}) {
  const d = parseDate(e.data);
  const day = d ? d.getDate() : "?";
  const mon = d ? MESI[d.getMonth()] : "";
  const yr = d ? d.getFullYear() : "";
  const col = companyColor || azColor(e.azienda);

  const tipColors: Record<string, string> = {
    WORKSHOP: "#a855f7", REVIEW: "#22c55e", PLANNING: "#4f8cff",
    MEETING: "#f59e0b", EVENTO: "#ec4899", FORMAZIONE: "#06b6d4", ALTRO: "#6b7280",
  };
  const tipColor = tipColors[e.tipologia] || "#6b7280";

  if (isEditing && draft && updateDraft && onSave && onCancel) {
    return (
      <div className={`ev-tl-item${isPast ? " past" : ""}`} id={`ev-${e.id}`}>
        <div className="ev-tl-node" style={{ background: col }} />
        <div className="ev-card ev-card-editing" style={{ "--ev-accent": col } as React.CSSProperties}>
          <div className="ev-date-block">
            <div className="ev-date-day">{day}</div>
            <div className="ev-date-month">{mon}</div>
          </div>
          <div className="ev-body">
            <EventEditForm draft={draft} updateDraft={updateDraft} onSave={onSave} onCancel={onCancel} people={people} />
          </div>
        </div>
      </div>
    );
  }

  const dEnd = e.dataFine ? parseDate(e.dataFine) : null;
  const endDay = dEnd ? dEnd.getDate() : null;
  const endMon = dEnd ? MESI[dEnd.getMonth()] : null;

  return (
    <div className={`ev-tl-item${isPast ? " past" : ""}`} id={`ev-${e.id}`}>
      <div className="ev-tl-node" style={{ background: col, boxShadow: isPast ? "none" : `0 0 12px ${col}66` }} />
      <div className="ev-card" style={{ "--ev-accent": col } as React.CSSProperties}>
        <div className="ev-date-block">
          <div className="ev-date-day">{day}</div>
          <div className="ev-date-month">{mon}</div>
          {dEnd ? (
            <div className="ev-date-range">
              <span className="ev-date-range-sep">&mdash;</span>
              <div className="ev-date-day">{endDay}</div>
              <div className="ev-date-month">{endMon}</div>
            </div>
          ) : (
            <div className="ev-date-year">{yr}</div>
          )}
        </div>
        <div className="ev-body">
          <div className="ev-title-row">
            <span className="ev-title">{e.titolo}</span>
            <span className="ev-tip-tag" style={{ background: tipColor + "22", color: tipColor }}>{e.tipologia}</span>
            <span className={`ev-badge ${e.confermato ? "ok" : "no"}`}>
              {e.confermato ? "Confermato" : "Da confermare"}
            </span>
          </div>
          <div className="ev-meta">
            {e.ora && <>{e.ora} &middot; </>}
            {e.luogo && (
              <a href={`https://www.google.com/maps/search/${encodeURIComponent(e.luogo)}`} target="_blank" rel="noopener">
                {e.luogo} &#8599;
              </a>
            )}
          </div>
          {e.partecipanti && (
            <div className="ev-participants">
              <span className="ev-field-label">Partecipanti</span>
              {e.partecipanti}
            </div>
          )}
          {e.odg && (
            <div className="ev-odg">
              <span className="ev-field-label">Agenda</span>
              {e.odg}
            </div>
          )}
          <div className="ev-card-actions">
            <button onClick={onEdit}>Modifica</button>
            {confirmDel ? (
              <span className="fws-confirm">
                <span className="fws-confirm-text">Eliminare?</span>
                <button className="fws-confirm-yes" onClick={onDelete}>Si</button>
                <button className="fws-confirm-no" onClick={onCancelDel}>No</button>
              </span>
            ) : (
              <button className="pe-del-btn" onClick={onConfirmDel}>Elimina</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
