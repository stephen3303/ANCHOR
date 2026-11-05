import assert from "node:assert/strict";
import { templateFixture, standardInputNames, standardInputValues, customMessageBody, authorFields } from "./template-test-fixtures.mjs";
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
  const readMessages = async (cookie = sessionCookie) => (await fetch(`${base}/api/messages`, { headers: { Cookie: cookie } })).json();
  const postMessage = (body, cookie = sessionCookie) => fetch(`${base}/api/messages`, { method: "POST", headers: { "Content-Type": "application/json", Origin: base, Cookie: cookie }, body: JSON.stringify(body) });
  assert.equal((await fetch(`${base}/api/messages`)).status, 401);
  assert.equal((await postMessage({}, "")).status, 401);
  const originalMessages = await readMessages();
  assert.equal(originalMessages.messages.length, seedCount);
  const original = originalMessages.messages[0];
  const originalRead = await (await fetch(`${base}/api/messages/${original.id}`, { headers: { Cookie: sessionCookie } })).json();
  assert.deepEqual(originalRead.message, original);
  const definition = templateFixture({
    name: "TEST", description: "Isolated test", text: "TO {{ Destinations }}\n{{ Status }}\n{{ Remarks }}\n{{ Type }}",
    fields: [
      { name: "Destinations", control: "command-multiple", required: true, options: [] },
      { name: "Status", control: "select", required: true, options: ["Ready", "Not ready"] },
      { name: "Remarks", control: "textarea", required: false, options: [] },
      { name: "Type", control: "text", required: true, options: [], fixedValue: "TEST" },
    ],
  });
  const readTopics = async (cookie = sessionCookie) => {
    const response = await fetch(`${base}/api/subscriptions`, { headers: { Cookie: cookie } });
    assert.equal(response.status, 200, await response.clone().text());
    return (await response.json()).topics;
  };
  const changeTopic = (id, subscribed, cookie = sessionCookie, origin = base) => fetch(`${base}/api/subscriptions/${id}`, { method: subscribed ? "PUT" : "DELETE", headers: { Cookie: cookie, Origin: origin } });
  assert.equal((await fetch(`${base}/api/subscriptions`)).status, 401);
  assert.ok(!(await readTopics()).some((topic) => topic.name === "TEST"), "Type is absent before the first template is created");
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
  const templateTopic = (await readTopics()).find((topic) => topic.name === "TEST");
  assert.ok(templateTopic); assert.equal(templateTopic.messageCount, 0); assert.equal(templateTopic.subscribed, false);
  assert.deepEqual(templateTopic.templates, ["API test template"], "Each type names the templates that draft it");
  sql("INSERT INTO message_topics(name) VALUES ('TEST:SUBTAG');");
  const parentTopics = await readTopics();
  assert.ok(parentTopics.some((topic) => topic.name === "TEST:SUBTAG"));
  assert.equal(parentTopics.filter((topic) => topic.name === "TEST").length, 1, "A TYPE:SUBTAG topic reuses its existing parent type");
  sql("INSERT INTO message_topics(name) VALUES ('PARENTLESS:ONE');");
  assert.ok((await readTopics()).some((topic) => topic.name === "PARENTLESS"), "A TYPE:SUBTAG topic registers its parent type");
  assert.equal((await changeTopic(templateTopic.id, true)).status, 200, "Users may subscribe before any matching message is sent");
  assert.deepEqual((await (await fetch(`${base}/api/messages?view=subscriptions`, { headers: { Cookie: sessionCookie } })).json()).messages, []);
  assert.equal(sql(`SELECT created_by FROM message_templates WHERE id = '${template.id}';`).trim(), seededUser.id);
  const stored = await (await fetch(`${base}/api/message-templates/${template.id}`)).json();
  assert.equal(stored.template.text, definition.text);
  assert.deepEqual(authorFields(stored.template.fields), definition.fields);
  const list = await (await fetch(`${base}/api/message-templates`)).json();
  assert.equal(list.templates[0].id, template.id);
  assert.equal(list.templates[0].variableCount, definition.fields.length);
  assert.equal(sql("SELECT count(*) FROM message_template_versions WHERE published_at IS NOT NULL;").trim(), "2");
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
  const messagePayload = { requestId: randomUUID(), templateVersionId: template.versionId, subject: "Integration message draft", precedence: "PRIORITY", values: { ...standardInputValues(commands.commands[0].id), Destinations: [commands.commands[1].id, commands.commands[0].id], Status: "Ready", Remarks: "Saved body {{ not-recursively-expanded }}" } };
  assert.equal((await postMessage({ ...messagePayload, values: { Status: "Ready" } })).status, 400);
  assert.equal((await postMessage({ ...messagePayload, values: { ...messagePayload.values, Status: "Unlisted" } })).status, 400);
  assert.equal((await postMessage({ ...messagePayload, values: { ...messagePayload.values, Destinations: ["00000000-0000-4000-8000-999999999999"] } })).status, 400);
  assert.equal((await postMessage({ ...messagePayload, originator: "SPOOFED" })).status, 400);
  assert.equal((await postMessage({ ...messagePayload, values: { ...messagePayload.values, Type: "SPOOFED" } })).status, 400);
  assert.equal(sql("SELECT count(*) FROM message_drafts;").trim(), "0");
  sql("UPDATE reference_sources SET enabled = false;");
  assert.equal((await postMessage(messagePayload)).status, 409);
  sql("UPDATE reference_sources SET enabled = true;");
  const concurrent = await Promise.all([postMessage(messagePayload), postMessage(messagePayload)]);
  assert.deepEqual(concurrent.map((item) => item.status).sort(), [200, 201], await concurrent[0].clone().text());
  const { message: savedMessage } = await concurrent[0].json();
  assert.equal((await concurrent[1].json()).message.id, savedMessage.id);
  assert.equal(savedMessage.kind, "draft");
  assert.equal((await readTopics()).find((topic) => topic.id === templateTopic.id).messageCount, 0, "Private drafts do not create published-message mappings");
  assert.deepEqual(templateTopic.templates, ["TEST"], "The Subscriptions page names the template that drafts the type");
  assert.equal(savedMessage.originator, "COMSUBLANT NORFOLK VA");
  assert.equal(customMessageBody(savedMessage.renderedText), `TO ${commands.commands[1].name}; ${commands.commands[0].name}\nReady\nSaved body {{ not-recursively-expanded }}\nTEST`);
  assert.equal(sql("SELECT count(*) FROM message_drafts;").trim(), "1");
  assert.equal(sql("SELECT count(*) FROM message_draft_references;").trim(), "4");
  assert.equal((await postMessage({ ...messagePayload, subject: "Changed retry" })).status, 409);
  assert.equal((await readMessages()).messages.length, seedCount, "Unreleased drafts must not enter the feed");
  const largeTemplateResponse = await publish({ ...definition, text: definition.text.replace("\nNNNN", `\n${"{{ Remarks }}".repeat(1000)}\nNNNN`) });
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
  for (const loginName of ["MRamos", "AChen", "RWalsh", "RPatel", "DHarper"]) sessions[loginName] = await login(accountList.users.find((user) => user.login === loginName).id);
  const ramos = sessions.MRamos.cookie, chen = sessions.AChen.cookie, walsh = sessions.RWalsh.cookie;
  assert.equal((await fetch(`${base}/api/messages?view=drafts`)).status, 401);
  assert.equal((await fetch(`${base}/api/routing`)).status, 401);
  assert.equal((await fetch(`${base}/api/messages/${savedMessage.id}`, { headers: { Cookie: sessions.RPatel.cookie } })).status, 404);
  assert.equal((await configRequest(await configRead(), ramos)).status, 403);
  let draft = await readDraft(savedMessage.id);
  assert.equal(draft.status, "drafting");
  assert.equal(draft.templateVersionId, template.versionId);
  assert.equal(draft.commandSelections.Destinations[0].id, messagePayload.values.Destinations[0]);
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
  const editingDuringReview = await patchDraft(draft.id, { action: "edit", revision: draft.revision, subject: messagePayload.subject, precedence: "PRIORITY", values: messagePayload.values });
  assert.equal(editingDuringReview.status, 200, await editingDuringReview.clone().text());
  assert.equal((await readDraft(draft.id)).status, "drafting");
  assert.deepEqual((await readDraft(draft.id)).route.map((step) => step.status), ["pending","pending","pending"]);
  assert.equal((await patchDraft(draft.id, { action: "advance", revision: draft.revision }, ramos)).status, 409, "An author edit invalidates in-flight review requests");
  await transition(draft.id, "submit");
  draft = await readDraft(draft.id);
  const doubleEndorsement = await Promise.all([patchDraft(draft.id, { action: "advance", revision: draft.revision }, ramos), patchDraft(draft.id, { action: "advance", revision: draft.revision }, ramos)]);
  assert.deepEqual(doubleEndorsement.map((response) => response.status).sort(), [200,409]);
  draft = await readDraft(draft.id);
  assert.equal((await patchDraft(draft.id, { action: "return", revision: draft.revision }, chen)).status, 400);
  await transition(draft.id, "return", chen, { comment: "Correct the remarks." });
  draft = await readDraft(draft.id);
  assert.equal(draft.status, "returned");
  const corrections = { action: "edit", revision: draft.revision, subject: "Approved integration message", precedence: "PRIORITY", messageType: "GENADMIN", values: { ...messagePayload.values, Remarks: "Corrected and approved exact template text." } };
  const corrected = await patchDraft(draft.id, corrections);
  assert.equal(corrected.status, 200, await corrected.clone().text());
  const approvedText = (await corrected.json()).message.renderedText;
  let upperText = approvedText.toUpperCase();
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
  const setWalshRole = (granted) => sql(`UPDATE users SET profile = jsonb_set(profile,'{roles}',(SELECT jsonb_agg(CASE WHEN role->>'name' = 'Release Authority' THEN jsonb_set(role,'{granted}','${granted}') ELSE role END) FROM jsonb_array_elements(profile->'roles') role)) WHERE id = '${walshId}';`);
  setWalshRole(false);
  draft = await readDraft(draft.id);
  assert.equal((await patchDraft(draft.id, { action: "release", revision: draft.revision }, walsh)).status, 403, "Current database roles, not stale browser claims, authorize release");
  assert.equal((await readMessages()).messages.length, seedCount);
  setWalshRole(true);
  const releaseAttempts = await Promise.all([patchDraft(draft.id, { action: "release", revision: draft.revision }, walsh),patchDraft(draft.id, { action: "release", revision: draft.revision }, walsh)]);
  assert.deepEqual(releaseAttempts.map((response) => response.status).sort(), [200,409]);
  // Release queues the message for the Message Admin; it is not in the message store yet.
  assert.equal((await readMessages()).messages.length, seedCount, "A queued release is not yet transmitted traffic");
  const harper = sessions.DHarper.cookie;
  const queue = async (cookie = sessionCookie) => (await (await fetch(`${base}/api/transmissions`, { headers: { Cookie: cookie } })).json()).transmissions;
  const txAction = (id, body, cookie) => fetch(`${base}/api/transmissions/${id}`, { method: "POST", headers: { Cookie: cookie, Origin: base, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const transmitRelease = async (messageId) => {
    const entry = (await queue()).find((item) => item.status === "queued" && item.messageId === messageId);
    assert.ok(entry, "Release is queued for transmission");
    assert.equal((await txAction(entry.id, { action: "transmit" }, harper)).status, 200);
  };
  let queued = (await queue(sessions.RPatel.cookie)).filter((entry) => entry.status === "queued");
  assert.equal(queued.length, 1, "Everyone in the command sees the queue");
  assert.equal((await readTopics()).find((topic) => topic.id === templateTopic.id).messageCount, 0, "Queued releases do not increase published-message counts");
  const subscribeByName = (name, cookie, origin = base) => fetch(`${base}/api/subscriptions`, { method: "POST", headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
  assert.equal((await subscribeByName("TEST", walsh, "https://untrusted.example")).status, 403);
  assert.equal((await subscribeByName("NO SUCH TEMPLATE TYPE", walsh)).status, 404);
  assert.equal((await subscribeByName("TEST\nX", walsh)).status, 400);
  const early = await subscribeByName("TEST", walsh);
  assert.equal(early.status, 200, await early.clone().text());
  const earlyTopic = await early.json();
  assert.equal(earlyTopic.subscribed, true); assert.equal(earlyTopic.id, templateTopic.id, "Subscribing by name reuses the template topic");
  assert.equal((await subscribeByName("TEST", walsh)).status, 200, "Subscribing by name is idempotent");
  assert.equal(queued[0].messageId, draft.id); assert.equal(queued[0].releasedBy, walshId);
  assert.equal((await readDraft(draft.id)).status, "released");
  assert.equal((await txAction(queued[0].id, { action: "transmit" }, walsh)).status, 403, "Release Authority does not transmit");
  assert.equal((await txAction(queued[0].id, { action: "revoke", comment: "Not mine" }, ramos)).status, 403, "Only the releaser or Release Authority withdraws");
  assert.equal((await txAction(queued[0].id, { action: "revoke" }, walsh)).status, 400, "Withdrawal needs a reason");
  // The releaser withdraws the release; the draft returns to its drafter and needs fresh approvals.
  assert.equal((await txAction(queued[0].id, { action: "revoke", comment: "Hold for updated figures" }, walsh)).status, 200);
  assert.equal((await txAction(queued[0].id, { action: "transmit" }, harper)).status, 409, "A withdrawn release cannot be transmitted");
  draft = await readDraft(draft.id);
  assert.equal(draft.status, "returned"); assert.equal(draft.releasedAt, undefined); assert.equal(draft.dtg, undefined);
  assert.equal(draft.route.at(-1).status, "returned");
  assert.ok((await readDesk()).events.some((event) => event.draftId === draft.id && event.type === "release_revoked"));
  await transition(draft.id, "submit");
  await transition(draft.id, "advance", ramos);
  await transition(draft.id, "advance", chen);
  draft = await readDraft(draft.id);
  assert.equal((await patchDraft(draft.id, { action: "release", revision: draft.revision }, walsh)).status, 200);
  queued = (await queue()).filter((entry) => entry.status === "queued");
  assert.equal(queued.length, 1);
  assert.equal((await txAction(queued[0].id, { action: "transmit" }, ramos)).status, 403, "Only the Message Admin transmits");
  assert.equal((await txAction(queued[0].id, { action: "transmit" }, harper)).status, 200);
  assert.equal((await txAction(queued[0].id, { action: "revoke", comment: "Too late" }, walsh)).status, 409, "A transmitted release cannot be withdrawn");
  assert.ok((await readDraft(draft.id)).transmittedAt);
  const released = (await readMessages()).messages.find((message) => message.id === draft.id);
  const publishedTopic = (await readTopics()).find((topic) => topic.name === "TEST");
  assert.ok(publishedTopic); assert.equal(publishedTopic.messageCount, 1);
  assert.equal(publishedTopic.id, templateTopic.id, "Sending reuses the topic created with the template");
  assert.equal(publishedTopic.subscribed, true, "Sending preserves subscriptions created before the first message");
  assert.equal(sql("SELECT count(*) FROM message_topics WHERE name='TEST';").trim(), "1");
  assert.equal((await changeTopic(publishedTopic.id, false)).status, 200);
  assert.equal(released.subscriptionTopicId, publishedTopic.id);
  assert.equal(released.subscriptionType, "TEST", "The subscription type is the pinned Type, not the workflow category");
  assert.equal(sql(`SELECT published_message_topic('${released.id}','MSGID/SPOOFED/ORIGIN//');`).trim(), "TEST", "Pinned Type wins over parsed/wrapped output");
  assert.equal((await changeTopic(publishedTopic.id, true, "")).status, 401);
  assert.equal((await changeTopic("bad-id", true)).status, 400);
  assert.equal((await changeTopic("00000000-0000-4000-8000-000000000000", true)).status, 404);
  assert.equal((await changeTopic(publishedTopic.id, true, sessionCookie, "https://untrusted.example")).status, 403);
  const personalFeed = async (cookie) => (await (await fetch(`${base}/api/messages?view=subscriptions`, { headers: { Cookie: cookie } })).json()).messages;
  assert.deepEqual(await personalFeed(sessions.RPatel.cookie), []);
  assert.equal((await changeTopic(publishedTopic.id, true, sessions.RPatel.cookie)).status, 200, "Ordinary viewers subscribe without approval");
  assert.equal((await changeTopic(publishedTopic.id, true, sessions.RPatel.cookie)).status, 200, "Subscribe is idempotent");
  assert.equal((await readTopics(sessions.RPatel.cookie)).find((topic) => topic.id === publishedTopic.id).subscribed, true);
  assert.equal((await readTopics()).find((topic) => topic.id === publishedTopic.id).subscribed, false, "Preferences are per person");
  assert.deepEqual((await personalFeed(sessions.RPatel.cookie)).map((message) => message.id), [released.id]);
  assert.equal((await readMessages(sessions.RPatel.cookie)).messages.length, seedCount + 1, "All Messages is unchanged");
  assert.equal((await changeTopic(publishedTopic.id, false, sessions.RPatel.cookie)).status, 200);
  assert.equal((await changeTopic(publishedTopic.id, false, sessions.RPatel.cookie)).status, 200);
  assert.deepEqual(await personalFeed(sessions.RPatel.cookie), []);
  assert.throws(() => sql(`UPDATE message_topics SET name='tampered' WHERE id='${publishedTopic.id}';`), /append-only/);
  assert.throws(() => sql(`DELETE FROM message_topic_messages WHERE message_id='${released.id}';`), /append-only/);
  console.log("Pub/sub API passed: template-created topics reused at transmission, subscribe by type name, pinned Type identity, free idempotent subscriptions, viewer permissions, per-account isolation and unchanged All Messages.");
  assert.equal(released.kind, "released"); assert.equal(released.renderedText, approvedText); assert.equal(released.rawText, approvedText);
  assert.ok(released.c2oixId.startsWith("ANCHOR-"), "Local release must not invent an external receipt");
  const localArtifact = await (await fetch(`${base}/api/messages/${released.id}/artifact`, { headers: { Cookie: sessionCookie } })).json();
  assert.equal(localArtifact.intact, true);
  assert.equal(localArtifact.rawText, approvedText);
  assert.equal(released.localSequence, "#0043", "A withdrawn release keeps its sequence number used"); assert.ok(released.dtg); assert.equal(released.releasedBy, walshId);
  assert.equal((await readMessages()).messages.length, seedCount + 1);
  assert.ok((await readMessages(sessions.RPatel.cookie)).messages.some((message) => message.id === draft.id));
  assert.equal((await patchDraft(draft.id, { action: "withdraw", revision: (await readDraft(draft.id)).revision })).status, 409);
  const releasedHistory = (await readDesk()).events.filter((event) => event.draftId === draft.id);
  assert.equal(releasedHistory.filter((event) => event.type === "released").length, 2);
  assert.equal(releasedHistory.filter((event) => event.type === "transmitted").length, 1);
  assert.equal(new Set(releasedHistory.filter((event) => event.revision >= approvalRevision).map((event) => event.snapshotHash)).size, 1);
  assert.throws(() => sql(`UPDATE outgoing_message_events SET comment = 'tampered' WHERE message_id = '${draft.id}';`), /append-only/);
  assert.throws(() => sql(`DELETE FROM outgoing_message_events WHERE message_id = '${draft.id}';`), /append-only/);
  const frozenRevision = (await readDraft(draft.id)).revision;
  assert.equal((await patchDraft(draft.id, { ...corrections, revision: frozenRevision })).status, 409);
  assert.equal((await patchDraft(draft.id, { action: "route", revision: frozenRevision, steps: [] })).status, 409);
  for (const statement of [
    `UPDATE outgoing_messages SET workflow_status='drafting' WHERE id='${draft.id}';`,
    `UPDATE outgoing_messages SET workflow_status='returned' WHERE id='${draft.id}';`,
    `UPDATE outgoing_messages SET record=jsonb_set(record,'{rawText}','"changed"') WHERE id='${draft.id}';`,
    `UPDATE outgoing_messages SET record=jsonb_set(record,'{transmittedAt}','"2026-01-01T00:00:00Z"') WHERE id='${draft.id}';`,
    `DELETE FROM outgoing_messages WHERE id='${draft.id}';`,
    `UPDATE messages SET record=jsonb_set(record,'{subject}','"changed"') WHERE id='${draft.id}';`,
    `UPDATE messages SET lifecycle='CANCELLED' WHERE id='${draft.id}';`,
    `DELETE FROM messages WHERE id='${draft.id}';`,
    `UPDATE message_drafts SET subject='changed' WHERE id='${draft.id}';`,
    `DELETE FROM message_draft_references WHERE draft_id='${draft.id}';`,
    `INSERT INTO message_draft_references (draft_id,field_key,position,source_id,command_id,snapshot) SELECT draft_id,'Extra',99,source_id,command_id,snapshot FROM message_draft_references WHERE draft_id='${draft.id}' LIMIT 1;`,
  ]) assert.throws(() => sql(statement), /immutable/);
  assert.throws(() => sql("TRUNCATE message_draft_references;"), /append-only/);
  sql(`UPDATE commands SET name = '${commands.commands[0].name}' WHERE id = '${commands.commands[0].id}';`);
  // Two releases lock the same persistent counter and get distinct sequences.
  const parallelIds = [];
  for (let index = 0; index < 2; index++) {
    const response = await postMessage({ ...messagePayload, requestId: randomUUID(), subject: `Parallel ${index}` });
    assert.equal(response.status, 201); const { message } = await response.json(); parallelIds.push(message.id);
    await transition(message.id, "submit"); await transition(message.id, "advance", ramos); await transition(message.id, "advance", chen);
  }
  const parallelReleases = await Promise.all(parallelIds.map((id) => transition(id, "release", walsh)));
  assert.deepEqual(parallelReleases.map((result) => result.message.localSequence).sort(), ["#0044","#0045"]);
  const parallelQueue = (await queue()).filter((entry) => entry.status === "queued");
  assert.equal(parallelQueue.length, 2);
  const transmissions = await Promise.all(parallelQueue.flatMap((entry) => [txAction(entry.id, { action: "transmit" }, harper), txAction(entry.id, { action: "transmit" }, harper)]));
  assert.deepEqual(transmissions.map((response) => response.status).sort(), [200,200,409,409], "Each release is transmitted once");
  sql(routingSeed.stdout);
  assert.equal((await configRead()).settings.nextSequence, 46, "Routine reseeding must never reset the release counter");
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
  // Author-specific routes are independent of the shared workflow and can be
  // adjusted mid-review only by discarding every existing approval.
  const customCreate = await postMessage({ ...messagePayload, requestId: randomUUID(), subject: "Custom routing" });
  const customId = (await customCreate.json()).message.id;
  const reviewStep = (personId, title = "Review") => ({ title, personId, action: "review" });
  const releaseStep = { title: "Final release", personId: sessions.RWalsh.user.id, action: "release" };
  let custom = await readDraft(customId);
  for (const steps of [[], [reviewStep(sessions.MRamos.user.id)], [releaseStep, reviewStep(sessions.MRamos.user.id)], [reviewStep(randomUUID()), releaseStep], [reviewStep(sessions.MRamos.user.id), reviewStep(sessions.MRamos.user.id), releaseStep], [{ ...releaseStep, status: "released" }], [{ ...releaseStep, personId: sessions.MRamos.user.id }]]) {
    assert.equal((await patchDraft(customId, { action: "route", revision: custom.revision, steps })).status, 400);
  }
  const sharedBefore = await configRead();
  await transition(customId, "route", sessionCookie, { steps: [reviewStep(sessions.MRamos.user.id), reviewStep(sessions.AChen.user.id), releaseStep] });
  assert.equal((await readDraft(customId)).customRoute, true);
  await transition(customId, "submit"); await transition(customId, "advance", ramos);
  custom = await readDraft(customId);
  assert.equal((await patchDraft(customId, { action: "route", revision: custom.revision, steps: [releaseStep] }, chen)).status, 403);
  assert.equal((await patchDraft(customId, { action: "edit", revision: custom.revision, subject: "Not owner", precedence: "ROUTINE", values: messagePayload.values }, chen)).status, 403);
  const inFlight = custom.revision;
  await transition(customId, "route", sessionCookie, { steps: [reviewStep(sessions.RPatel.user.id, "Added reviewer"), releaseStep] });
  custom = await readDraft(customId);
  assert.equal(custom.status, "drafting");
  assert.deepEqual(custom.route.map((step) => step.status), ["pending","pending"]);
  assert.equal((await patchDraft(customId, { action: "release", revision: inFlight }, walsh)).status, 409);
  assert.equal((await readDraft(customId, ramos)), undefined, "Removed reviewers no longer have private draft access");
  assert.deepEqual(await configRead(), sharedBefore, "Customizing one draft must not change command workflows");
  await transition(customId, "submit");
  assert.equal((await readDraft(customId)).route[0].personId, sessions.RPatel.user.id);
  const beforeEdit = (await readDraft(customId)).revision;
  await transition(customId, "advance", sessions.RPatel.cookie);
  await transition(customId, "edit", sessionCookie, { subject: "Edited after endorsement", precedence: "PRIORITY", values: messagePayload.values });
  custom = await readDraft(customId);
  assert.equal(custom.status, "drafting"); assert.ok(custom.route.every((step) => step.status === "pending" && !step.actedAt));
  assert.ok(custom.revision > beforeEdit);
  await transition(customId, "route", sessionCookie, { steps: null });
  assert.equal((await readDraft(customId)).customRoute, false);
  assert.deepEqual((await readDraft(customId)).route.map((step) => step.personId), [sessions.MRamos.user.id,sessions.AChen.user.id,sessions.RWalsh.user.id]);
  await transition(customId, "withdraw");
  await transition(customId, "edit", sessionCookie, { subject: "Reopened unpublished message", precedence: "ROUTINE", values: messagePayload.values });
  assert.equal((await readDraft(customId)).status, "drafting");
  const customEvents = (await readDesk()).events.filter((event) => event.draftId === customId);
  assert.ok(customEvents.some((event) => event.routeSnapshot.some((step) => step.personId === sessions.RPatel.user.id)));
  assert.ok(!(await readMessages()).messages.some((message) => message.id === customId));
  const racingCreate = await postMessage({ ...messagePayload, requestId: randomUUID(), subject: "Concurrent edit and release" });
  const racingMessage = (await racingCreate.json()).message;
  await transition(racingMessage.id, "route", sessionCookie, { steps: [releaseStep] });
  await transition(racingMessage.id, "submit");
  const racingRevision = (await readDraft(racingMessage.id)).revision;
  const racingResponses = await Promise.all([
    patchDraft(racingMessage.id, { action: "edit", revision: racingRevision, subject: "Changed before publication", precedence: "ROUTINE", values: { ...messagePayload.values, Remarks: "Never publish without new approvals" } }),
    patchDraft(racingMessage.id, { action: "release", revision: racingRevision }, walsh),
  ]);
  assert.deepEqual(racingResponses.map((response) => response.status).sort(), [200,409]);
  const racingDraft = await readDraft(racingMessage.id);
  if (racingDraft.status === "released") await transmitRelease(racingMessage.id);
  const racingPublished = (await readMessages()).messages.find((message) => message.id === racingMessage.id);
  if (racingDraft.status === "released") {
    assert.equal(racingPublished.rawText, racingMessage.rawText);
    assert.equal(racingPublished.subject, racingMessage.subject);
  } else {
    assert.equal(racingDraft.status, "drafting"); assert.equal(racingPublished, undefined);
    assert.ok(racingDraft.route.every((step) => step.status === "pending"));
  }
  console.log("Custom routes passed: authorization, membership/role validation, adding/removing/reordering, resetting approvals, restoring defaults, and editing until publication.");
  console.log("Persistent routing passed: authenticated sequential approvals, returns/edits, immutable snapshots/history, stale revisions, role revocation, withdrawal, visibility and concurrent release sequencing.");

  // Wrapping happens after substitution, is persisted, and never changes at
  // release. Legacy overlong drafts must be resaved, not silently reformatted
  // after a reviewer has approved them.
  const paragraph = Array(30).fill("word").join(" ");
  const longRemarks = `${paragraph}\n${"X".repeat(70)}`;
  const wrapInputs = { subject: "Wrapped message", precedence: "ROUTINE", values: { ...messagePayload.values, Remarks: longRemarks } };
  const wrapResponse = await postMessage({ ...wrapInputs, requestId: randomUUID(), templateVersionId: template.versionId });
  assert.equal(wrapResponse.status, 201, await wrapResponse.clone().text());
  const wrapMessage = (await wrapResponse.json()).message;
  const wrappedRemarks = `${Array(14).fill("word").join(" ")}\n${Array(14).fill("word").join(" ")}\nword word\n${"X".repeat(69)}\nX`;
  assert.ok(customMessageBody(wrapMessage.rawText).endsWith(`${wrappedRemarks}\nTEST`));
  assert.ok(wrapMessage.rawText.split("\n").every((line) => Array.from(line).length <= 69));
  assert.equal((await readDraft(wrapMessage.id)).inputValues.Remarks, longRemarks, "Wrapping must not rewrite original form inputs");
  assert.equal(JSON.parse(sql(`SELECT render_metadata::text FROM message_drafts WHERE id='${wrapMessage.id}';`)).formatting.lineLength, 69);
  const legacyText = "Z".repeat(70);
  const legacySnapshot = () => sql(`UPDATE outgoing_messages SET record=jsonb_set(jsonb_set(record,'{rawText}',to_jsonb('${legacyText}'::text)),'{renderedText}',to_jsonb('${legacyText}'::text)) WHERE id='${wrapMessage.id}'; UPDATE message_drafts SET rendered_text='${legacyText}',rendered_document=jsonb_build_object('body','${legacyText}') WHERE id='${wrapMessage.id}';`);
  legacySnapshot();
  let wrappingDraft = await readDraft(wrapMessage.id);
  assert.equal((await patchDraft(wrapMessage.id, { action: "submit", revision: wrappingDraft.revision })).status, 409);
  await transition(wrapMessage.id, "edit", sessionCookie, wrapInputs);
  await transition(wrapMessage.id, "route", sessionCookie, { steps: [releaseStep] });
  await transition(wrapMessage.id, "submit");
  legacySnapshot();
  wrappingDraft = await readDraft(wrapMessage.id);
  assert.equal((await patchDraft(wrapMessage.id, { action: "release", revision: wrappingDraft.revision }, walsh)).status, 409);
  assert.ok(!(await readMessages()).messages.some((message) => message.id === wrapMessage.id));
  await transition(wrapMessage.id, "edit", sessionCookie, wrapInputs);
  await transition(wrapMessage.id, "submit");
  const wrappedPublication = await transition(wrapMessage.id, "release", walsh);
  await transmitRelease(wrapMessage.id);
  assert.equal(wrappedPublication.message.rawText, wrapMessage.rawText);
  const wrappedArtifact = await (await fetch(`${base}/api/messages/${wrapMessage.id}/artifact`, { headers: { Cookie: sessionCookie } })).json();
  assert.equal(wrappedArtifact.rawText, wrapMessage.rawText); assert.equal(wrappedArtifact.intact, true);
  const standardVersionId = sql("SELECT v.id FROM message_template_versions v JOIN message_templates t ON t.id=v.template_id WHERE t.key='standard-message' AND v.published_at IS NOT NULL ORDER BY v.version DESC LIMIT 1;").trim();
  const legacyProfile = sql(`SELECT formatting_profile::text FROM message_template_versions WHERE id='${standardVersionId}';`);
  const standardCreate = await postMessage({ requestId: randomUUID(), templateVersionId: standardVersionId, subject: "Standard template wrapping", precedence: "ROUTINE", values: {
    Precedence: "R - Routine", "Message DateTime": "050800Z NOV 26", "Recipient Commands": [commands.commands[0].id], "Info Commands": [commands.commands[1].id], Classification: "UNCLASSIFIED", "Msg Type": "SAFETY:ELECTRICAL", Subject: "Standard template wrapping", "Point of Contact": "LT Taylor", Body: "Y".repeat(70), "Message Number": "1",
  } });
  assert.equal(standardCreate.status, 201, await standardCreate.clone().text());
  const standardMessage = (await standardCreate.json()).message;
  assert.ok(standardMessage.rawText.split("\n").every((line) => Array.from(line).length <= 69));
  // The template's Type writes MSGID field 2 as TYPE:SUBTAG, and the rendered line sets the subscription key.
  assert.equal(standardMessage.type, "SAFETY"); assert.equal(standardMessage.subtag, "ELECTRICAL");
  assert.match(standardMessage.rawText, /^MSGID\/SAFETY:ELECTRICAL\//m);
  assert.equal(sql(`SELECT formatting_profile::text FROM message_template_versions WHERE id='${standardVersionId}';`), legacyProfile, "Existing immutable template profiles must not be rewritten");
  console.log("69-character formatting passed: word wrap, hard breaks, preserved inputs, legacy resave requirement, and exact approved publication bytes.");

  for (const separator of ["semicolon", "space", "newline"]) {
    const separated = { ...definition, fields: definition.fields.map((field) => field.name === "Destinations" ? { ...field, separator } : field) };
    const published = await publish(separated);
    assert.equal(published.status, 201);
    const { template: selected } = await published.json();
    const readback = await (await fetch(`${base}/api/message-templates/${selected.id}`)).json();
    assert.equal(readback.template.fields.find((field) => field.name === "Destinations").separator, separator);
    const separatedCreate = await postMessage({ ...messagePayload, requestId: randomUUID(), templateVersionId: selected.versionId, subject: `Separator ${separator}` });
    assert.equal(separatedCreate.status, 201, await separatedCreate.clone().text());
    const { message: separatedMessage } = await separatedCreate.json();
    const separatorText = { semicolon: "; ", space: " ", newline: "\n" }[separator];
    assert.ok(customMessageBody(separatedMessage.renderedText).startsWith(`TO ${commands.commands[1].name}${separatorText}${commands.commands[0].name}\n`));
  }
  assert.equal((await publish({ ...definition, fields: definition.fields.map((field) => field.name === "Destinations" ? { ...field, separator: "comma" } : field) })).status, 400);
  assert.equal((await publish({ ...definition, fields: definition.fields.map((field) => field.name === "Status" ? { ...field, separator: "space" } : field) })).status, 400);

  for (const control of ["select", "radio", "checkbox-group", "checkbox"]) {
    const choice = templateFixture({
      name: "Output override test", description: "", text: "{{ Choice }}\n{{ Type }}",
      fields: [{ name: "Choice", control, required: false, options: control === "checkbox" ? [] : ["Ready", "Not ready"], optionOutputs: control === "checkbox" ? { YES: "ACK", NO: "NO ACK" } : { Ready: "READY FOR TASKING" } }, { name: "Type", control: "text", required: true, options: [], fixedValue: "OUTPUT OVERRIDE TEST" }],
    });
    const savedChoice = await publish(choice);
    assert.equal(savedChoice.status, 201, await savedChoice.clone().text());
    const { template: result } = await savedChoice.json();
    const readback = await (await fetch(`${base}/api/message-templates/${result.id}`)).json();
    assert.deepEqual(authorFields(readback.template.fields), choice.fields);
    const selectedValue = control === "checkbox" ? false : control === "checkbox-group" ? ["Ready", "Not ready"] : "Ready";
    const choiceCreate = await postMessage({ requestId: randomUUID(), templateVersionId: result.versionId, subject: `Choice ${control}`, precedence: "ROUTINE", values: { ...standardInputValues(commands.commands[0].id), Choice: selectedValue } });
    assert.equal(choiceCreate.status, 201, await choiceCreate.clone().text());
    assert.equal(customMessageBody((await choiceCreate.json()).message.renderedText), `${control === "checkbox" ? "NO ACK" : control === "checkbox-group" ? "READY FOR TASKING; Not ready" : "READY FOR TASKING"}\nOUTPUT OVERRIDE TEST`);
  }
  assert.equal((await publish({ name: "Old number", description: "", text: "{{ Value }}", fields: [{ name: "Value", control: "number", required: false, options: [] }] })).status, 400);
  assert.equal((await publish({ ...definition, fields: definition.fields.map((field) => field.name === "Status" ? { ...field, optionOutputs: { Invalid: "Unknown option" } } : field) })).status, 400);

  // Autogenerated bindings are stored, but their output is resolved per request
  // using server-only context, never submitted values or a submitted clock.
  sql(`INSERT INTO commands (id, name) VALUES ('${sendingCommandId}', 'ORIGINATOR EXAMPLE');`);
  const automatic = templateFixture({
    name: "Generated fields", description: "", text: "FROM {{ Origin }}\n{{ Timestamp }}\n{{ Date }}\n{{ DTG }}\n{{ Origin }}\n{{ Type }}",
    fields: [
      { name: "Origin", control: "autogenerated", required: true, options: [], generator: { key: "sending-command", version: 1 } },
      { name: "Timestamp", control: "autogenerated", required: true, options: [], generator: { key: "current-timestamp", version: 2 } },
      { name: "Date", control: "autogenerated", required: true, options: [], generator: { key: "current-date", version: 2 } },
      { name: "DTG", control: "autogenerated", required: true, options: [], generator: { key: "current-dtg", version: 1 } },
      { name: "Type", control: "text", required: true, options: [], fixedValue: "GENERATED FIELDS" },
    ],
  });
  assert.equal((await publish({ ...automatic, fields: automatic.fields.map((field) => ({ ...field, generator: { key: "eval", version: 1 } })) })).status, 400);
  const autoPublished = await publish(automatic);
  assert.equal(autoPublished.status, 201, await autoPublished.clone().text());
  const { template: autoTemplate } = await autoPublished.json();
  const savedAuto = await (await fetch(`${base}/api/message-templates/${autoTemplate.id}`)).json();
  assert.deepEqual(authorFields(savedAuto.template.fields), automatic.fields);
  assert.deepEqual(Object.keys(JSON.parse(sql(`SELECT input_schema->'properties' FROM message_template_versions WHERE id = '${autoTemplate.versionId}';`))).sort(), [...standardInputNames].sort());
  assert.deepEqual(JSON.parse(sql(`SELECT input_schema->'required' FROM message_template_versions WHERE id = '${autoTemplate.versionId}';`)).sort(), [...standardInputNames].sort());
  const preview = (body, origin = base, cookie = sessionCookie) => fetch(`${base}/api/message-templates/preview-generated`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, Cookie: cookie }, body: JSON.stringify(body) });
  assert.equal((await preview(automatic, base, "")).status, 401);
  assert.equal((await preview(automatic, base, "anchor_session=LTaylor")).status, 401);
  assert.equal((await preview(automatic, "https://untrusted.example")).status, 403);
  const generatedResponse = await preview({ ...automatic, values: { Origin: "SPOOFED", Timestamp: "1900-01-01" }, context: { sendingCommand: { name: "SPOOFED" }, now: "1900-01-01" } });
  assert.equal(generatedResponse.status, 200);
  assert.equal(generatedResponse.headers.get("cache-control"), "no-store");
  const generated = await generatedResponse.json();
  assert.deepEqual(generated.errors, {});
  assert.equal(generated.values.Origin, "COMSUBLANT NORFOLK VA");
  assert.match(generated.values.Timestamp, /^\d{2} [A-Z]{3} \d{4} ([01]\d|2[0-3])[0-5]\dZ$/);
  assert.ok(Math.abs(Date.now() - Date.parse(generated.resolvedAt)) < 10000);
  assert.equal(generated.values.Date, generated.values.Timestamp.slice(0, -6));
  assert.match(generated.values.DTG, /^\d{6}Z [A-Z]{3} \d{2}$/);

  // A second independent browser session must resolve its own user's command.
  const secondId = sql(`INSERT INTO users (login, name, command_id) VALUES ('SecondUser', 'Second User', '${sendingCommandId}') RETURNING id;`).trim();
  const second = await login(secondId);
  assert.equal((await readMessages(second.cookie)).messages.length, (await readMessages()).messages.length, "Published traffic follows main's shared message-store visibility");
  assert.equal((await fetch(`${base}/api/messages/${savedMessage.id}`, { headers: { Cookie: second.cookie } })).status, 200);
  const automaticPayload = { requestId: randomUUID(), templateVersionId: autoTemplate.versionId, subject: "Other user's automatic draft", precedence: "ROUTINE", values: standardInputValues(commands.commands[0].id) };
  assert.equal((await postMessage({ ...automaticPayload, values: { ...automaticPayload.values, Origin: "SPOOFED" } }, second.cookie)).status, 400);
  const secondCreated = await postMessage(automaticPayload, second.cookie);
  assert.equal(secondCreated.status, 201, await secondCreated.clone().text());
  const { message: secondMessage } = await secondCreated.json();
  assert.ok(customMessageBody(secondMessage.renderedText).startsWith("FROM ORIGINATOR EXAMPLE\n"));
  assert.ok(!secondMessage.renderedText.includes("{{"));
  assert.equal((await fetch(`${base}/api/messages/${secondMessage.id}`, { headers: { Cookie: sessionCookie } })).status, 404);
  const otherGenerated = await (await preview({ ...automatic, userId: seededUser.id, commandId: signedIn.user.commandId }, base, second.cookie)).json();
  assert.equal(otherGenerated.values.Origin, "ORIGINATOR EXAMPLE");
  assert.equal((await (await preview(automatic)).json()).values.Origin, "COMSUBLANT NORFOLK VA");
  sql(`UPDATE commands SET name = 'RENAMED ORIGINATOR' WHERE id = '${sendingCommandId}';`);
  const changed = await (await preview(automatic, base, second.cookie)).json();
  assert.equal(changed.values.Origin, "RENAMED ORIGINATOR");
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
      await page.getByRole("group", { name: /^Precedence/ }).getByRole("combobox").selectOption("R - Routine");
      for (const [name, value] of Object.entries(standardInputValues(commands.commands[0].id))) {
        if (typeof value === "string" && name !== "Precedence") await page.getByRole("textbox", { name, exact: true }).fill(value);
      }
      for (const name of ["Recipients", "Info"]) {
        const group = page.getByRole("group", { name: new RegExp(`^${name}`) });
        await group.getByRole("textbox", { name: "Search commands" }).fill(commands.commands[0].name);
        await group.getByRole("checkbox", { name: commands.commands[0].name, exact: true }).check();
      }
      const recipients = page.getByRole("group", { name: /^Destinations/ });
      await recipients.getByRole("textbox", { name: "Search commands" }).fill("test");
      await expect(recipients.getByRole("checkbox")).toHaveCount(50);
      await expect(recipients.locator("mark")).toHaveCount(50);
      await expect(recipients.locator("mark").first()).toHaveText("TEST");
      await recipients.getByRole("button", { name: "Next results", exact: true }).click();
      await expect(recipients.getByRole("checkbox")).toHaveCount(10);
      await recipients.getByRole("button", { name: "Previous results", exact: true }).click();
      await expect(recipients.getByRole("checkbox")).toHaveCount(50);
      await recipients.getByRole("textbox", { name: "Search commands" }).fill(commands.commands[0].name.toLowerCase());
      await expect(recipients.locator("mark")).toHaveCount(1);
      await expect(recipients.locator("mark")).toHaveText(commands.commands[0].name);
      await recipients.getByRole("checkbox", { name: commands.commands[0].name, exact: true }).check();
      await page.getByRole("combobox", { name: "Status", exact: true }).selectOption("Ready");
      await page.getByRole("textbox", { name: "Remarks", exact: true }).fill(longRemarks);
      await expect(page.locator("pre")).toContainText(wrappedRemarks);
      const plaintextPreview = await page.locator("pre").textContent();
      assert.ok(plaintextPreview.includes(wrappedRemarks));
      assert.ok(plaintextPreview.split("\n").every((line) => Array.from(line).length <= 69));
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
      await page.getByRole("button", { name: "Customize routing", exact: true }).click();
      const patelName = sessions.RPatel.user.name, chenName = sessions.AChen.user.name;
      await page.getByTestId(`routing-person-${sessions.RPatel.user.id}`).dragTo(page.getByTestId("route-drop-1"));
      await expect(page.getByTestId(`route-step-${sessions.RPatel.user.id}`)).toBeVisible();
      await page.getByRole("button", { name: `Move ${patelName} up`, exact: true }).click();
      await page.getByRole("button", { name: `Move ${patelName} down`, exact: true }).click();
      await page.getByRole("button", { name: `Remove ${chenName} from route`, exact: true }).click();
      await page.getByRole("button", { name: `Add ${chenName}`, exact: true }).click();
      await expect(page.getByRole("button", { name: "Save routing chain", exact: true })).toBeDisabled();
      await page.getByRole("button", { name: `Move ${chenName} up`, exact: true }).click();
      await page.getByRole("button", { name: `Remove ${patelName} from route`, exact: true }).click();
      await actInBrowser("Save routing chain");
      const customized = await (await page.request.get(`${base}/api/messages?view=drafts`)).json();
      assert.equal(customized.drafts.find((draft) => draft.id === browserMessage.id).customRoute, true);
      await actInBrowser("Submit for routing");
      await page.reload();
      await page.getByRole("button").filter({ hasText: "Browser-created draft" }).click();
      const beforeRelease = await (await page.request.get(`${base}/api/messages`)).json();
      assert.ok(!beforeRelease.messages.some((message) => message.id === browserMessage.id));
      await openAs("MRamos"); await actInBrowser("Endorse and advance");
      await openAs("LTaylor");
      await page.getByRole("button", { name: "Edit template fields", exact: true }).click();
      await page.getByRole("textbox", { name: "Remarks", exact: true }).fill("Changed during review");
      // A reviewer progressing while the author types must not erase local edits
      // or silently upgrade the author's expected revision.
      await transition(browserMessage.id, "advance", chen);
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect(page.getByRole("button", { name: "Reload latest version (discard edits)", exact: true })).toBeVisible();
      await expect(page.getByRole("textbox", { name: "Remarks", exact: true })).toHaveValue("Changed during review");
      const staleSave = page.waitForResponse((response) => response.url() === `${base}/api/messages/${browserMessage.id}` && response.request().method() === "PATCH");
      await page.getByRole("button", { name: "Save corrections", exact: true }).click();
      assert.equal((await staleSave).status(), 409);
      await expect(page.getByRole("textbox", { name: "Remarks", exact: true })).toHaveValue("Changed during review");
      await page.getByRole("button", { name: "Reload latest version (discard edits)", exact: true }).click();
      await expect(page.getByRole("textbox", { name: "Remarks", exact: true })).toHaveValue("Created through the browser");
      await page.getByRole("textbox", { name: "Remarks", exact: true }).fill("Changed during review");
      await actInBrowser("Save corrections");
      const revised = await (await page.request.get(`${base}/api/messages?view=drafts`)).json();
      const revisedDraft = revised.drafts.find((draft) => draft.id === browserMessage.id);
      assert.equal(revisedDraft.status, "drafting"); assert.ok(revisedDraft.route.every((step) => step.status === "pending"));
      await actInBrowser("Submit for routing");
      await openAs("MRamos"); await actInBrowser("Endorse and advance");
      await openAs("AChen");
      await page.getByRole("textbox", { name: "Review comment", exact: true }).fill("Correct the remarks in the template.");
      await actInBrowser("Return for correction");
      await openAs("LTaylor");
      await page.getByRole("button", { name: "Edit template fields", exact: true }).click();
      await expect(page.getByRole("group", { name: /^Destinations/ }).getByRole("button", { name: `Remove ${commands.commands[0].name}`, exact: true })).toBeVisible();
      await expect(page.getByRole("textbox", { name: "Remarks", exact: true })).toHaveValue("Changed during review");
      await page.getByRole("textbox", { name: "Remarks", exact: true }).fill("Corrected in the browser");
      await actInBrowser("Save corrections"); await actInBrowser("Submit for routing");
      await openAs("MRamos"); await actInBrowser("Endorse and advance");
      await openAs("AChen"); await actInBrowser("Endorse and advance");
      await openAs("RWalsh"); await actInBrowser("Release message");
      await expect(page.getByRole("link", { name: "Open Transmission Queue", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Edit template fields", exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Customize routing", exact: true })).toHaveCount(0);
      // Only the Message Admin transmits; everyone else sees the queue read-only.
      await page.goto(`${base}/transmissions`);
      await expect(page.getByRole("button", { name: "Transmit", exact: true })).toHaveCount(0);
      await switchAccount("DHarper"); await page.goto(`${base}/transmissions`);
      await expect(page.getByRole("button", { name: "Transmit", exact: true })).toBeEnabled();
      const transmitted = page.waitForResponse((response) => response.url().includes("/api/transmissions/") && response.request().method() === "POST");
      await page.getByRole("button", { name: "Transmit", exact: true }).click();
      assert.equal((await transmitted).status(), 200);
      await expect(page.getByText("Nothing is waiting to be transmitted.", { exact: true })).toBeVisible();
      await openAs("RWalsh");
      await page.getByRole("link", { name: "View transmitted message", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Browser-created draft", exact: true })).toBeVisible();
      await expect(page.getByText("Approved message text", { exact: true })).toBeVisible();
      await page.goto(`${base}/messages`);
      await page.getByRole("textbox", { name: "Search messages", exact: true }).fill("Browser-created draft");
      await expect(page.getByRole("button", { name: "Browser-created draft", exact: true })).toBeVisible();
      await page.goto(`${base}/messages/${browserMessage.id}/print`);
      await expect(page.getByText("Released and transmitted by the Message Admin.", { exact: false })).toBeVisible();
      await switchAccount("RPatel");
      await page.goto(`${base}/messages`);
      const feed = page.getByRole("group", { name: "Message feed", exact: true });
      await expect(feed.getByRole("button", { name: "All Messages", exact: true })).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByTestId(`message-row-${browserMessage.id}`)).toBeVisible();
      await feed.getByRole("button", { name: "Subscriptions", exact: true }).click();
      await expect(page.getByTestId(`message-row-${browserMessage.id}`)).toHaveCount(0);
      await page.getByRole("link", { name: "Manage subscriptions", exact: true }).click();
      const topicRow = page.getByTestId(`message-topic-${publishedTopic.id}`);
      await page.route(`**/api/subscriptions/${publishedTopic.id}`, (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Subscription save unavailable in test" }) }));
      await topicRow.getByRole("button", { name: "Subscribe to TEST", exact: true }).click();
      await expect(page.getByRole("alert").filter({ hasText: "Subscription save unavailable in test" })).toBeVisible();
      await expect(topicRow.getByRole("button", { name: "Subscribe to TEST", exact: true })).toBeEnabled();
      await page.unroute(`**/api/subscriptions/${publishedTopic.id}`);
      await topicRow.getByRole("button", { name: "Subscribe to TEST", exact: true }).click();
      await expect(topicRow.getByRole("button", { name: "Unsubscribe from TEST", exact: true })).toBeEnabled();
      await page.reload();
      await expect(topicRow.getByRole("button", { name: "Unsubscribe from TEST", exact: true })).toBeVisible();
      await page.goto(`${base}/messages`);
      await feed.getByRole("button", { name: "Subscriptions", exact: true }).click();
      await expect(page.getByTestId(`message-row-${browserMessage.id}`)).toBeVisible();
      await expect(page.getByTestId("message-row-comsublant-078-26")).toHaveCount(0);
      await page.getByRole("textbox", { name: "Search messages", exact: true }).fill("Browser-created draft");
      await expect(page.getByTestId(`message-row-${browserMessage.id}`)).toBeVisible();
      await page.getByRole("textbox", { name: "Search messages", exact: true }).fill("no matching topic traffic");
      await expect(page.getByTestId(`message-row-${browserMessage.id}`)).toHaveCount(0);
      await page.getByRole("link", { name: "Manage subscriptions", exact: true }).click();
      await topicRow.getByRole("button", { name: "Unsubscribe from TEST", exact: true }).click();
      await expect(topicRow.getByRole("button", { name: "Subscribe to TEST", exact: true })).toBeEnabled();
      await page.goto(`${base}/messages`);
      await feed.getByRole("button", { name: "Subscriptions", exact: true }).click();
      await expect(page.getByTestId(`message-row-${browserMessage.id}`)).toHaveCount(0);
      await feed.getByRole("button", { name: "All Messages", exact: true }).click();
      await expect(page.getByTestId(`message-row-${browserMessage.id}`)).toBeVisible();
      await expect(page.getByTestId("message-row-comsublant-078-26")).toBeVisible();
      await page.route("**/api/subscriptions", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Subscription catalog unavailable in test" }) }));
      await page.reload();
      await feed.getByRole("button", { name: "Subscriptions", exact: true }).click();
      await expect(page.getByRole("alert").filter({ hasText: "Subscription catalog unavailable in test" })).toBeVisible();
      await expect(page.getByTestId(`message-row-${browserMessage.id}`)).toHaveCount(0);
      await feed.getByRole("button", { name: "All Messages", exact: true }).click();
      await expect(page.getByTestId(`message-row-${browserMessage.id}`)).toBeVisible();
      await page.unroute("**/api/subscriptions");
      await switchAccount("RWalsh");
      await page.goto(`${base}/subscriptions`);
      await expect(topicRow.getByRole("button", { name: "Subscribe to TEST", exact: true })).toBeVisible();
      console.log("Pub/sub browser passed: default All Messages, empty subscription feed, free subscribe/unsubscribe, reload persistence, exact feed filtering, search and account isolation.");
      assert.deepEqual(browserErrors, []);
      await page.request.delete(`${base}/api/session`);
      console.log("Browser drafting passed: template form, persisted private draft, real-account reviews, return/correction with hydrated commands, release, Message Admin transmission, message list, reader and print.");
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
  assert.ok(managed.users.find((user) => user.login === "RWalsh").roles.includes("Release Authority"));
  assert.equal((await admin("", "POST", { login: "TJones", rank: "lt", surname: "Jones", billet: "Assistant N3", unit: "COMSUBLANT N3", roles: ["Message Viewer"] }, sessionCookie)).status, 201);
  assert.equal((await admin("", "POST", { login: "tjones", rank: "LT", surname: "Jones", billet: "Assistant N3", unit: "COMSUBLANT N3", roles: [] })).status, 409);
  assert.equal((await admin("", "POST", { login: "Bad", rank: "LT", surname: "X", billet: "B", unit: "U", roles: ["Emperor"] })).status, 400);
  assert.equal((await admin("", "POST", { login: "X1", rank: "LT", surname: "X", billet: "B", unit: "U", roles: [] }, sessionCookie.replace(/=.*/, "=bad"))).status, 401);
  assert.equal((await (await fetch(`${base}/api/users`)).json()).users.length, 12);
  const edited = await admin(`/${patel.id}`, "PATCH", { billet: "Assistant Logistics Officer (N4A)", roles: ["Report Viewer"] });
  assert.equal(edited.status, 200, await edited.clone().text());
  assert.deepEqual((await edited.json()).user.roles, ["Message Viewer", "Report Viewer"], "Message Viewer is every account's baseline");
  assert.equal((await admin("", "POST", { login: "Retired", rank: "LT", surname: "X", billet: "B", unit: "U", roles: ["Briefing Creator"] })).status, 400, "Folded roles are gone");
  // System Admin cannot grant or remove a release designation, and a command has one Release Authority.
  assert.equal((await admin(`/${patel.id}`, "PATCH", { roles: ["Designated Release Authority"] })).status, 400);
  const chenUser = managed.users.find((user) => user.login === "AChen");
  assert.equal((await admin(`/${chenUser.id}`, "PATCH", { roles: ["Report Viewer"] })).status, 400, "Removing a designation is the Release Authority's");
  const secondCo = await admin(`/${patel.id}`, "PATCH", { roles: ["Release Authority"] });
  assert.equal(secondCo.status, 409); assert.match((await secondCo.json()).error, /already holds Release Authority/);
  assert.equal((await admin("", "POST", { login: "CO2", rank: "CAPT", surname: "X", billet: "B", unit: "U", roles: ["Release Authority"] })).status, 409);
  assert.equal((await admin(`/${patel.id}`, "PATCH", { roles: ["Message Admin", "Auditor", "Subscription Approver", "Report Viewer"] })).status, 200, "Other roles combine freely");
  // The Release Authority designates; holding a designation is what grants the role.
  const designations = (body, cookie) => fetch(`${base}/api/routing/designations`, { method: "PATCH", headers: { Cookie: cookie, Origin: base, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  let routingNow = await configRead();
  const patelDesignation = { id: "dra-patel", personId: patel.id, designation: "Supply Officer (N41)", isCommandingOfficer: true, scope: [] };
  assert.equal((await designations({ revision: routingNow.revision, authorities: [...routingNow.authorities, patelDesignation] }, sessionCookie)).status, 403, "System Admin cannot designate");
  const walshCookie = sessions.RWalsh.cookie;
  const designated = await designations({ revision: routingNow.revision, authorities: [...routingNow.authorities, patelDesignation] }, walshCookie);
  assert.equal(designated.status, 200, await designated.clone().text());
  routingNow = await designated.json();
  assert.equal(routingNow.authorities.find((entry) => entry.personId === patel.id).isCommandingOfficer, false);
  assert.ok(routingNow.people.find((person) => person.id === patel.id).canRelease);
  assert.ok((await (await admin("")).json()).users.find((user) => user.id === patel.id).roles.includes("Designated Release Authority"));
  assert.equal((await designations({ revision: routingNow.revision, authorities: [...routingNow.authorities, { ...patelDesignation, id: "dra-walsh", personId: walshId }] }, walshCookie)).status, 400, "The Release Authority needs no designation");
  const undesignated = await designations({ revision: routingNow.revision, authorities: routingNow.authorities.filter((entry) => entry.personId !== patel.id) }, walshCookie);
  assert.equal(undesignated.status, 200);
  assert.ok(!(await (await admin("")).json()).users.find((user) => user.id === patel.id).roles.includes("Designated Release Authority"));
  // A System Admin routing save keeps the Release Authority's designations.
  routingNow = await configRead();
  assert.equal((await configRequest({ ...routingNow, authorities: [] })).status, 200);
  assert.equal((await configRead()).authorities.length, routingNow.authorities.length);
  assert.equal(JSON.parse(sql(`SELECT profile::text FROM users WHERE id = '${patel.id}';`)).billet, "Assistant Logistics Officer (N4A)");
  assert.equal((await admin(`/${seededUser.id}`, "PATCH", { active: false })).status, 400, "Admins cannot deactivate themselves");
  assert.equal((await admin(`/${seededUser.id}`, "PATCH", { roles: ["Message Viewer"] })).status, 400, "Admins cannot drop their own System Admin role");
  assert.equal((await admin(`/${patel.id}`, "PATCH", { active: false })).status, 200);
  assert.equal((await (await fetch(`${base}/api/session`, { headers: { Cookie: patelSession.cookie } })).json()).user, null, "Deactivation signs the user out");
  assert.ok(!(await (await fetch(`${base}/api/users`)).json()).users.some((user) => user.id === patel.id));
  assert.equal((await admin(`/${patel.id}`, "PATCH", { active: true })).status, 200);
  const crossOrigin = await fetch(`${base}/api/admin/users/${patel.id}`, { method: "PATCH", headers: { Origin: "https://untrusted.example", Cookie: sessionCookie, "Content-Type": "application/json" }, body: "{\"active\":false}" });
  assert.equal(crossOrigin.status, 403);

  const retainedResponse = await postMessage({ ...messagePayload, requestId: randomUUID(), subject: "Retained after template deletion" });
  assert.equal(retainedResponse.status, 201);
  const retainedMessage = (await retainedResponse.json()).message;
  const retainedBefore = await readDraft(retainedMessage.id);
  const publishedBeforeDelete = sql(`SELECT row_to_json(m) FROM messages m WHERE id='${savedMessage.id}';`);
  const deletion = await fetch(`${base}/api/message-templates/${template.id}`, { method: "DELETE", headers: { Cookie: sessionCookie, Origin: base } });
  assert.equal(deletion.status, 204, await deletion.clone().text());
  assert.ok((await readTopics()).some((topic) => topic.id === publishedTopic.id), "Deleting a template cannot remove its published topic");
  assert.equal((await postMessage({ ...messagePayload, requestId: randomUUID() })).status, 404, "Deleted templates cannot create new drafts, even through pinned version IDs");
  assert.deepEqual(await readDraft(retainedMessage.id), retainedBefore, "Deletion must not rewrite existing draft definitions, inputs or history");
  const editRetained = await patchDraft(retainedMessage.id, { action: "edit", revision: retainedBefore.revision, subject: retainedBefore.subject, precedence: "PRIORITY", values: { ...messagePayload.values, Remarks: "Edited using retained pinned template" } });
  assert.equal(editRetained.status, 200, await editRetained.clone().text());
  assert.ok((await editRetained.json()).message.renderedText.includes("Edited using retained pinned template"));
  assert.equal(sql(`SELECT row_to_json(m) FROM messages m WHERE id='${savedMessage.id}';`), publishedBeforeDelete);
  console.log("Deleted template safety passed: new drafting blocked, existing draft still editable, published message unchanged.");

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
