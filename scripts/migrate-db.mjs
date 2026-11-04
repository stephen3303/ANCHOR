import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const literal = (value) => `'${value.replaceAll("'", "''")}'`;

try {
  const migrations = ["database/init", "database/migrations"]
    .flatMap((directory) => readdirSync(join(root, directory))
      .filter((name) => name.endsWith(".sql"))
      .map((name) => ({ name, sql: readFileSync(join(root, directory, name), "utf8") })))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (new Set(migrations.map(({ name }) => name)).size !== migrations.length) {
    throw new Error("Migration filenames must be unique.");
  }
  const statements = [
    "BEGIN;",
    "SET LOCAL standard_conforming_strings = on;",
    // Serialize concurrent runs, including ledger initialization.
    "SELECT pg_advisory_xact_lock(1819242083, 1);",
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      sha256 text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    );`,
  ];
  for (const { name, sql } of migrations) {
    const checksum = createHash("sha256").update(sql).digest("hex");
    statements.push(
      `DO $migration$ BEGIN
        IF EXISTS (SELECT 1 FROM schema_migrations WHERE name = ${literal(name)} AND sha256 <> ${literal(checksum)}) THEN
          RAISE EXCEPTION 'An applied migration has changed; restore it and create a new migration';
        END IF;
      END $migration$;`,
      `SELECT NOT EXISTS (SELECT 1 FROM schema_migrations WHERE name = ${literal(name)}) AS apply_migration \\gset`,
      "\\if :apply_migration",
      `\\echo Applying ${name}`,
      sql,
      `INSERT INTO schema_migrations (name, sha256) VALUES (${literal(name)}, ${literal(checksum)});`,
      "\\else",
      `\\echo Already applied: ${name}`,
      "\\endif",
    );
  }
  statements.push("COMMIT;");
  const result = spawnSync("docker", [
    "compose", "exec", "-T", "postgres", "sh", "-c",
    'exec psql -X --set=ON_ERROR_STOP=1 --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"',
  ], { cwd: root, input: statements.join("\n"), encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || "Migration failed; ensure PostgreSQL is running.");
  process.stdout.write(result.stdout);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
