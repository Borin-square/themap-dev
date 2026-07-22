import { Client } from "pg";

const url = process.env.POSTGRES_URL_NON_POOLING;
if (!url) { console.error("POSTGRES_URL_NON_POOLING not set"); process.exit(1); }

const cleanUrl = url.replace(/[?&]sslmode=[^&]*/g, "");
const client = new Client({ connectionString: cleanUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const t = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' ORDER BY table_name
  `);
  console.log("Tables:", t.rows.map(r => r.table_name).join(", "));

  const app = await client.query(`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema='public' AND table_name='app_state'
    ORDER BY ordinal_position
  `);
  console.log("\napp_state columns:");
  app.rows.forEach(r => console.log(`  ${r.column_name} : ${r.data_type}`));

  const keys = await client.query(`
    SELECT DISTINCT key FROM app_state ORDER BY key LIMIT 50
  `);
  console.log("\napp_state distinct keys:");
  keys.rows.forEach(r => console.log(`  ${r.key}`));

  const counts = await client.query(`
    SELECT company, key, jsonb_typeof(data) as t
    FROM app_state
    WHERE key IN ('fwData','fwConfig','eeVals','eeScenarios','mfwData','mfwConfig')
    ORDER BY company, key
  `);
  console.log(`\nStrategic data rows (${counts.rows.length}):`);
  counts.rows.forEach(r => console.log(`  ${r.company} / ${r.key} (${r.t})`));
} finally {
  await client.end();
}
