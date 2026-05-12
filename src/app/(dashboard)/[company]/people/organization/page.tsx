"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getCompany } from "@/lib/companies";
import {
  getMockPeople, PE_FUNZIONI, PE_LIVELLI, PE_CONTRATTI,
  peFnColor, peLvlClass, peInitials,
  type Persona,
} from "@/lib/people";

/* ── Types ── */

interface OrgNode {
  id: string;
  persona: Persona;
  children: OrgNode[];
}

/* ── Build tree from flat people list ── */

function buildTree(people: Persona[]): OrgNode | null {
  // Find CEO (DIREZIONE leader)
  const dirLeader = people.find((p) => p.funzione === "DIREZIONE" && p.leader);
  if (!dirLeader) {
    // Fallback: first DIREZIONE person or first person
    const fallback = people.find((p) => p.funzione === "DIREZIONE") || people[0];
    if (!fallback) return null;
    return { id: fallback.nome, persona: fallback, children: buildLevel1(people, fallback.nome) };
  }
  return { id: dirLeader.nome, persona: dirLeader, children: buildLevel1(people, dirLeader.nome) };
}

function buildLevel1(people: Persona[], ceoName: string): OrgNode[] {
  const nodes: OrgNode[] = [];

  // DIREZIONE non-leaders
  people
    .filter((p) => p.funzione === "DIREZIONE" && !p.leader && p.nome !== ceoName)
    .forEach((p) => nodes.push({ id: p.nome, persona: p, children: [] }));

  // Leaders of each function (grouped by team)
  const fns = PE_FUNZIONI.filter((f) => f !== "DIREZIONE");
  fns.forEach((fn) => {
    const fnPeople = people.filter((p) => p.funzione === fn);
    // Group by team
    const teams: Record<string, Persona[]> = {};
    fnPeople.forEach((p) => {
      const t = p.team || fn;
      if (!teams[t]) teams[t] = [];
      teams[t].push(p);
    });

    Object.entries(teams).forEach(([teamName, members]) => {
      const leader = members.find((p) => p.leader);
      const rest = members.filter((p) => !p.leader);
      const children = rest.map((p) => ({ id: p.nome, persona: p, children: [] as OrgNode[] }));

      if (leader) {
        nodes.push({ id: leader.nome, persona: leader, children });
      } else if (rest.length > 0) {
        // No leader: first person as "node head", rest as children
        const [head, ...tail] = rest;
        nodes.push({ id: head.nome, persona: head, children: tail.map((p) => ({ id: p.nome, persona: p, children: [] })) });
      }
    });
  });

  return nodes;
}

/* ── Layout constants ── */

const NODE_W = 160;
const NODE_H = 72;
const H_GAP = 24;
const V_GAP = 60;
const LINE_COLOR = "#30363d";

/* ── Calculate positions ── */

interface LayoutNode {
  node: OrgNode;
  x: number;
  y: number;
  w: number; // subtree width
  children: LayoutNode[];
}

function layoutTree(node: OrgNode, depth: number = 0): LayoutNode {
  if (node.children.length === 0) {
    return { node, x: 0, y: depth * (NODE_H + V_GAP), w: NODE_W, children: [] };
  }

  const kids = node.children.map((c) => layoutTree(c, depth + 1));
  const totalW = kids.reduce((s, k) => s + k.w, 0) + (kids.length - 1) * H_GAP;

  // Position children side by side
  let cx = -totalW / 2;
  kids.forEach((k) => {
    k.x = cx + k.w / 2;
    cx += k.w + H_GAP;
  });

  return {
    node,
    x: 0,
    y: depth * (NODE_H + V_GAP),
    w: Math.max(NODE_W, totalW),
    children: kids,
  };
}

function flattenLayout(ln: LayoutNode, offsetX: number = 0): { node: OrgNode; x: number; y: number; parentX?: number; parentY?: number }[] {
  const result: { node: OrgNode; x: number; y: number; parentX?: number; parentY?: number }[] = [];
  const absX = offsetX + ln.x;

  result.push({ node: ln.node, x: absX, y: ln.y });

  ln.children.forEach((child) => {
    const childFlat = flattenLayout(child, absX);
    // Mark parent coords for lines
    childFlat[0].parentX = absX;
    childFlat[0].parentY = ln.y;
    result.push(...childFlat);
  });

  return result;
}

/* ── Component ── */

export default function OrganizationPage() {
  const params = useParams();
  const company = getCompany(params.company as string);
  const [people, setPeople] = useState<Persona[]>(getMockPeople);
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Persona> | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null); // parent nome
  const [toast, setToast] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  // Edit
  function startEdit(p: Persona) {
    setEditId(p.nome);
    setDraft({ ...p });
    setAddingTo(null);
  }

  function cancelEdit() {
    setEditId(null);
    setDraft(null);
    setAddingTo(null);
  }

  function saveDraft() {
    if (!draft || !draft.nome?.trim()) return;
    if (addingTo !== null) {
      // Adding new person
      const newP: Persona = {
        nome: draft.nome!.trim(),
        azienda: people[0]?.azienda || "",
        funzione: draft.funzione || "OPERATION",
        livello: draft.livello || "MIDDLE",
        contratto: draft.contratto || "DIPENDENTE",
        team: draft.team || "",
        leader: draft.leader || false,
        anni: { 2026: { capSett: null, mesiEff: null, costoOra: null, ral: null } },
      };
      setPeople((prev) => [...prev, newP]);
      showToast("Persona aggiunta");
    } else if (editId) {
      setPeople((prev) =>
        prev.map((p) =>
          p.nome === editId
            ? { ...p, nome: draft.nome!.trim(), funzione: draft.funzione || p.funzione, livello: draft.livello || p.livello, contratto: draft.contratto || p.contratto, team: draft.team ?? p.team, leader: draft.leader ?? p.leader }
            : p,
        ),
      );
      showToast("Persona aggiornata");
    }
    cancelEdit();
  }

  function deletePerson(nome: string) {
    setPeople((p) => p.filter((x) => x.nome !== nome));
    setConfirmDel(null);
    showToast(`${nome} rimosso`);
  }

  function startAdd(parentNome: string) {
    // Inherit function/team from parent
    const parent = people.find((p) => p.nome === parentNome);
    setAddingTo(parentNome);
    setEditId(null);
    setDraft({
      nome: "",
      funzione: parent?.funzione || "OPERATION",
      livello: "MIDDLE",
      contratto: "DIPENDENTE",
      team: parent?.team || "",
      leader: false,
    });
  }

  function updateDraft(field: string, value: string | boolean) {
    if (!draft) return;
    setDraft({ ...draft, [field]: value });
  }

  // Build and layout tree
  const tree = buildTree(people);
  const layout = tree ? layoutTree(tree) : null;
  const flat = layout ? flattenLayout(layout) : [];

  // Calculate SVG bounds
  let minX = 0, maxX = 0, maxY = 0;
  flat.forEach((f) => {
    if (f.x - NODE_W / 2 < minX) minX = f.x - NODE_W / 2;
    if (f.x + NODE_W / 2 > maxX) maxX = f.x + NODE_W / 2;
    if (f.y + NODE_H > maxY) maxY = f.y + NODE_H;
  });

  const svgW = maxX - minX + 80;
  const svgH = maxY + 60;
  const offsetX = -minX + 40;
  const offsetY = 30;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div className="ee-subnav">
        <Link href={`/${params.company}/people`} className="ee-tab">People</Link>
        <span className="ee-tab active">Organigramma</span>
        <Link href={`/${params.company}/people/rituals`} className="ee-tab">Rituals</Link>
      </div>

      {toast && <div className="fws-toast">{toast}</div>}

      <div className="og-scroll">
        <svg
          width={svgW}
          height={svgH}
          viewBox={`0 0 ${svgW} ${svgH}`}
          className="og-svg"
        >
          {/* Connection lines */}
          {flat.map((f) => {
            if (f.parentX === undefined || f.parentY === undefined) return null;
            const px = f.parentX + offsetX;
            const py = f.parentY + offsetY + NODE_H;
            const cx = f.x + offsetX;
            const cy = f.y + offsetY;
            const midY = py + (cy - py) / 2;
            return (
              <path
                key={`line-${f.node.id}`}
                d={`M${px},${py} L${px},${midY} L${cx},${midY} L${cx},${cy}`}
                fill="none"
                stroke={LINE_COLOR}
                strokeWidth={1.5}
              />
            );
          })}

          {/* Nodes */}
          {flat.map((f) => {
            const p = f.node.persona;
            const nx = f.x + offsetX - NODE_W / 2;
            const ny = f.y + offsetY;
            const fnColor = peFnColor(p.funzione);
            const isEditing = editId === p.nome;
            const isCeo = p.funzione === "DIREZIONE" && p.leader;

            return (
              <foreignObject
                key={f.node.id}
                x={nx}
                y={ny}
                width={NODE_W}
                height={NODE_H}
              >
                <div
                  className={`og-node${isCeo ? " og-ceo" : ""}${p.leader ? " og-leader" : ""}`}
                  style={{ "--og-fn-color": fnColor } as React.CSSProperties}
                >
                  <div className="og-node-initials" style={{ background: fnColor }}>
                    {peInitials(p.nome)}
                  </div>
                  <div className="og-node-info">
                    <div className="og-node-name">{p.nome}</div>
                    <div className="og-node-meta">
                      <span className={`pe-lvl ${peLvlClass(p.livello)}`}>{p.livello}</span>
                      <span className="og-node-fn">{p.funzione}</span>
                    </div>
                    {p.team && p.team !== p.funzione && (
                      <div className="og-node-team">{p.team}</div>
                    )}
                  </div>
                  <div className="og-node-actions">
                    <button className="og-act" onClick={() => startEdit(p)} title="Modifica">&#9998;</button>
                    <button className="og-act" onClick={() => startAdd(p.nome)} title="Aggiungi sotto">+</button>
                    {!isCeo && (
                      confirmDel === p.nome ? (
                        <span className="og-confirm">
                          <button className="fws-confirm-yes" onClick={() => deletePerson(p.nome)}>Si</button>
                          <button className="fws-confirm-no" onClick={() => setConfirmDel(null)}>No</button>
                        </span>
                      ) : (
                        <button className="og-act og-act-del" onClick={() => setConfirmDel(p.nome)} title="Rimuovi">&times;</button>
                      )
                    )}
                  </div>
                </div>
              </foreignObject>
            );
          })}
        </svg>
      </div>

      {/* Inline edit/add panel (bottom bar) */}
      {(editId || addingTo !== null) && draft && (
        <div className="og-edit-bar">
          <span className="og-edit-label">{addingTo !== null ? "Nuova persona" : `Modifica: ${editId}`}</span>
          <input className="og-edit-input og-edit-name" value={draft.nome || ""} onChange={(e) => updateDraft("nome", e.target.value)} placeholder="Nome..." autoFocus />
          <select className="og-edit-select" value={draft.funzione || "OPERATION"} onChange={(e) => updateDraft("funzione", e.target.value)}>
            {PE_FUNZIONI.map((f) => <option key={f}>{f}</option>)}
          </select>
          <select className="og-edit-select" value={draft.livello || "MIDDLE"} onChange={(e) => updateDraft("livello", e.target.value)}>
            {PE_LIVELLI.map((l) => <option key={l}>{l}</option>)}
          </select>
          <select className="og-edit-select" value={draft.contratto || "DIPENDENTE"} onChange={(e) => updateDraft("contratto", e.target.value)}>
            {PE_CONTRATTI.map((c) => <option key={c}>{c}</option>)}
          </select>
          <input className="og-edit-input" value={draft.team || ""} onChange={(e) => updateDraft("team", e.target.value)} placeholder="Team..." />
          <label className="og-edit-leader">
            <input type="checkbox" checked={draft.leader || false} onChange={(e) => updateDraft("leader", e.target.checked)} /> Leader
          </label>
          <button className="pe-act-save" onClick={saveDraft}>Salva</button>
          <button className="pe-act-cancel" onClick={cancelEdit}>Annulla</button>
        </div>
      )}
    </div>
  );
}
