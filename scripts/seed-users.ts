import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DEMO_USERS, SYSTEM_ADMIN_ROLE } from "../src/lib/demo-users";

// Each demo account is mapped explicitly to a PLADS directory entry. Do not
// guess a sender from a partial name or the first directory row.
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
const [taylor] = DEMO_USERS;
const adminGrant = literal(JSON.stringify([{ name: SYSTEM_ADMIN_ROLE, granted: true }]));

const sql = `BEGIN;
SET LOCAL standard_conforming_strings = on;
${[...new Set(DEMO_USERS.map((u) => u.commandName))].map((name) =>
  `INSERT INTO commands (name) VALUES (${literal(name)}) ON CONFLICT (name) DO NOTHING;`).join("\n")}
-- Bootstrap: if no active account can manage users (a database seeded before
-- the Users tab existed), restore the default account's seeded roles so
-- someone can administer. Never runs once any System Admin exists.
UPDATE users SET profile = jsonb_set(profile, '{roles}', ${literal(JSON.stringify(taylor.profile.roles))}::jsonb)
WHERE login = ${literal(taylor.login)}
  AND NOT EXISTS (SELECT 1 FROM users WHERE active AND profile->'roles' @> ${adminGrant}::jsonb);
${DEMO_USERS.map((u) => `INSERT INTO users (login, name, command_id, profile)
SELECT ${literal(u.login)}, ${literal(u.name)}, id, ${literal(JSON.stringify(u.profile))}::jsonb
FROM commands WHERE name = ${literal(u.commandName)}
ON CONFLICT DO NOTHING;`).join("\n")}
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
    console.log(`Seeded ${DEMO_USERS.length} demo accounts: ${DEMO_USERS.map((u) => u.name).join(", ")}. Existing accounts are preserved.`);
  }
}
