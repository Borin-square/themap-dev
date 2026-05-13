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

const client = new pg.Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
await client.connect();

await client.query(`
  CREATE TABLE IF NOT EXISTS app_state (
    company TEXT NOT NULL,
    key TEXT NOT NULL,
    data JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (company, key)
  );
`);

await client.query(`ALTER TABLE app_state ENABLE ROW LEVEL SECURITY;`);

await client.query(`
  DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = 'app_state' AND policyname = 'allow_all'
    ) THEN
      CREATE POLICY allow_all ON app_state FOR ALL USING (true) WITH CHECK (true);
    END IF;
  END $$;
`);

console.log("Table app_state created successfully");
await client.end();
