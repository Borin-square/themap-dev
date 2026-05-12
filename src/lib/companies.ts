export interface Company {
  slug: string;
  name: string;
  color: string;
}

export const COMPANIES: Company[] = [
  { slug: "acme", name: "Acme Corp", color: "#4f8cff" },
  { slug: "beta", name: "Beta Srl", color: "#22c55e" },
  { slug: "gamma", name: "Gamma SpA", color: "#f59e0b" },
];

export function getCompany(slug: string): Company | undefined {
  return COMPANIES.find((c) => c.slug === slug);
}
