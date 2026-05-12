import { COMPANIES } from "./companies";

export interface NavItem {
  id: string;
  label: string;
  href?: string;
  color?: string;
  children?: NavItem[];
}

function buildOperativeNav(): NavItem[] {
  return COMPANIES.map((c) => ({
    id: c.slug,
    label: c.name,
    color: c.color,
    children: [
      {
        id: `${c.slug}-strategy`,
        label: "STRATEGY",
        children: [
          {
            id: `${c.slug}-fw`,
            label: "Flywheel",
            children: [
              { id: `${c.slug}-fw-ov`, label: "Overview", href: `/${c.slug}/flywheel` },
              { id: `${c.slug}-fw-su`, label: "Setup", href: `/${c.slug}/flywheel/setup` },
              { id: `${c.slug}-fw-re`, label: "Consuntivo", href: `/${c.slug}/flywheel/real` },
            ],
          },
          {
            id: `${c.slug}-ee`,
            label: "Economic Engine",
            children: [
              { id: `${c.slug}-ee-pg`, label: "Playground", href: `/${c.slug}/economic-engine` },
              { id: `${c.slug}-ee-fc`, label: "Forecast", href: `/${c.slug}/economic-engine/forecast` },
              { id: `${c.slug}-ee-re`, label: "Consuntivo", href: `/${c.slug}/economic-engine/real` },
              { id: `${c.slug}-ee-ckm`, label: "Cycle Key Metrics", href: `/${c.slug}/economic-engine/ckm` },
            ],
          },
        ],
      },
      {
        id: `${c.slug}-org`,
        label: "Organization",
        children: [
          { id: `${c.slug}-pe`, label: "People", href: `/${c.slug}/people` },
          { id: `${c.slug}-orgchart`, label: "Organigramma", href: `/${c.slug}/people/organization` },
          { id: `${c.slug}-rituals`, label: "Rituals", href: `/${c.slug}/people/rituals` },
        ],
      },
    ],
  }));
}

export const NAV: NavItem[] = [
  { id: "home", label: "Home", href: "/" },
  {
    id: "holding",
    label: "Holding",
    children: [
      { id: "overview", label: "Overview", href: "/holding/overview" },
      { id: "vision", label: "Vision", href: "/holding/vision" },
      { id: "workload", label: "Workload", href: "/holding/workload" },
      { id: "tasks", label: "Task Manager", href: "/holding/tasks" },
    ],
  },
  { id: "operative", label: "Operative", children: buildOperativeNav() },
];

export const FOOTER_NAV: NavItem[] = [
  { id: "library", label: "Library", href: "/library" },
  { id: "settings", label: "Settings", href: "/settings" },
];

export function flatNav(
  items: NavItem[],
  parents: string[] = []
): { id: string; label: string; path: string; href: string }[] {
  const result: { id: string; label: string; path: string; href: string }[] = [];
  for (const it of items) {
    const p = [...parents, it.label];
    if (it.href) {
      result.push({ id: it.id, label: it.label, path: p.join(" / "), href: it.href });
    }
    if (it.children) {
      result.push(...flatNav(it.children, p));
    }
  }
  return result;
}

export function getPath(
  items: NavItem[],
  href: string,
  path: NavItem[] = []
): NavItem[] | null {
  for (const it of items) {
    const np = [...path, it];
    if (it.href === href) return np;
    if (it.children) {
      const f = getPath(it.children, href, np);
      if (f) return f;
    }
  }
  return null;
}
