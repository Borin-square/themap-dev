import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(resolve(__dirname, "..", ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }),
);

const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("SUPABASE_URL o SERVICE_ROLE_KEY mancante"); process.exit(1); }

const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: buckets, error: e1 } = await sb.storage.listBuckets();
if (e1) { console.error("list err:", e1.message); process.exit(1); }
if (buckets.some((b) => b.name === "hm-opportunities")) { console.log("✓ bucket già esistente"); process.exit(0); }
const { error: e2 } = await sb.storage.createBucket("hm-opportunities", { public: true, fileSizeLimit: "50MB", allowedMimeTypes: ["application/pdf"] });
if (e2) { console.error("create err:", e2.message); process.exit(1); }
console.log("✓ bucket 'hm-opportunities' creato (public, pdf-only, 50MB max)");
