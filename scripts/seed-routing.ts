import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { INITIAL_WORKFLOWS, INITIAL_AUTHORITIES, INITIAL_COMMAND_SETTINGS } from "../src/lib/routing";

// One-time mapping of the old fictional roster to the actual seeded accounts.
// Persisted workflow holders use user UUIDs, never browser-selected mock actors.
const logins = { "p-walsh": "RWalsh", "p-okafor": "DOkafor", "p-chen": "AChen", "p-ramos": "MRamos", "p-brooks": "KBrooks", "p-patel": "RPatel", "p-taylor": "LTaylor", "p-nguyen": "SNguyen", "p-morales": "EMorales", "p-harper": "DHarper" };
const literal = (value: unknown) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const sql = `BEGIN;
DO $seed$
DECLARE command uuid; ids jsonb; mappings jsonb := ${literal(logins)}; w jsonb; s jsonb; a jsonb; steps jsonb; workflows jsonb := '[]'; authorities jsonb := '[]';
BEGIN
  SELECT command_id INTO command FROM users WHERE login = 'LTaylor';
  IF command IS NULL THEN RAISE EXCEPTION 'Run db:seed:users before db:seed:routing'; END IF;
  IF EXISTS (SELECT 1 FROM command_routing WHERE command_id = command) THEN RETURN; END IF;
  SELECT jsonb_object_agg(login, id::text) INTO ids FROM users WHERE command_id = command AND active;
  IF EXISTS (SELECT 1 FROM jsonb_each_text(mappings) m WHERE NOT (ids ? m.value)) THEN
    RAISE EXCEPTION 'Seeded reviewer accounts are missing or inactive. Run db:seed:users or configure routing manually.';
  END IF;
  FOR w IN SELECT value FROM jsonb_array_elements(${literal(INITIAL_WORKFLOWS)}) LOOP
    steps := '[]';
    FOR s IN SELECT value FROM jsonb_array_elements(w->'steps') LOOP
      steps := steps || jsonb_build_array(s || jsonb_build_object('personId', ids->>(mappings->>(s->>'personId'))));
    END LOOP;
    workflows := workflows || jsonb_build_array(w || jsonb_build_object('steps', steps));
  END LOOP;
  FOR a IN SELECT value FROM jsonb_array_elements(${literal(INITIAL_AUTHORITIES)}) LOOP
    authorities := authorities || jsonb_build_array(a || jsonb_build_object('personId', ids->>(mappings->>(a->>'personId'))));
  END LOOP;
  INSERT INTO command_routing (command_id, workflows, authorities, settings)
    VALUES (command, workflows, authorities, ${literal({ ...INITIAL_COMMAND_SETTINGS, textCase: "mixed" })});
END $seed$;
COMMIT;`;
if (process.argv.includes("--sql")) process.stdout.write(sql);
else {
  const result = spawnSync("docker", ["compose", "exec", "-T", "postgres", "sh", "-c", 'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'], { cwd: fileURLToPath(new URL("../", import.meta.url)), input: sql, encoding: "utf8" });
  if (result.error || result.status !== 0) { console.error(result.error?.message || result.stderr); process.exitCode = 1; }
  else console.log("Seeded command routing with real demo accounts. Existing workflows, designations and sequence counters preserved.");
}
