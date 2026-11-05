import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { MESSAGES } from "../src/lib/data";

const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
const rows = MESSAGES.map((message) => `(${literal(message.id)}, ${literal(message.received)}::timestamptz, ${literal(JSON.stringify(message))}::jsonb)`);
const sql = `BEGIN;
SET LOCAL standard_conforming_strings = on;
INSERT INTO messages (id, received_at, record) VALUES ${rows.join(",\n")}
ON CONFLICT (id) DO NOTHING;
COMMIT;`;
if (process.argv.includes("--sql")) process.stdout.write(sql);
else {
  const result = spawnSync("docker", ["compose", "exec", "-T", "postgres", "sh", "-c", 'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'], {
    cwd: fileURLToPath(new URL("../", import.meta.url)), input: sql, encoding: "utf8",
  });
  if (result.error || result.status !== 0) {
    console.error(result.error?.message || result.stderr || "Message seed failed.");
    process.exitCode = 1;
  } else console.log(`Seeded ${MESSAGES.length} messages from src/lib/data.ts; existing messages and drafts preserved.`);
}
