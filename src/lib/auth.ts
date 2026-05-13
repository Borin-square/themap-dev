export type Ruolo = "ADMIN" | "OPERATIVO";

export interface UserProfile {
  id: string;
  email: string;
  nome: string;
  ruolo: Ruolo;
  funzione: string;
  aziende: string; // "*" = tutte, oppure comma-separated slugs
}

export interface Session {
  email: string;
  nome: string;
  ruolo: Ruolo;
  funzione: string;
  aziende: string;
}

/* Visibility helpers */
export function getAllowedSlugs(session: Session | null): string[] | "*" {
  if (!session) return [];
  if (session.ruolo === "ADMIN" || session.aziende === "*") return "*";
  return session.aziende.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export function canAccessCompany(session: Session | null, slug: string): boolean {
  const allowed = getAllowedSlugs(session);
  if (allowed === "*") return true;
  return allowed.includes(slug.toLowerCase());
}

export function isAdmin(session: Session | null): boolean {
  return session?.ruolo === "ADMIN";
}
