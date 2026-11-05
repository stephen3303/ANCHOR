import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { compileTemplate, validateTemplateDefinition } from "../src/lib/message-templates";

const root = fileURLToPath(new URL("../", import.meta.url));
const name = `anchor_template_seed_test_${process.pid}_${Date.now()}`;
function docker(args: string[], input?: string) {
  const result = spawnSync("docker", ["compose", "exec", "-T", "postgres", ...args], { cwd: root, input, encoding: "utf8" });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr);
  return result.stdout.trim();
}
const sql = (statement: string) => docker(["sh", "-c", `exec psql -X -v ON_ERROR_STOP=1 -Atq -U "$POSTGRES_USER" -d ${name}`], statement);
const seedSql = (script: string) => {
  const result = spawnSync(process.execPath, ["--import", "tsx", script, "--sql"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
};
let created = false;
try {
  docker(["sh", "-c", `createdb -U "$POSTGRES_USER" ${name}`]);
  created = true;
  for (const path of ["database/init/001-commands.sql", "database/migrations/002-message-templates.sql", "database/migrations/003-users-and-sessions.sql"]) sql(readFileSync(`${root}${path}`, "utf8"));
  const seed = seedSql("scripts/seed-templates.ts");
  assert.throws(() => sql(seed), /Run db:seed:users/);
  assert.equal(sql("SELECT count(*) FROM message_templates;"), "0");
  sql(seedSql("scripts/seed-users.ts"));
  sql("UPDATE reference_sources SET enabled=false;");
  assert.throws(() => sql(seed), /command directory source/);
  assert.equal(sql("SELECT count(*) FROM message_templates;"), "0");
  sql("UPDATE reference_sources SET enabled=true;");
  sql(seed);
  const definition = validateTemplateDefinition(JSON.parse(readFileSync(`${root}database/seeds/standard-message.json`, "utf8")));
  const compiled = compileTemplate(definition);
  const version = JSON.parse(sql("SELECT row_to_json(v) FROM message_template_versions v;"));
  assert.ok(version.published_at);
  assert.equal(version.created_by, sql("SELECT id FROM users WHERE login='LTaylor';"));
  assert.deepEqual(version.input_schema, compiled.inputSchema);
  assert.deepEqual(version.ui_schema, compiled.uiSchema);
  assert.deepEqual(version.output_definition, compiled.outputDefinition);
  assert.ok(!Object.hasOwn(version.input_schema.properties, "Origin"));
  const snapshot = () => sql("SELECT jsonb_build_object('templates',(SELECT jsonb_agg(t ORDER BY id) FROM message_templates t),'versions',(SELECT jsonb_agg(v ORDER BY id) FROM message_template_versions v));");
  const first = snapshot();
  sql(seed);
  assert.equal(snapshot(), first, "Reruns must leave IDs, publication times and versions unchanged");
  // Existing UI-authored templates use random keys. Do not duplicate or adopt
  // them by rewriting their key/creator, and do not publish their pending edits.
  sql("UPDATE message_templates SET key='template-existing-ui'; INSERT INTO message_template_versions (template_id,version,created_by) SELECT id,2,created_by FROM message_templates;");
  const existing = snapshot();
  sql(seed);
  assert.equal(snapshot(), existing);
  sql("UPDATE message_templates SET key='standard-message',name='Customized name',description='Keep my edits',active=false;");
  const archived = snapshot();
  sql(seed);
  assert.equal(snapshot(), archived, "An archived/customized seed must not be restored or overwritten");
  assert.equal(sql("SELECT count(*) FROM message_templates;"), "1");
  const migration = readFileSync(`${root}database/migrations/006-standard-message-template.sql`, "utf8");
  sql(migration);
  assert.equal(snapshot(), archived, "The automatic migration must also preserve an existing customized template");
  const upgrade = readFileSync(`${root}database/migrations/008-standard-message-body-textarea.sql`, "utf8");
  const legacyVersion = (number: number) => sql(`INSERT INTO message_template_versions (template_id,version,input_schema,ui_schema,output_definition,formatting_profile,renderer_version,created_by,published_at)
    SELECT template_id,${number},input_schema,ui_schema || jsonb_build_object('keepThis',true,'fields',
      (SELECT jsonb_agg(CASE WHEN field->>'name'='Body' THEN jsonb_set(field,'{control}','"text"') ELSE field END ORDER BY position)
       FROM jsonb_array_elements(ui_schema->'fields') WITH ORDINALITY fields(field,position))),
      jsonb_set(output_definition,'{body}',to_jsonb('CUSTOM HEADER ' || (output_definition->>'body'))),formatting_profile,renderer_version,created_by,now()
    FROM message_template_versions WHERE version=1 RETURNING id;`);
  const oldVersionId = legacyVersion(3);
  const oldVersion = JSON.parse(sql(`SELECT row_to_json(v) FROM message_template_versions v WHERE id='${oldVersionId}';`));
  const pin = sql(`INSERT INTO message_drafts(template_version_id,created_by) SELECT id,created_by FROM message_template_versions WHERE id='${oldVersionId}' RETURNING id;`);
  sql(upgrade);
  const upgraded = JSON.parse(sql("SELECT row_to_json(v) FROM message_template_versions v ORDER BY version DESC LIMIT 1;"));
  assert.equal(upgraded.version, 4);
  assert.deepEqual(upgraded.ui_schema, { ...oldVersion.ui_schema, fields: oldVersion.ui_schema.fields.map((field: { name: string; control: string }) => field.name === "Body" ? { ...field, control: "textarea" } : field) });
  for (const key of ["input_schema","output_definition","formatting_profile","renderer_version","created_by"]) assert.deepEqual(upgraded[key], oldVersion[key]);
  assert.deepEqual(JSON.parse(sql(`SELECT row_to_json(v) FROM message_template_versions v WHERE id='${oldVersionId}';`)), oldVersion);
  assert.equal(sql(`SELECT template_version_id FROM message_drafts WHERE id='${pin}';`), oldVersionId);
  assert.equal(sql("SELECT active FROM message_templates;"), "f");
  const afterUpgrade = snapshot(); sql(upgrade); assert.equal(snapshot(), afterUpgrade);
  // A disposable fixture only: exercise migration bootstrap without seed users.
  sql("TRUNCATE message_templates CASCADE; DELETE FROM users; DELETE FROM commands;");
  sql(migration);
  const automatic = JSON.parse(sql("SELECT row_to_json(v) FROM message_template_versions v;"));
  // Applied migrations retain the historical variable spelling; the seed
  // source uses Type for newly seeded definitions.
  const historicalNames: Record<string, string> = { Type: "Msg Type", Origin: "Origin Command", DateTime: "Message DateTime", Recipients: "Recipient Commands", Info: "Info Commands", POC: "Point of Contact" };
  const historical = compileTemplate({ ...definition,
    text: "TODO: figure out header\n" + definition.text.replace(/{{([^{}]*)}}/g, (placeholder, raw: string) => historicalNames[raw.trim()] ? `{{ ${historicalNames[raw.trim()]} }}` : placeholder),
    fields: definition.fields.map((field) => ({ ...field, name: historicalNames[field.name] ?? field.name })),
  });
  assert.deepEqual(automatic.input_schema, historical.inputSchema);
  assert.deepEqual(automatic.ui_schema, historical.uiSchema);
  assert.deepEqual(automatic.output_definition, historical.outputDefinition);
  assert.ok(automatic.published_at);
  assert.equal(automatic.created_by, sql("SELECT id FROM users WHERE login='LTaylor';"));
  assert.equal(sql("SELECT count(*) FROM users;"), "1", "Only the missing seed creator is bootstrapped");
  const migrated = snapshot();
  sql(migration); sql(seed); sql(upgrade);
  assert.equal(snapshot(), migrated, "Fresh textarea seeds do not need another version");
  assert.equal(automatic.ui_schema.fields.find((field: { name: string }) => field.name === "Body").control, "textarea");
  // Exercise the real checksum runner on an existing ledger, including its
  // narrowly allowed 006 amendment and rejection of any unrecognized checksum.
  legacyVersion(2);
  const appliedFiles = ["database/init/001-commands.sql", "database/migrations/002-message-templates.sql", "database/migrations/003-users-and-sessions.sql"];
  sql("CREATE TABLE schema_migrations(name text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now());");
  for (const path of appliedFiles) sql(`INSERT INTO schema_migrations(name,sha256) VALUES ('${path.split("/").at(-1)}','${createHash("sha256").update(readFileSync(`${root}${path}`)).digest("hex")}');`);
  sql("INSERT INTO schema_migrations(name,sha256) VALUES ('006-standard-message-template.sql','8db320b28a498319d703d22373749f81e45d03d0db1f3b688a2fc4d78b1c1d4f');");
  const batchResult = spawnSync(process.execPath, ["scripts/migrate-db.mjs", "--sql"], { cwd: root, encoding: "utf8" });
  assert.equal(batchResult.status, 0, batchResult.stderr);
  sql(batchResult.stdout);
  assert.equal(sql("SELECT count(*) FROM schema_migration_amendments;"), "1");
  assert.equal(sql("SELECT ui_schema->'fields' FROM message_template_versions ORDER BY version DESC LIMIT 1;").includes('"textarea"'), true);
  assert.equal(sql("SELECT sha256 FROM schema_migrations WHERE name='006-standard-message-template.sql';"), createHash("sha256").update(migration).digest("hex"));
  const completed = snapshot(); sql(batchResult.stdout); assert.equal(snapshot(), completed);
  sql(`UPDATE schema_migrations SET sha256='${"f".repeat(64)}' WHERE name='006-standard-message-template.sql';`);
  assert.throws(() => sql(batchResult.stdout), /An applied migration has changed/);
  console.log("Template seed tests passed: fresh textarea seeds, immutable version upgrade, draft pins, customizations, reruns, audited checksum amendment and strict checksum rejection.");
} finally {
  if (created) docker(["sh", "-c", `dropdb --force -U "$POSTGRES_USER" ${name}`]);
}
