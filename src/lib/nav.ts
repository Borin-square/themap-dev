export interface NavItem {
  id: string;
  label: string;
  href?: string;
  color?: string;
  children?: NavItem[];
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
  { id: "operative", label: "Operative", children: [] },
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
