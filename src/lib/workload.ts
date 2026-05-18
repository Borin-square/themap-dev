import { type Company } from "./companies";
import { type Persona, getMockPeopleForCompany } from "./people";
import { dataVersion } from "./square-marketing-data";

export const WL_MAX_EFFORT = 5;

export const WL_LIVELLI = [
  "AUTONOMO",
  "MANAGER DA SUPPORTARE",
  "SUPPORTA MANAGER",
  "FUNZIONE DA DELEGARE",
  "RESPONSABILITA' DIRETTA",
] as const;

export const WL_FUNZIONI = ["MARKETING", "SALES", "OPERATION", "DIREZIONE", "AMMINISTRAZIONE"] as const;

export interface Mission {
  id: string;
  persona: string;
  azienda: string; // company slug
  funzione: string;
  livello: string;
  effort: number; // days/week (0-5)
}

export interface PersonCard {
  name: string;
  total: number;
  entries: Mission[];
  isFounder: boolean;
}

export function effortColor(total: number): string {
  if (total > 5) return "#ef4444";
  if (total > 4) return "#eab308";
  return "#22c55e";
}

export function companyColor(slug: string, companies: Company[]): string {
  return companies.find((c) => c.slug === slug)?.color || "var(--fg2)";
}

export function groupByPerson(missions: Mission[], founders: string[]): PersonCard[] {
  const map: Record<string, PersonCard> = {};
  missions.forEach((m) => {
    if (!map[m.persona]) {
      map[m.persona] = { name: m.persona, total: 0, entries: [], isFounder: founders.includes(m.persona) };
    }
    map[m.persona].entries.push(m);
    map[m.persona].total += m.effort;
  });
  return Object.values(map).sort((a, b) => b.total - a.total);
}

export function emptyMission(): Mission {
  return { id: crypto.randomUUID(), persona: "", azienda: "", funzione: "OPERATION", livello: "", effort: 0 };
}

/* ── Mock data ── */

export function getMockMissions(): Mission[] {
  let i = 0;
  const m = (persona: string, azienda: string, funzione: string, livello: string, effort: number): Mission => ({
    id: `wl-${++i}`, persona, azienda, funzione, livello, effort,
  });

  return [
    // Founders — cross-company
    m("Borin Nicholas", "square-marketing", "DIREZIONE", "AUTONOMO", 2),
    m("Borin Nicholas", "acme", "DIREZIONE", "RESPONSABILITA' DIRETTA", 1.5),
    m("Borin Nicholas", "beta", "DIREZIONE", "FUNZIONE DA DELEGARE", 1),
    m("Edoardo Rossignoli", "square-marketing", "DIREZIONE", "AUTONOMO", 2.5),
    m("Edoardo Rossignoli", "acme", "DIREZIONE", "MANAGER DA SUPPORTARE", 1),
    m("Edoardo Rossignoli", "gamma", "DIREZIONE", "FUNZIONE DA DELEGARE", 1),
    m("Giovanni Bergamini", "square-marketing", "DIREZIONE", "AUTONOMO", 2),
    m("Giovanni Bergamini", "beta", "DIREZIONE", "RESPONSABILITA' DIRETTA", 1.5),
    m("Giovanni Bergamini", "gamma", "DIREZIONE", "MANAGER DA SUPPORTARE", 1),

    // Square Marketing people
    m("Federico Montresor", "square-marketing", "OPERATION", "AUTONOMO", 4),
    m("Federico Montresor", "acme", "OPERATION", "SUPPORTA MANAGER", 1),
    m("Michele Buoso", "square-marketing", "OPERATION", "AUTONOMO", 4.5),
    m("Giovanni Solimeno", "square-marketing", "OPERATION", "AUTONOMO", 4),
    m("Giovanni Solimeno", "beta", "OPERATION", "MANAGER DA SUPPORTARE", 1),
    m("Fabio Zanoncello", "square-marketing", "SALES", "AUTONOMO", 4),
    m("Fabio Zanoncello", "acme", "SALES", "FUNZIONE DA DELEGARE", 1),
    m("Nicola Ferrari", "square-marketing", "MARKETING", "AUTONOMO", 4.5),
    m("Alessandra Marafetti", "square-marketing", "OPERATION", "MANAGER DA SUPPORTARE", 4),
    m("Nicholas Ferrari", "square-marketing", "OPERATION", "SUPPORTA MANAGER", 4),
    m("Silvia Cenci", "square-marketing", "OPERATION", "AUTONOMO", 4),
    m("Manuel Sgrazzutti", "square-marketing", "OPERATION", "SUPPORTA MANAGER", 4),
    m("Rebecca Mantoanello", "square-marketing", "OPERATION", "MANAGER DA SUPPORTARE", 4),
    m("Davide Zago", "square-marketing", "AMMINISTRAZIONE", "AUTONOMO", 4),
    m("Sara Crepaldi", "square-marketing", "SALES", "SUPPORTA MANAGER", 4),
    m("Stefano Rizzo", "square-marketing", "OPERATION", "SUPPORTA MANAGER", 4),
    m("Alice Martelloni", "square-marketing", "OPERATION", "MANAGER DA SUPPORTARE", 4),

    // Acme people
    m("Marco Rossi", "acme", "DIREZIONE", "AUTONOMO", 5),
    m("Giuseppe Verdi", "acme", "OPERATION", "AUTONOMO", 4),
    m("Roberto Sala", "acme", "SALES", "AUTONOMO", 4.5),
    m("Silvia Rizzo", "acme", "MARKETING", "AUTONOMO", 4),
    m("Giulia Fontana", "acme", "AMMINISTRAZIONE", "AUTONOMO", 4),
  ];
}

export const DEFAULT_FOUNDERS = ["Borin Nicholas", "Edoardo Rossignoli", "Giovanni Bergamini"];

/** Read leader names from localStorage across all companies (fallback: mock data) */
export function getLeaderNames(companies: Company[]): Set<string> {
  const leaders = new Set<string>();
  if (typeof window === "undefined") return leaders;
  for (const c of companies) {
    const v = dataVersion(c.slug);
    const key = v != null ? `themap:${c.slug}:people:v${v}` : `themap:${c.slug}:people`;
    let people: Persona[] | null = null;
    try {
      const raw = localStorage.getItem(key);
      if (raw) people = JSON.parse(raw);
    } catch { /* ignore */ }
    if (!people) people = getMockPeopleForCompany(c.slug);
    people.forEach((p) => { if (p.leader) leaders.add(p.nome); });
  }
  return leaders;
}
