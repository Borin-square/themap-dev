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
const cos = await c.query(`SELECT slug, name, type, color FROM companies WHERE type IN ('holding','operative') ORDER BY type, name`);
console.log("=== companies (holding+operative) ===");
cos.rows.forEach(r => console.log(`${r.type.padEnd(10)} ${r.slug.padEnd(28)} ${r.name}  color=${r.color}`));

const maps = await c.query(`SELECT * FROM serenissima_company_map ORDER BY company_slug`);
console.log(`\n=== serenissima_company_map (${maps.rows.length}) ===`);
maps.rows.forEach(r => console.log(JSON.stringify(r)));

const opSlugs = cos.rows.filter(r => r.type === 'operative').map(r => r.slug);
const st = await c.query(`SELECT company, key, year FROM app_state WHERE company = ANY($1) AND key IN ('eeForecast','people') ORDER BY company, key, year`, [opSlugs]);
console.log(`\n=== app_state operatives (eeForecast + people) ===`);
st.rows.forEach(r => console.log(`${r.company.padEnd(28)} ${r.key.padEnd(12)} ${r.year}`));
await c.end();
