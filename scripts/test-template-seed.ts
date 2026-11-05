import assert from "node:assert/strict";
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
  assert.ok(!Object.hasOwn(version.input_schema.properties, "Origin Command"));
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
  // A disposable fixture only: exercise migration bootstrap without seed users.
  sql("TRUNCATE message_templates CASCADE; DELETE FROM users; DELETE FROM commands;");
  sql(migration);
  const automatic = JSON.parse(sql("SELECT row_to_json(v) FROM message_template_versions v;"));
  assert.deepEqual(automatic.input_schema, compiled.inputSchema);
  assert.deepEqual(automatic.ui_schema, compiled.uiSchema);
  assert.deepEqual(automatic.output_definition, compiled.outputDefinition);
  assert.ok(automatic.published_at);
  assert.equal(automatic.created_by, sql("SELECT id FROM users WHERE login='LTaylor';"));
  assert.equal(sql("SELECT count(*) FROM users;"), "1", "Only the missing seed creator is bootstrapped");
  const migrated = snapshot();
  sql(migration); sql(seed);
  assert.equal(snapshot(), migrated);
  console.log("Template seed tests passed: validated publication, prerequisites, reruns, existing/archived versions, and automatic migration on a database without seed users.");
} finally {
  if (created) docker(["sh", "-c", `dropdb --force -U "$POSTGRES_USER" ${name}`]);
}
