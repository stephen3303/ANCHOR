import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { CURRENT_USER } from "../src/lib/data";

// Explicit mapping of the fictional CURRENT_USER profile to a PLADS directory
// entry. Do not guess a sender from a partial name or the first directory row.
const commandName = "COMSUBLANT NORFOLK VA";
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
const { login, name, ...profile } = CURRENT_USER;
const sql = `BEGIN;
SET LOCAL standard_conforming_strings = on;
INSERT INTO commands (name) VALUES (${literal(commandName)}) ON CONFLICT (name) DO NOTHING;
INSERT INTO users (login, name, command_id, profile)
SELECT ${literal(login)}, ${literal(name)}, id, ${literal(JSON.stringify(profile))}::jsonb
FROM commands WHERE name = ${literal(commandName)}
ON CONFLICT DO NOTHING;
COMMIT;`;

// --sql allows the integration suite to apply the same seed to its isolated DB.
if (process.argv.includes("--sql")) {
  process.stdout.write(sql);
} else {
  const result = spawnSync("docker", ["compose", "exec", "-T", "postgres", "sh", "-c",
    'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"',
  ], { cwd: fileURLToPath(new URL("../", import.meta.url)), input: sql, encoding: "utf8" });
  if (result.error || result.status !== 0) {
    console.error(result.error?.message || result.stderr || "User seed failed.");
    process.exitCode = 1;
  } else {
    console.log(`Seeded ${login} (${name}), linked to ${commandName}. Existing accounts are preserved.`);
  }
}
