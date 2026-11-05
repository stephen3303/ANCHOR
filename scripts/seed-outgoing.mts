import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { compileTemplate, validateTemplateForPublication } from "../src/lib/message-templates";
import { MESSAGE_FORMATTING_PROFILE } from "../src/lib/message-format";
import { LEGACY_STANDARD_NAMES, newStandardTemplate } from "../src/lib/standard-template";
import { exampleType, LIFECYCLE_EXAMPLES, LIFECYCLE_TEMPLATES, STANDARD_TEMPLATE, type LifecycleExample } from "../src/lib/lifecycle-examples";
import type { AppUser } from "../src/lib/users";
import type { RouteStep } from "../src/lib/types";

// Seeds outgoing example traffic at each lifecycle stage: drafting, routing,
// returned, released (queued) and transmitted. Each example is driven through
// the app's own server code (create, submit, endorse, release, transmit), acting
// as each account the command's routing chain names, so the records, route
// history, DTG stamp, release sequence and transmission are exactly what the app
// writes. The DTG is stamped only at release.
//
// Re-running changes nothing: each draft has a fixed request ID, and an example
// whose draft already exists is skipped, whatever happened to it since. Typed
// templates (CASREP, EXORD, OPREP, PLANORD) are created only when the command
// has no template of that name; existing templates are never changed.
//
// Run with host Node against the Compose PostgreSQL port, using the same
// POSTGRES_* settings Compose uses. Requires db:seed:users and db:seed:routing.
const root = fileURLToPath(new URL("../", import.meta.url));
if (existsSync(`${root}.env`)) process.loadEnvFile(`${root}.env`);
if (!process.argv.includes("--database-url")) {
  // Compose publishes PostgreSQL on 127.0.0.1:${POSTGRES_PORT:-5432}; DATABASE_URL is for npm run dev.
  delete process.env.DATABASE_URL;
  process.env.PGHOST = "127.0.0.1";
  process.env.PGPORT = process.env.POSTGRES_PORT || "5432";
  process.env.PGDATABASE = process.env.POSTGRES_DB || "anchor";
  process.env.PGUSER = process.env.POSTGRES_USER || "anchor";
  process.env.PGPASSWORD = process.env.POSTGRES_PASSWORD || "anchor-local-dev";
}

const { database } = await import("../src/lib/server/db");
const { createMessage } = await import("../src/lib/server/outgoing-messages");
const { updateMessage } = await import("../src/lib/server/message-routing");
const { transmit } = await import("../src/lib/server/transmissions");

/** A stable UUID for an example's create request, so the draft is created once. */
function requestId(key: string) {
  const hex = createHash("sha256").update(`anchor-lifecycle-example:${key}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${((parseInt(hex[16], 16) & 3) | 8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

// Each lifecycle step happens at its own past moment, so release DTGs are
// distinct (references are identified by sender and DTG) and the queue and
// history read in a believable order. Only this seed process sees the clock.
const RealDate = Date;
let frozen: number | null = null;
class SeedDate extends RealDate {
  constructor(...args: unknown[]) {
    if (args.length === 0 && frozen !== null) super(frozen);
    else super(...(args as [string]));
  }
  static now() { return frozen ?? RealDate.now(); }
}
globalThis.Date = SeedDate as DateConstructor;
const at = (time: number) => { frozen = time; };

const db = database();
const usersByLogin = new Map<string, AppUser>();
const usersById = new Map<string, AppUser>();
{
  const { rows } = await db.query(`SELECT u.id, u.login, u.name, u.profile, u.command_id AS "commandId", c.name AS "commandName"
    FROM users u JOIN commands c ON c.id = u.command_id WHERE u.active`);
  for (const row of rows) {
    const p = row.profile ?? {};
    const user: AppUser = { id: row.id, login: row.login, name: row.name, commandId: row.commandId, commandName: row.commandName,
      rank: p.rank ?? "", community: p.community ?? "", billet: p.billet ?? "", unit: p.unit ?? "", command: p.command ?? row.commandName,
      location: p.location ?? "", email: p.email ?? "", dsn: p.dsn ?? "", roles: Array.isArray(p.roles) ? p.roles : [], groups: Array.isArray(p.groups) ? p.groups : [] };
    usersByLogin.set(user.login, user);
    usersById.set(user.id, user);
  }
}
const taylor = usersByLogin.get("LTaylor");
if (!taylor) throw new Error("Run db:seed:users before db:seed:outgoing.");
const { rowCount: routing } = await db.query("SELECT 1 FROM command_routing WHERE command_id = $1", [taylor.commandId]);
if (!routing) throw new Error("Run db:seed:routing before db:seed:outgoing.");
const harper = [...usersById.values()].find((u) => u.commandId === taylor.commandId && u.roles.some((r) => r.name === "Message Admin" && r.granted));

/** Create a typed template from the standard definition, as the Templates page does, unless one of that name exists. */
async function ensureTemplate(name: string) {
  const definition = validateTemplateForPublication({ ...newStandardTemplate(), name, description: `Drafts ${name} messages.` });
  const compiled = compileTemplate(definition);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`seed-template:${name.toLowerCase()}`]);
    const { rowCount } = await client.query("SELECT 1 FROM message_templates WHERE lower(name) = lower($1)", [name]);
    if (rowCount) { await client.query("COMMIT"); return false; }
    const { rows: [template] } = await client.query(`INSERT INTO message_templates (key, name, description, created_by)
      VALUES ($1, $2, $3, $4) RETURNING id`, [`seed-${name.toLowerCase()}`, definition.name, definition.description, taylor!.id]);
    await client.query(`INSERT INTO message_template_versions
      (template_id, version, input_schema, ui_schema, output_definition, formatting_profile, renderer_version, created_by, published_at)
      VALUES ($1, 1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, 'named-v1', $6, now())`,
    [template.id, JSON.stringify(compiled.inputSchema), JSON.stringify(compiled.uiSchema), JSON.stringify(compiled.outputDefinition), JSON.stringify(MESSAGE_FORMATTING_PROFILE), taylor!.id]);
    await client.query("COMMIT");
    return true;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

/** The latest published version of the active template with this name. */
async function templateVersion(name: string) {
  const { rows: [row] } = await db.query(`SELECT v.id, v.ui_schema FROM message_templates t
    JOIN message_template_versions v ON v.template_id = t.id
    WHERE t.active AND lower(t.name) = lower($1) AND v.published_at IS NOT NULL
    ORDER BY v.version DESC LIMIT 1`, [name]);
  return row as { id: string; ui_schema: { fields: { name: string; control: string; fixedValue?: string }[] } } | undefined;
}

const commandIds = new Map<string, string>();
async function commandId(name: string) {
  if (!commandIds.has(name)) {
    const { rows: [row] } = await db.query("SELECT id FROM commands WHERE name = $1", [name]);
    if (!row) throw new Error(`${name} is not in the command directory. Run db:seed:commands.`);
    commandIds.set(name, row.id);
  }
  return commandIds.get(name)!;
}

async function inputValues(example: LifecycleExample, fields: { name: string; control: string; fixedValue?: string }[]) {
  const values: Record<string, string | string[]> = {
    Recipients: await Promise.all(example.to.map(commandId)),
    Info: await Promise.all(example.info.map(commandId)),
    Classification: "UNCLASSIFIED",
    Subject: example.subject,
    POC: example.poc,
    Body: example.rmks.map((text, index) => `${index + 1}. ${text}`).join("\n"),
    "Message Number": "1",
  };
  if (example.template === STANDARD_TEMPLATE) values.Type = example.type;
  // Only send what the template asks for; Precedence and DateTime are draft-managed.
  // Early Standard Message versions still use the older field names (Msg Type, POC as Point of Contact).
  return Object.fromEntries(fields
    .filter((f) => f.control !== "autogenerated" && f.fixedValue === undefined)
    .map((f) => [f.name, values[LEGACY_STANDARD_NAMES[f.name] ?? f.name]] as const)
    .filter(([, value]) => value !== undefined));
}

const done: string[] = [];
const skipped: string[] = [];
let createdTemplates = 0;
try {
  for (const name of LIFECYCLE_TEMPLATES) if (await ensureTemplate(name)) createdTemplates += 1;
  const base = Math.floor(RealDate.now() / 60000) * 60000;
  for (const example of LIFECYCLE_EXAMPLES) {
    const id = requestId(example.key);
    const { rowCount: exists } = await db.query("SELECT 1 FROM outgoing_messages WHERE request_id = $1", [id]);
    if (exists) { skipped.push(`${example.key} (already seeded)`); continue; }
    const drafter = usersByLogin.get(example.drafter);
    const version = await templateVersion(example.template);
    if (!drafter || !version) { skipped.push(`${example.key} (${!drafter ? `no active account ${example.drafter}` : `no published ${example.template} template`})`); continue; }
    if (example.stage === "transmitted" && !harper) { skipped.push(`${example.key} (no Message Admin)`); continue; }

    // Every example starts at its own minute, and each step moves the clock on.
    let time = base - example.hoursAgo * 3600000;
    const step = () => { time += Math.max(1, example.stepMinutes) * 60000; at(time); };
    at(time);
    const { message } = await createMessage({ requestId: id, templateVersionId: version.id, subject: example.subject, precedence: example.precedence,
      messageType: exampleType(example), values: await inputValues(example, version.ui_schema.fields) }, drafter);
    // The insert takes created_at from the database clock; show the moment the drafter started it.
    await db.query("UPDATE outgoing_messages SET created_at = $2 WHERE id = $1", [message.id, new Date()]);
    if (example.stage === "drafting") { done.push(`${example.key}: drafting`); continue; }

    const state = async () => {
      const { rows: [row] } = await db.query("SELECT routing_revision, routing_route, workflow_status FROM outgoing_messages WHERE id = $1", [message.id]);
      return { revision: row.routing_revision as number, route: row.routing_route as RouteStep[], status: row.workflow_status as string };
    };
    step();
    let s = await state();
    await updateMessage(message.id, { action: "submit", revision: s.revision }, drafter);
    let endorsed = 0;
    let last = "submitted";
    while (true) {
      s = await state();
      const current = s.route.find((entry) => entry.status === "current");
      if (s.status !== "in_routing" || !current) break;
      const holder = usersById.get(current.personId);
      if (!holder) throw new Error(`${example.key}: the route holder ${current.personId} is not an active account.`);
      if (example.stage === "routing" && endorsed >= (example.endorsements ?? 0)) { last = `waiting on ${holder.name} (${current.title})`; break; }
      step();
      if (example.stage === "returned") {
        await updateMessage(message.id, { action: "return", revision: s.revision, comment: example.returnComment ?? "Returned for correction." }, holder);
        last = `returned by ${holder.name}`;
      } else if (current.action === "release") {
        if (example.stage === "routing") { last = `waiting on ${holder.name} (${current.title})`; break; }
        await updateMessage(message.id, { action: "release", revision: s.revision, comment: "" }, holder);
        last = `released by ${holder.name}`;
      } else {
        await updateMessage(message.id, { action: "advance", revision: s.revision, comment: "Concur." }, holder);
        endorsed += 1;
      }
    }
    if (example.stage === "transmitted") {
      const { rows: [tx] } = await db.query("SELECT id FROM transmissions WHERE outgoing_message_id = $1 AND status = 'queued'", [message.id]);
      if (tx && harper) {
        step();
        await transmit(harper, tx.id);
        last += `, transmitted by ${harper.name}`;
      }
    }
    done.push(`${example.key}: ${last}`);
  }
} finally {
  frozen = null;
  await db.end();
}

console.log(`Lifecycle examples: ${done.length} seeded, ${skipped.length} skipped. Typed templates created: ${createdTemplates}.`);
for (const line of done) console.log(`  + ${line}`);
for (const line of skipped) console.log(`  = ${line}`);
