"use client";

import { useState, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getCompany } from "@/lib/companies";
import { useLocalState } from "@/lib/useLocalState";
import {
  type SEONode, type SEONodeType, type SEOWarning,
  SEO_NODE_LABELS, SEO_NODE_ICONS, SEO_STATI, SEO_STATO_LABELS,
  SEO_INTENTI, SEO_FUNNEL, SEO_PRIORITA, SEO_KW_TIPO, SEO_LINGUE,
  emptyNode, emptyProject, canAddChild,
  updateNodeInTree, updateNodeData, addChildToNode,
  removeNodeFromTree, moveNodeInChildren, findNode, findParent,
  countByType, totalVolume, avgDifficulty, clusterCoverage, healthScore,
  scoreOpportunita, computeWarnings, flattenAll, flattenByType,
  parseKeywordCSV, getMockSEOProject,
} from "@/lib/seo-cluster";

type ViewMode = "map" | "table";

interface ProjectListEntry {
  id: string;
  label: string;
}

function emptyProjectList(): ProjectListEntry[] {
  const p = getMockSEOProject();
  return [{ id: p.id, label: p.label }];
}

export default function SEOClusterPage() {
  const params = useParams();
  const company = getCompany(params.company as string);
  const slug = params.company as string;

  // Multi-project: lista progetti + progetto attivo
  const [projectList, setProjectList] = useLocalState<ProjectListEntry[]>(
    `themap:${slug}:seoProjects`, emptyProjectList,
  );
  const [activeProjectId, setActiveProjectId] = useState<string>(projectList[0]?.id || "");
  const [project, setProject] = useLocalState<SEONode>(
    `themap:${slug}:seoCluster:${activeProjectId}`, getMockSEOProject,
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ [project.id]: true });
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [search, setSearch] = useState("");
  const [filterStato, setFilterStato] = useState("");
  const [filterType, setFilterType] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [confirmDelProject, setConfirmDelProject] = useState(false);

  const selected = selectedId ? findNode(project, selectedId) : null;
  const warnings = useMemo(() => computeWarnings(project), [project]);
  const warningMap = useMemo(() => {
    const m = new Map<string, SEOWarning[]>();
    warnings.forEach((w) => {
      if (!m.has(w.nodeId)) m.set(w.nodeId, []);
      m.get(w.nodeId)!.push(w);
    });
    return m;
  }, [warnings]);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000); }

  /* ── Project CRUD ── */

  function handleNewProject() {
    const p = emptyProject();
    setProjectList((prev) => [...prev, { id: p.id, label: p.label }]);
    setActiveProjectId(p.id);
    setSelectedId(null);
    setExpanded({ [p.id]: true });
    // Il nuovo progetto verra' salvato automaticamente da useLocalState con la nuova key
    // Forzo il set immediato del progetto vuoto
    setTimeout(() => setProject(p), 0);
    showToast("Nuovo progetto creato");
  }

  function handleDeleteProject() {
    if (projectList.length <= 1) { showToast("Devi avere almeno un progetto"); return; }
    const newList = projectList.filter((p) => p.id !== activeProjectId);
    setProjectList(newList);
    setActiveProjectId(newList[0].id);
    setSelectedId(null);
    setConfirmDelProject(false);
    showToast("Progetto eliminato");
  }

  function handleSwitchProject(id: string) {
    setActiveProjectId(id);
    setSelectedId(null);
    setExpanded({ [id]: true });
  }

  function handleRenameProject(newLabel: string) {
    setProjectList((prev) => prev.map((p) => p.id === activeProjectId ? { ...p, label: newLabel } : p));
    setProject((p) => updateNodeInTree(p, p.id, { label: newLabel }));
  }

  /* ── Tree operations ── */

  function toggle(id: string) {
    setExpanded((p) => ({ ...p, [id]: !p[id] }));
  }

  function expandTo(nodeId: string) {
    const path: string[] = [];
    function find(n: SEONode, trail: string[]): boolean {
      if (n.id === nodeId) { path.push(...trail); return true; }
      for (const c of n.children) {
        if (find(c, [...trail, n.id])) return true;
      }
      return false;
    }
    find(project, []);
    setExpanded((p) => {
      const next = { ...p };
      path.forEach((id) => { next[id] = true; });
      return next;
    });
  }

  function selectNode(id: string) {
    setSelectedId(id);
    expandTo(id);
  }

  function handleAddChild(parentId: string, type: SEONodeType) {
    const child = emptyNode(type);
    setProject((p) => addChildToNode(p, parentId, child));
    setExpanded((p) => ({ ...p, [parentId]: true }));
    setSelectedId(child.id);
    showToast(`${SEO_NODE_LABELS[type]} aggiunto`);
  }

  function handleAddCluster() {
    handleAddChild(project.id, "cluster");
  }

  function handleDelete(nodeId: string) {
    if (nodeId === project.id) return;
    setProject((p) => removeNodeFromTree(p, nodeId));
    if (selectedId === nodeId) setSelectedId(null);
    setConfirmDel(null);
    showToast("Elemento eliminato");
  }

  function handleMove(nodeId: string, dir: -1 | 1) {
    setProject((p) => moveNodeInChildren(p, nodeId, dir));
  }

  function handleUpdateLabel(nodeId: string, label: string) {
    setProject((p) => updateNodeInTree(p, nodeId, { label }));
    // Se rinomino il progetto root, aggiorno anche la lista
    if (nodeId === project.id) {
      setProjectList((prev) => prev.map((e) => e.id === activeProjectId ? { ...e, label } : e));
    }
  }

  function handleUpdateData(nodeId: string, patch: Record<string, unknown>) {
    setProject((p) => updateNodeData(p, nodeId, patch));
  }

  function handleDuplicate(nodeId: string) {
    const source = findNode(project, nodeId);
    if (!source || source.id === project.id) return;
    const parent = findParent(project, nodeId);
    if (!parent) return;

    function deepClone(n: SEONode): SEONode {
      return { ...n, id: crypto.randomUUID(), children: n.children.map(deepClone) };
    }
    const clone = deepClone(source);
    clone.label = source.label + " (copia)";
    setProject((p) => addChildToNode(p, parent.id, clone));
    setSelectedId(clone.id);
    showToast("Elemento duplicato");
  }

  function handleImportCSV(csv: string, targetId: string) {
    const nodes = parseKeywordCSV(csv);
    if (nodes.length === 0) { showToast("Nessuna keyword trovata nel CSV"); return; }
    let updated = project;
    for (const n of nodes) updated = addChildToNode(updated, targetId, n);
    setProject(updated);
    setShowImport(false);
    showToast(`${nodes.length} keyword importate`);
  }

  // Stats
  const stats = useMemo(() => ({
    clusters: countByType(project, "cluster"),
    pillars: countByType(project, "pillar"),
    supporting: countByType(project, "supporting"),
    keywords: countByType(project, "keyword"),
    totalVol: totalVolume(project),
    warnings: warnings.length,
  }), [project, warnings]);

  return (
    <div>
      <div className="ee-subnav">
        <Link href={`/${slug}/marketing`} className="ee-tab">Campaign Manager</Link>
        <Link href={`/${slug}/marketing/strategy`} className="ee-tab">Strategy</Link>
        <Link href={`/${slug}/marketing/brand-asset`} className="ee-tab">Brand Asset</Link>
        <span className="ee-tab active">SEO Cluster</span>
        <Link href={`/${slug}/marketing/geo-tool`} className="ee-tab">GEO Tool</Link>
        <Link href={`/${slug}/marketing/flywheel`} className="ee-tab">Flywheel</Link>
      </div>

      {toast && <div className="fws-toast">{toast}</div>}

      <div className="seo-page">
        {/* Header */}
        <div className="seo-head">
          <div className="seo-title">
            {company && <span style={{ color: company.color }}>{"\u25A0"}</span>}
            {company?.name || slug} — SEO Cluster
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="mk-import-btn" onClick={() => setShowImport(true)}>Import CSV</button>
            <button className="comp-add" onClick={handleAddCluster}>+ Cluster</button>
            <button className="comp-add" onClick={handleNewProject}>+ Progetto</button>
          </div>
        </div>

        {/* Project Switcher */}
        <div className="seo-project-bar">
          <span className="seo-project-label">Progetto:</span>
          <select
            className="seo-project-select"
            value={activeProjectId}
            onChange={(e) => handleSwitchProject(e.target.value)}
          >
            {projectList.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
          {confirmDelProject ? (
            <span className="fws-confirm">
              <span style={{ fontSize: 11, color: "var(--fg3)", marginRight: 4 }}>Elimina progetto?</span>
              <button className="fws-confirm-yes" onClick={handleDeleteProject}>Si</button>
              <button className="fws-confirm-no" onClick={() => setConfirmDelProject(false)}>No</button>
            </span>
          ) : (
            <button
              className="seo-project-del"
              onClick={() => setConfirmDelProject(true)}
              title="Elimina progetto"
              disabled={projectList.length <= 1}
            >{"\u2715"}</button>
          )}
        </div>

        {/* KPI Bar */}
        <div className="seo-kpi-bar">
          <div className="seo-kpi"><span className="seo-kpi-n">{stats.clusters}</span><span className="seo-kpi-l">Cluster</span></div>
          <div className="seo-kpi"><span className="seo-kpi-n">{stats.pillars}</span><span className="seo-kpi-l">Pillar</span></div>
          <div className="seo-kpi"><span className="seo-kpi-n">{stats.supporting}</span><span className="seo-kpi-l">Supporting</span></div>
          <div className="seo-kpi"><span className="seo-kpi-n">{stats.keywords}</span><span className="seo-kpi-l">Keyword</span></div>
          <div className="seo-kpi"><span className="seo-kpi-n">{stats.totalVol.toLocaleString("it-IT")}</span><span className="seo-kpi-l">Volume tot.</span></div>
          {stats.warnings > 0 && (
            <div className="seo-kpi seo-kpi-warn"><span className="seo-kpi-n">{stats.warnings}</span><span className="seo-kpi-l">Warning</span></div>
          )}
        </div>

        {/* Toolbar: search, filters, view toggle */}
        <div className="seo-toolbar">
          <input
            className="seo-search"
            placeholder="Cerca nodi..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={filterStato} onChange={(e) => setFilterStato(e.target.value)}>
            <option value="">Tutti gli stati</option>
            {SEO_STATI.map((s) => <option key={s} value={s}>{SEO_STATO_LABELS[s]}</option>)}
          </select>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="">Tutti i tipi</option>
            {(["cluster", "pillar", "supporting", "keyword"] as SEONodeType[]).map((t) => (
              <option key={t} value={t}>{SEO_NODE_LABELS[t]}</option>
            ))}
          </select>
          <div className="mk-view-toggle">
            <button className={viewMode === "map" ? "act" : ""} onClick={() => setViewMode("map")} title="Mappa">
              <svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="3" r="2" fill="currentColor"/><circle cx="3" cy="10" r="2" fill="currentColor"/><circle cx="11" cy="10" r="2" fill="currentColor"/><line x1="7" y1="5" x2="3" y2="8" stroke="currentColor" strokeWidth="1"/><line x1="7" y1="5" x2="11" y2="8" stroke="currentColor" strokeWidth="1"/></svg>
            </button>
            <button className={viewMode === "table" ? "act" : ""} onClick={() => setViewMode("table")} title="Tabella">
              <svg width="14" height="14" viewBox="0 0 14 14"><rect x="1" y="1" width="5" height="3" rx=".5" fill="currentColor"/><rect x="8" y="1" width="5" height="3" rx=".5" fill="currentColor"/><rect x="1" y="5.5" width="5" height="3" rx=".5" fill="currentColor"/><rect x="8" y="5.5" width="5" height="3" rx=".5" fill="currentColor"/><rect x="1" y="10" width="5" height="3" rx=".5" fill="currentColor"/><rect x="8" y="10" width="5" height="3" rx=".5" fill="currentColor"/></svg>
            </button>
          </div>
        </div>

        {/* Main content: map + sidebar */}
        <div className="seo-main">
          <div className={`seo-canvas${selected ? " seo-canvas-narrow" : ""}`}>
            {viewMode === "map" ? (
              <TreeView
                node={project}
                depth={0}
                expanded={expanded}
                selectedId={selectedId}
                warningMap={warningMap}
                search={search}
                filterStato={filterStato}
                filterType={filterType}
                onToggle={toggle}
                onSelect={selectNode}
                onAddChild={handleAddChild}
                onDelete={(id) => setConfirmDel(id)}
                onMove={handleMove}
                onDuplicate={handleDuplicate}
                confirmDel={confirmDel}
                onConfirmYes={handleDelete}
                onConfirmNo={() => setConfirmDel(null)}
              />
            ) : (
              <TableView
                project={project}
                search={search}
                filterStato={filterStato}
                filterType={filterType}
                selectedId={selectedId}
                warningMap={warningMap}
                onSelect={selectNode}
              />
            )}
          </div>

          {selected && (
            <div className="seo-sidebar">
              <div className="seo-sb-head">
                <span className="seo-sb-type">{SEO_NODE_LABELS[selected.type]}</span>
                <button className="seo-sb-close" onClick={() => setSelectedId(null)}>{"\u2715"}</button>
              </div>
              <SidebarDetail
                node={selected}
                warnings={warningMap.get(selected.id) || []}
                project={project}
                onUpdateLabel={(l) => handleUpdateLabel(selected.id, l)}
                onUpdateData={(d) => handleUpdateData(selected.id, d)}
              />
            </div>
          )}
        </div>
      </div>

      {showImport && (
        <ImportCSVModal
          project={project}
          onImport={handleImportCSV}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════
   TREE VIEW (Mind Map style)
   ═══════════════════════════════════════ */

function TreeView({
  node, depth, expanded, selectedId, warningMap, search, filterStato, filterType,
  onToggle, onSelect, onAddChild, onDelete, onMove, onDuplicate,
  confirmDel, onConfirmYes, onConfirmNo,
}: {
  node: SEONode;
  depth: number;
  expanded: Record<string, boolean>;
  selectedId: string | null;
  warningMap: Map<string, SEOWarning[]>;
  search: string;
  filterStato: string;
  filterType: string;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  onAddChild: (parentId: string, type: SEONodeType) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onDuplicate: (id: string) => void;
  confirmDel: string | null;
  onConfirmYes: (id: string) => void;
  onConfirmNo: () => void;
}) {
  const isOpen = expanded[node.id] ?? false;
  const hasChildren = node.children.length > 0;
  const isSelected = node.id === selectedId;
  const nodeWarnings = warningMap.get(node.id) || [];
  const [showAdd, setShowAdd] = useState(false);
  const allowedChildren = canAddChild(node.type);

  // Search/filter visibility
  const matchesSearch = !search || node.label.toLowerCase().includes(search.toLowerCase());
  const matchesStato = !filterStato || (node.data.stato as string) === filterStato;
  const matchesType = !filterType || node.type === filterType;

  // For project/cluster, show if any descendant matches
  const hasMatchingDescendant = useMemo(() => {
    if (!search && !filterStato && !filterType) return true;
    function check(n: SEONode): boolean {
      const ms = !search || n.label.toLowerCase().includes(search.toLowerCase());
      const mst = !filterStato || (n.data.stato as string) === filterStato;
      const mt = !filterType || n.type === filterType;
      if (ms && mst && mt) return true;
      return n.children.some(check);
    }
    return check(node);
  }, [node, search, filterStato, filterType]);

  if (!hasMatchingDescendant && !matchesSearch) return null;

  const vol = totalVolume(node);
  const stato = node.data.stato as string;

  return (
    <div className={`seo-tree-node seo-tree-d${Math.min(depth, 4)}`}>
      <div
        className={`seo-tree-row${isSelected ? " seo-tree-sel" : ""}${nodeWarnings.length > 0 ? " seo-tree-warn" : ""}`}
        onClick={() => onSelect(node.id)}
      >
        {/* Expand/collapse */}
        <span
          className={`seo-tree-chev${hasChildren ? "" : " seo-tree-chev-hide"}${isOpen ? " seo-tree-chev-open" : ""}`}
          onClick={(e) => { e.stopPropagation(); if (hasChildren) onToggle(node.id); }}
        >
          &#9654;
        </span>

        {/* Icon */}
        <span className={`seo-tree-icon seo-tree-icon-${node.type}`}>
          {SEO_NODE_ICONS[node.type]}
        </span>

        {/* Label */}
        <span className="seo-tree-label">{node.label}</span>

        {/* Badges */}
        {stato && node.type !== "project" && node.type !== "keyword" && (
          <span className={`seo-badge seo-badge-${stato}`}>{SEO_STATO_LABELS[stato as keyof typeof SEO_STATO_LABELS] || stato}</span>
        )}
        {vol > 0 && (
          <span className="seo-tree-vol">{vol.toLocaleString("it-IT")}</span>
        )}
        {node.type === "keyword" && node.data.difficolta != null && (
          <span className={`seo-tree-kd seo-kd-${kdLevel(node.data.difficolta as number)}`}>
            KD {String(node.data.difficolta)}
          </span>
        )}
        {node.type === "cluster" && (
          <span className="seo-tree-cov">{clusterCoverage(node)}%</span>
        )}
        {nodeWarnings.length > 0 && (
          <span className="seo-tree-warning-badge" title={nodeWarnings.map((w) => w.message).join("\n")}>
            {"\u26A0"} {nodeWarnings.length}
          </span>
        )}

        {/* Actions */}
        <span className="seo-tree-actions" onClick={(e) => e.stopPropagation()}>
          {allowedChildren.length > 0 && (
            <button className="seo-tree-btn" onClick={() => setShowAdd(!showAdd)} title="Aggiungi">+</button>
          )}
          {depth > 0 && (
            <>
              <button className="seo-tree-btn" onClick={() => onDuplicate(node.id)} title="Duplica">{"\u29C9"}</button>
              <button className="seo-tree-btn" onClick={() => onMove(node.id, -1)} title="Su">{"\u2191"}</button>
              <button className="seo-tree-btn" onClick={() => onMove(node.id, 1)} title="Giu">{"\u2193"}</button>
              {confirmDel === node.id ? (
                <span className="fws-confirm">
                  <button className="fws-confirm-yes" onClick={() => onConfirmYes(node.id)}>Si</button>
                  <button className="fws-confirm-no" onClick={onConfirmNo}>No</button>
                </span>
              ) : (
                <button className="seo-tree-btn seo-tree-btn-del" onClick={() => onDelete(node.id)} title="Elimina">{"\u2715"}</button>
              )}
            </>
          )}
        </span>
      </div>

      {/* Add child menu */}
      {showAdd && (
        <div className="seo-add-menu">
          {allowedChildren.map((t) => (
            <button key={t} onClick={() => { onAddChild(node.id, t); setShowAdd(false); }}>
              <span className={`seo-tree-icon seo-tree-icon-${t}`}>{SEO_NODE_ICONS[t]}</span>
              {SEO_NODE_LABELS[t]}
            </button>
          ))}
        </div>
      )}

      {/* Children */}
      {isOpen && hasChildren && (
        <div className="seo-tree-children">
          {node.children.map((child) => (
            <TreeView
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              selectedId={selectedId}
              warningMap={warningMap}
              search={search}
              filterStato={filterStato}
              filterType={filterType}
              onToggle={onToggle}
              onSelect={onSelect}
              onAddChild={onAddChild}
              onDelete={onDelete}
              onMove={onMove}
              onDuplicate={onDuplicate}
              confirmDel={confirmDel}
              onConfirmYes={onConfirmYes}
              onConfirmNo={onConfirmNo}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function kdLevel(kd: number): string {
  if (kd <= 30) return "easy";
  if (kd <= 60) return "mid";
  return "hard";
}

/* ═══════════════════════════════════════
   TABLE VIEW
   ═══════════════════════════════════════ */

function TableView({
  project, search, filterStato, filterType, selectedId, warningMap, onSelect,
}: {
  project: SEONode;
  search: string;
  filterStato: string;
  filterType: string;
  selectedId: string | null;
  warningMap: Map<string, SEOWarning[]>;
  onSelect: (id: string) => void;
}) {
  const [sortCol, setSortCol] = useState<string>("label");
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  const allNodes = useMemo(() => {
    return flattenAll(project).filter((n) => n.type !== "project");
  }, [project]);

  const filtered = useMemo(() => {
    return allNodes.filter((n) => {
      if (search && !n.label.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterStato && (n.data.stato as string) !== filterStato) return false;
      if (filterType && n.type !== filterType) return false;
      return true;
    });
  }, [allNodes, search, filterStato, filterType]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let va: string | number = "", vb: string | number = "";
      switch (sortCol) {
        case "label": va = a.label; vb = b.label; break;
        case "type": va = a.type; vb = b.type; break;
        case "stato": va = (a.data.stato as string) || ""; vb = (b.data.stato as string) || ""; break;
        case "volume": va = (a.data.volume as number) || totalVolume(a); vb = (b.data.volume as number) || totalVolume(b); break;
        case "difficolta": va = (a.data.difficolta as number) || 0; vb = (b.data.difficolta as number) || 0; break;
        case "owner": va = (a.data.owner as string) || ""; vb = (b.data.owner as string) || ""; break;
      }
      if (typeof va === "string") return va.localeCompare(vb as string) * sortDir;
      return ((va as number) - (vb as number)) * sortDir;
    });
  }, [filtered, sortCol, sortDir]);

  function handleSort(col: string) {
    if (sortCol === col) setSortDir((d) => d === 1 ? -1 : 1);
    else { setSortCol(col); setSortDir(1); }
  }

  function SortTh({ col, children }: { col: string; children: React.ReactNode }) {
    return (
      <th onClick={() => handleSort(col)} style={{ cursor: "pointer" }}>
        {children} {sortCol === col ? (sortDir === 1 ? "\u25B2" : "\u25BC") : ""}
      </th>
    );
  }

  return (
    <div className="seo-table-wrap">
      <table className="seo-table">
        <thead>
          <tr>
            <SortTh col="type">Tipo</SortTh>
            <SortTh col="label">Nome</SortTh>
            <SortTh col="stato">Stato</SortTh>
            <SortTh col="volume">Volume</SortTh>
            <SortTh col="difficolta">KD</SortTh>
            <SortTh col="owner">Owner</SortTh>
            <th>Warning</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((n) => {
            const w = warningMap.get(n.id) || [];
            const vol = n.data.volume as number || (n.type === "cluster" ? totalVolume(n) : 0);
            return (
              <tr
                key={n.id}
                className={`seo-tbl-row${selectedId === n.id ? " seo-tbl-sel" : ""}${w.length > 0 ? " seo-tbl-warn" : ""}`}
                onClick={() => onSelect(n.id)}
              >
                <td>
                  <span className={`seo-tree-icon seo-tree-icon-${n.type}`}>{SEO_NODE_ICONS[n.type]}</span>
                  <span className="seo-tbl-type">{SEO_NODE_LABELS[n.type]}</span>
                </td>
                <td className="seo-tbl-name">{n.label}</td>
                <td>
                  {n.data.stato ? (
                    <span className={`seo-badge seo-badge-${n.data.stato as string}`}>
                      {SEO_STATO_LABELS[n.data.stato as keyof typeof SEO_STATO_LABELS] || String(n.data.stato)}
                    </span>
                  ) : null}
                </td>
                <td className="seo-tbl-num">{vol > 0 ? vol.toLocaleString("it-IT") : "\u2014"}</td>
                <td className="seo-tbl-num">
                  {n.data.difficolta != null ? (
                    <span className={`seo-tree-kd seo-kd-${kdLevel(n.data.difficolta as number)}`}>{String(n.data.difficolta)}</span>
                  ) : (
                    n.type === "cluster" ? (avgDifficulty(n) ?? "\u2014") : "\u2014"
                  )}
                </td>
                <td>{(n.data.owner as string) || "\u2014"}</td>
                <td>
                  {w.length > 0 && (
                    <span className="seo-tree-warning-badge" title={w.map((x) => x.message).join("\n")}>
                      {"\u26A0"} {w.length}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {sorted.length === 0 && (
        <div className="comp-empty">Nessun elemento trovato con i filtri selezionati.</div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════
   SIDEBAR DETAIL
   ═══════════════════════════════════════ */

function SidebarDetail({
  node, warnings, project, onUpdateLabel, onUpdateData,
}: {
  node: SEONode;
  warnings: SEOWarning[];
  project: SEONode;
  onUpdateLabel: (label: string) => void;
  onUpdateData: (data: Record<string, unknown>) => void;
}) {
  const d = node.data;

  return (
    <div className="seo-sb-body">
      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="seo-sb-warnings">
          {warnings.map((w, i) => (
            <div key={i} className="seo-sb-warning">{"\u26A0"} {w.message}</div>
          ))}
        </div>
      )}

      {/* Label */}
      <label>Nome</label>
      <input value={node.label} onChange={(e) => onUpdateLabel(e.target.value)} />

      {/* Type-specific fields */}
      {node.type === "project" && (
        <ProjectFields data={d} onUpdate={onUpdateData} />
      )}
      {node.type === "cluster" && (
        <ClusterFields data={d} node={node} onUpdate={onUpdateData} />
      )}
      {(node.type === "pillar" || node.type === "supporting") && (
        <ContentFields data={d} node={node} type={node.type} onUpdate={onUpdateData} />
      )}
      {node.type === "keyword" && (
        <KeywordFields data={d} onUpdate={onUpdateData} />
      )}
    </div>
  );
}

/* ── Project Fields ── */

function ProjectFields({ data, onUpdate }: { data: Record<string, unknown>; onUpdate: (d: Record<string, unknown>) => void }) {
  return (
    <>
      <label>Descrizione</label>
      <textarea value={(data.description as string) || ""} onChange={(e) => onUpdate({ description: e.target.value })} rows={2} />
      <div className="seo-sb-row">
        <div>
          <label>Lingua</label>
          <select value={(data.lingua as string) || "it"} onChange={(e) => onUpdate({ lingua: e.target.value })}>
            {SEO_LINGUE.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
          </select>
        </div>
        <div>
          <label>Paese</label>
          <input value={(data.paese as string) || ""} onChange={(e) => onUpdate({ paese: e.target.value })} placeholder="IT" />
        </div>
      </div>
    </>
  );
}

/* ── Cluster Fields ── */

function ClusterFields({ data, node, onUpdate }: { data: Record<string, unknown>; node: SEONode; onUpdate: (d: Record<string, unknown>) => void }) {
  const cov = clusterCoverage(node);
  const health = healthScore(node);
  const vol = totalVolume(node);
  const diff = avgDifficulty(node);

  return (
    <>
      {/* Computed metrics */}
      <div className="seo-sb-metrics">
        <div><span className="seo-sb-met-n">{vol.toLocaleString("it-IT")}</span><span className="seo-sb-met-l">Volume totale</span></div>
        <div><span className="seo-sb-met-n">{cov}%</span><span className="seo-sb-met-l">Copertura</span></div>
        <div><span className="seo-sb-met-n">{health}</span><span className="seo-sb-met-l">Health</span></div>
        {diff != null && <div><span className="seo-sb-met-n">{diff}</span><span className="seo-sb-met-l">KD medio</span></div>}
      </div>

      <label>Descrizione</label>
      <textarea value={(data.description as string) || ""} onChange={(e) => onUpdate({ description: e.target.value })} rows={2} />

      <div className="seo-sb-row">
        <div>
          <label>Lingua</label>
          <select value={(data.lingua as string) || "it"} onChange={(e) => onUpdate({ lingua: e.target.value })}>
            {SEO_LINGUE.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
          </select>
        </div>
        <div>
          <label>Paese</label>
          <input value={(data.paese as string) || ""} onChange={(e) => onUpdate({ paese: e.target.value })} placeholder="IT" />
        </div>
      </div>

      <label>Obiettivo SEO</label>
      <input value={(data.obiettivo_seo as string) || ""} onChange={(e) => onUpdate({ obiettivo_seo: e.target.value })} placeholder="Top 3, featured snippet..." />

      <label>Obiettivo business</label>
      <input value={(data.obiettivo_business as string) || ""} onChange={(e) => onUpdate({ obiettivo_business: e.target.value })} placeholder="Lead gen, brand..." />

      <div className="seo-sb-row">
        <div>
          <label>Stato</label>
          <select value={(data.stato as string) || "idea"} onChange={(e) => onUpdate({ stato: e.target.value })}>
            {SEO_STATI.map((s) => <option key={s} value={s}>{SEO_STATO_LABELS[s]}</option>)}
          </select>
        </div>
        <div>
          <label>Priorita</label>
          <select value={(data.priorita as string) || "media"} onChange={(e) => onUpdate({ priorita: e.target.value })}>
            {SEO_PRIORITA.map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
          </select>
        </div>
      </div>

      <label>Owner</label>
      <input value={(data.owner as string) || ""} onChange={(e) => onUpdate({ owner: e.target.value })} />

      <label>Note strategiche</label>
      <textarea value={(data.note as string) || ""} onChange={(e) => onUpdate({ note: e.target.value })} rows={3} />
    </>
  );
}

/* ── Content Fields (Pillar / Supporting) ── */

function ContentFields({ data, node, type, onUpdate }: {
  data: Record<string, unknown>; node: SEONode; type: "pillar" | "supporting";
  onUpdate: (d: Record<string, unknown>) => void;
}) {
  const opp = scoreOpportunita(node);

  return (
    <>
      {/* Score */}
      <div className="seo-sb-metrics">
        <div><span className="seo-sb-met-n">{opp}</span><span className="seo-sb-met-l">Score Opp.</span></div>
        {(data.volume as number) > 0 && <div><span className="seo-sb-met-n">{(data.volume as number).toLocaleString("it-IT")}</span><span className="seo-sb-met-l">Volume</span></div>}
      </div>

      <label>URL</label>
      <input value={(data.url as string) || ""} onChange={(e) => onUpdate({ url: e.target.value })} placeholder="/slug-pagina" />

      <label>Keyword primaria</label>
      <input value={(data.keyword_primaria as string) || ""} onChange={(e) => onUpdate({ keyword_primaria: e.target.value })} />

      <div className="seo-sb-row">
        <div>
          <label>Volume KW</label>
          <input type="number" value={(data.volume as number) ?? ""} onChange={(e) => onUpdate({ volume: e.target.value ? Number(e.target.value) : null })} />
        </div>
        <div>
          <label>Lingua</label>
          <select value={(data.lingua as string) || "it"} onChange={(e) => onUpdate({ lingua: e.target.value })}>
            {SEO_LINGUE.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
          </select>
        </div>
      </div>

      <label>Keyword secondarie</label>
      <textarea value={(data.keyword_secondarie as string) || ""} onChange={(e) => onUpdate({ keyword_secondarie: e.target.value })} rows={2} placeholder="Una per riga" />

      <div className="seo-sb-row">
        <div>
          <label>Intent</label>
          <select value={(data.intent as string) || ""} onChange={(e) => onUpdate({ intent: e.target.value })}>
            {SEO_INTENTI.map((i) => <option key={i} value={i}>{i.charAt(0).toUpperCase() + i.slice(1)}</option>)}
          </select>
        </div>
        <div>
          <label>Funnel</label>
          <select value={(data.funnel_stage as string) || ""} onChange={(e) => onUpdate({ funnel_stage: e.target.value })}>
            {SEO_FUNNEL.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
      </div>

      <div className="seo-sb-row">
        <div>
          <label>Stato</label>
          <select value={(data.stato as string) || "idea"} onChange={(e) => onUpdate({ stato: e.target.value })}>
            {SEO_STATI.map((s) => <option key={s} value={s}>{SEO_STATO_LABELS[s]}</option>)}
          </select>
        </div>
        <div>
          <label>Priorita</label>
          <select value={(data.priorita as string) || "media"} onChange={(e) => onUpdate({ priorita: e.target.value })}>
            {SEO_PRIORITA.map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
          </select>
        </div>
      </div>

      <div className="seo-sb-row">
        <div>
          <label>Owner</label>
          <input value={(data.owner as string) || ""} onChange={(e) => onUpdate({ owner: e.target.value })} />
        </div>
        <div>
          <label>Deadline</label>
          <input type="date" value={(data.deadline as string) || ""} onChange={(e) => onUpdate({ deadline: e.target.value })} />
        </div>
      </div>

      <label>Data pubblicazione</label>
      <input type="date" value={(data.data_pub as string) || ""} onChange={(e) => onUpdate({ data_pub: e.target.value })} />

      <label>Meta Title</label>
      <input value={(data.meta_title as string) || ""} onChange={(e) => onUpdate({ meta_title: e.target.value })} />

      <label>Meta Description</label>
      <textarea value={(data.meta_desc as string) || ""} onChange={(e) => onUpdate({ meta_desc: e.target.value })} rows={2} />

      <label>H1</label>
      <input value={(data.h1 as string) || ""} onChange={(e) => onUpdate({ h1: e.target.value })} />

      <label>Outline (H2/H3)</label>
      <textarea value={(data.outline as string) || ""} onChange={(e) => onUpdate({ outline: e.target.value })} rows={4} placeholder="H2: Titolo&#10;  H3: Sotto-titolo&#10;H2: Altro titolo" />

      <label>Brief editoriale</label>
      <textarea value={(data.brief as string) || ""} onChange={(e) => onUpdate({ brief: e.target.value })} rows={3} />

      <label>CTA</label>
      <input value={(data.cta as string) || ""} onChange={(e) => onUpdate({ cta: e.target.value })} />

      {type === "supporting" && (
        <>
          <label>Link verso Pillar</label>
          <input value={(data.link_pillar as string) || ""} onChange={(e) => onUpdate({ link_pillar: e.target.value })} placeholder="/url-pillar-page" />
        </>
      )}

      <label>Competitor in SERP</label>
      <textarea value={(data.competitor_serp as string) || ""} onChange={(e) => onUpdate({ competitor_serp: e.target.value })} rows={2} placeholder="Uno per riga" />

      <label>Note</label>
      <textarea value={(data.note as string) || ""} onChange={(e) => onUpdate({ note: e.target.value })} rows={2} />
    </>
  );
}

/* ── Keyword Fields ── */

function KeywordFields({ data, onUpdate }: { data: Record<string, unknown>; onUpdate: (d: Record<string, unknown>) => void }) {
  return (
    <>
      <div className="seo-sb-row">
        <div>
          <label>Volume</label>
          <input type="number" value={(data.volume as number) ?? ""} onChange={(e) => onUpdate({ volume: e.target.value ? Number(e.target.value) : null })} />
        </div>
        <div>
          <label>Difficolta (0-100)</label>
          <input type="number" min={0} max={100} value={(data.difficolta as number) ?? ""} onChange={(e) => onUpdate({ difficolta: e.target.value ? Number(e.target.value) : null })} />
        </div>
      </div>

      <div className="seo-sb-row">
        <div>
          <label>CPC</label>
          <input type="number" step="0.01" value={(data.cpc as number) ?? ""} onChange={(e) => onUpdate({ cpc: e.target.value ? Number(e.target.value) : null })} />
        </div>
        <div>
          <label>Tipo</label>
          <select value={(data.tipo as string) || "primaria"} onChange={(e) => onUpdate({ tipo: e.target.value })}>
            {SEO_KW_TIPO.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
        </div>
      </div>

      <div className="seo-sb-row">
        <div>
          <label>Intent</label>
          <select value={(data.intent as string) || ""} onChange={(e) => onUpdate({ intent: e.target.value })}>
            {SEO_INTENTI.map((i) => <option key={i} value={i}>{i.charAt(0).toUpperCase() + i.slice(1)}</option>)}
          </select>
        </div>
        <div>
          <label>Funnel</label>
          <select value={(data.funnel_stage as string) || ""} onChange={(e) => onUpdate({ funnel_stage: e.target.value })}>
            {SEO_FUNNEL.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
      </div>

      <div className="seo-sb-row">
        <div>
          <label>Lingua</label>
          <select value={(data.lingua as string) || "it"} onChange={(e) => onUpdate({ lingua: e.target.value })}>
            {SEO_LINGUE.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
          </select>
        </div>
        <div>
          <label>Paese</label>
          <input value={(data.paese as string) || ""} onChange={(e) => onUpdate({ paese: e.target.value })} placeholder="IT" />
        </div>
      </div>

      <label>Priorita</label>
      <select value={(data.priorita as string) || "media"} onChange={(e) => onUpdate({ priorita: e.target.value })}>
        {SEO_PRIORITA.map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
      </select>

      <label>Varianti / Sinonimi</label>
      <textarea value={(data.varianti as string) || ""} onChange={(e) => onUpdate({ varianti: e.target.value })} rows={2} placeholder="Una per riga" />

      <label>Note SERP</label>
      <textarea value={(data.note_serp as string) || ""} onChange={(e) => onUpdate({ note_serp: e.target.value })} rows={2} placeholder="Featured snippet, PAA, local pack..." />
    </>
  );
}

/* ═══════════════════════════════════════
   IMPORT CSV MODAL
   ═══════════════════════════════════════ */

function ImportCSVModal({ project, onImport, onClose }: {
  project: SEONode;
  onImport: (csv: string, targetId: string) => void;
  onClose: () => void;
}) {
  const [csv, setCsv] = useState("");
  const [targetId, setTargetId] = useState(project.id);
  const fileRef = useRef<HTMLInputElement>(null);

  const targets = useMemo(() => {
    const nodes: { id: string; label: string; type: SEONodeType }[] = [];
    function walk(n: SEONode, prefix: string) {
      if (n.type === "project" || n.type === "cluster" || n.type === "pillar" || n.type === "supporting") {
        nodes.push({ id: n.id, label: prefix + n.label, type: n.type });
      }
      n.children.forEach((c) => walk(c, prefix + "  "));
    }
    walk(project, "");
    return nodes;
  }, [project]);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCsv(reader.result as string);
    reader.readAsText(file);
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 600 }}>
        <h3>Importa Keyword da CSV</h3>

        <label>Destinazione</label>
        <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
          {targets.map((t) => (
            <option key={t.id} value={t.id}>{SEO_NODE_ICONS[t.type]} {t.label}</option>
          ))}
        </select>

        <label>File CSV</label>
        <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" onChange={handleFile} />

        <label>Oppure incolla qui</label>
        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={8}
          placeholder={"keyword,volume,difficulty,cpc,intent\ninfissi pvc,8100,45,1.2,commerciale\nfinestre pvc prezzi,4000,38,0.9,transazionale"}
          style={{ fontFamily: "monospace", fontSize: 11 }}
        />

        <div className="mk-import-format">
          <div className="mk-import-format-title">Formato</div>
          <p>Colonne accettate: <strong>keyword</strong> (obbligatoria), volume, difficulty/KD, CPC, intent</p>
          <p>Separatori: virgola, punto e virgola, tab</p>
        </div>

        <div className="modal-foot">
          <button className="btn-cancel" onClick={onClose}>Annulla</button>
          <button className="btn-save" onClick={() => onImport(csv, targetId)} disabled={!csv.trim()}>Importa</button>
        </div>
      </div>
    </div>
  );
}
