import { Client } from "pg";

const url = process.env.POSTGRES_URL_NON_POOLING;
const cleanUrl = url.replace(/[?&]sslmode=[^&]*/g, "");
const client = new Client({ connectionString: cleanUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const rls = await client.query(`
    SELECT relname, relrowsecurity FROM pg_class WHERE relname='app_state'
  `);
  console.log("RLS on app_state:", rls.rows);

  const pols = await client.query(`
    SELECT policyname, cmd, roles::text[] FROM pg_policies WHERE tablename='app_state'
  `);
  console.log("Policies:", pols.rows);

  const recent = await client.query(`
    SELECT company, key, year, updated_at, jsonb_array_length(CASE WHEN jsonb_typeof(data)='array' THEN data ELSE '[]'::jsonb END) as items
    FROM app_state
    WHERE key LIKE 'people%' OR key = 'eeScenarios'
    ORDER BY updated_at DESC
    LIMIT 20
  `);
  console.log("\nRecent people / eeScenarios rows:");
  recent.rows.forEach(r => console.log(`  ${r.updated_at.toISOString()}  ${r.company}/${r.key}/y${r.year}  items=${r.items}`));

  const pk = await client.query(`
    SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.app_state'::regclass AND contype='p'
  `);
  console.log("\nPK:", pk.rows);
} finally {
  await client.end();
}
