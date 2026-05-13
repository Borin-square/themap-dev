import { createClient } from "@supabase/supabase-js";
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

const supabaseUrl = vars.SUPABASE_URL || vars.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = vars.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

// Use service role key to create users (bypasses RLS)
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const users = [
  { email: "admin@themap.it", password: "admin123!", nome: "Nicholas Borin", ruolo: "ADMIN", funzione: "DIREZIONE", aziende: "*" },
  { email: "marco@acme.com", password: "demo123!", nome: "Marco Rossi", ruolo: "OPERATIVO", funzione: "OPERATION", aziende: "acme" },
  { email: "anna@beta.com", password: "demo123!", nome: "Anna Bianchi", ruolo: "OPERATIVO", funzione: "SALES", aziende: "beta" },
  { email: "luca@gamma.com", password: "demo123!", nome: "Luca Verdi", ruolo: "OPERATIVO", funzione: "MARKETING", aziende: "acme,gamma" },
];

for (const u of users) {
  // Create auth user
  const { data, error } = await supabase.auth.admin.createUser({
    email: u.email,
    password: u.password,
    email_confirm: true, // auto-confirm
  });

  if (error) {
    if (error.message?.includes("already been registered")) {
      console.log(`  [skip] ${u.email} already exists`);
      // Get existing user to insert profile
      const { data: existing } = await supabase.auth.admin.listUsers();
      const found = existing?.users?.find((x) => x.email === u.email);
      if (found) {
        await supabase.from("user_profiles").upsert({
          id: found.id, email: u.email, nome: u.nome, ruolo: u.ruolo, funzione: u.funzione, aziende: u.aziende,
        }, { onConflict: "id" });
      }
      continue;
    }
    console.error(`  [error] ${u.email}: ${error.message}`);
    continue;
  }

  // Insert profile
  const { error: profErr } = await supabase.from("user_profiles").upsert({
    id: data.user.id, email: u.email, nome: u.nome, ruolo: u.ruolo, funzione: u.funzione, aziende: u.aziende,
  }, { onConflict: "id" });

  if (profErr) {
    console.error(`  [profile error] ${u.email}: ${profErr.message}`);
  } else {
    console.log(`  [ok] ${u.email} (${u.ruolo})`);
  }
}

console.log("\nDone. Demo credentials:");
console.log("  admin@themap.it / admin123!");
console.log("  marco@acme.com / demo123!");
console.log("  anna@beta.com / demo123!");
console.log("  luca@gamma.com / demo123!");
