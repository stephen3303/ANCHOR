import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
if (existsSync(`${root}.env`)) process.loadEnvFile(`${root}.env`);
const testDb = `anchor_template_test_${Date.now()}`;
const sendingCommandId = "00000000-0000-4000-8000-000000000001";
let created = false;
let app;
let logs = "";
function docker(args, input) {
  const result = spawnSync("docker", ["compose", "exec", "-T", "postgres", ...args], { cwd: root, input, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || "Docker command failed.");
  return result.stdout;
}
const sql = (statement) => docker(["sh", "-c", `exec psql -X -v ON_ERROR_STOP=1 -Atq -U "$POSTGRES_USER" -d ${testDb}`], statement);
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

try {
  if (!existsSync(`${root}.next/BUILD_ID`)) throw new Error("Run npm run build first.");
  docker(["sh", "-c", `createdb -U "$POSTGRES_USER" ${testDb}`]);
  created = true;
  sql(readFileSync(`${root}database/init/001-commands.sql`, "utf8"));
  sql(readFileSync(`${root}database/migrations/002-message-templates.sql`, "utf8"));
  sql(readFileSync(`${root}database/migrations/003-users-and-sessions.sql`, "utf8"));
  const seed = spawnSync(process.execPath, ["--import", "tsx", "scripts/seed-users.ts", "--sql"], { cwd: root, encoding: "utf8" });
  assert.equal(seed.status, 0, seed.stderr);
  sql(seed.stdout);
  sql(seed.stdout);
  assert.equal(sql("SELECT count(*) FROM users;").trim(), "10");
  const seededProfile = JSON.parse(sql("SELECT profile::text FROM users WHERE login = 'LTaylor';"));
  sql("INSERT INTO commands (name) SELECT 'TEST COMMAND ' || lpad(n::text, 2, '0') FROM generate_series(1, 60) n;");

  const socket = createServer();
  await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  const dbPortResult = spawnSync("docker", ["compose", "port", "postgres", "5432"], { cwd: root, encoding: "utf8" });
  if (dbPortResult.status !== 0) throw new Error("Cannot determine PostgreSQL's mapped port.");
  const dbPort = dbPortResult.stdout.trim().split(":").at(-1);
  const url = new URL(`postgresql://127.0.0.1:${dbPort}/${testDb}`);
  url.username = process.env.POSTGRES_USER || "anchor";
  url.password = process.env.POSTGRES_PASSWORD || "anchor-local-dev";
  app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root, env: { ...process.env, DATABASE_URL: url.toString(), ENABLE_TEMPLATE_AUTHORING: "true", ENABLE_DEMO_LOGIN: "true", SESSION_COOKIE_SECURE: "false" }, stdio: ["ignore", "pipe", "pipe"],
  });
  app.stdout.on("data", (chunk) => { logs += chunk; });
  app.stderr.on("data", (chunk) => { logs += chunk; });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { ready = (await fetch(`${base}/api/message-templates`)).ok; } catch { /* wait for server */ }
    if (ready) break;
    if (app.exitCode !== null) throw new Error(logs);
    await delay(200);
  }
  assert.ok(ready, `Server failed to become ready: ${logs}`);
  let sessionCookie = "";
  const publish = (body, headers = {}) => fetch(`${base}/api/message-templates`, { method: "POST", headers: { "Content-Type": "application/json", Origin: base, Cookie: sessionCookie, ...headers }, body: JSON.stringify(body) });
  const accountList = await (await fetch(`${base}/api/users`)).json();
  assert.equal(accountList.users.length, 10);
  const seededUser = accountList.users.find((user) => user.login === "LTaylor");
  assert.equal(seededUser.login, "LTaylor");
  assert.equal(seededUser.name, "LT Taylor");
  assert.equal(seededUser.commandName, "COMSUBLANT NORFOLK VA");
  assert.equal((await (await fetch(`${base}/api/session`)).json()).user, null);
  const login = async (userId, oldCookie = "") => {
    const response = await fetch(`${base}/api/session`, { method: "POST", headers: { "Content-Type": "application/json", Origin: base, Cookie: oldCookie }, body: JSON.stringify({ userId }) });
    assert.equal(response.status, 200, await response.clone().text());
    const cookie = response.headers.get("set-cookie");
    assert.ok(cookie.includes("HttpOnly") && /SameSite=strict/i.test(cookie));
    return { cookie: cookie.split(";")[0], user: (await response.json()).user };
  };
  assert.equal((await publish({})).status, 401);
  const signedIn = await login(seededUser.id);
  sessionCookie = signedIn.cookie;
  assert.equal(signedIn.user.unit, seededProfile.unit);
  assert.equal(signedIn.user.command, seededProfile.command);
  const resumed = await (await fetch(`${base}/api/session`, { headers: { Cookie: sessionCookie } })).json();
  assert.equal(resumed.user.id, seededUser.id);
  const workspacePage = await fetch(`${base}/templates`, { headers: { Cookie: sessionCookie } });
  assert.equal(new URL(workspacePage.url).pathname, "/templates");
  assert.ok((await workspacePage.text()).includes("Plaintext template"), "Signed-in workspace must render its page on the server");
  const definition = {
    name: "API test template", description: "Isolated test", text: "TO {{ Recipients }}\n{{ Status }}\n{{ Remarks }}",
    fields: [
      { name: "Recipients", control: "command-multiple", required: true, options: [] },
      { name: "Status", control: "select", required: true, options: ["Ready", "Not ready"] },
      { name: "Remarks", control: "textarea", required: false, options: [] },
    ],
  };
  const invalidTemplate = await publish({ ...definition, text: "{{ Missing }}" });
  assert.equal(invalidTemplate.status, 400, await invalidTemplate.text());
  assert.equal((await publish({ ...definition, fields: [] })).status, 400);
  assert.equal((await publish(definition, { Origin: "https://untrusted.example" })).status, 403);
  assert.equal((await publish(definition, { "Content-Type": "text/plain" })).status, 415);
  assert.equal((await publish({ ...definition, description: "x".repeat(310000) })).status, 413);
  assert.equal((await fetch(`${base}/api/message-templates`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: sessionCookie }, body: "{" })).status, 400);
  sql("UPDATE reference_sources SET enabled = false;");
  assert.equal((await publish(definition)).status, 409);
  assert.equal(sql("SELECT count(*) FROM message_templates;").trim(), "0");
  sql("UPDATE reference_sources SET enabled = true;");

  const response = await publish(definition);
  assert.equal(response.status, 201, await response.clone().text());
  const { template } = await response.json();
  assert.equal(sql(`SELECT created_by FROM message_templates WHERE id = '${template.id}';`).trim(), seededUser.id);
  const stored = await (await fetch(`${base}/api/message-templates/${template.id}`)).json();
  assert.equal(stored.template.text, definition.text);
  assert.deepEqual(stored.template.fields.map(({ name, control, required, options }) => ({ name, control, required, options })), definition.fields);
  const list = await (await fetch(`${base}/api/message-templates`)).json();
  assert.equal(list.templates[0].id, template.id);
  assert.equal(list.templates[0].variableCount, 3);
  assert.equal(sql("SELECT count(*) FROM message_template_versions WHERE published_at IS NOT NULL;").trim(), "1");
  assert.equal((await fetch(`${base}/api/message-templates/not-an-id`)).status, 400);
  assert.equal((await fetch(`${base}/api/message-templates/00000000-0000-0000-0000-000000000000`)).status, 404);
  const commands = await (await fetch(`${base}/api/reference-data/commands?q=TEST`)).json();
  assert.equal(commands.commands.length, 50);
  assert.equal(commands.nextCursor, "50");
  const secondPage = await (await fetch(`${base}/api/reference-data/commands?q=TEST&cursor=50`)).json();
  assert.equal(secondPage.commands.length, 10);
  assert.equal(secondPage.nextCursor, null);
  assert.equal(new Set([...commands.commands, ...secondPage.commands].map((command) => command.id)).size, 60);
  assert.equal((await fetch(`${base}/api/reference-data/commands?cursor=-1`)).status, 400);
  for (const separator of ["semicolon", "space", "newline"]) {
    const separated = { ...definition, fields: definition.fields.map((field, index) => index === 0 ? { ...field, separator } : field) };
    const published = await publish(separated);
    assert.equal(published.status, 201);
    const { template: selected } = await published.json();
    const readback = await (await fetch(`${base}/api/message-templates/${selected.id}`)).json();
    assert.equal(readback.template.fields[0].separator, separator);
  }
  assert.equal((await publish({ ...definition, fields: definition.fields.map((field, index) => index === 0 ? { ...field, separator: "comma" } : field) })).status, 400);
  assert.equal((await publish({ ...definition, fields: definition.fields.map((field, index) => index === 1 ? { ...field, separator: "space" } : field) })).status, 400);

  for (const control of ["select", "radio", "checkbox-group", "checkbox"]) {
    const choice = {
      name: "Output override test", description: "", text: "{{ Choice }}",
      fields: [{ name: "Choice", control, required: false, options: control === "checkbox" ? [] : ["Ready", "Not ready"], optionOutputs: control === "checkbox" ? { YES: "ACK", NO: "NO ACK" } : { Ready: "READY FOR TASKING" } }],
    };
    const savedChoice = await publish(choice);
    assert.equal(savedChoice.status, 201, await savedChoice.clone().text());
    const { template: result } = await savedChoice.json();
    const readback = await (await fetch(`${base}/api/message-templates/${result.id}`)).json();
    assert.deepEqual(readback.template.fields, choice.fields);
  }
  assert.equal((await publish({ name: "Old number", description: "", text: "{{ Value }}", fields: [{ name: "Value", control: "number", required: false, options: [] }] })).status, 400);
  assert.equal((await publish({ ...definition, fields: definition.fields.map((field, index) => index === 1 ? { ...field, optionOutputs: { Invalid: "Unknown option" } } : field) })).status, 400);

  // Autogenerated bindings are stored, but their output is resolved per request
  // using server-only context, never submitted values or a submitted clock.
  sql(`INSERT INTO commands (id, name) VALUES ('${sendingCommandId}', 'ORIGINATOR EXAMPLE');`);
  const automatic = {
    name: "Generated fields", description: "", text: "FROM {{ Originator }}\n{{ Timestamp }}\n{{ Date }}\n{{ DTG }}\n{{ Originator }}",
    fields: [
      { name: "Originator", control: "autogenerated", required: true, options: [], generator: { key: "sending-command", version: 1 } },
      { name: "Timestamp", control: "autogenerated", required: true, options: [], generator: { key: "current-timestamp", version: 2 } },
      { name: "Date", control: "autogenerated", required: true, options: [], generator: { key: "current-date", version: 2 } },
      { name: "DTG", control: "autogenerated", required: true, options: [], generator: { key: "current-dtg", version: 1 } },
    ],
  };
  assert.equal((await publish({ ...automatic, fields: automatic.fields.map((field) => ({ ...field, generator: { key: "eval", version: 1 } })) })).status, 400);
  const autoPublished = await publish(automatic);
  assert.equal(autoPublished.status, 201, await autoPublished.clone().text());
  const { template: autoTemplate } = await autoPublished.json();
  const savedAuto = await (await fetch(`${base}/api/message-templates/${autoTemplate.id}`)).json();
  assert.deepEqual(savedAuto.template.fields, automatic.fields);
  assert.equal(sql(`SELECT input_schema->'properties' FROM message_template_versions WHERE id = '${autoTemplate.versionId}';`).trim(), "{}");
  assert.equal(sql(`SELECT input_schema->'required' FROM message_template_versions WHERE id = '${autoTemplate.versionId}';`).trim(), "[]");
  const preview = (body, origin = base, cookie = sessionCookie) => fetch(`${base}/api/message-templates/preview-generated`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, Cookie: cookie }, body: JSON.stringify(body) });
  assert.equal((await preview(automatic, base, "")).status, 401);
  assert.equal((await preview(automatic, base, "anchor_session=LTaylor")).status, 401);
  assert.equal((await preview(automatic, "https://untrusted.example")).status, 403);
  const generatedResponse = await preview({ ...automatic, values: { Originator: "SPOOFED", Timestamp: "1900-01-01" }, context: { sendingCommand: { name: "SPOOFED" }, now: "1900-01-01" } });
  assert.equal(generatedResponse.status, 200);
  assert.equal(generatedResponse.headers.get("cache-control"), "no-store");
  const generated = await generatedResponse.json();
  assert.deepEqual(generated.errors, {});
  assert.equal(generated.values.Originator, "COMSUBLANT NORFOLK VA");
  assert.match(generated.values.Timestamp, /^\d{2} [A-Z]{3} \d{4} ([01]\d|2[0-3])[0-5]\dZ$/);
  assert.ok(Math.abs(Date.now() - Date.parse(generated.resolvedAt)) < 10000);
  assert.equal(generated.values.Date, generated.values.Timestamp.slice(0, -6));
  assert.match(generated.values.DTG, /^\d{6}Z [A-Z]{3} \d{2}$/);

  // A second independent browser session must resolve its own user's command.
  const secondId = sql(`INSERT INTO users (login, name, command_id) VALUES ('SecondUser', 'Second User', '${sendingCommandId}') RETURNING id;`).trim();
  const second = await login(secondId);
  const otherGenerated = await (await preview({ ...automatic, userId: seededUser.id, commandId: signedIn.user.commandId }, base, second.cookie)).json();
  assert.equal(otherGenerated.values.Originator, "ORIGINATOR EXAMPLE");
  assert.equal((await (await preview(automatic)).json()).values.Originator, "COMSUBLANT NORFOLK VA");
  sql(`UPDATE commands SET name = 'RENAMED ORIGINATOR' WHERE id = '${sendingCommandId}';`);
  const changed = await (await preview(automatic, base, second.cookie)).json();
  assert.equal(changed.values.Originator, "RENAMED ORIGINATOR");
  sql(`UPDATE users SET active = false WHERE id = '${secondId}';`);
  assert.equal((await preview(automatic, base, second.cookie)).status, 401);
  sql(`UPDATE users SET active = true WHERE id = '${secondId}';`);
  sql(`UPDATE user_sessions SET created_at = now() - interval '10 hours', expires_at = now() - interval '1 hour' WHERE user_id = '${secondId}';`);
  assert.equal((await preview(automatic, base, second.cookie)).status, 401);
  const rotated = await login(seededUser.id, sessionCookie);
  assert.notEqual(rotated.cookie, sessionCookie);
  assert.equal((await preview(automatic, base, sessionCookie)).status, 401);
  sessionCookie = rotated.cookie;
  // User management (Admin > Users) requires System Admin and persists changes.
  const admin = (path, method = "GET", body, cookie = sessionCookie) => fetch(`${base}/api/admin/users${path}`, {
    method, headers: { Origin: base, Cookie: cookie, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const patel = accountList.users.find((user) => user.login === "RPatel");
  const patelSession = await login(patel.id);
  assert.equal((await admin("", "GET", undefined, patelSession.cookie)).status, 403, "Non-admins cannot list users");
  assert.equal((await admin("", "GET", undefined, "")).status, 401);
  const managed = await (await admin("")).json();
  assert.equal(managed.users.length, 11);
  assert.ok(managed.users.find((user) => user.login === "RWalsh").roles.includes("Release Authority"));
  assert.equal((await admin("", "POST", { login: "TJones", rank: "lt", surname: "Jones", billet: "Assistant N3", unit: "COMSUBLANT N3", roles: ["Message Viewer"] }, sessionCookie)).status, 201);
  assert.equal((await admin("", "POST", { login: "tjones", rank: "LT", surname: "Jones", billet: "Assistant N3", unit: "COMSUBLANT N3", roles: [] })).status, 409);
  assert.equal((await admin("", "POST", { login: "Bad", rank: "LT", surname: "X", billet: "B", unit: "U", roles: ["Emperor"] })).status, 400);
  assert.equal((await admin("", "POST", { login: "X1", rank: "LT", surname: "X", billet: "B", unit: "U", roles: [] }, sessionCookie.replace(/=.*/, "=bad"))).status, 401);
  assert.equal((await (await fetch(`${base}/api/users`)).json()).users.length, 12);
  const edited = await admin(`/${patel.id}`, "PATCH", { billet: "Assistant Logistics Officer (N4A)", roles: ["Message Viewer", "Report Viewer"] });
  assert.equal(edited.status, 200, await edited.clone().text());
  assert.deepEqual((await edited.json()).user.roles, ["Message Viewer", "Report Viewer"]);
  assert.equal(JSON.parse(sql(`SELECT profile::text FROM users WHERE id = '${patel.id}';`)).billet, "Assistant Logistics Officer (N4A)");
  assert.equal((await admin(`/${seededUser.id}`, "PATCH", { active: false })).status, 400, "Admins cannot deactivate themselves");
  assert.equal((await admin(`/${seededUser.id}`, "PATCH", { roles: ["Message Viewer"] })).status, 400, "Admins cannot drop their own System Admin role");
  assert.equal((await admin(`/${patel.id}`, "PATCH", { active: false })).status, 200);
  assert.equal((await (await fetch(`${base}/api/session`, { headers: { Cookie: patelSession.cookie } })).json()).user, null, "Deactivation signs the user out");
  assert.ok(!(await (await fetch(`${base}/api/users`)).json()).users.some((user) => user.id === patel.id));
  assert.equal((await admin(`/${patel.id}`, "PATCH", { active: true })).status, 200);
  const crossOrigin = await fetch(`${base}/api/admin/users/${patel.id}`, { method: "PATCH", headers: { Origin: "https://untrusted.example", Cookie: sessionCookie, "Content-Type": "application/json" }, body: "{\"active\":false}" });
  assert.equal(crossOrigin.status, 403);

  // Editing a template publishes a new version under the same stable ID.
  const patchTemplate = (id, body, cookie = sessionCookie, origin = base) => fetch(`${base}/api/message-templates/${id}`, { method: "PATCH", headers: { Origin: origin, Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const originalVersion = JSON.parse(sql(`SELECT row_to_json(v) FROM message_template_versions v WHERE id='${template.versionId}';`));
  const pinnedId = sql(`INSERT INTO message_drafts(template_version_id,created_by,subject,rendered_document,rendered_text) VALUES ('${template.versionId}','${seededUser.id}','Pinned draft','{}','Original saved text') RETURNING id;`).trim();
  const revisedDefinition = { ...definition, text: `${definition.text}\nUPDATED {{ Remarks }}`, fields: definition.fields.map((field) => field.name === "Remarks" ? { ...field, control: "text" } : field) };
  const editPayload = { expectedVersionId: template.versionId, definition: revisedDefinition };
  const activePatel = await login(patel.id);
  assert.equal((await patchTemplate(template.id, editPayload, "")).status, 401);
  assert.equal((await patchTemplate(template.id, editPayload, activePatel.cookie)).status, 403);
  assert.equal((await patchTemplate(template.id, editPayload, sessionCookie, "https://untrusted.example")).status, 403);
  assert.equal((await patchTemplate(template.id, { ...editPayload, expectedVersionId: "invalid" })).status, 400);
  assert.equal((await patchTemplate(template.id, { ...editPayload, definition: { ...definition, fields: [] } })).status, 400);
  const simultaneousEdits = await Promise.all([patchTemplate(template.id, editPayload),patchTemplate(template.id, editPayload)]);
  assert.deepEqual(simultaneousEdits.map((response) => response.status).sort(), [201,409]);
  const versionTwo = (await (await fetch(`${base}/api/message-templates/${template.id}`)).json()).template;
  assert.equal(versionTwo.id, template.id); assert.equal(versionTwo.version, 2);
  assert.equal(versionTwo.text, revisedDefinition.text);
  assert.notEqual(versionTwo.versionId, template.versionId);
  assert.deepEqual(JSON.parse(sql(`SELECT row_to_json(v) FROM message_template_versions v WHERE id='${template.versionId}';`)), originalVersion);
  assert.equal(sql(`SELECT template_version_id FROM message_drafts WHERE id='${pinnedId}';`).trim(), template.versionId);
  assert.equal(sql(`SELECT rendered_text FROM message_drafts WHERE id='${pinnedId}';`).trim(), "Original saved text");
  assert.equal((await patchTemplate(template.id, editPayload)).status, 409);
  const patelLibrary = (await (await fetch(`${base}/api/message-templates`, { headers: { Cookie: activePatel.cookie } })).json()).templates;
  assert.equal(patelLibrary.find((item) => item.id === template.id).canEdit, false);
  assert.equal((await (await fetch(`${base}/api/message-templates`, { headers: { Cookie: sessionCookie } })).json()).templates.find((item) => item.id === template.id).canEdit, true);
  assert.ok((await (await fetch(`${base}/api/message-templates`)).json()).templates.every((item) => item.canEdit === false));
  const patelPublished = await publish({ ...definition, name: "Patel owned template" }, { Cookie: activePatel.cookie });
  assert.equal(patelPublished.status, 201);
  const patelTemplate = (await patelPublished.json()).template;
  const patelUpdate = { expectedVersionId: patelTemplate.versionId, definition: { ...definition, name: "Updated by command admin" } };
  assert.equal((await patchTemplate(patelTemplate.id, patelUpdate)).status, 201, "A command admin can revise a colleague's template");
  sql(`UPDATE users SET profile=jsonb_set(profile,'{roles}','[{"name":"System Admin","granted":true}]') WHERE id='${secondId}';`);
  const foreignAdmin = await login(secondId);
  assert.equal((await patchTemplate(template.id, { expectedVersionId: versionTwo.versionId, definition }, foreignAdmin.cookie)).status, 403);
  console.log("Template revision API passed: owner/admin permissions, concurrent edits, stale version rejection, preserved published definitions and pinned drafts.");
  if (process.argv.includes("--browser")) {
    const { chromium, expect } = await import("@playwright/test");
    const browser = await chromium.launch({ channel: process.env.E2E_BROWSER_CHANNEL || undefined, headless: true });
    try {
      const page = await browser.newPage();
      const errors = []; page.on("pageerror", (error) => errors.push(error.message));
      assert.equal((await page.request.post(`${base}/api/session`, { data: { userId: seededUser.id } })).status(), 200);
      await page.goto(`${base}/templates`);
      await page.getByTestId(`template-${template.id}`).getByRole("button", { name: `Edit ${definition.name}`, exact: true }).click();
      await expect(page.getByRole("textbox", { name: "Template name", exact: true })).toHaveValue(definition.name);
      await expect(page.getByRole("textbox", { name: "Plaintext template", exact: true })).toHaveValue(versionTwo.text);
      await page.getByRole("textbox", { name: "Plaintext template", exact: true }).fill(`${versionTwo.text}\nBrowser revision`);
      await page.getByRole("button", { name: "Detect and configure variables", exact: true }).click();
      await expect(page.getByRole("group", { name: "Status", exact: true }).getByRole("textbox", { name: /^Options \(one per line\)/ })).toHaveValue("Ready\nNot ready");
      await page.getByRole("group", { name: "Remarks", exact: true }).getByRole("combobox", { name: "Input type", exact: true }).selectOption("textarea");
      await page.getByRole("button", { name: "Review generated form", exact: true }).click();
      const publishing = page.waitForResponse((response) => response.url() === `${base}/api/message-templates/${template.id}` && response.request().method() === "PATCH");
      await page.getByRole("button", { name: "Publish new version", exact: true }).click();
      const published = await publishing;
      assert.equal(published.status(), 201, await published.text());
      assert.equal((await published.json()).template.version, 3);
      await expect(page.getByRole("heading", { name: "Template published", exact: true })).toBeVisible();
      await page.reload();
      const current = (await (await page.request.get(`${base}/api/message-templates/${template.id}`)).json()).template;
      assert.equal(current.version, 3); assert.equal(current.fields.find((field) => field.name === "Remarks").control, "textarea");
      assert.equal(current.text, `${versionTwo.text}\nBrowser revision`);
      assert.equal(sql(`SELECT template_version_id FROM message_drafts WHERE id='${pinnedId}';`).trim(), template.versionId);
      assert.deepEqual(errors, []);
      await page.request.delete(`${base}/api/session`);
      console.log("Template editing browser flow passed: load existing fields, modify text/control, publish a new version, reload, preserve old pins.");
    } finally { await browser.close(); }
  }

  const logout = await fetch(`${base}/api/session`, { method: "DELETE", headers: { Origin: base, Cookie: sessionCookie } });
  assert.equal(logout.status, 200);
  assert.equal((await preview(automatic)).status, 401);
  assert.equal((await (await fetch(`${base}/api/session`, { headers: { Cookie: sessionCookie } })).json()).user, null);
  const signedOutPage = await fetch(`${base}/templates`);
  assert.equal(new URL(signedOutPage.url).pathname, "/login");
  const html = await signedOutPage.text();
  assert.ok(html.includes("ANCHOR") && html.includes("Demo sign in"));
  console.log("API integration tests passed: user seed, user management, sessions, rotation/logout/expiry, per-user originators, Zulu outputs, and template persistence.");
} finally {
  if (app && app.exitCode === null) {
    const exited = new Promise((resolve) => app.once("exit", resolve));
    app.kill("SIGTERM");
    await exited;
  }
  if (created) docker(["sh", "-c", `dropdb --force -U "$POSTGRES_USER" ${testDb}`]);
}
