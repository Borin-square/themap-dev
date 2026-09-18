// Seed idempotente delle mappature Serenissima per le operative esistenti.
// Popola serenissima_company_map con posizioni x/y iniziali + scores default.
// Non tocca le righe già esistenti (ON CONFLICT DO NOTHING) — l'admin regola da UI.

import pg from "pg";
import { readFileSync } from "fs";

const envContent = readFileSync("/Users/nicholasborin/ProgettiNAS/the-map-app/.env.local", "utf-8");
const vars = {};
envContent.split("\n").forEach((line) => {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) vars[m[1].trim()] = m[2].trim().replace(/^"|"$/g, "");
});
const u = new URL(vars.POSTGRES_URL);
u.searchParams.delete("sslmode");
const c = new pg.Client({ connectionString: u.toString(), ssl: { rejectUnauthorized: false } });
await c.connect();

// Seed iniziale: coordinate a occhio + scores default. Modifica da admin dopo.
// x: 0 servizi ↔ 1 prodotti/platform. y: 0 B2B ↔ 1 community/audience.
const SEED = [
  { slug: "square-marketing",  x: 0.35, y: 0.30, exp: 3, conf: 5, status: "portfolio",  bm: "Agency B2B marketing" },
  { slug: "virality-solution", x: 0.65, y: 0.75, exp: 4, conf: 4, status: "portfolio",  bm: "Growth tech per creator" },
  { slug: "friday",            x: 0.55, y: 0.65, exp: 4, conf: 2, status: "incubating", bm: "TBD" },
  { slug: "crea-studios",      x: 0.45, y: 0.45, exp: 3, conf: 3, status: "portfolio",  bm: null },
];

const { rows: existing } = await c.query(
  `SELECT slug FROM companies WHERE type = 'operative'`
);
const existSlugs = new Set(existing.map((r) => r.slug));

let inserted = 0, skipped = 0;
for (const s of SEED) {
  if (!existSlugs.has(s.slug)) {
    console.log(`  · skip ${s.slug} — non presente in companies`);
    skipped++;
    continue;
  }
  const res = await c.query(
    `INSERT INTO serenissima_company_map
       (company_slug, portfolio_status, strategic_x, strategic_y, expandability_score, confidence_score, business_model, city_seed)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $1)
     ON CONFLICT (company_slug) DO NOTHING
     RETURNING company_slug`,
    [s.slug, s.status, s.x, s.y, s.exp, s.conf, s.bm]
  );
  if (res.rows.length > 0) { inserted++; console.log(`  + ${s.slug}`); }
  else { skipped++; console.log(`  · skip ${s.slug} — già mappata`); }
}

console.log(`\nDone. Inserted=${inserted}, Skipped=${skipped}.`);
await c.end();
