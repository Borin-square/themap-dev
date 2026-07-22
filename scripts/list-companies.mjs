import { Client } from "pg";
const url = process.env.POSTGRES_URL_NON_POOLING;
const cleanUrl = url.replace(/[?&]sslmode=[^&]*/g, "");
const client = new Client({ connectionString: cleanUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const r = await client.query(`SELECT slug, name, type FROM companies ORDER BY type, slug`);
  r.rows.forEach(x => console.log(`${x.type.padEnd(10)} ${x.slug.padEnd(28)} ${x.name}`));
} finally { await client.end(); }
