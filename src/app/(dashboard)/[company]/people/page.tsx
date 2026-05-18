"use client";

import { useState, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getCompany } from "@/lib/companies";
import { useLocalState } from "@/lib/useLocalState";
import { dataVersion } from "@/lib/square-marketing-data";
import {
  getMockPeopleForCompany, PE_FUNZIONI, PE_LIVELLI, PE_CONTRATTI,
  peFnColor, peLvlClass,
  type Persona, type PersonaAnno,
} from "@/lib/people";

const YEAR = 2026;

function fmtN(n: number): string {
  return Math.round(n).toLocaleString("it-IT");
}

function emptyPersona(): Persona {
  return {
    nome: "", azienda: "", funzione: "OPERATION", livello: "MIDDLE",
    contratto: "DIPENDENTE", team: "", leader: false,
    anni: { [YEAR]: { capSett: null, mesiEff: null, costoOra: null, ral: null } },
  };
}

export default function PeoplePage() {
  const params = useParams();
  const company = getCompany(params.company as string);
  const slug = params.company as string;
  const dv = dataVersion(slug);
  const [people, setPeople] = useLocalState<Persona[]>(`themap:${slug}:people`, () => getMockPeopleForCompany(slug), dv);
  const [editId, setEditId] = useState<string | null>(null); // nome of person being edited
  const [addRow, setAddRow] = useState<Persona | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Draft state for inline editing
  const [draft, setDraft] = useState<Persona | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [bulkPreview, setBulkPreview] = useState<Persona[] | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  function startEdit(p: Persona) {
    setEditId(p.nome);
    setDraft({ ...p, anni: { ...p.anni, [YEAR]: { ...(p.anni[YEAR] || { capSett: null, mesiEff: null, costoOra: null, ral: null }) } } });
    setAddRow(null);
  }

  function startAdd() {
    const p = emptyPersona();
    setAddRow(p);
    setDraft(p);
    setEditId(null);
  }

  function cancelEdit() {
    setEditId(null);
    setAddRow(null);
    setDraft(null);
  }

  function saveDraft() {
    if (!draft || !draft.nome.trim()) return;
    if (addRow) {
      setPeople((prev) => [...prev, { ...draft, nome: draft.nome.trim() }]);
      showToast("Persona aggiunta");
    } else if (editId) {
      setPeople((prev) => prev.map((x) => (x.nome === editId ? { ...draft, nome: draft.nome.trim() } : x)));
      showToast("Persona aggiornata");
    }
    cancelEdit();
  }

  function deletePerson(nome: string) {
    setPeople((p) => p.filter((x) => x.nome !== nome));
    setConfirmDel(null);
    showToast(`${nome} eliminato`);
  }

  function updateDraft(field: string, value: string | boolean) {
    if (!draft) return;
    setDraft({ ...draft, [field]: value });
  }

  function updateDraftAnno(field: keyof PersonaAnno, value: string) {
    if (!draft) return;
    const ya = draft.anni[YEAR] || { capSett: null, mesiEff: null, costoOra: null, ral: null };
    setDraft({
      ...draft,
      anni: { ...draft.anni, [YEAR]: { ...ya, [field]: value === "" ? null : Number(value) } },
    });
  }

  function handleBulkFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (!text) return;
      const lines = text.split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) { showToast("File vuoto o senza dati"); return; }
      const headers = lines[0].split(/[,;\t]/).map((h) => h.trim().toLowerCase());
      const parsed: Persona[] = [];
      for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].split(/[,;\t]/).map((v) => v.trim());
        const get = (key: string) => {
          const idx = headers.indexOf(key);
          return idx >= 0 ? vals[idx] || "" : "";
        };
        const nome = get("nome");
        if (!nome) continue;
        const fn = get("funzione").toUpperCase();
        const lvl = get("livello").toUpperCase();
        const contr = get("contratto").toUpperCase();
        parsed.push({
          nome,
          azienda: slug.toUpperCase(),
          funzione: PE_FUNZIONI.includes(fn as typeof PE_FUNZIONI[number]) ? fn : "OPERATION",
          livello: PE_LIVELLI.includes(lvl as typeof PE_LIVELLI[number]) ? lvl : "MIDDLE",
          contratto: PE_CONTRATTI.includes(contr as typeof PE_CONTRATTI[number]) ? contr : "DIPENDENTE",
          team: get("team"),
          leader: ["true", "si", "1", "yes"].includes(get("leader").toLowerCase()),
          anni: {
            [YEAR]: {
              capSett: get("h/sett") || get("capsett") ? Number(get("h/sett") || get("capsett")) || null : null,
              mesiEff: get("mesi") || get("mesieff") ? Number(get("mesi") || get("mesieff")) || null : null,
              costoOra: get("costo/ora") || get("costoora") ? Number(get("costo/ora") || get("costoora")) || null : null,
              ral: get("ral") ? Number(get("ral")) || null : null,
            },
          },
        });
      }
      if (parsed.length === 0) { showToast("Nessuna persona trovata nel file"); return; }
      setBulkPreview(parsed);
    };
    reader.readAsText(file);
    if (fileRef.current) fileRef.current.value = "";
  }

  function confirmBulk() {
    if (!bulkPreview) return;
    setPeople((prev) => [...prev, ...bulkPreview]);
    showToast(`${bulkPreview.length} persone aggiunte`);
    setBulkPreview(null);
  }

  /* Summary stats */
  let totH = 0, totRAL = 0, dipCount = 0, freeCount = 0, opH = 0, freeH = 0;
  people.forEach((p) => {
    const ya = p.anni[YEAR] || { capSett: null, mesiEff: null, costoOra: null, ral: null };
    const ph = (ya.capSett || 0) * (ya.mesiEff || 0) * 3.5;
    totH += ph;
    if (ya.ral) totRAL += ya.ral;
    if (p.contratto === "FREELANCE") { freeCount++; freeH += ph; } else { dipCount++; }
    if (p.funzione === "OPERATION") opH += ph;
  });

  /* Pie data */
  let srCount = 0, midCount = 0, jrCount = 0;
  const fnCount: Record<string, number> = {};
  people.forEach((p) => {
    if (p.livello === "SENIOR") srCount++;
    else if (p.livello === "JUNIOR") jrCount++;
    else midCount++;
    const fn = p.funzione || "ALTRO";
    fnCount[fn] = (fnCount[fn] || 0) + 1;
  });

  /* Group by function */
  const byFn: Record<string, Persona[]> = {};
  people.forEach((p) => {
    const fn = p.funzione || "ALTRO";
    if (!byFn[fn]) byFn[fn] = [];
    byFn[fn].push(p);
  });

  return (
    <div>
      <div className="ee-subnav">
        <span className="ee-tab active">People</span>
        <Link href={`/${params.company}/people/organization`} className="ee-tab">Organigramma</Link>
        <Link href={`/${params.company}/people/rituals`} className="ee-tab">Rituals</Link>
        <Link href={`/${params.company}/organization/tools`} className="ee-tab">Tools</Link>
      </div>

      {toast && <div className="fws-toast">{toast}</div>}

      <div className="pe-page">
        <div className="pe-head">
          {company && <span style={{ color: company.color }}>{"\u25A0"}</span>}
          {company?.name || params.company} — People {YEAR}
          <button className="pe-add-btn" onClick={startAdd}>+ Aggiungi</button>
          <button className="pe-add-btn" style={{ background: "var(--bg3)", color: "var(--fg2)" }} onClick={() => fileRef.current?.click()}>Upload CSV</button>
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" style={{ display: "none" }} onChange={handleBulkFile} />
        </div>

        {/* Bulk preview */}
        {bulkPreview && (
          <div className="pe-bulk-preview">
            <div className="pe-bulk-head">
              Anteprima: {bulkPreview.length} persone da importare
              <button className="pe-act-save" onClick={confirmBulk}>Conferma import</button>
              <button className="pe-act-cancel" onClick={() => setBulkPreview(null)}>Annulla</button>
            </div>
            <div className="pe-table-wrap">
              <table className="pe-table">
                <thead>
                  <tr><th>Nome</th><th>Funzione</th><th>Livello</th><th>Contratto</th><th>Team</th><th>h/sett</th><th>Mesi</th><th>RAL</th></tr>
                </thead>
                <tbody>
                  {bulkPreview.map((p, i) => {
                    const ya = p.anni[YEAR] || {} as PersonaAnno;
                    return (
                      <tr key={i}>
                        <td>{p.nome}</td><td>{p.funzione}</td><td>{p.livello}</td>
                        <td>{p.contratto}</td><td>{p.team}</td>
                        <td className="pe-cell-num">{ya.capSett ?? "-"}</td>
                        <td className="pe-cell-num">{ya.mesiEff ?? "-"}</td>
                        <td className="pe-cell-num">{ya.ral ? `\u20AC${fmtN(ya.ral)}` : "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Summary cards */}
        <div className="pe-summary">
          <div className="pe-sum-card"><div className="pe-sum-val">{people.length}</div><div className="pe-sum-label">Persone</div></div>
          <div className="pe-sum-card"><div className="pe-sum-val">{dipCount}</div><div className="pe-sum-label">Dipendenti</div></div>
          <div className="pe-sum-card"><div className="pe-sum-val">{freeCount}</div><div className="pe-sum-label">Freelance</div></div>
          <div className="pe-sum-card"><div className="pe-sum-val">{fmtN(totH)}</div><div className="pe-sum-label">h/anno Totali</div></div>
          <div className="pe-sum-card pe-sum-accent"><div className="pe-sum-val">{fmtN(opH)}</div><div className="pe-sum-label">h/anno Operation</div></div>
          <div className="pe-sum-card"><div className="pe-sum-val">{fmtN(freeH)}</div><div className="pe-sum-label">h/anno Freelance</div></div>
          {totRAL > 0 && <div className="pe-sum-card"><div className="pe-sum-val">{"\u20AC"}{fmtN(totRAL)}</div><div className="pe-sum-label">RAL Totale</div></div>}
        </div>

        {/* Pie charts */}
        <div className="pe-charts">
          <PieChart title="Seniority" items={[
            { n: "Senior", v: srCount, c: "#4f8cff" },
            { n: "Middle", v: midCount, c: "#9ca3af" },
            { n: "Junior", v: jrCount, c: "#34d399" },
          ]} />
          <PieChart title="Funzioni" items={
            Object.entries(fnCount).map(([fn, v]) => ({ n: fn, v, c: peFnColor(fn) }))
          } />
          <PieChart title="Contratto" items={[
            { n: "Dipendenti", v: dipCount, c: "#4f8cff" },
            { n: "Freelance", v: freeCount, c: "#f59e0b" },
          ]} />
        </div>

        {/* Per-function sections with table */}
        {[...PE_FUNZIONI, "ALTRO"].map((fn) => {
          const list = byFn[fn];
          if (!list || list.length === 0) return null;
          let fH = 0, fRAL = 0;
          list.forEach((p) => {
            const ya = p.anni[YEAR] || { capSett: null, mesiEff: null, costoOra: null, ral: null };
            fH += (ya.capSett || 0) * (ya.mesiEff || 0) * 3.5;
            if (ya.ral) fRAL += ya.ral;
          });
          return (
            <div key={fn} className="pe-fn-section">
              <div className="pe-fn-head" style={{ borderColor: company?.color }}>
                <span className="pe-fn-name">{fn}</span>
                <span className="pe-fn-stats">
                  {list.length} persone &middot; {fmtN(fH)} h/anno
                  {fRAL > 0 && <> &middot; RAL {"\u20AC"}{fmtN(fRAL)}</>}
                </span>
              </div>
              <div className="pe-table-wrap">
                <table className="pe-table">
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>Leader</th>
                      <th>Livello</th>
                      <th>Contratto</th>
                      <th>Team</th>
                      <th>h/sett</th>
                      <th>Mesi</th>
                      <th>{"\u20AC"}/h</th>
                      <th>RAL</th>
                      <th>h/anno</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((p) => {
                      const isEditing = editId === p.nome;
                      const ya = p.anni[YEAR] || { capSett: null, mesiEff: null, costoOra: null, ral: null };
                      const hAnno = (ya.capSett || 0) * (ya.mesiEff || 0) * 3.5;

                      if (isEditing && draft) {
                        const dya = draft.anni[YEAR] || { capSett: null, mesiEff: null, costoOra: null, ral: null };
                        return (
                          <tr key={p.nome} className="pe-row-edit">
                            <td><input className="pe-inline-input" value={draft.nome} onChange={(e) => updateDraft("nome", e.target.value)} autoFocus /></td>
                            <td className="pe-cell-center"><input type="checkbox" checked={draft.leader} onChange={(e) => updateDraft("leader", e.target.checked)} /></td>
                            <td>
                              <select className="pe-inline-select" value={draft.livello} onChange={(e) => updateDraft("livello", e.target.value)}>
                                {PE_LIVELLI.map((l) => <option key={l}>{l}</option>)}
                              </select>
                            </td>
                            <td>
                              <select className="pe-inline-select" value={draft.contratto} onChange={(e) => updateDraft("contratto", e.target.value)}>
                                {PE_CONTRATTI.map((c) => <option key={c}>{c}</option>)}
                              </select>
                            </td>
                            <td><input className="pe-inline-input" value={draft.team} onChange={(e) => updateDraft("team", e.target.value)} /></td>
                            <td><input className="pe-inline-input pe-inline-num" type="number" value={dya.capSett ?? ""} onChange={(e) => updateDraftAnno("capSett", e.target.value)} /></td>
                            <td><input className="pe-inline-input pe-inline-num" type="number" value={dya.mesiEff ?? ""} onChange={(e) => updateDraftAnno("mesiEff", e.target.value)} /></td>
                            <td><input className="pe-inline-input pe-inline-num" type="number" value={dya.costoOra ?? ""} onChange={(e) => updateDraftAnno("costoOra", e.target.value)} /></td>
                            <td><input className="pe-inline-input pe-inline-num" type="number" value={dya.ral ?? ""} onChange={(e) => updateDraftAnno("ral", e.target.value)} /></td>
                            <td className="pe-cell-ro">{fmtN((dya.capSett || 0) * (dya.mesiEff || 0) * 3.5)}</td>
                            <td>
                              <div className="pe-row-actions">
                                <button className="pe-act-save" onClick={saveDraft}>Salva</button>
                                <button className="pe-act-cancel" onClick={cancelEdit}>Annulla</button>
                              </div>
                            </td>
                          </tr>
                        );
                      }

                      return (
                        <tr key={p.nome} className="pe-row" onDoubleClick={() => startEdit(p)}>
                          <td className="pe-cell-name">{p.nome}</td>
                          <td className="pe-cell-center">{p.leader ? "\u2605" : ""}</td>
                          <td><span className={`pe-lvl ${peLvlClass(p.livello)}`}>{p.livello}</span></td>
                          <td><span className={p.contratto === "FREELANCE" ? "pe-contr-free" : "pe-contr-dip"}>{p.contratto}</span></td>
                          <td className="pe-cell-dim">{p.team}</td>
                          <td className="pe-cell-num">{ya.capSett ?? "-"}</td>
                          <td className="pe-cell-num">{ya.mesiEff ?? "-"}</td>
                          <td className="pe-cell-num">{ya.costoOra != null ? `${"\u20AC"}${ya.costoOra}` : "-"}</td>
                          <td className="pe-cell-num">{ya.ral != null ? `${"\u20AC"}${fmtN(ya.ral)}` : "-"}</td>
                          <td className="pe-cell-num pe-cell-hours">{hAnno > 0 ? fmtN(hAnno) : "-"}</td>
                          <td>
                            <div className="pe-row-actions">
                              <button className="pe-act-edit" onClick={() => startEdit(p)} title="Modifica">&#9998;</button>
                              {confirmDel === p.nome ? (
                                <span className="fws-confirm">
                                  <span className="fws-confirm-text">Eliminare?</span>
                                  <button className="fws-confirm-yes" onClick={() => deletePerson(p.nome)}>Si</button>
                                  <button className="fws-confirm-no" onClick={() => setConfirmDel(null)}>No</button>
                                </span>
                              ) : (
                                <button className="pe-act-del" onClick={() => setConfirmDel(p.nome)} title="Elimina">&times;</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {/* Add row inline (only in the matching function section) */}
                    {addRow && draft && draft.funzione === fn && (
                      <tr className="pe-row-edit pe-row-add">
                        <td><input className="pe-inline-input" value={draft.nome} onChange={(e) => updateDraft("nome", e.target.value)} autoFocus placeholder="Nome..." /></td>
                        <td className="pe-cell-center"><input type="checkbox" checked={draft.leader} onChange={(e) => updateDraft("leader", e.target.checked)} /></td>
                        <td>
                          <select className="pe-inline-select" value={draft.livello} onChange={(e) => updateDraft("livello", e.target.value)}>
                            {PE_LIVELLI.map((l) => <option key={l}>{l}</option>)}
                          </select>
                        </td>
                        <td>
                          <select className="pe-inline-select" value={draft.contratto} onChange={(e) => updateDraft("contratto", e.target.value)}>
                            {PE_CONTRATTI.map((c) => <option key={c}>{c}</option>)}
                          </select>
                        </td>
                        <td><input className="pe-inline-input" value={draft.team} onChange={(e) => updateDraft("team", e.target.value)} placeholder="Team..." /></td>
                        <td><input className="pe-inline-input pe-inline-num" type="number" value={draft.anni[YEAR]?.capSett ?? ""} onChange={(e) => updateDraftAnno("capSett", e.target.value)} /></td>
                        <td><input className="pe-inline-input pe-inline-num" type="number" value={draft.anni[YEAR]?.mesiEff ?? ""} onChange={(e) => updateDraftAnno("mesiEff", e.target.value)} /></td>
                        <td><input className="pe-inline-input pe-inline-num" type="number" value={draft.anni[YEAR]?.costoOra ?? ""} onChange={(e) => updateDraftAnno("costoOra", e.target.value)} /></td>
                        <td><input className="pe-inline-input pe-inline-num" type="number" value={draft.anni[YEAR]?.ral ?? ""} onChange={(e) => updateDraftAnno("ral", e.target.value)} /></td>
                        <td className="pe-cell-ro">-</td>
                        <td>
                          <div className="pe-row-actions">
                            <button className="pe-act-save" onClick={saveDraft}>Salva</button>
                            <button className="pe-act-cancel" onClick={cancelEdit}>Annulla</button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

        {/* If adding and function section doesn't exist yet, show standalone add row */}
        {addRow && draft && !byFn[draft.funzione] && (
          <div className="pe-fn-section">
            <div className="pe-fn-head" style={{ borderColor: company?.color }}>
              <span className="pe-fn-name">{draft.funzione}</span>
              <span className="pe-fn-stats">Nuova</span>
            </div>
            <div className="pe-table-wrap">
              <table className="pe-table">
                <thead>
                  <tr>
                    <th>Nome</th><th>Leader</th><th>Livello</th><th>Contratto</th><th>Team</th>
                    <th>h/sett</th><th>Mesi</th><th>{"\u20AC"}/h</th><th>RAL</th><th>h/anno</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="pe-row-edit pe-row-add">
                    <td><input className="pe-inline-input" value={draft.nome} onChange={(e) => updateDraft("nome", e.target.value)} autoFocus placeholder="Nome..." /></td>
                    <td className="pe-cell-center"><input type="checkbox" checked={draft.leader} onChange={(e) => updateDraft("leader", e.target.checked)} /></td>
                    <td>
                      <select className="pe-inline-select" value={draft.livello} onChange={(e) => updateDraft("livello", e.target.value)}>
                        {PE_LIVELLI.map((l) => <option key={l}>{l}</option>)}
                      </select>
                    </td>
                    <td>
                      <select className="pe-inline-select" value={draft.contratto} onChange={(e) => updateDraft("contratto", e.target.value)}>
                        {PE_CONTRATTI.map((c) => <option key={c}>{c}</option>)}
                      </select>
                    </td>
                    <td><input className="pe-inline-input" value={draft.team} onChange={(e) => updateDraft("team", e.target.value)} placeholder="Team..." /></td>
                    <td><input className="pe-inline-input pe-inline-num" type="number" value={draft.anni[YEAR]?.capSett ?? ""} onChange={(e) => updateDraftAnno("capSett", e.target.value)} /></td>
                    <td><input className="pe-inline-input pe-inline-num" type="number" value={draft.anni[YEAR]?.mesiEff ?? ""} onChange={(e) => updateDraftAnno("mesiEff", e.target.value)} /></td>
                    <td><input className="pe-inline-input pe-inline-num" type="number" value={draft.anni[YEAR]?.costoOra ?? ""} onChange={(e) => updateDraftAnno("costoOra", e.target.value)} /></td>
                    <td><input className="pe-inline-input pe-inline-num" type="number" value={draft.anni[YEAR]?.ral ?? ""} onChange={(e) => updateDraftAnno("ral", e.target.value)} /></td>
                    <td className="pe-cell-ro">-</td>
                    <td>
                      <div className="pe-row-actions">
                        <button className="pe-act-save" onClick={saveDraft}>Salva</button>
                        <button className="pe-act-cancel" onClick={cancelEdit}>Annulla</button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Function selector for add row */}
        {addRow && draft && (
          <div className="pe-fn-picker">
            <span className="pe-fn-picker-label">Funzione:</span>
            <select className="pe-inline-select" value={draft.funzione} onChange={(e) => updateDraft("funzione", e.target.value)}>
              {PE_FUNZIONI.map((f) => <option key={f}>{f}</option>)}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Pie Chart ── */

function PieChart({ title, items }: { title: string; items: { n: string; v: number; c: string }[] }) {
  const tot = items.reduce((s, it) => s + it.v, 0);
  const paths: React.ReactNode[] = [];
  if (tot === 0) {
    paths.push(<circle key="empty" cx={100} cy={100} r={64} fill="none" stroke="#30363d" strokeWidth={28} />);
  } else {
    let ag = -Math.PI / 2;
    items.forEach((it, i) => {
      const f = it.v / tot;
      if (f <= 0) return;
      if (f > 0.999) {
        paths.push(<circle key={i} cx={100} cy={100} r={64} fill="none" stroke={it.c} strokeWidth={28} />);
        return;
      }
      const a1 = ag, a2 = ag + f * Math.PI * 2;
      const x1 = 100 + 64 * Math.cos(a1), y1 = 100 + 64 * Math.sin(a1);
      const x2 = 100 + 64 * Math.cos(a2), y2 = 100 + 64 * Math.sin(a2);
      paths.push(
        <path key={i} d={`M${x1} ${y1}A64 64 0 ${f > 0.5 ? 1 : 0} 1 ${x2} ${y2}`}
          fill="none" stroke={it.c} strokeWidth={28} strokeLinecap="round" />
      );
      ag = a2;
    });
    paths.push(
      <text key="tot" x={100} y={104} textAnchor="middle" fill="var(--fg)" fontSize={18} fontWeight={700}>{tot}</text>
    );
  }
  return (
    <div className="pe-chart-box">
      <div className="pe-chart-title">{title}</div>
      <svg viewBox="0 0 200 200">{paths}</svg>
      <div className="pe-chart-leg">
        {items.map((it) => {
          const pct = tot > 0 ? Math.round((it.v / tot) * 100) : 0;
          return (
            <span key={it.n}><i style={{ background: it.c }} />{it.n} {pct}%</span>
          );
        })}
      </div>
    </div>
  );
}
