import { Client } from "pg";

const url = process.env.POSTGRES_URL_NON_POOLING;
const cleanUrl = url.replace(/[?&]sslmode=[^&]*/g, "");
const client = new Client({ connectionString: cleanUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const q = await client.query(`
    SELECT company, key, year, updated_at,
           jsonb_typeof(data) as t,
           CASE WHEN jsonb_typeof(data)='array' THEN jsonb_array_length(data) ELSE NULL END as len,
           CASE WHEN jsonb_typeof(data)='object' THEN (SELECT count(*) FROM jsonb_object_keys(data)) ELSE NULL END as keys_count
    FROM app_state
    WHERE key IN ('eeVals','eeScenarios','eeReal','ckmSelected','ckmNotes','ckmPickerOpen','fwData','fwConfig','mfwData','mfwConfig')
    ORDER BY key, updated_at DESC
  `);
  for (const r of q.rows) {
    const desc = r.t === "array" ? `[${r.len}]` : r.t === "object" ? `{${r.keys_count}}` : r.t;
    console.log(`${r.company.padEnd(22)} ${r.key.padEnd(15)} y${r.year}  ${desc.padEnd(6)}  ${r.updated_at.toISOString()}`);
  }
} finally { await client.end(); }
