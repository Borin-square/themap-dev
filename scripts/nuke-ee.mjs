import { Client } from "pg";
const url = process.env.POSTGRES_URL_NON_POOLING;
const cleanUrl = url.replace(/[?&]sslmode=[^&]*/g, "");
const client = new Client({ connectionString: cleanUrl, ssl: { rejectUnauthorized: false } });
await client.connect();

const keys = ["eeVals", "eeReal", "eeScenarios", "ckmSelected", "ckmPickerOpen", "ckmNotes"];

await client.query("BEGIN");
try {
  const r = await client.query(
    `DELETE FROM app_state WHERE key = ANY($1::text[]) RETURNING company, key, year`,
    [keys],
  );
  r.rows.forEach((x) => console.log(`  ✓ ${x.company}/${x.key}/y${x.year}`));
  console.log(`Total deleted: ${r.rowCount}`);
  await client.query("COMMIT");
} catch (e) {
  await client.query("ROLLBACK");
  console.error("Rolled back:", e.message);
  process.exit(1);
} finally {
  await client.end();
}
