import { Client } from "pg";
const url = process.env.POSTGRES_URL_NON_POOLING;
const cleanUrl = url.replace(/[?&]sslmode=[^&]*/g, "");
const client = new Client({ connectionString: cleanUrl, ssl: { rejectUnauthorized: false } });
await client.connect();

const targets = [
  // People pollution (mock ACME saved as real data)
  { company: "serenissima-holding", key: "people", year: 2026 },
  { company: "square-marketing",    key: "people", year: 2026 }, // dead unversioned
  { company: "crea-studios",        key: "people", year: 2026 }, // user will rewrite

  // Empty eeScenarios auto-saved
  { company: "serenissima-holding", key: "eeScenarios", year: 2026 },
  { company: "virality-solution",   key: "eeScenarios", year: 2026 },
];

await client.query("BEGIN");
try {
  for (const t of targets) {
    const r = await client.query(
      `DELETE FROM app_state WHERE company=$1 AND key=$2 AND year=$3 RETURNING company, key, year`,
      [t.company, t.key, t.year],
    );
    console.log(`  ${r.rowCount === 1 ? "✓" : "·"} ${t.company}/${t.key}/y${t.year}`);
  }
  await client.query("COMMIT");
  console.log("Committed.");
} catch (e) {
  await client.query("ROLLBACK");
  console.error("Rolled back:", e.message);
  process.exit(1);
} finally {
  await client.end();
}
