import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { compileTemplate, validateTemplateDefinition } from "../src/lib/message-templates";

// Compile the bundled snapshot through the same validation/schema builder as
// template authoring. Automatic values remain bindings, not seeded output.
const definition = validateTemplateDefinition(JSON.parse(readFileSync(new URL("../database/seeds/standard-message.json", import.meta.url), "utf8")));
const compiled = compileTemplate(definition);
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
const json = (value: unknown) => `${literal(JSON.stringify(value))}::jsonb`;
const sql = `BEGIN;
SET LOCAL standard_conforming_strings = on;
SELECT pg_advisory_xact_lock(hashtextextended('seed-template:standard-message', 0));
DO $seed$
DECLARE author uuid; template uuid;
BEGIN
  -- Recognize the UI-authored original as well as the stable seed key. Never
  -- overwrite, republish or reactivate an existing template, even if revised.
  IF EXISTS (SELECT 1 FROM message_templates WHERE key = 'standard-message' OR lower(name) = lower(${literal(definition.name)})) THEN
    RAISE NOTICE 'Standard Message already exists; preserving its definitions and versions';
    RETURN;
  END IF;
  SELECT id INTO author FROM users WHERE login = 'LTaylor';
  IF author IS NULL THEN RAISE EXCEPTION 'Run db:seed:users before db:seed:templates'; END IF;
  PERFORM id FROM reference_sources WHERE key = 'recipient-commands' AND contract_version = 1 AND enabled FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'The command directory source must be enabled before seeding templates'; END IF;
  INSERT INTO message_templates (key, name, description, created_by)
    VALUES ('standard-message', ${literal(definition.name)}, ${literal(definition.description)}, author)
    RETURNING id INTO template;
  INSERT INTO message_template_versions
    (template_id, version, input_schema, ui_schema, output_definition, formatting_profile, renderer_version, created_by, published_at)
    VALUES (template, 1, ${json(compiled.inputSchema)}, ${json(compiled.uiSchema)}, ${json(compiled.outputDefinition)},
      ${json({ version: 1, wordWrap: false, newline: "LF" })}, 'named-v1', author, now());
END $seed$;
COMMIT;`;

// Same SQL can be applied to isolated test databases without changing .env.
if (process.argv.includes("--sql")) {
  process.stdout.write(sql);
} else {
  const result = spawnSync("docker", ["compose", "exec", "-T", "postgres", "sh", "-c",
    'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"',
  ], { cwd: fileURLToPath(new URL("../", import.meta.url)), input: sql, encoding: "utf8" });
  if (result.error || result.status !== 0) {
    console.error(result.error?.message || result.stderr || "Template seed failed.");
    process.exitCode = 1;
  } else {
    console.log("Standard Message template seeded. Existing templates and published versions are preserved.");
  }
}
