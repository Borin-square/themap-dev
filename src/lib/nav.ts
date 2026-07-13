import type { Company } from "./companies";
import { type DisabledFeatures, isFeatureEnabled } from "./features";

export interface NavItem {
  id: string;
  label: string;
  href?: string;
  color?: string;
  featureKey?: string;
  children?: NavItem[];
}

export function buildOperativeNav(companies: Company[]): NavItem[] {
  return companies.map((c) => ({
    id: c.slug,
    label: c.name,
    color: c.color,
    children: [
      {
        id: `${c.slug}-strategy`,
        label: "Strategy",
        children: [
          {
            id: `${c.slug}-fw`,
            label: "Flywheel",
            featureKey: "strategy.flywheel",
            children: [
              { id: `${c.slug}-fw-ov`, label: "Overview", href: `/${c.slug}/flywheel` },
              { id: `${c.slug}-fw-su`, label: "Setup", href: `/${c.slug}/flywheel/setup` },
              { id: `${c.slug}-fw-re`, label: "Consuntivo", href: `/${c.slug}/flywheel/real` },
            ],
          },
          {
            id: `${c.slug}-ee`,
            label: "Economic Engine",
            featureKey: "strategy.economic-engine",
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
        id: `${c.slug}-mktg`,
        label: "Marketing",
        children: [
          { id: `${c.slug}-mktg-camp`, label: "Campaign Manager", featureKey: "marketing.campaigns", href: `/${c.slug}/marketing` },
          { id: `${c.slug}-mktg-strat`, label: "Strategy", featureKey: "marketing.strategy", href: `/${c.slug}/marketing/strategy` },
          { id: `${c.slug}-mktg-brand`, label: "Brand Asset", featureKey: "marketing.brand-asset", href: `/${c.slug}/marketing/brand-asset` },
          { id: `${c.slug}-mktg-seo`, label: "SEO Cluster", featureKey: "marketing.seo-cluster", href: `/${c.slug}/marketing/seo-cluster` },
          { id: `${c.slug}-mktg-geo`, label: "GEO Tool", featureKey: "marketing.geo-tool", href: `/${c.slug}/marketing/geo-tool` },
          { id: `${c.slug}-mktg-pg`, label: "Page Generator", featureKey: "marketing.page-generator", href: `/${c.slug}/marketing/page-generator` },
          {
            id: `${c.slug}-mktg-fw`,
            label: "Flywheel",
            featureKey: "marketing.flywheel",
            children: [
              { id: `${c.slug}-mktg-fw-ov`, label: "Overview", href: `/${c.slug}/marketing/flywheel` },
              { id: `${c.slug}-mktg-fw-su`, label: "Setup", href: `/${c.slug}/marketing/flywheel/setup` },
              { id: `${c.slug}-mktg-fw-re`, label: "Consuntivo", href: `/${c.slug}/marketing/flywheel/real` },
            ],
          },
        ],
      },
      {
        id: `${c.slug}-org`,
        label: "Organization",
        children: [
          { id: `${c.slug}-pe`, label: "People", featureKey: "organization.people", href: `/${c.slug}/people` },
          { id: `${c.slug}-orgchart`, label: "Organigramma", featureKey: "organization.organigramma", href: `/${c.slug}/people/organization` },
          { id: `${c.slug}-rituals`, label: "Rituals", featureKey: "organization.rituals", href: `/${c.slug}/people/rituals` },
          { id: `${c.slug}-tools`, label: "Tools", featureKey: "organization.tools", href: `/${c.slug}/organization/tools` },
          { id: `${c.slug}-mcp`, label: "MCP", featureKey: "organization.mcp", href: `/${c.slug}/organization/mcp` },
        ],
      },
    ],
  }));
}

/** Filtra i nav items in base alle feature flags. I company slug sono estratti dal contesto nav. */
export function filterNavByFeatures(items: NavItem[], disabled: DisabledFeatures, companySlug?: string): NavItem[] {
  return items.reduce<NavItem[]>((acc, item) => {
    // Determina il company slug: se l'item è una company root (ha color), usa il suo id
    const slug = item.color ? item.id : companySlug;

    // Se l'item ha una featureKey e la feature è disabilitata, skip
    if (item.featureKey && slug && !isFeatureEnabled(disabled, slug, item.featureKey)) {
      return acc;
    }

    // Filtra ricorsivamente i children
    if (item.children) {
      const filteredChildren = filterNavByFeatures(item.children, disabled, slug);
      // Se aveva children ma ora sono tutti filtrati, nascondi il parent
      if (filteredChildren.length === 0) return acc;
      acc.push({ ...item, children: filteredChildren });
    } else {
      acc.push(item);
    }

    return acc;
  }, []);
}

export function buildNav(companies: Company[]): NavItem[] {
  return [
    { id: "home", label: "Home", href: "/" },
    {
      id: "holding",
      label: "Panoramica",
      children: [
        { id: "overview", label: "Overview", href: "/holding/overview" },
        { id: "vision", label: "Vision", href: "/holding/vision" },
        { id: "workload", label: "Workload", href: "/holding/workload" },
        { id: "tasks", label: "Task Manager", href: "/holding/tasks" },
      ],
    },
    { id: "operative", label: "Operative", children: buildOperativeNav(companies) },
  ];
}

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
