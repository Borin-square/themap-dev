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

// Companies table
await client.query(`
  CREATE TABLE IF NOT EXISTS companies (
    slug TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#4f8cff',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`);

// User profiles (linked to Supabase auth.users)
await client.query(`
  CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    nome TEXT NOT NULL,
    ruolo TEXT NOT NULL DEFAULT 'OPERATIVO' CHECK (ruolo IN ('ADMIN', 'OPERATIVO')),
    funzione TEXT NOT NULL DEFAULT 'OPERATION',
    aziende TEXT NOT NULL DEFAULT '*',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`);

// RLS
await client.query(`ALTER TABLE companies ENABLE ROW LEVEL SECURITY;`);
await client.query(`ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;`);

// Companies: anyone authenticated can read
await client.query(`
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='companies' AND policyname='companies_read') THEN
      CREATE POLICY companies_read ON companies FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='companies' AND policyname='companies_anon_read') THEN
      CREATE POLICY companies_anon_read ON companies FOR SELECT TO anon USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='companies' AND policyname='companies_write') THEN
      CREATE POLICY companies_write ON companies FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
  END $$;
`);

// User profiles: users can read all profiles, write own
await client.query(`
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_profiles' AND policyname='profiles_read') THEN
      CREATE POLICY profiles_read ON user_profiles FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_profiles' AND policyname='profiles_write') THEN
      CREATE POLICY profiles_write ON user_profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
  END $$;
`);

// Seed companies
await client.query(`
  INSERT INTO companies (slug, name, color) VALUES
    ('acme', 'Acme Corp', '#4f8cff'),
    ('beta', 'Beta Srl', '#22c55e'),
    ('gamma', 'Gamma SpA', '#f59e0b')
  ON CONFLICT (slug) DO NOTHING;
`);

console.log("Tables companies + user_profiles created, seed data inserted.");
console.log("");
console.log("Now create the admin user via Supabase Auth.");
console.log("Run: node scripts/create-admin.mjs");
await client.end();
