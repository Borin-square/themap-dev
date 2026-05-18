export interface PersonaAnno {
  capSett: number | null;
  mesiEff: number | null;
  costoOra: number | null;
  ral: number | null;
}

export interface Persona {
  nome: string;
  azienda: string;
  funzione: string;
  livello: string;
  contratto: string;
  team: string;
  leader: boolean;
  anni: Record<number, PersonaAnno>;
}

export const PE_FUNZIONI = ["OPERATION", "SALES", "MARKETING", "AMMINISTRAZIONE", "DIREZIONE"] as const;
export const PE_LIVELLI = ["SENIOR", "MIDDLE", "JUNIOR"] as const;
export const PE_CONTRATTI = ["DIPENDENTE", "FREELANCE"] as const;

const FN_COLORS: Record<string, string> = {
  OPERATION: "#f59e0b",
  SALES: "#22c55e",
  MARKETING: "#a855f7",
  AMMINISTRAZIONE: "#ec4899",
  DIREZIONE: "#06b6d4",
};

export function peFnColor(fn: string): string {
  return FN_COLORS[fn] || "#6b7280";
}

export function peLvlClass(lvl: string): string {
  if (lvl === "SENIOR") return "pe-lvl-sr";
  if (lvl === "JUNIOR") return "pe-lvl-jr";
  return "pe-lvl-mid";
}

export function peLvlColor(lvl: string): string {
  if (lvl === "SENIOR") return "#4f8cff";
  if (lvl === "JUNIOR") return "#34d399";
  return "#9ca3af";
}

export function peLvlFilter(fn: string, lvl: string): string {
  const f = fn.toUpperCase();
  if (f === "DIREZIONE") return "og-dir";
  if (f === "AMMINISTRAZIONE") return "og-amm";
  if (lvl === "SENIOR") return "og-senior";
  if (lvl === "JUNIOR") return "og-junior";
  return "og-middle";
}

export function peInitials(nome: string): string {
  const p = nome.trim().split(/\s+/);
  if (p.length >= 2) return (p[0][0] + p[p.length - 1][0]).toUpperCase();
  return nome.substring(0, 2).toUpperCase();
}

/* Org chart constants */
export const OG_SEGS = [
  { key: "MARKETING", color: "#a855f7", bg: "rgba(168,85,247,.08)" },
  { key: "SALES", color: "#22c55e", bg: "rgba(34,197,94,.08)" },
  { key: "AMMINISTRAZIONE", color: "#ec4899", bg: "rgba(236,72,153,.08)" },
  { key: "OPERATION", color: "#f59e0b", bg: "rgba(245,158,11,.08)" },
];
export const OG_IR = 185, OG_OR = 310, OG_MR = 248, OG_SR = 365, OG_LR = 405;
export const OG_GAP = 10, OG_PAD = 16;
export const OG_LDR = 30, OG_MDR = 14;
export const OG_MIN_A = 30;

/* Mock data — company-aware */
import { getSquarePeople } from "./square-marketing-data";

export function getMockPeopleForCompany(slug: string): Persona[] {
  if (slug === "square-marketing") return getSquarePeople();
  return getMockPeople();
}

export function getMockPeople(): Persona[] {
  return [
    { nome: "Marco Rossi", azienda: "ACME", funzione: "DIREZIONE", livello: "SENIOR", contratto: "DIPENDENTE", team: "DIREZIONE", leader: true, anni: { 2026: { capSett: 40, mesiEff: 12, costoOra: null, ral: 85000 } } },
    { nome: "Laura Bianchi", azienda: "ACME", funzione: "DIREZIONE", livello: "SENIOR", contratto: "DIPENDENTE", team: "DIREZIONE", leader: false, anni: { 2026: { capSett: 40, mesiEff: 12, costoOra: null, ral: 72000 } } },
    { nome: "Giuseppe Verdi", azienda: "ACME", funzione: "OPERATION", livello: "SENIOR", contratto: "DIPENDENTE", team: "Operations Core", leader: true, anni: { 2026: { capSett: 40, mesiEff: 12, costoOra: null, ral: 52000 } } },
    { nome: "Anna Neri", azienda: "ACME", funzione: "OPERATION", livello: "MIDDLE", contratto: "DIPENDENTE", team: "Operations Core", leader: false, anni: { 2026: { capSett: 38, mesiEff: 11, costoOra: null, ral: 35000 } } },
    { nome: "Paolo Gialli", azienda: "ACME", funzione: "OPERATION", livello: "JUNIOR", contratto: "DIPENDENTE", team: "Operations Core", leader: false, anni: { 2026: { capSett: 40, mesiEff: 10, costoOra: null, ral: 26000 } } },
    { nome: "Elena Conti", azienda: "ACME", funzione: "OPERATION", livello: "MIDDLE", contratto: "FREELANCE", team: "Support", leader: true, anni: { 2026: { capSett: 24, mesiEff: 10, costoOra: 35, ral: null } } },
    { nome: "Davide Ferri", azienda: "ACME", funzione: "OPERATION", livello: "JUNIOR", contratto: "FREELANCE", team: "Support", leader: false, anni: { 2026: { capSett: 20, mesiEff: 8, costoOra: 25, ral: null } } },
    { nome: "Roberto Sala", azienda: "ACME", funzione: "SALES", livello: "SENIOR", contratto: "DIPENDENTE", team: "Sales", leader: true, anni: { 2026: { capSett: 40, mesiEff: 12, costoOra: null, ral: 55000 } } },
    { nome: "Chiara Monti", azienda: "ACME", funzione: "SALES", livello: "MIDDLE", contratto: "DIPENDENTE", team: "Sales", leader: false, anni: { 2026: { capSett: 40, mesiEff: 11, costoOra: null, ral: 38000 } } },
    { nome: "Luca Barbieri", azienda: "ACME", funzione: "SALES", livello: "JUNIOR", contratto: "DIPENDENTE", team: "Sales", leader: false, anni: { 2026: { capSett: 38, mesiEff: 10, costoOra: null, ral: 28000 } } },
    { nome: "Silvia Rizzo", azienda: "ACME", funzione: "MARKETING", livello: "SENIOR", contratto: "DIPENDENTE", team: "Digital", leader: true, anni: { 2026: { capSett: 40, mesiEff: 12, costoOra: null, ral: 50000 } } },
    { nome: "Federico Gallo", azienda: "ACME", funzione: "MARKETING", livello: "MIDDLE", contratto: "FREELANCE", team: "Digital", leader: false, anni: { 2026: { capSett: 30, mesiEff: 10, costoOra: 40, ral: null } } },
    { nome: "Valentina Costa", azienda: "ACME", funzione: "MARKETING", livello: "JUNIOR", contratto: "DIPENDENTE", team: "Content", leader: false, anni: { 2026: { capSett: 40, mesiEff: 11, costoOra: null, ral: 27000 } } },
    { nome: "Giulia Fontana", azienda: "ACME", funzione: "AMMINISTRAZIONE", livello: "SENIOR", contratto: "DIPENDENTE", team: "Admin", leader: true, anni: { 2026: { capSett: 40, mesiEff: 12, costoOra: null, ral: 45000 } } },
    { nome: "Matteo Leone", azienda: "ACME", funzione: "AMMINISTRAZIONE", livello: "MIDDLE", contratto: "DIPENDENTE", team: "Admin", leader: false, anni: { 2026: { capSett: 36, mesiEff: 11, costoOra: null, ral: 32000 } } },
  ];
}
