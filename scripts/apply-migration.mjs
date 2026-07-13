import pg from "pg";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "..", ".env.local");
const envContent = readFileSync(envPath, "utf-8");

const vars = {};
envContent.split("\n").forEach((line) => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) vars[match[1].trim()] = match[2].trim().replace(/^"|"$/g, "");
});

const connStr = vars.POSTGRES_URL;
if (!connStr) { console.error("POSTGRES_URL not found in .env.local"); process.exit(1); }

const migrationFile = process.argv[2];
if (!migrationFile) {
  console.error("Usage: node apply-migration.mjs <migration-file>");
  process.exit(1);
}

const sql = readFileSync(resolve(__dirname, "..", "supabase", "migrations", migrationFile), "utf-8");

// Rimuovi eventuale sslmode dal query string per lasciare il controllo all'oggetto ssl
const u = new URL(connStr);
u.searchParams.delete("sslmode");
const client = new pg.Client({ connectionString: u.toString(), ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  await client.query("BEGIN");
  await client.query(sql);
  await client.query("COMMIT");
  console.log(`\u2713 Migration ${migrationFile} applied.`);
} catch (err) {
  await client.query("ROLLBACK");
  console.error(`\u2717 Migration failed:`, err.message);
  process.exit(1);
} finally {
  await client.end();
}
