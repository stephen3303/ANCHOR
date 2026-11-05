import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createServer } from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
if (existsSync(`${root}.env`)) process.loadEnvFile(`${root}.env`);
const testDb = `anchor_drafting_test_${Date.now()}`;
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
  for (const filename of readdirSync(`${root}database/migrations`).filter((name) => name.endsWith(".sql")).sort()) {
    sql(readFileSync(`${root}database/migrations/${filename}`, "utf8"));
  }
  const messageSeed = spawnSync(process.execPath, ["--import", "tsx", "scripts/seed-messages.ts", "--sql"], { cwd: root, encoding: "utf8" });
  assert.equal(messageSeed.status, 0, messageSeed.stderr);
  sql(messageSeed.stdout);
  const seedCount = Number(sql("SELECT count(*) FROM messages;").trim());
  assert.ok(seedCount > 0);
  sql(messageSeed.stdout);
  assert.equal(Number(sql("SELECT count(*) FROM messages;").trim()), seedCount);
  const seed = spawnSync(process.execPath, ["--import", "tsx", "scripts/seed-users.ts", "--sql"], { cwd: root, encoding: "utf8" });
  assert.equal(seed.status, 0, seed.stderr);
  sql(seed.stdout);
  sql(seed.stdout);
  assert.equal(sql("SELECT count(*) FROM users;").trim(), "10");
  const routingSeed = spawnSync(process.execPath, ["--import", "tsx", "scripts/seed-routing.ts", "--sql"], { cwd: root, encoding: "utf8" });
  assert.equal(routingSeed.status, 0, routingSeed.stderr);
  sql(routingSeed.stdout); sql(routingSeed.stdout);
  const seededProfile = JSON.parse(sql("SELECT profile::text FROM users WHERE login = 'LTaylor';"));
  sql("INSERT INTO commands (name) SELECT 'TEST COMMAND ' || lpad(n::text, 2, '0') FROM generate_series(1, 30) n;");

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
  const readMessages = async (cookie = sessionCookie) => (await fetch(`${base}/api/messages`, { headers: { Cookie: cookie } })).json();
  const postMessage = (body, cookie = sessionCookie) => fetch(`${base}/api/messages`, { method: "POST", headers: { "Content-Type": "application/json", Origin: base, Cookie: cookie }, body: JSON.stringify(body) });
  assert.equal((await fetch(`${base}/api/messages`)).status, 401);
  assert.equal((await postMessage({}, "")).status, 401);
  const originalMessages = await readMessages();
  assert.equal(originalMessages.messages.length, seedCount);
  const original = originalMessages.messages[0];
  const originalRead = await (await fetch(`${base}/api/messages/${original.id}`, { headers: { Cookie: sessionCookie } })).json();
  assert.deepEqual(originalRead.message, original);
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
  assert.equal(sql("SELECT count(*) FROM message_templates;").trim(), "1");
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
  assert.equal(sql("SELECT count(*) FROM message_template_versions WHERE published_at IS NOT NULL;").trim(), "2");
  assert.equal((await fetch(`${base}/api/message-templates/not-an-id`)).status, 400);
  assert.equal((await fetch(`${base}/api/message-templates/00000000-0000-0000-0000-000000000000`)).status, 404);
  const commands = await (await fetch(`${base}/api/reference-data/commands?q=TEST`)).json();
  assert.equal(commands.commands.length, 25);
  assert.equal(commands.nextCursor, "25");
  const secondPage = await (await fetch(`${base}/api/reference-data/commands?q=TEST&cursor=25`)).json();
  assert.equal(secondPage.commands.length, 5);
  assert.equal(secondPage.nextCursor, null);
  assert.equal((await fetch(`${base}/api/reference-data/commands?cursor=-1`)).status, 400);
  const messagePayload = { requestId: randomUUID(), templateVersionId: template.versionId, subject: "Integration message draft", precedence: "PRIORITY", values: { Recipients: [commands.commands[1].id, commands.commands[0].id], Status: "Ready", Remarks: "Saved body {{ not-recursively-expanded }}" } };
  assert.equal((await postMessage({ ...messagePayload, values: { Status: "Ready" } })).status, 400);
  assert.equal((await postMessage({ ...messagePayload, values: { ...messagePayload.values, Status: "Unlisted" } })).status, 400);
  assert.equal((await postMessage({ ...messagePayload, values: { ...messagePayload.values, Recipients: ["00000000-0000-4000-8000-999999999999"] } })).status, 400);
  assert.equal((await postMessage({ ...messagePayload, originator: "SPOOFED" })).status, 400);
  assert.equal(sql("SELECT count(*) FROM message_drafts;").trim(), "0");
  sql("UPDATE reference_sources SET enabled = false;");
  assert.equal((await postMessage(messagePayload)).status, 409);
  sql("UPDATE reference_sources SET enabled = true;");
  const concurrent = await Promise.all([postMessage(messagePayload), postMessage(messagePayload)]);
  assert.deepEqual(concurrent.map((item) => item.status).sort(), [200, 201], await concurrent[0].clone().text());
  const { message: savedMessage } = await concurrent[0].json();
  assert.equal((await concurrent[1].json()).message.id, savedMessage.id);
  assert.equal(savedMessage.kind, "draft");
  assert.equal(savedMessage.originator, "COMSUBLANT NORFOLK VA");
  assert.equal(savedMessage.renderedText, `TO ${commands.commands[1].name}; ${commands.commands[0].name}\nReady\nSaved body {{ not-recursively-expanded }}`);
  assert.equal(sql("SELECT count(*) FROM message_drafts;").trim(), "1");
  assert.equal(sql("SELECT count(*) FROM message_draft_references;").trim(), "2");
  assert.equal((await postMessage({ ...messagePayload, subject: "Changed retry" })).status, 409);
  assert.equal((await readMessages()).messages.length, seedCount, "Unreleased drafts must not enter the feed");
  const largeTemplateResponse = await publish({ ...definition, text: `${definition.text}\n${"{{ Remarks }}".repeat(1000)}` });
  assert.equal(largeTemplateResponse.status, 201);
  const { template: largeTemplate } = await largeTemplateResponse.json();
  const oversized = await postMessage({ ...messagePayload, requestId: randomUUID(), templateVersionId: largeTemplate.versionId, values: { ...messagePayload.values, Remarks: "x".repeat(5000) } });
  assert.equal(oversized.status, 400);
  assert.equal(sql("SELECT count(*) FROM message_drafts;").trim(), "1");
  const savedRead = await (await fetch(`${base}/api/messages/${savedMessage.id}`, { headers: { Cookie: sessionCookie } })).json();
  assert.deepEqual(savedRead.message, savedMessage);
  assert.equal(sql(`SELECT count(*) FROM messages WHERE id='${savedMessage.id}';`).trim(), "0", "Private drafts are not published message artifacts");
  const deskPage = await (await fetch(`${base}/drafting`, { headers: { Cookie: sessionCookie } })).text();
  assert.ok(deskPage.includes("Drafting &amp; Release"));
  sql(messageSeed.stdout);
  assert.equal((await readMessages()).messages.length, seedCount);

  // The same stored message moves through a real, session-authorized chain.
  const readDesk = async (cookie = sessionCookie) => {
    const response = await fetch(`${base}/api/messages?view=drafts`, { headers: { Cookie: cookie } });
    assert.equal(response.status, 200, await response.clone().text()); return response.json();
  };
  const readDraft = async (id, cookie = sessionCookie) => (await readDesk(cookie)).drafts.find((draft) => draft.id === id);
  const patchDraft = (id, body, cookie = sessionCookie, origin = base) => fetch(`${base}/api/messages/${id}`, { method: "PATCH", headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const transition = async (id, action, cookie = sessionCookie, extras = {}) => {
    const draft = await readDraft(id, cookie); assert.ok(draft);
    const response = await patchDraft(id, { action, revision: draft.revision, ...extras }, cookie);
    assert.equal(response.status, 200, await response.clone().text()); return response.json();
  };
  const configRequest = (body, cookie = sessionCookie) => fetch(`${base}/api/routing`, { method: "PATCH", headers: { Cookie: cookie, Origin: base, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const configRead = async () => (await fetch(`${base}/api/routing`, { headers: { Cookie: sessionCookie } })).json();
  const sessions = {};
  for (const loginName of ["MRamos", "AChen", "RWalsh", "RPatel"]) sessions[loginName] = await login(accountList.users.find((user) => user.login === loginName).id);
  const ramos = sessions.MRamos.cookie, chen = sessions.AChen.cookie, walsh = sessions.RWalsh.cookie;
  assert.equal((await fetch(`${base}/api/messages?view=drafts`)).status, 401);
  assert.equal((await fetch(`${base}/api/routing`)).status, 401);
  assert.equal((await fetch(`${base}/api/messages/${savedMessage.id}`, { headers: { Cookie: sessions.RPatel.cookie } })).status, 404);
  assert.equal((await configRequest(await configRead(), ramos)).status, 403);
  let draft = await readDraft(savedMessage.id);
  assert.equal(draft.status, "drafting");
  assert.equal(draft.templateVersionId, template.versionId);
  assert.equal(draft.commandSelections.Recipients[0].id, messagePayload.values.Recipients[0]);
  assert.equal((await patchDraft(draft.id, { action: "submit", revision: draft.revision, actorId: sessions.MRamos.user.id })).status, 400);
  assert.equal((await patchDraft(draft.id, { action: "release", revision: draft.revision })).status, 409);
  assert.equal((await patchDraft(draft.id, { action: "submit", revision: draft.revision }, sessionCookie, "https://untrusted.example")).status, 403);
  await transition(draft.id, "submit");
  draft = await readDraft(draft.id);
  assert.equal(draft.status, "in_routing");
  assert.equal(draft.route[0].personId, sessions.MRamos.user.id);
  assert.equal((await readDraft(draft.id, ramos)).id, draft.id);
  assert.equal((await patchDraft(draft.id, { action: "advance", revision: draft.revision })).status, 403);
  assert.equal((await patchDraft(draft.id, { action: "release", revision: draft.revision }, walsh)).status, 403);
  assert.equal((await patchDraft(draft.id, { action: "edit", revision: draft.revision, subject: "Bypass review", precedence: "ROUTINE", values: messagePayload.values })).status, 409);
  const doubleEndorsement = await Promise.all([patchDraft(draft.id, { action: "advance", revision: draft.revision }, ramos), patchDraft(draft.id, { action: "advance", revision: draft.revision }, ramos)]);
  assert.deepEqual(doubleEndorsement.map((response) => response.status).sort(), [200,409]);
  draft = await readDraft(draft.id);
  assert.equal((await patchDraft(draft.id, { action: "return", revision: draft.revision }, chen)).status, 400);
  await transition(draft.id, "return", chen, { comment: "Correct the remarks." });
  draft = await readDraft(draft.id);
  assert.equal(draft.status, "returned");
  const corrections = { action: "edit", revision: draft.revision, subject: "Approved integration message", precedence: "PRIORITY", messageType: "COMSUBLANT MSG", values: { ...messagePayload.values, Remarks: "Corrected and approved exact template text." } };
  const corrected = await patchDraft(draft.id, corrections);
  assert.equal(corrected.status, 200, await corrected.clone().text());
  const approvedText = (await corrected.json()).message.renderedText;
  assert.equal((await patchDraft(draft.id, corrections)).status, 409);
  await transition(draft.id, "submit");
  draft = await readDraft(draft.id);
  const approvalRevision = draft.revision;
  assert.deepEqual(draft.route.map((step) => step.status), ["current","pending","pending"], "Returning/editing cannot retain old endorsements");
  // Changing the configured workflow cannot silently replace an in-flight route.
  const originalConfig = await configRead();
  const changedConfig = { ...originalConfig, workflows: originalConfig.workflows.map((workflow) => ({ ...workflow, name: `${workflow.name} updated` })) };
  assert.equal((await configRequest(changedConfig)).status, 200);
  assert.equal((await configRequest(changedConfig)).status, 409);
  assert.deepEqual((await readDraft(draft.id)).route, draft.route);
  const latestConfig = await configRead();
  assert.equal((await configRequest({ ...latestConfig, workflows: originalConfig.workflows })).status, 200);
  assert.equal((await readMessages()).messages.length, seedCount);
  // Review uses the saved snapshot, not a newly resolved directory name.
  sql(`UPDATE commands SET name = 'RENAMED AFTER SUBMISSION' WHERE id = '${commands.commands[0].id}';`);
  await transition(draft.id, "advance", ramos);
  await transition(draft.id, "advance", chen);
  const walshId = sessions.RWalsh.user.id;
  sql(`UPDATE users SET profile = jsonb_set(profile,'{roles}',(SELECT jsonb_agg(CASE WHEN role->>'name' = 'Designated Release Authority' THEN jsonb_set(role,'{granted}','false') ELSE role END) FROM jsonb_array_elements(profile->'roles') role)) WHERE id = '${walshId}';`);
  draft = await readDraft(draft.id);
  assert.equal((await patchDraft(draft.id, { action: "release", revision: draft.revision }, walsh)).status, 403, "Current database roles, not stale browser claims, authorize release");
  assert.equal((await readMessages()).messages.length, seedCount);
  sql(`UPDATE users SET profile = jsonb_set(profile,'{roles}',(SELECT jsonb_agg(CASE WHEN role->>'name' = 'Designated Release Authority' THEN jsonb_set(role,'{granted}','true') ELSE role END) FROM jsonb_array_elements(profile->'roles') role)) WHERE id = '${walshId}';`);
  const releaseAttempts = await Promise.all([patchDraft(draft.id, { action: "release", revision: draft.revision }, walsh),patchDraft(draft.id, { action: "release", revision: draft.revision }, walsh)]);
  assert.deepEqual(releaseAttempts.map((response) => response.status).sort(), [200,409]);
  const released = (await readMessages()).messages.find((message) => message.id === draft.id);
  assert.equal(released.kind, "released"); assert.equal(released.renderedText, approvedText); assert.equal(released.rawText, approvedText);
  assert.ok(released.c2oixId.startsWith("ANCHOR-"), "Local release must not invent an external receipt");
  const localArtifact = await (await fetch(`${base}/api/messages/${released.id}/artifact`, { headers: { Cookie: sessionCookie } })).json();
  assert.equal(localArtifact.intact, true);
  assert.equal(localArtifact.rawText, approvedText);
  assert.equal(released.localSequence, "#0042"); assert.ok(released.dtg); assert.equal(released.releasedBy, walshId);
  assert.equal((await readMessages()).messages.length, seedCount + 1);
  assert.ok((await readMessages(sessions.RPatel.cookie)).messages.some((message) => message.id === draft.id));
  assert.equal((await patchDraft(draft.id, { action: "withdraw", revision: (await readDraft(draft.id)).revision })).status, 409);
  const releasedHistory = (await readDesk()).events.filter((event) => event.draftId === draft.id);
  assert.equal(releasedHistory.filter((event) => event.type === "released").length, 1);
  assert.equal(new Set(releasedHistory.filter((event) => event.revision >= approvalRevision).map((event) => event.snapshotHash)).size, 1);
  assert.throws(() => sql(`UPDATE outgoing_message_events SET comment = 'tampered' WHERE message_id = '${draft.id}';`), /append-only/);
  assert.throws(() => sql(`DELETE FROM outgoing_message_events WHERE message_id = '${draft.id}';`), /append-only/);
  sql(`UPDATE commands SET name = '${commands.commands[0].name}' WHERE id = '${commands.commands[0].id}';`);
  // Two releases lock the same persistent counter and get distinct sequences.
  const parallelIds = [];
  for (let index = 0; index < 2; index++) {
    const response = await postMessage({ ...messagePayload, requestId: randomUUID(), subject: `Parallel ${index}` });
    assert.equal(response.status, 201); const { message } = await response.json(); parallelIds.push(message.id);
    await transition(message.id, "submit"); await transition(message.id, "advance", ramos); await transition(message.id, "advance", chen);
  }
  const parallelReleases = await Promise.all(parallelIds.map((id) => transition(id, "release", walsh)));
  assert.deepEqual(parallelReleases.map((result) => result.message.localSequence).sort(), ["#0043","#0044"]);
  sql(routingSeed.stdout);
  assert.equal((await configRead()).settings.nextSequence, 45, "Routine reseeding must never reset the release counter");
  const withdrawnCreate = await postMessage({ ...messagePayload, requestId: randomUUID(), subject: "Withdraw this draft" });
  const withdrawnId = (await withdrawnCreate.json()).message.id;
  const ramosId = sessions.MRamos.user.id;
  sql(`UPDATE users SET active=false WHERE id='${ramosId}';`);
  const unsubmitted = await readDraft(withdrawnId);
  assert.equal((await patchDraft(withdrawnId, { action: "submit", revision: unsubmitted.revision })).status, 409);
  sql(`UPDATE users SET active=true WHERE id='${ramosId}';`);
  await transition(withdrawnId, "submit");
  assert.equal((await patchDraft(withdrawnId, { action: "withdraw", revision: (await readDraft(withdrawnId)).revision }, ramos)).status, 403);
  await transition(withdrawnId, "withdraw");
  assert.equal((await readDraft(withdrawnId)).status, "withdrawn");
  assert.ok(!(await readMessages()).messages.some((message) => message.id === withdrawnId));
  assert.equal((await readMessages()).messages.length, seedCount + 3);
  console.log("Persistent routing passed: authenticated sequential approvals, returns/edits, immutable snapshots/history, stale revisions, role revocation, withdrawal, visibility and concurrent release sequencing.");

  for (const separator of ["semicolon", "space", "newline"]) {
    const separated = { ...definition, fields: definition.fields.map((field, index) => index === 0 ? { ...field, separator } : field) };
    const published = await publish(separated);
    assert.equal(published.status, 201);
    const { template: selected } = await published.json();
    const readback = await (await fetch(`${base}/api/message-templates/${selected.id}`)).json();
    assert.equal(readback.template.fields[0].separator, separator);
    const separatedCreate = await postMessage({ ...messagePayload, requestId: randomUUID(), templateVersionId: selected.versionId, subject: `Separator ${separator}` });
    assert.equal(separatedCreate.status, 201, await separatedCreate.clone().text());
    const { message: separatedMessage } = await separatedCreate.json();
    const separatorText = { semicolon: "; ", space: " ", newline: "\n" }[separator];
    assert.ok(separatedMessage.renderedText.startsWith(`TO ${commands.commands[1].name}${separatorText}${commands.commands[0].name}\n`));
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
    const selectedValue = control === "checkbox" ? false : control === "checkbox-group" ? ["Ready", "Not ready"] : "Ready";
    const choiceCreate = await postMessage({ requestId: randomUUID(), templateVersionId: result.versionId, subject: `Choice ${control}`, precedence: "ROUTINE", values: { Choice: selectedValue } });
    assert.equal(choiceCreate.status, 201, await choiceCreate.clone().text());
    assert.equal((await choiceCreate.json()).message.renderedText, control === "checkbox" ? "NO ACK" : control === "checkbox-group" ? "READY FOR TASKING; Not ready" : "READY FOR TASKING");
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
  assert.equal((await readMessages(second.cookie)).messages.length, seedCount + 3, "Published traffic follows main's shared message-store visibility");
  assert.equal((await fetch(`${base}/api/messages/${savedMessage.id}`, { headers: { Cookie: second.cookie } })).status, 200);
  const automaticPayload = { requestId: randomUUID(), templateVersionId: autoTemplate.versionId, subject: "Other user's automatic draft", precedence: "ROUTINE", values: {} };
  assert.equal((await postMessage({ ...automaticPayload, values: { Originator: "SPOOFED" } }, second.cookie)).status, 400);
  const secondCreated = await postMessage(automaticPayload, second.cookie);
  assert.equal(secondCreated.status, 201, await secondCreated.clone().text());
  const { message: secondMessage } = await secondCreated.json();
  assert.ok(secondMessage.renderedText.startsWith("FROM ORIGINATOR EXAMPLE\n"));
  assert.ok(!secondMessage.renderedText.includes("{{"));
  assert.equal((await fetch(`${base}/api/messages/${secondMessage.id}`, { headers: { Cookie: sessionCookie } })).status, 404);
  const otherGenerated = await (await preview({ ...automatic, userId: seededUser.id, commandId: signedIn.user.commandId }, base, second.cookie)).json();
  assert.equal(otherGenerated.values.Originator, "ORIGINATOR EXAMPLE");
  assert.equal((await (await preview(automatic)).json()).values.Originator, "COMSUBLANT NORFOLK VA");
  sql(`UPDATE commands SET name = 'RENAMED ORIGINATOR' WHERE id = '${sendingCommandId}';`);
  const changed = await (await preview(automatic, base, second.cookie)).json();
  assert.equal(changed.values.Originator, "RENAMED ORIGINATOR");
  const unchangedSnapshot = await (await fetch(`${base}/api/messages/${secondMessage.id}`, { headers: { Cookie: second.cookie } })).json();
  assert.equal(unchangedSnapshot.message.renderedText, secondMessage.renderedText);
  sql(`UPDATE users SET active = false WHERE id = '${secondId}';`);
  assert.equal((await preview(automatic, base, second.cookie)).status, 401);
  sql(`UPDATE users SET active = true WHERE id = '${secondId}';`);
  sql(`UPDATE user_sessions SET created_at = now() - interval '10 hours', expires_at = now() - interval '1 hour' WHERE user_id = '${secondId}';`);
  assert.equal((await preview(automatic, base, second.cookie)).status, 401);
  if (process.argv.includes("--browser")) {
    const { chromium, expect } = await import("@playwright/test");
    const browser = await chromium.launch({ channel: process.env.E2E_BROWSER_CHANNEL || undefined, headless: true });
    try {
      const page = await browser.newPage();
      const browserErrors = [];
      page.on("pageerror", (error) => browserErrors.push(error.message));
      const switchAccount = async (name) => {
        const result = await page.request.post(`${base}/api/session`, { data: { userId: accountList.users.find((user) => user.login === name).id } });
        assert.equal(result.status(), 200);
        await page.goto(`${base}/drafting`);
      };
      await switchAccount("LTaylor");
      await expect(page.getByRole("navigation", { name: "Main", exact: true }).getByRole("link", { name: "Create Message", exact: true })).toHaveCount(0);
      await page.getByRole("button", { name: "New Draft", exact: true }).click();
      await page.getByRole("combobox", { name: "Message template", exact: true }).selectOption(template.id);
      await page.getByRole("textbox", { name: "Message subject", exact: true }).fill("Browser-created draft");
      const recipients = page.getByRole("group", { name: /^Recipients/ });
      await recipients.getByRole("textbox", { name: "Search commands" }).fill(commands.commands[0].name);
      await recipients.getByRole("checkbox", { name: commands.commands[0].name, exact: true }).check();
      await page.getByRole("combobox", { name: "Status", exact: true }).selectOption("Ready");
      await page.getByRole("textbox", { name: "Remarks", exact: true }).fill("Created through the browser");
      const saved = page.waitForResponse((response) => response.url() === `${base}/api/messages` && response.request().method() === "POST");
      await page.getByRole("button", { name: "Save draft", exact: true }).click();
      const saveResponse = await saved;
      assert.equal(saveResponse.status(), 201, await saveResponse.text());
      const { message: browserMessage } = await saveResponse.json();
      assert.ok(browserMessage.renderedText.includes(commands.commands[0].name));
      await expect(page).toHaveURL(`${base}/drafting`);
      await expect(page.getByRole("heading", { name: "Browser-created draft", exact: true })).toBeVisible();
      const actInBrowser = async (label) => {
        const waiting = page.waitForResponse((response) => response.url() === `${base}/api/messages/${browserMessage.id}` && response.request().method() === "PATCH");
        await page.getByRole("button", { name: label, exact: true }).click();
        const response = await waiting;
        assert.equal(response.status(), 200, await response.text());
      };
      const openAs = async (name) => {
        await switchAccount(name);
        await page.getByRole("button").filter({ hasText: "Browser-created draft" }).click();
        await expect(page.getByRole("heading", { name: "Browser-created draft", exact: true })).toBeVisible();
      };
      await actInBrowser("Submit for routing");
      await page.reload();
      await page.getByRole("button").filter({ hasText: "Browser-created draft" }).click();
      const beforeRelease = await (await page.request.get(`${base}/api/messages`)).json();
      assert.ok(!beforeRelease.messages.some((message) => message.id === browserMessage.id));
      await openAs("MRamos"); await actInBrowser("Endorse and advance");
      await openAs("AChen");
      await page.getByRole("textbox", { name: "Review comment", exact: true }).fill("Correct the remarks in the template.");
      await actInBrowser("Return for correction");
      await openAs("LTaylor");
      await page.getByRole("button", { name: "Edit template fields", exact: true }).click();
      await expect(page.getByRole("button", { name: `Remove ${commands.commands[0].name}`, exact: true })).toBeVisible();
      await expect(page.getByRole("textbox", { name: "Remarks", exact: true })).toHaveValue("Created through the browser");
      await page.getByRole("textbox", { name: "Remarks", exact: true }).fill("Corrected in the browser");
      await actInBrowser("Save corrections"); await actInBrowser("Submit for routing");
      await openAs("MRamos"); await actInBrowser("Endorse and advance");
      await openAs("AChen"); await actInBrowser("Endorse and advance");
      await openAs("RWalsh"); await actInBrowser("Release message");
      await page.getByRole("link", { name: "View released message", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Browser-created draft", exact: true })).toBeVisible();
      await expect(page.getByText("Approved message text", { exact: true })).toBeVisible();
      await page.goto(`${base}/messages`);
      await page.getByRole("textbox", { name: "Search messages", exact: true }).fill("Browser-created draft");
      await expect(page.getByRole("button", { name: "Browser-created draft", exact: true })).toBeVisible();
      await page.goto(`${base}/messages/${browserMessage.id}/print`);
      await expect(page.getByText("Released in ANCHOR — External transmission not performed.", { exact: false })).toBeVisible();
      assert.deepEqual(browserErrors, []);
      await page.request.delete(`${base}/api/session`);
      console.log("Browser drafting passed: template form, persisted private draft, real-account reviews, return/correction with hydrated commands, release, message list, reader and print.");
    } finally { await browser.close(); }
  }
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
  assert.ok(managed.users.find((user) => user.login === "RWalsh").roles.includes("Designated Release Authority"));
  assert.equal((await admin("", "POST", { login: "TJones", rank: "lt", surname: "Jones", billet: "Assistant N3", unit: "COMSUBLANT N3", roles: ["Message Viewer"] }, sessionCookie)).status, 201);
  assert.equal((await admin("", "POST", { login: "tjones", rank: "LT", surname: "Jones", billet: "Assistant N3", unit: "COMSUBLANT N3", roles: [] })).status, 409);
  assert.equal((await admin("", "POST", { login: "Bad", rank: "LT", surname: "X", billet: "B", unit: "U", roles: ["Emperor"] })).status, 400);
  assert.equal((await admin("", "POST", { login: "X1", rank: "LT", surname: "X", billet: "B", unit: "U", roles: [] }, sessionCookie.replace(/=.*/, "=bad"))).status, 401);
  assert.equal((await (await fetch(`${base}/api/users`)).json()).users.length, 12);
  const edited = await admin(`/${patel.id}`, "PATCH", { billet: "Assistant Logistics Officer (N4A)", roles: ["Message Viewer", "Briefing Creator"] });
  assert.equal(edited.status, 200, await edited.clone().text());
  assert.deepEqual((await edited.json()).user.roles, ["Message Viewer", "Briefing Creator"]);
  assert.equal(JSON.parse(sql(`SELECT profile::text FROM users WHERE id = '${patel.id}';`)).billet, "Assistant Logistics Officer (N4A)");
  assert.equal((await admin(`/${seededUser.id}`, "PATCH", { active: false })).status, 400, "Admins cannot deactivate themselves");
  assert.equal((await admin(`/${seededUser.id}`, "PATCH", { roles: ["Message Viewer"] })).status, 400, "Admins cannot drop their own System Admin role");
  assert.equal((await admin(`/${patel.id}`, "PATCH", { active: false })).status, 200);
  assert.equal((await (await fetch(`${base}/api/session`, { headers: { Cookie: patelSession.cookie } })).json()).user, null, "Deactivation signs the user out");
  assert.ok(!(await (await fetch(`${base}/api/users`)).json()).users.some((user) => user.id === patel.id));
  assert.equal((await admin(`/${patel.id}`, "PATCH", { active: true })).status, 200);
  const crossOrigin = await fetch(`${base}/api/admin/users/${patel.id}`, { method: "PATCH", headers: { Origin: "https://untrusted.example", Cookie: sessionCookie, "Content-Type": "application/json" }, body: "{\"active\":false}" });
  assert.equal(crossOrigin.status, 403);

  const logout = await fetch(`${base}/api/session`, { method: "DELETE", headers: { Origin: base, Cookie: sessionCookie } });
  assert.equal(logout.status, 200);
  assert.equal((await preview(automatic)).status, 401);
  assert.equal((await (await fetch(`${base}/api/session`, { headers: { Cookie: sessionCookie } })).json()).user, null);
  const signedOutPage = await fetch(`${base}/templates`);
  assert.equal(new URL(signedOutPage.url).pathname, "/login");
  const html = await signedOutPage.text();
  assert.ok(html.includes("ANCHOR") && html.includes("Demo sign in"));
  console.log("API integration tests passed: message seeds/validation/idempotency/privacy/snapshots, templates, sessions, and Zulu outputs.");
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  if (app && app.exitCode === null) {
    const exited = new Promise((resolve) => app.once("exit", resolve));
    app.kill("SIGTERM");
    await exited;
  }
  if (created) docker(["sh", "-c", `dropdb --force -U "$POSTGRES_USER" ${testDb}`]);
}
