import { Client } from "pg";

const url = process.env.POSTGRES_URL_NON_POOLING;
const cleanUrl = url.replace(/[?&]sslmode=[^&]*/g, "");
const client = new Client({ connectionString: cleanUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const q = await client.query(`
    SELECT company, key, year, jsonb_array_length(data) AS n, data->0->>'nome' AS first_name, updated_at
    FROM app_state
    WHERE key IN ('people','people:v2')
    ORDER BY updated_at DESC
  `);
  for (const r of q.rows) {
    const looksLikeAcmeMock = r.first_name === "Marco Rossi";
    console.log(`${r.company}/${r.key}/y${r.year}  n=${r.n}  first=${r.first_name}  ${looksLikeAcmeMock ? "⚠ MOCK POLLUTION" : ""}  ${r.updated_at.toISOString()}`);
  }
} finally { await client.end(); }
