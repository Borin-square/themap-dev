import { Client } from "pg";

const url = process.env.POSTGRES_URL_NON_POOLING;
const cleanUrl = url.replace(/[?&]sslmode=[^&]*/g, "");
const client = new Client({ connectionString: cleanUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const q = await client.query(`
    SELECT company, key, year, updated_at, data
    FROM app_state
    WHERE company='serenissima-holding' AND key='people'
    ORDER BY updated_at DESC
  `);
  for (const r of q.rows) {
    console.log(`${r.company} / ${r.key} / y${r.year} — ${r.updated_at.toISOString()}`);
    const people = r.data;
    console.log(`  ${people.length} entries. First 3 names: ${people.slice(0, 3).map(p => p.nome).join(", ")}`);
  }

  const s = await client.query(`
    SELECT company, key, year, updated_at, data
    FROM app_state
    WHERE key='eeScenarios' AND jsonb_array_length(data) > 0
    ORDER BY updated_at DESC
  `);
  console.log("\nNon-empty scenarios:");
  for (const r of s.rows) {
    console.log(`${r.company} / y${r.year} — ${r.updated_at.toISOString()}`);
    r.data.forEach(sc => console.log(`  #${sc.id} ${sc.nome} (${sc.data})`));
  }
} finally { await client.end(); }
