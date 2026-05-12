export type Ruolo = "ADMIN" | "OPERATIVO";

export interface AccessEntry {
  email: string;
  nome: string;
  ruolo: Ruolo;
  funzione: string;
  aziende: string; // "*" = tutte, oppure comma-separated slugs
}

const STORAGE_KEY = "themap_session";

/* Mock access list */
const DEFAULT_ACCESS: AccessEntry[] = [
  { email: "admin@themap.it", nome: "Nicholas Borin", ruolo: "ADMIN", funzione: "DIREZIONE", aziende: "*" },
  { email: "marco@acme.com", nome: "Marco Rossi", ruolo: "OPERATIVO", funzione: "OPERATION", aziende: "acme" },
  { email: "anna@beta.com", nome: "Anna Bianchi", ruolo: "OPERATIVO", funzione: "SALES", aziende: "beta" },
  { email: "luca@gamma.com", nome: "Luca Verdi", ruolo: "OPERATIVO", funzione: "MARKETING", aziende: "acme,gamma" },
];

/* Persist access list in localStorage so CRUD survives page reloads */
function getStoredAccess(): AccessEntry[] {
  if (typeof window === "undefined") return DEFAULT_ACCESS;
  try {
    const raw = localStorage.getItem("themap_access");
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return DEFAULT_ACCESS;
}

function setStoredAccess(list: AccessEntry[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem("themap_access", JSON.stringify(list));
}

export function getAccessList(): AccessEntry[] {
  return getStoredAccess();
}

export function addAccess(entry: AccessEntry) {
  const list = getStoredAccess();
  if (list.some((u) => u.email.toLowerCase() === entry.email.toLowerCase())) {
    throw new Error("Utente già presente");
  }
  list.push(entry);
  setStoredAccess(list);
}

export function updateAccess(oldEmail: string, entry: AccessEntry) {
  const list = getStoredAccess();
  const idx = list.findIndex((u) => u.email.toLowerCase() === oldEmail.toLowerCase());
  if (idx === -1) throw new Error("Utente non trovato");
  list[idx] = entry;
  setStoredAccess(list);
}

export function deleteAccess(email: string) {
  const list = getStoredAccess();
  const filtered = list.filter((u) => u.email.toLowerCase() !== email.toLowerCase());
  if (filtered.length === list.length) throw new Error("Utente non trovato");
  setStoredAccess(filtered);
}

/* Session */
export interface Session {
  email: string;
  nome: string;
  ruolo: Ruolo;
  funzione: string;
  aziende: string;
}

export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

export function login(email: string): Session | null {
  const list = getStoredAccess();
  const user = list.find((u) => u.email.toLowerCase() === email.toLowerCase().trim());
  if (!user) return null;
  const session: Session = {
    email: user.email,
    nome: user.nome,
    ruolo: user.ruolo,
    funzione: user.funzione,
    aziende: user.aziende,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  return session;
}

export function logout() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
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
