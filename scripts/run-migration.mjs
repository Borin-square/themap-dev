import { readFileSync } from "node:fs";
import { Client } from "pg";

const [, , sqlPath] = process.argv;
if (!sqlPath) {
  console.error("Usage: node scripts/run-migration.mjs <path-to-sql>");
  process.exit(1);
}

const url = process.env.POSTGRES_URL_NON_POOLING;
if (!url) {
  console.error("POSTGRES_URL_NON_POOLING not set");
  process.exit(1);
}

const sql = readFileSync(sqlPath, "utf8");
const cleanUrl = url.replace(/[?&]sslmode=[^&]*/g, "");
const client = new Client({ connectionString: cleanUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(sql);
  console.log(`Applied: ${sqlPath}`);
} finally {
  await client.end();
}
