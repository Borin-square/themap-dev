import { Client } from "pg";

const url = process.env.POSTGRES_URL_NON_POOLING;
const cleanUrl = url.replace(/[?&]sslmode=[^&]*/g, "");
const client = new Client({ connectionString: cleanUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const pols = await client.query(`
    SELECT tablename, policyname, cmd, roles::text[], qual, with_check
    FROM pg_policies
    WHERE tablename='app_state'
  `);
  console.log(JSON.stringify(pols.rows, null, 2));
} finally { await client.end(); }
