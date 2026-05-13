"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getCompany } from "@/lib/companies";
import { useLocalState } from "@/lib/useLocalState";
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

/* ── Build hierarchy from explicit map ── */

function initOrgMap(people: Persona[]): Record<string, string | null> {
  const map: Record<string, string | null> = {};
  const ceo = people.find((p) => p.funzione === "DIREZIONE" && p.leader);

  if (!ceo) {
    people.forEach((p) => { map[p.nome] = null; });
    return map;
  }

  map[ceo.nome] = null;

  // DIREZIONE non-leaders → CEO
  people.filter((p) => p.funzione === "DIREZIONE" && !p.leader && p.nome !== ceo.nome)
    .forEach((p) => { map[p.nome] = ceo.nome; });

  // Other functions: leaders → CEO, members → their leader
  PE_FUNZIONI.filter((f) => f !== "DIREZIONE").forEach((fn) => {
    const fnPeople = people.filter((p) => p.funzione === fn);
    const teams: Record<string, Persona[]> = {};
    fnPeople.forEach((p) => {
      const t = p.team || fn;
      if (!teams[t]) teams[t] = [];
      teams[t].push(p);
    });

    Object.values(teams).forEach((members) => {
      const leader = members.find((p) => p.leader);
      const rest = members.filter((p) => !p.leader);
      if (leader) {
        map[leader.nome] = ceo.nome;
        rest.forEach((p) => { map[p.nome] = leader.nome; });
      } else {
        members.forEach((p) => { map[p.nome] = ceo.nome; });
      }
    });
  });

  return map;
}

function buildForest(people: Persona[], orgMap: Record<string, string | null>): OrgNode[] {
  const nodeMap: Record<string, OrgNode> = {};
  people.forEach((p) => { nodeMap[p.nome] = { id: p.nome, persona: p, children: [] }; });

  const roots: OrgNode[] = [];
  people.forEach((p) => {
    const parentName = orgMap[p.nome];
    if (parentName && nodeMap[parentName]) {
      nodeMap[parentName].children.push(nodeMap[p.nome]);
    } else {
      roots.push(nodeMap[p.nome]);
    }
  });

  return roots;
}

/* ── Layout ── */

const NODE_W = 164;
const NODE_H = 68;
const H_GAP = 20;
const V_GAP = 56;

interface LayoutNode {
  node: OrgNode;
  x: number;
  y: number;
  w: number;
  children: LayoutNode[];
  collapsed: boolean;
}

function layoutTree(node: OrgNode, depth: number, collState: Record<string, boolean>): LayoutNode {
  const isColl = collState[node.id] ?? false;

  if (node.children.length === 0 || isColl) {
    return { node, x: 0, y: depth * (NODE_H + V_GAP), w: NODE_W, children: [], collapsed: isColl };
  }

  const kids = node.children.map((c) => layoutTree(c, depth + 1, collState));
  const totalW = kids.reduce((s, k) => s + k.w, 0) + (kids.length - 1) * H_GAP;

  let cx = -totalW / 2;
  kids.forEach((k) => {
    k.x = cx + k.w / 2;
    cx += k.w + H_GAP;
  });

  return { node, x: 0, y: depth * (NODE_H + V_GAP), w: Math.max(NODE_W, totalW), children: kids, collapsed: isColl };
}

function layoutForest(roots: OrgNode[], collState: Record<string, boolean>): LayoutNode[] {
  const layouts = roots.map((r) => layoutTree(r, 0, collState));
  if (layouts.length <= 1) return layouts;

  let cx = 0;
  layouts.forEach((l) => { l.x = cx + l.w / 2; cx += l.w + H_GAP; });
  const totalW = cx - H_GAP;
  layouts.forEach((l) => { l.x -= totalW / 2; });
  return layouts;
}

interface FlatItem {
  node: OrgNode;
  x: number;
  y: number;
  parentX?: number;
  parentY?: number;
  collapsed: boolean;
  childCount: number;
}

function flattenLayout(ln: LayoutNode, offsetX: number = 0): FlatItem[] {
  const result: FlatItem[] = [];
  const absX = offsetX + ln.x;
  result.push({ node: ln.node, x: absX, y: ln.y, collapsed: ln.collapsed, childCount: ln.node.children.length });

  if (!ln.collapsed) {
    ln.children.forEach((child) => {
      const childFlat = flattenLayout(child, absX);
      childFlat[0].parentX = absX;
      childFlat[0].parentY = ln.y;
      result.push(...childFlat);
    });
  }

  return result;
}

function flattenForest(layouts: LayoutNode[]): FlatItem[] {
  const result: FlatItem[] = [];
  layouts.forEach((l) => result.push(...flattenLayout(l)));
  return result;
}

/* ── Helpers ── */

function isDescendant(orgMap: Record<string, string | null>, nodeId: string, possibleAncestorId: string): boolean {
  let cur: string | null = nodeId;
  while (cur) {
    if (cur === possibleAncestorId) return true;
    cur = orgMap[cur] ?? null;
  }
  return false;
}

/* ── Component ── */

export default function OrganizationPage() {
  const params = useParams();
  const company = getCompany(params.company as string);
  const slug = params.company as string;
  const [people, setPeople] = useLocalState<Persona[]>(`themap:${slug}:people`, getMockPeople);
  const [orgMap, setOrgMap] = useLocalState<Record<string, string | null>>(`themap:${slug}:orgMap`, () => initOrgMap(getMockPeople()));
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [movingId, setMovingId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Persona> | null>(null);
  const [addMode, setAddMode] = useState<"below" | "above" | null>(null);
  const [addTarget, setAddTarget] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Escape cancels moving mode
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMovingId(null);
        cancelEdit();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  function toggleCollapse(id: string) {
    setCollapsed((p) => ({ ...p, [id]: !p[id] }));
  }

  /* ── Move ── */
  function startMove(id: string) {
    setMovingId(id);
    cancelEdit();
  }

  function doMove(targetId: string | null) {
    if (!movingId || movingId === targetId) { setMovingId(null); return; }
    // Can't move under own descendant
    if (targetId && isDescendant(orgMap, targetId, movingId)) {
      showToast("Non puoi spostare un nodo sotto un suo discendente");
      return;
    }
    setOrgMap((prev) => ({ ...prev, [movingId]: targetId }));
    setMovingId(null);
    showToast("Nodo spostato");
  }

  /* ── Edit ── */
  function startEdit(p: Persona) {
    setEditId(p.nome);
    setDraft({ ...p });
    setAddMode(null);
    setAddTarget(null);
    setMovingId(null);
  }

  function cancelEdit() {
    setEditId(null);
    setDraft(null);
    setAddMode(null);
    setAddTarget(null);
  }

  function saveDraft() {
    if (!draft || !draft.nome?.trim()) return;
    const nome = draft.nome.trim();

    if (addMode && addTarget !== null) {
      // New person
      const newP: Persona = {
        nome,
        azienda: people[0]?.azienda || "",
        funzione: draft.funzione || "OPERATION",
        livello: draft.livello || "MIDDLE",
        contratto: draft.contratto || "DIPENDENTE",
        team: draft.team || "",
        leader: draft.leader || false,
        anni: { 2026: { capSett: null, mesiEff: null, costoOra: null, ral: null } },
      };
      setPeople((prev) => [...prev, newP]);

      if (addMode === "below") {
        // New person reports to addTarget
        setOrgMap((prev) => ({ ...prev, [nome]: addTarget === "__ROOT__" ? null : addTarget }));
      } else if (addMode === "above") {
        // New person takes addTarget's parent, addTarget now reports to new person
        setOrgMap((prev) => {
          const parentOfTarget = prev[addTarget!];
          return { ...prev, [nome]: parentOfTarget ?? null, [addTarget!]: nome };
        });
      }
      showToast("Persona aggiunta");
    } else if (editId) {
      // Update existing
      const oldName = editId;
      setPeople((prev) =>
        prev.map((p) =>
          p.nome === oldName
            ? { ...p, nome, funzione: draft.funzione || p.funzione, livello: draft.livello || p.livello, contratto: draft.contratto || p.contratto, team: draft.team ?? p.team, leader: draft.leader ?? p.leader }
            : p,
        ),
      );
      // Update orgMap if name changed
      if (oldName !== nome) {
        setOrgMap((prev) => {
          const next: Record<string, string | null> = {};
          Object.entries(prev).forEach(([k, v]) => {
            const newK = k === oldName ? nome : k;
            const newV = v === oldName ? nome : v;
            next[newK] = newV;
          });
          return next;
        });
      }
      showToast("Persona aggiornata");
    }
    cancelEdit();
  }

  function deletePerson(nome: string) {
    // Reparent children to deleted node's parent
    const parentOfDeleted = orgMap[nome] ?? null;
    setOrgMap((prev) => {
      const next = { ...prev };
      // Children of deleted → inherit parent
      Object.entries(next).forEach(([k, v]) => {
        if (v === nome) next[k] = parentOfDeleted;
      });
      delete next[nome];
      return next;
    });
    setPeople((p) => p.filter((x) => x.nome !== nome));
    setConfirmDel(null);
    showToast(`${nome} rimosso`);
  }

  function startAddBelow(parentNome: string) {
    const parent = people.find((p) => p.nome === parentNome);
    setAddMode("below");
    setAddTarget(parentNome);
    setEditId(null);
    setMovingId(null);
    setDraft({ nome: "", funzione: parent?.funzione || "OPERATION", livello: "MIDDLE", contratto: "DIPENDENTE", team: parent?.team || "", leader: false });
  }

  function startAddAbove(nodeNome: string) {
    const node = people.find((p) => p.nome === nodeNome);
    setAddMode("above");
    setAddTarget(nodeNome);
    setEditId(null);
    setMovingId(null);
    setDraft({ nome: "", funzione: node?.funzione || "OPERATION", livello: "MIDDLE", contratto: "DIPENDENTE", team: node?.team || "", leader: false });
  }

  function startAddRoot() {
    setAddMode("below");
    setAddTarget("__ROOT__");
    setEditId(null);
    setMovingId(null);
    setDraft({ nome: "", funzione: "DIREZIONE", livello: "SENIOR", contratto: "DIPENDENTE", team: "", leader: false });
  }

  function updateDraft(field: string, value: string | boolean) {
    if (!draft) return;
    setDraft({ ...draft, [field]: value });
  }

  // Handle click on a node when in moving mode
  function handleNodeClick(nome: string) {
    if (movingId) {
      doMove(nome);
    }
  }

  /* ── Build & layout ── */
  const roots = buildForest(people, orgMap);
  const layouts = layoutForest(roots, collapsed);
  const flat = flattenForest(layouts);

  let minX = 0, maxX = 0, maxY = 0;
  flat.forEach((f) => {
    if (f.x - NODE_W / 2 < minX) minX = f.x - NODE_W / 2;
    if (f.x + NODE_W / 2 > maxX) maxX = f.x + NODE_W / 2;
    if (f.y + NODE_H > maxY) maxY = f.y + NODE_H;
  });

  const PAD = 50;
  const svgW = maxX - minX + PAD * 2;
  const svgH = maxY + PAD * 2 + (movingId ? 40 : 0);
  const offsetX = -minX + PAD;
  const offsetY = PAD;

  const isEditing = editId !== null || addMode !== null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div className="ee-subnav">
        <Link href={`/${params.company}/people`} className="ee-tab">People</Link>
        <span className="ee-tab active">Organigramma</span>
        <Link href={`/${params.company}/people/rituals`} className="ee-tab">Rituals</Link>
      </div>

      {toast && <div className="fws-toast">{toast}</div>}

      {/* Moving mode banner */}
      {movingId && (
        <div className="og-move-banner">
          Spostando <b>{movingId}</b> — clicca su un nodo destinazione, oppure
          <button className="og-move-root" onClick={() => doMove(null)}>sposta al livello root</button>
          <button className="pe-act-cancel" onClick={() => setMovingId(null)}>Annulla</button>
        </div>
      )}

      {/* Top bar */}
      <div className="og-topbar">
        <button className="pe-add-btn" onClick={startAddRoot}>+ Aggiungi al top</button>
        <span className="og-count">{people.length} persone</span>
      </div>

      <div className="og-scroll">
        <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} className="og-svg">
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
                stroke="#30363d"
                strokeWidth={1.5}
              />
            );
          })}

          {/* Collapsed indicator (dashed line + count) */}
          {flat.filter((f) => f.collapsed && f.childCount > 0).map((f) => {
            const cx = f.x + offsetX;
            const cy = f.y + offsetY + NODE_H;
            return (
              <g key={`coll-${f.node.id}`}>
                <line x1={cx} y1={cy} x2={cx} y2={cy + 18} stroke="#30363d" strokeWidth={1} strokeDasharray="3,3" />
                <rect x={cx - 16} y={cy + 18} width={32} height={18} rx={9} fill="var(--bg3)" stroke="#30363d" strokeWidth={1} />
                <text x={cx} y={cy + 28} fill="var(--fg3)" fontSize={9} fontWeight={700} textAnchor="middle" dominantBaseline="central">
                  +{f.childCount}
                </text>
              </g>
            );
          })}

          {/* Nodes */}
          {flat.map((f) => {
            const p = f.node.persona;
            const nx = f.x + offsetX - NODE_W / 2;
            const ny = f.y + offsetY;
            const fnColor = peFnColor(p.funzione);
            const isCeo = orgMap[p.nome] === null || orgMap[p.nome] === undefined;
            const isMoving = movingId === p.nome;
            const isDropTarget = movingId && movingId !== p.nome && !isDescendant(orgMap, p.nome, movingId);

            return (
              <foreignObject key={f.node.id} x={nx} y={ny} width={NODE_W} height={NODE_H}>
                <div
                  className={`og-node${isCeo ? " og-ceo" : ""}${p.leader ? " og-leader" : ""}${isMoving ? " og-moving" : ""}${isDropTarget ? " og-drop-target" : ""}`}
                  style={{ "--og-fn-color": fnColor } as React.CSSProperties}
                  onClick={() => handleNodeClick(p.nome)}
                >
                  {/* Collapse toggle */}
                  {f.childCount > 0 && (
                    <button
                      className="og-collapse-btn"
                      onClick={(e) => { e.stopPropagation(); toggleCollapse(f.node.id); }}
                      title={f.collapsed ? "Espandi" : "Chiudi"}
                    >
                      {f.collapsed ? "\u25B6" : "\u25BC"}
                    </button>
                  )}

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

                  {/* Hover actions */}
                  {!movingId && (
                    <div className="og-node-actions">
                      <button className="og-act" onClick={(e) => { e.stopPropagation(); startEdit(p); }} title="Modifica">&#9998;</button>
                      <button className="og-act" onClick={(e) => { e.stopPropagation(); startMove(p.nome); }} title="Sposta">&#8693;</button>
                      <button className="og-act" onClick={(e) => { e.stopPropagation(); startAddAbove(p.nome); }} title="Inserisci sopra">&#8613;</button>
                      <button className="og-act" onClick={(e) => { e.stopPropagation(); startAddBelow(p.nome); }} title="Aggiungi sotto">+</button>
                      {confirmDel === p.nome ? (
                        <span className="og-confirm" onClick={(e) => e.stopPropagation()}>
                          <button className="fws-confirm-yes" onClick={() => deletePerson(p.nome)}>Si</button>
                          <button className="fws-confirm-no" onClick={() => setConfirmDel(null)}>No</button>
                        </span>
                      ) : (
                        <button className="og-act og-act-del" onClick={(e) => { e.stopPropagation(); setConfirmDel(p.nome); }} title="Rimuovi">&times;</button>
                      )}
                    </div>
                  )}
                </div>
              </foreignObject>
            );
          })}
        </svg>
      </div>

      {/* Edit bar */}
      {isEditing && draft && (
        <div className="og-edit-bar">
          <span className="og-edit-label">
            {addMode === "below" && addTarget === "__ROOT__" ? "Nuovo (top level)" : addMode === "below" ? `Nuovo sotto ${addTarget}` : addMode === "above" ? `Nuovo sopra ${addTarget}` : `Modifica: ${editId}`}
          </span>
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
