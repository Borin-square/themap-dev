const KEY = "themap:visitHistory";
const MAX_ITEMS = 20;

export interface Visit {
  href: string;
  label: string;
  sub?: string;
  accent?: string;
  at: number; // epoch ms
}

export function pushVisit(v: Omit<Visit, "at">) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(KEY);
    const list: Visit[] = raw ? JSON.parse(raw) : [];
    // Rimuovi eventuale duplicato dello stesso href, poi metti in testa
    const filtered = list.filter((x) => x.href !== v.href);
    filtered.unshift({ ...v, at: Date.now() });
    localStorage.setItem(KEY, JSON.stringify(filtered.slice(0, MAX_ITEMS)));
  } catch { /* localStorage pieno o disabilitato — ignora */ }
}

export function readVisits(limit = 8): Visit[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    const list: Visit[] = raw ? JSON.parse(raw) : [];
    return list.slice(0, limit);
  } catch { return []; }
}

export function clearVisits() {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(KEY); } catch {}
}
