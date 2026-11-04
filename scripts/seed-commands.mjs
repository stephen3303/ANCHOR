import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// No database driver needed: use psql inside the Compose PostgreSQL service.
const root = fileURLToPath(new URL("../", import.meta.url));
const source = resolve(process.argv[2] ?? resolve(root, "database/seeds/PLADS.txt"));

try {
  const lines = readFileSync(source, "utf8")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/);
  if (
    !/^\*+$/.test(lines[0]?.trim() ?? "") ||
    !/^Updated .+$/.test(lines[1]?.trim() ?? "") ||
    !/^\*+$/.test(lines[2]?.trim() ?? "")
  ) {
    throw new Error("Unexpected PLADS header; refusing to import metadata as command names.");
  }

  const names = [...new Set(lines.slice(3).map((line) => line.trim()).filter(Boolean))];
  if (!names.length || names.some((name) => name.includes("\0"))) {
    throw new Error("PLADS must contain nonempty command names without null characters.");
  }

  const statements = ["BEGIN;", "SET LOCAL standard_conforming_strings = on;"];
  for (let offset = 0; offset < names.length; offset += 1000) {
    const values = names.slice(offset, offset + 1000)
      .map((name) => `('${name.replaceAll("'", "''")}')`)
      .join(",\n");
    statements.push(`INSERT INTO commands (name) VALUES\n${values}\nON CONFLICT (name) DO NOTHING;`);
  }
  statements.push("COMMIT;", "SELECT count(*) AS total_commands FROM commands;");

  const result = spawnSync("docker", [
    "compose", "exec", "-T", "postgres", "sh", "-c",
    'exec psql -X --set=ON_ERROR_STOP=1 --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"',
  ], {
    cwd: root,
    input: statements.join("\n"),
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || "PostgreSQL import failed. Is the postgres service running?");
  }
  console.log(`Imported ${names.length} unique command names from ${source} (existing names preserved).`);
  process.stdout.write(result.stdout);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
