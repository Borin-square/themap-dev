"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getCompany } from "@/lib/companies";
import { useLocalState } from "@/lib/useLocalState";
import { PE_FUNZIONI, peFnColor } from "@/lib/people";
import { getSquareTools, dataVersion, type ToolItem } from "@/lib/square-marketing-data";

let _nextId = 100;

function getMockTools(): ToolItem[] {
  return [
    { id: 1, label: "Google Drive", url: "https://drive.google.com", desc: "Cartella condivisa", funzione: "DIREZIONE" },
    { id: 2, label: "Notion", url: "https://notion.so", desc: "Knowledge base", funzione: "OPERATION" },
    { id: 3, label: "Slack", url: "https://slack.com", desc: "Comunicazione interna", funzione: "" },
    { id: 4, label: "HubSpot", url: "https://hubspot.com", desc: "CRM", funzione: "SALES" },
    { id: 5, label: "Figma", url: "https://figma.com", desc: "Design files", funzione: "MARKETING" },
    { id: 6, label: "Fatture in Cloud", url: "https://fattureincloud.it", desc: "Fatturazione", funzione: "AMMINISTRAZIONE" },
  ];
}

function getMockToolsForCompany(slug: string): ToolItem[] {
  if (slug === "square-marketing") return getSquareTools();
  return getMockTools();
}

export default function ToolsPage() {
  const params = useParams();
  const company = getCompany(params.company as string);
  const slug = params.company as string;
  const dv = dataVersion(slug);
  const [tools, setTools] = useLocalState<ToolItem[]>(`themap:${slug}:tools`, () => getMockToolsForCompany(slug), dv);
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [draft, setDraft] = useState({ label: "", url: "", desc: "", funzione: "" });
  const [confirmDel, setConfirmDel] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const color = company?.color || "var(--accent)";

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000); }

  function startAdd() {
    setDraft({ label: "", url: "", desc: "", funzione: "" });
    setAdding(true);
    setEditId(null);
  }

  function startEdit(t: ToolItem) {
    setDraft({ label: t.label, url: t.url, desc: t.desc, funzione: t.funzione });
    setEditId(t.id);
    setAdding(false);
  }

  function cancel() { setAdding(false); setEditId(null); }

  function save() {
    if (!draft.label.trim() || !draft.url.trim()) return;
    if (adding) {
      setTools((p) => [...p, { id: _nextId++, ...draft, label: draft.label.trim(), url: draft.url.trim() }]);
      showToast("Link aggiunto");
    } else if (editId !== null) {
      setTools((p) => p.map((t) => t.id === editId ? { ...t, ...draft, label: draft.label.trim(), url: draft.url.trim() } : t));
      showToast("Link aggiornato");
    }
    cancel();
  }

  function deleteItem(id: number) {
    setTools((p) => p.filter((t) => t.id !== id));
    setConfirmDel(null);
    showToast("Link eliminato");
  }

  return (
    <div>
      <div className="ee-subnav">
        <Link href={`/${params.company}/people`} className="ee-tab">People</Link>
        <Link href={`/${params.company}/people/organization`} className="ee-tab">Organigramma</Link>
        <Link href={`/${params.company}/people/rituals`} className="ee-tab">Rituals</Link>
        <span className="ee-tab active">Tools</span>
        <Link href={`/${params.company}/organization/mcp`} className="ee-tab">MCP</Link>
      </div>

      {toast && <div className="fws-toast">{toast}</div>}

      <div className="tools-page">
        <div className="tools-head">
          <span style={{ color }}>{"\u25A0"}</span>
          Tools {company?.name || slug}
          <button className="pe-add-btn" onClick={startAdd}>+ Aggiungi link</button>
        </div>

        {/* Add / Edit inline form */}
        {(adding || editId !== null) && (
          <div className="tools-add-form" style={{ marginBottom: 16 }}>
            <div className="tools-add-row">
              <input className="tools-add-input" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="Nome..." autoFocus />
              <input className="tools-add-input" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} placeholder="https://..." style={{ flex: 2 }} />
            </div>
            <div className="tools-add-row">
              <input className="tools-add-input" value={draft.desc} onChange={(e) => setDraft({ ...draft, desc: e.target.value })} placeholder="Descrizione (opzionale)..." />
              <select className="ev-edit-select" value={draft.funzione} onChange={(e) => setDraft({ ...draft, funzione: e.target.value })}>
                <option value="">— Funzione —</option>
                {PE_FUNZIONI.map((f) => <option key={f}>{f}</option>)}
              </select>
            </div>
            <div className="ev-edit-actions">
              <button className="pe-act-save" onClick={save}>Salva</button>
              <button className="pe-act-cancel" onClick={cancel}>Annulla</button>
            </div>
          </div>
        )}

        {/* Grid */}
        <div className="tools-grid">
          {tools.map((t) => {
            const fnCol = t.funzione ? peFnColor(t.funzione) : "#6b7280";
            return (
              <div key={t.id} className="tools-card">
                <a className="tools-card-link" href={t.url} target="_blank" rel="noopener">
                  <div className="tools-icon" style={{ background: color + "22", color }}>
                    {t.label.charAt(0).toUpperCase()}
                  </div>
                  <div className="tools-info">
                    <strong>{t.label}</strong>
                    {t.funzione && (
                      <span className="tools-fn-tag" style={{ background: fnCol + "22", color: fnCol }}>
                        {t.funzione}
                      </span>
                    )}
                    {t.desc && <small>{t.desc}</small>}
                  </div>
                  <span className="tools-arrow">&#8599;</span>
                </a>
                <div className="tools-actions">
                  <button className="og-act" onClick={(e) => { e.preventDefault(); startEdit(t); }} title="Modifica">&#9998;</button>
                  {confirmDel === t.id ? (
                    <span className="fws-confirm" style={{ display: "flex", gap: 2 }}>
                      <button className="fws-confirm-yes" onClick={() => deleteItem(t.id)}>Si</button>
                      <button className="fws-confirm-no" onClick={() => setConfirmDel(null)}>No</button>
                    </span>
                  ) : (
                    <button className="og-act og-act-del" onClick={(e) => { e.preventDefault(); setConfirmDel(t.id); }} title="Elimina">&times;</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {tools.length === 0 && !adding && (
          <div className="tools-empty">Nessun link configurato. Clicca &quot;+ Aggiungi link&quot; per iniziare.</div>
        )}
      </div>
    </div>
  );
}
