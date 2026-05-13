/* ── SEO Cluster & Pillar Page Module ── */

export type SEONodeType = "project" | "cluster" | "pillar" | "supporting" | "keyword";

export const SEO_NODE_LABELS: Record<SEONodeType, string> = {
  project: "Progetto SEO",
  cluster: "Topic Cluster",
  pillar: "Pillar Page",
  supporting: "Supporting Page",
  keyword: "Keyword",
};

export const SEO_NODE_ICONS: Record<SEONodeType, string> = {
  project: "\u25A0",
  cluster: "\u25C6",
  pillar: "\u25B2",
  supporting: "\u25CF",
  keyword: "\u2666",
};

export const SEO_STATI = [
  "idea", "brief", "in_scrittura", "in_revisione", "pubblicato", "da_aggiornare",
] as const;
export type SEOStato = typeof SEO_STATI[number];

export const SEO_STATO_LABELS: Record<SEOStato, string> = {
  idea: "Idea", brief: "Brief", in_scrittura: "In scrittura",
  in_revisione: "In revisione", pubblicato: "Pubblicato", da_aggiornare: "Da aggiornare",
};

export const SEO_INTENTI = ["informativo", "navigazionale", "transazionale", "commerciale"] as const;
export type SEOIntent = typeof SEO_INTENTI[number];

export const SEO_FUNNEL = ["TOFU", "MOFU", "BOFU"] as const;
export type SEOFunnel = typeof SEO_FUNNEL[number];

export const SEO_PRIORITA = ["alta", "media", "bassa"] as const;
export type SEOPriorita = typeof SEO_PRIORITA[number];

export const SEO_KW_TIPO = ["primaria", "secondaria"] as const;

export const SEO_LINGUE = ["it", "en", "de", "fr", "es", "pt", "nl"] as const;

export interface SEONode {
  id: string;
  type: SEONodeType;
  label: string;
  children: SEONode[];
  data: Record<string, unknown>;
}

/* ── Data shapes per tipo nodo ── */

export interface ClusterData {
  description: string;
  lingua: string;
  paese: string;
  obiettivo_seo: string;
  obiettivo_business: string;
  stato: string;
  priorita: string;
  owner: string;
  note: string;
}

export interface ContentData {
  url: string;
  keyword_primaria: string;
  volume: number | null;
  keyword_secondarie: string;
  lingua: string;
  intent: string;
  funnel_stage: string;
  stato: string;
  owner: string;
  deadline: string;
  data_pub: string;
  meta_title: string;
  meta_desc: string;
  h1: string;
  outline: string;
  brief: string;
  cta: string;
  link_pillar: string;
  competitor_serp: string;
  note: string;
}

export interface KeywordData {
  volume: number | null;
  difficolta: number | null;
  cpc: number | null;
  intent: string;
  funnel_stage: string;
  priorita: string;
  tipo: string;
  varianti: string;
  note_serp: string;
  lingua: string;
  paese: string;
}

/* ── Factory functions ── */

export function emptyNode(type: SEONodeType, label = ""): SEONode {
  return {
    id: crypto.randomUUID(),
    type,
    label: label || SEO_NODE_LABELS[type],
    children: [],
    data: emptyDataFor(type),
  };
}

function emptyDataFor(type: SEONodeType): Record<string, unknown> {
  switch (type) {
    case "project":
      return { description: "", lingua: "it", paese: "IT" };
    case "cluster":
      return {
        description: "", lingua: "it", paese: "IT",
        obiettivo_seo: "", obiettivo_business: "",
        stato: "idea", priorita: "media", owner: "", note: "",
      } satisfies ClusterData;
    case "pillar":
    case "supporting":
      return {
        url: "", keyword_primaria: "", volume: null,
        keyword_secondarie: "", lingua: "it", intent: "informativo",
        funnel_stage: "TOFU", stato: "idea", owner: "", deadline: "",
        data_pub: "", meta_title: "", meta_desc: "", h1: "",
        outline: "", brief: "", cta: "", link_pillar: "",
        competitor_serp: "", note: "",
      } satisfies ContentData;
    case "keyword":
      return {
        volume: null, difficolta: null, cpc: null,
        intent: "informativo", funnel_stage: "TOFU",
        priorita: "media", tipo: "primaria", varianti: "",
        note_serp: "", lingua: "it", paese: "IT",
      } satisfies KeywordData;
  }
}

export function emptyProject(): SEONode {
  return emptyNode("project", "Nuovo Progetto SEO");
}

/* ── Allowed children per type ── */

const ALLOWED_CHILDREN: Record<SEONodeType, SEONodeType[]> = {
  project: ["cluster"],
  cluster: ["pillar", "supporting", "keyword"],
  pillar: ["keyword"],
  supporting: ["keyword"],
  keyword: [],
};

export function canAddChild(parentType: SEONodeType): SEONodeType[] {
  return ALLOWED_CHILDREN[parentType];
}

/* ── Tree operations (immutable) ── */

export function updateNodeInTree(root: SEONode, nodeId: string, patch: Partial<SEONode>): SEONode {
  if (root.id === nodeId) return { ...root, ...patch };
  return {
    ...root,
    children: root.children.map((c) => updateNodeInTree(c, nodeId, patch)),
  };
}

export function updateNodeData(root: SEONode, nodeId: string, dataPatch: Record<string, unknown>): SEONode {
  if (root.id === nodeId) return { ...root, data: { ...root.data, ...dataPatch } };
  return {
    ...root,
    children: root.children.map((c) => updateNodeData(c, nodeId, dataPatch)),
  };
}

export function addChildToNode(root: SEONode, parentId: string, child: SEONode): SEONode {
  if (root.id === parentId) return { ...root, children: [...root.children, child] };
  return {
    ...root,
    children: root.children.map((c) => addChildToNode(c, parentId, child)),
  };
}

export function removeNodeFromTree(root: SEONode, nodeId: string): SEONode {
  return {
    ...root,
    children: root.children
      .filter((c) => c.id !== nodeId)
      .map((c) => removeNodeFromTree(c, nodeId)),
  };
}

export function moveNodeInChildren(root: SEONode, nodeId: string, dir: -1 | 1): SEONode {
  const idx = root.children.findIndex((c) => c.id === nodeId);
  if (idx >= 0) {
    const target = idx + dir;
    if (target >= 0 && target < root.children.length) {
      const next = [...root.children];
      [next[idx], next[target]] = [next[target], next[idx]];
      return { ...root, children: next };
    }
    return root;
  }
  return {
    ...root,
    children: root.children.map((c) => moveNodeInChildren(c, nodeId, dir)),
  };
}

export function findNode(root: SEONode, nodeId: string): SEONode | null {
  if (root.id === nodeId) return root;
  for (const c of root.children) {
    const found = findNode(c, nodeId);
    if (found) return found;
  }
  return null;
}

export function findParent(root: SEONode, nodeId: string): SEONode | null {
  for (const c of root.children) {
    if (c.id === nodeId) return root;
    const found = findParent(c, nodeId);
    if (found) return found;
  }
  return null;
}

/* ── Aggregate stats ── */

export function countByType(node: SEONode, type: SEONodeType): number {
  let count = node.type === type ? 1 : 0;
  for (const c of node.children) count += countByType(c, type);
  return count;
}

export function totalVolume(node: SEONode): number {
  let vol = 0;
  if (node.type === "keyword") vol += (node.data.volume as number) || 0;
  if (node.type === "pillar" || node.type === "supporting") vol += (node.data.volume as number) || 0;
  for (const c of node.children) vol += totalVolume(c);
  return vol;
}

export function avgDifficulty(node: SEONode): number | null {
  const diffs: number[] = [];
  function collect(n: SEONode) {
    if (n.type === "keyword" && n.data.difficolta != null) diffs.push(n.data.difficolta as number);
    n.children.forEach(collect);
  }
  collect(node);
  if (diffs.length === 0) return null;
  return Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length);
}

export function clusterCoverage(node: SEONode): number {
  if (node.type !== "cluster") return 0;
  const contents = flattenByType(node, ["pillar", "supporting"]);
  if (contents.length === 0) return 0;
  const published = contents.filter((c) => c.data.stato === "pubblicato").length;
  return Math.round((published / contents.length) * 100);
}

export function flattenByType(node: SEONode, types: SEONodeType[]): SEONode[] {
  const result: SEONode[] = [];
  function walk(n: SEONode) {
    if (types.includes(n.type)) result.push(n);
    n.children.forEach(walk);
  }
  walk(node);
  return result;
}

export function flattenAll(node: SEONode): SEONode[] {
  const result: SEONode[] = [node];
  for (const c of node.children) result.push(...flattenAll(c));
  return result;
}

/* ── Warnings ── */

export interface SEOWarning {
  nodeId: string;
  type: string;
  message: string;
}

export function computeWarnings(root: SEONode): SEOWarning[] {
  const warnings: SEOWarning[] = [];
  const allNodes = flattenAll(root);

  // Check duplicate primary keywords
  const kwMap = new Map<string, string[]>();
  for (const n of allNodes) {
    if ((n.type === "pillar" || n.type === "supporting") && n.data.keyword_primaria) {
      const kw = (n.data.keyword_primaria as string).toLowerCase().trim();
      if (!kwMap.has(kw)) kwMap.set(kw, []);
      kwMap.get(kw)!.push(n.id);
    }
  }
  for (const [kw, ids] of kwMap) {
    if (ids.length > 1) {
      ids.forEach((id) =>
        warnings.push({ nodeId: id, type: "cannibalizzazione", message: `Keyword primaria "${kw}" usata da ${ids.length} contenuti` })
      );
    }
  }

  // Check contents without pillar link
  for (const n of allNodes) {
    if (n.type === "supporting" && !n.data.link_pillar) {
      warnings.push({ nodeId: n.id, type: "no_link_pillar", message: "Nessun link verso la pillar page" });
    }
  }

  // Check clusters without pillar
  for (const n of allNodes) {
    if (n.type === "cluster") {
      const hasPillar = n.children.some((c) => c.type === "pillar");
      if (!hasPillar) {
        warnings.push({ nodeId: n.id, type: "no_pillar", message: "Cluster senza pillar page" });
      }
    }
  }

  // Check keywords without content
  for (const n of allNodes) {
    if (n.type === "keyword") {
      const parent = findParent(root, n.id);
      if (parent && parent.type === "cluster") {
        warnings.push({ nodeId: n.id, type: "kw_orfana", message: "Keyword non associata a un contenuto" });
      }
    }
  }

  // Check high volume without content
  for (const n of allNodes) {
    if (n.type === "keyword" && (n.data.volume as number) > 1000) {
      const parent = findParent(root, n.id);
      if (parent && parent.type === "cluster") {
        warnings.push({ nodeId: n.id, type: "volume_no_content", message: "Volume alto ma nessun contenuto pianificato" });
      }
    }
  }

  return warnings;
}

/* ── Scoring ── */

export function scoreOpportunita(node: SEONode): number {
  if (node.type !== "pillar" && node.type !== "supporting") return 0;
  const vol = (node.data.volume as number) || 0;
  const diff = avgDifficulty(node) ?? 50;
  const intentMultiplier = node.data.intent === "transazionale" ? 1.5
    : node.data.intent === "commerciale" ? 1.3
    : node.data.intent === "informativo" ? 0.8
    : 1;
  return Math.round(vol * (1 - diff / 100) * intentMultiplier);
}

export function healthScore(cluster: SEONode): number {
  if (cluster.type !== "cluster") return 0;
  const coverage = clusterCoverage(cluster);
  const hasPillar = cluster.children.some((c) => c.type === "pillar") ? 100 : 0;
  const contents = flattenByType(cluster, ["pillar", "supporting"]);
  const withLinks = contents.filter((c) => c.type === "pillar" || c.data.link_pillar).length;
  const linkScore = contents.length > 0 ? (withLinks / contents.length) * 100 : 0;
  return Math.round((coverage * 0.4 + hasPillar * 0.3 + linkScore * 0.3));
}

/* ── CSV Import ── */

export function parseKeywordCSV(csv: string): SEONode[] {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return [];

  const header = lines[0].toLowerCase().split(/[,;\t]/);
  const kwIdx = header.findIndex((h) => h.includes("keyword") || h.includes("kw"));
  const volIdx = header.findIndex((h) => h.includes("volume") || h.includes("vol"));
  const diffIdx = header.findIndex((h) => h.includes("difficolt") || h.includes("difficulty") || h.includes("kd"));
  const cpcIdx = header.findIndex((h) => h.includes("cpc"));
  const intentIdx = header.findIndex((h) => h.includes("intent"));

  if (kwIdx === -1) return [];

  return lines.slice(1).filter((l) => l.trim()).map((line) => {
    const cols = line.split(/[,;\t]/);
    const node = emptyNode("keyword", cols[kwIdx]?.trim() || "");
    if (volIdx >= 0) node.data.volume = parseInt(cols[volIdx]) || null;
    if (diffIdx >= 0) node.data.difficolta = parseInt(cols[diffIdx]) || null;
    if (cpcIdx >= 0) node.data.cpc = parseFloat(cols[cpcIdx]) || null;
    if (intentIdx >= 0) node.data.intent = cols[intentIdx]?.trim() || "informativo";
    return node;
  });
}

/* ── Mock data ── */

export function getMockSEOProject(): SEONode {
  const kw1 = emptyNode("keyword", "infissi in pvc");
  kw1.data = { ...kw1.data, volume: 8100, difficolta: 45, cpc: 1.2, tipo: "primaria", intent: "commerciale" };
  const kw2 = emptyNode("keyword", "finestre pvc prezzi");
  kw2.data = { ...kw2.data, volume: 4000, difficolta: 38, cpc: 0.9, tipo: "secondaria", intent: "transazionale" };
  const kw3 = emptyNode("keyword", "infissi pvc o alluminio");
  kw3.data = { ...kw3.data, volume: 2800, difficolta: 32, cpc: 0.7, tipo: "primaria", intent: "informativo" };

  const pillar = emptyNode("pillar", "Guida completa agli infissi in PVC");
  pillar.data = { ...pillar.data, keyword_primaria: "infissi in pvc", volume: 8100, stato: "pubblicato", url: "/guida-infissi-pvc", intent: "commerciale", funnel_stage: "MOFU" };
  pillar.children = [kw1, kw2];

  const supp1 = emptyNode("supporting", "Come scegliere infissi in PVC");
  supp1.data = { ...supp1.data, keyword_primaria: "come scegliere infissi", volume: 3200, stato: "in_scrittura", intent: "informativo", funnel_stage: "TOFU", link_pillar: "/guida-infissi-pvc" };

  const supp2 = emptyNode("supporting", "Infissi PVC vs Alluminio");
  supp2.data = { ...supp2.data, keyword_primaria: "infissi pvc vs alluminio", volume: 2800, stato: "idea", intent: "informativo", funnel_stage: "TOFU" };
  supp2.children = [kw3];

  const cluster1 = emptyNode("cluster", "Infissi in PVC");
  cluster1.data = { ...cluster1.data, lingua: "it", paese: "IT", obiettivo_seo: "Posizionamento top 3", obiettivo_business: "Lead generation serramenti", stato: "idea", priorita: "alta" };
  cluster1.children = [pillar, supp1, supp2];

  const project = emptyNode("project", "SEO Serramenti");
  project.data = { ...project.data, lingua: "it", paese: "IT", description: "Progetto SEO per il sito serramenti" };
  project.children = [cluster1];

  return project;
}
