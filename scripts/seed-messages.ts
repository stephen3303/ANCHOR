import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ACK_RECEIPTS, MESSAGES } from "../src/lib/data";
import { normRef, parseNavalMessage } from "../src/lib/naval";

// Loads the demo traffic into the message store. Every message's raw text goes
// through the same parser live ingestion uses, and the seed stops if what the
// parser reads disagrees with the demo record. Re-running it changes nothing.
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

const problems: string[] = [];
for (const m of MESSAGES) {
  try {
    const p = parseNavalMessage(m.rawText);
    const expected = { reference: normRef(m.reference), dtg: m.dtg, precedence: m.precedence, classification: m.classification, originator: m.originator.toUpperCase(), type: m.type, subtag: m.subtag };
    const actual = { reference: p.reference, dtg: p.dtg, precedence: p.precedence, classification: p.classification, originator: p.originator.toUpperCase(), type: p.type, subtag: p.subtag };
    for (const key of Object.keys(expected) as (keyof typeof expected)[]) {
      if (expected[key] !== actual[key]) problems.push(`${m.reference}: ${key} reads "${actual[key]}", record says "${expected[key]}"`);
    }
  } catch (error) {
    problems.push(`${m.reference}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
if (problems.length) {
  console.error(`The demo raw text does not match the demo records:\n${problems.join("\n")}`);
  process.exit(1);
}

const statements = MESSAGES.flatMap((m) => {
  const display: Record<string, unknown> = { ...m };
  for (const key of ["rawText", "sha256", "c2oixId", "lifecycle", "replacedBy"]) delete display[key];
  return [
    `INSERT INTO message_artifacts (c2oix_id, raw_text, sha256, size_bytes, ingested_at)
VALUES (${literal(m.c2oixId)}, ${literal(m.rawText)}, ${literal(sha256(m.rawText))}, ${Buffer.byteLength(m.rawText, "utf8")}, ${literal(m.received)})
ON CONFLICT (c2oix_id) DO NOTHING;`,
    `INSERT INTO messages (id, reference, c2oix_id, received, lifecycle, replaced_by, record)
VALUES (${literal(m.id)}, ${literal(m.reference)}, ${literal(m.c2oixId)}, ${literal(m.received)}, ${literal(m.lifecycle)}, ${m.replacedBy ? literal(m.replacedBy) : "NULL"}, ${literal(JSON.stringify(display))}::jsonb)
ON CONFLICT (id) DO NOTHING;`,
  ];
});
const receipts = Object.entries(ACK_RECEIPTS).flatMap(([id, list]) => list.map((r) =>
  `INSERT INTO message_acknowledgements (message_id, origin, command_name, acknowledged_at)
VALUES (${literal(id)}, 'received', ${literal(r.command)}, ${literal(r.at)})
ON CONFLICT (message_id, command_name, acknowledged_at) WHERE origin = 'received' DO NOTHING;`));

const sql = `BEGIN;
SET LOCAL standard_conforming_strings = on;
${statements.join("\n")}
${receipts.join("\n")}
COMMIT;`;

// --sql lets the integration test apply the same seed to its own database.
if (process.argv.includes("--sql")) {
  process.stdout.write(sql);
} else {
  const result = spawnSync("docker", ["compose", "exec", "-T", "postgres", "sh", "-c",
    'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"',
  ], { cwd: fileURLToPath(new URL("../", import.meta.url)), input: sql, encoding: "utf8" });
  if (result.error || result.status !== 0) {
    console.error(result.error?.message || result.stderr || "Message seed failed.");
    process.exitCode = 1;
  } else {
    console.log(`Seeded ${MESSAGES.length} demo messages and ${receipts.length} acknowledgements received from other commands. Existing records are preserved.`);
  }
}
