// End-to-end test of the message store API against a throwaway PostgreSQL
// database. Needs a production build (npm run build) and a PostgreSQL server
// it may create databases on:
//
//   TEST_DATABASE_URL=postgresql://anchor:anchor-local-dev@127.0.0.1:5432/anchor npm run test:messages:api
//
// Without TEST_DATABASE_URL it uses the docker compose postgres service's
// mapped port and the credentials from .env, like the template API test.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createServer } from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = fileURLToPath(new URL("../", import.meta.url));
if (existsSync(`${root}.env`)) process.loadEnvFile(`${root}.env`);
const testDb = `anchor_message_test_${Date.now()}`;

function adminUrl() {
  if (process.env.TEST_DATABASE_URL) return new URL(process.env.TEST_DATABASE_URL);
  const port = spawnSync("docker", ["compose", "port", "postgres", "5432"], { cwd: root, encoding: "utf8" });
  if (port.status !== 0) throw new Error("Set TEST_DATABASE_URL or start the compose postgres service.");
  const url = new URL(`postgresql://127.0.0.1:${port.stdout.trim().split(":").at(-1)}/${process.env.POSTGRES_DB || "anchor"}`);
  url.username = process.env.POSTGRES_USER || "anchor";
  url.password = process.env.POSTGRES_PASSWORD || "anchor-local-dev";
  return url;
}

const admin = adminUrl();
const testUrl = new URL(admin);
testUrl.pathname = `/${testDb}`;
const adminClient = new pg.Client({ connectionString: admin.toString() });
const db = new pg.Client({ connectionString: testUrl.toString() });
let created = false;
let app;
let logs = "";
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const seedSql = (script) => {
  const r = spawnSync(process.execPath, ["--import", "tsx", script, "--sql"], { cwd: root, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
};

try {
  if (!existsSync(`${root}.next/BUILD_ID`)) throw new Error("Run npm run build first.");
  await adminClient.connect();
  await adminClient.query(`CREATE DATABASE ${testDb}`);
  created = true;
  await db.connect();
  const migrations = ["database/init", "database/migrations"]
    .flatMap((dir) => readdirSync(`${root}${dir}`).filter((n) => n.endsWith(".sql")).map((n) => ({ n, path: `${root}${dir}/${n}` })))
    .sort((a, b) => a.n.localeCompare(b.n));
  for (const { path } of migrations) await db.query(readFileSync(path, "utf8"));
  await db.query(seedSql("scripts/seed-users.ts"));
  const messageSeed = seedSql("scripts/seed-messages.ts");
  await db.query(messageSeed);
  await db.query(messageSeed); // re-running the seed changes nothing
  const count = async (sql) => Number((await db.query(sql)).rows[0].n);
  const seededMessages = await count("SELECT count(*) AS n FROM messages");
  assert.ok(seededMessages >= 15, `seeded ${seededMessages} messages`);
  assert.equal(await count("SELECT count(*) AS n FROM message_artifacts"), seededMessages);
  const seededReceipts = await count("SELECT count(*) AS n FROM message_acknowledgements");
  assert.equal(seededReceipts, 12);

  // The database itself refuses changes to the official record.
  await assert.rejects(db.query("UPDATE message_artifacts SET raw_text = raw_text || ' ' WHERE c2oix_id = (SELECT min(c2oix_id) FROM message_artifacts)"), /append-only/);
  await assert.rejects(db.query("DELETE FROM message_artifacts"), /append-only/);
  await assert.rejects(db.query("UPDATE message_acknowledgements SET command_name = 'X'"), /append-only/);
  await assert.rejects(db.query("UPDATE messages SET reference = 'X 1/26' WHERE id = 'comsublant-078-26'"), /cannot change/);

  const socket = createServer();
  await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root, env: { ...process.env, DATABASE_URL: testUrl.toString(), ENABLE_DEMO_LOGIN: "true", SESSION_COOKIE_SECURE: "false" }, stdio: ["ignore", "pipe", "pipe"],
  });
  app.stdout.on("data", (c) => { logs += c; });
  app.stderr.on("data", (c) => { logs += c; });
  let ready = false;
  for (let attempt = 0; attempt < 150 && !ready; attempt++) {
    try { ready = (await fetch(`${base}/api/users`)).ok; } catch { /* starting */ }
    if (app.exitCode !== null) throw new Error(logs);
    if (!ready) await delay(200);
  }
  assert.ok(ready, `Server failed to start: ${logs}`);

  const { users } = await (await fetch(`${base}/api/users`)).json();
  const login = async (who) => {
    const user = users.find((u) => u.login === who);
    assert.ok(user, `demo account ${who}`);
    const r = await fetch(`${base}/api/session`, { method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body: JSON.stringify({ userId: user.id }) });
    assert.equal(r.status, 200, await r.clone().text());
    return r.headers.get("set-cookie").split(";")[0];
  };
  const call = (cookie, path, method = "GET", body) => fetch(`${base}${path}`, {
    method, headers: { Origin: base, Cookie: cookie, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const json = async (response, status = 200) => {
    const text = await response.text();
    assert.equal(response.status, status, text);
    return JSON.parse(text);
  };

  // Signed out: nothing.
  assert.equal((await fetch(`${base}/api/messages`)).status, 401);

  // Two people in the same command; Taylor is a System Admin.
  const sameCommand = users.filter((u) => u.commandName === users.find((x) => x.login === "LTaylor").commandName);
  assert.ok(sameCommand.length >= 2, "need two accounts in one command");
  const taylor = await login("LTaylor");
  // The Message Admin sends acknowledgements; everyone else sees that one is needed.
  const colleagueLogin = "DHarper";
  assert.ok(sameCommand.some((u) => u.login === colleagueLogin));
  const colleague = await login(colleagueLogin);

  const snap = await json(await call(taylor, "/api/messages"));
  assert.equal(snap.messages.length, seededMessages);
  const sha = (await import("node:crypto")).createHash("sha256");
  const first = snap.messages.find((m) => m.id === "comsublant-078-26");
  assert.equal(first.sha256, sha.update(first.rawText, "utf8").digest("hex"));
  assert.equal(snap.ackReceipts["comsublant-080-26"].length, 6);

  // Received traffic that needs acknowledgement: one person acknowledges for the whole command.
  const received = snap.messages.find((m) => m.ackRequired && m.source !== "COMSUBLANT" && !["SUPERSEDED", "CANCELLED"].includes(m.lifecycle));
  assert.ok(received, "a received message needing acknowledgement");
  assert.equal(snap.userState[received.id].acknowledgedAt, undefined);
  await json(await call(taylor, `/api/messages/${received.id}/ack`, "POST", {}), 403);
  const ack = await json(await call(colleague, `/api/messages/${received.id}/ack`, "POST", {}));
  assert.equal(ack.already, false);
  const again = await json(await call(colleague, `/api/messages/${received.id}/ack`, "POST", {}));
  assert.equal(again.already, true);
  assert.equal(again.acknowledgedAt, ack.acknowledgedAt);
  const after = await json(await call(taylor, "/api/messages"));
  assert.equal(after.userState[received.id].acknowledgedAt, ack.acknowledgedAt);
  assert.equal(await count(`SELECT count(*) AS n FROM message_acknowledgements WHERE origin = 'local' AND message_id = '${received.id}'`), 1);
  // Sending the acknowledgement records one outgoing acknowledgement message, visible to the whole command.
  const sent = (await json(await call(taylor, "/api/transmissions"))).transmissions.filter((t) => t.kind === "acknowledgement" && t.messageId === received.id);
  assert.equal(sent.length, 1); assert.equal(sent[0].status, "transmitted");
  assert.match(sent[0].body, /RECEIVED AND ACKNOWLEDGED/);

  // Traffic the command sent, and traffic that doesn't need it, can't be acknowledged here.
  await json(await call(colleague, "/api/messages/comsublant-078-26/ack", "POST", {}), 409);
  const noAck = snap.messages.find((m) => !m.ackRequired);
  await json(await call(colleague, `/api/messages/${noAck.id}/ack`, "POST", {}), 409);
  await json(await call(colleague, "/api/messages/no-such-message/ack", "POST", {}), 404);

  // Reading state is per person.
  const before = snap.userState["navadmin-234-26"].read;
  const changed = before === "unread" ? "read" : "unread";
  await json(await call(taylor, "/api/messages/navadmin-234-26/state", "PATCH", { read: changed }));
  const taylorView = await json(await call(taylor, "/api/messages"));
  const colleagueView = await json(await call(colleague, "/api/messages"));
  assert.equal(taylorView.userState["navadmin-234-26"].read, changed);
  assert.equal(taylorView.userState["navadmin-234-26"].starred, undefined);
  assert.equal(colleagueView.userState["navadmin-234-26"].read, before);
  await json(await call(taylor, "/api/messages/navadmin-234-26/state", "PATCH", { read: "sideways" }), 400);

  // Writes from another site are refused.
  const crossSite = await fetch(`${base}/api/messages/${received.id}/ack`, { method: "POST", headers: { Origin: "https://evil.example", Cookie: taylor, "Content-Type": "application/json" }, body: "{}" });
  assert.equal(crossSite.status, 403);

  // Ingest: System Admin only; parses, stores, and applies the directive.
  const raw = `O 041530Z NOV 26
FM COMSUBFOR N7
TO ALL SUBMARINE FORCE UNITS
INFO COMSUBLANT, COMSUBPAC
BT
UNCLAS
SUBJ/WATCH TEAM QUALIFICATION STANDARDS (CHANGE 1)//
MSGID/GENADMIN/COMSUBFOR N7/COMSUBFOR INST 3500.2//
REF/A/MSG/COMSUBFOR INST 3500.1//
NARR/THIS MSG SUPERSEDES REF A.//
ACK/061200Z NOV 26//
RMKS/1. PURPOSE. TO REISSUE THE STANDARDS WITH CHANGE 1.//
BT
NNNN`;
  const nonAdmin = users.find((u) => u.commandName === sameCommand[0].commandName && u.login !== "LTaylor");
  const nonAdminCookie = await login(nonAdmin.login);
  const nonAdminProfile = await db.query("SELECT profile->'roles' AS roles FROM users WHERE login = $1", [nonAdmin.login]);
  const nonAdminIsAdmin = nonAdminProfile.rows[0].roles.some((r) => r.name === "System Admin" && r.granted);
  if (!nonAdminIsAdmin) await json(await call(nonAdminCookie, "/api/ingest", "POST", { raw }), 403);
  const ingested = await json(await call(taylor, "/api/ingest", "POST", { raw }), 201);
  assert.equal(ingested.message.reference, "COMSUBFOR INST 3500.2");
  assert.deepEqual(ingested.applied, { target: "COMSUBFOR INST 3500.1", lifecycle: "SUPERSEDED" });
  await json(await call(taylor, "/api/ingest", "POST", { raw }), 409);
  await json(await call(taylor, "/api/ingest", "POST", { raw: raw.replace("UNCLAS", "SECRET") }), 422);
  await json(await call(taylor, "/api/ingest", "POST", { raw: "not a message" }), 422);
  const withNew = await json(await call(taylor, "/api/messages"));
  assert.equal(withNew.messages.length, seededMessages + 1);
  const old = withNew.messages.find((m) => m.id === "comsubfor-3500-1");
  assert.equal(old.lifecycle, "SUPERSEDED");
  assert.equal(old.replacedBy, "COMSUBFOR INST 3500.2");
  const fresh = withNew.messages.find((m) => m.reference === "COMSUBFOR INST 3500.2");
  assert.equal(fresh.ackRequired, true);
  assert.equal(withNew.userState[fresh.id].read, "new");

  // Integrity: every stored artifact still hashes to what was recorded.
  const artifact = await json(await call(taylor, `/api/messages/${fresh.id}/artifact`));
  assert.equal(artifact.rawText, raw);
  assert.equal(artifact.intact, true);
  const integrity = await json(await call(taylor, "/api/integrity"));
  assert.equal(integrity.checked, seededMessages + 1);
  assert.deepEqual(integrity.failures, []);

  console.log(`Message API test passed: ${seededMessages} seeded messages, command-level acknowledgement, per-person state, ingest, integrity.`);
} catch (error) {
  console.error(error);
  if (logs) console.error(logs.slice(-4000));
  process.exitCode = 1;
} finally {
  app?.kill();
  await db.end().catch(() => {});
  if (created) {
    if (app && app.exitCode === null) await new Promise((resolve) => app.once("exit", resolve));
    await adminClient.query(`DROP DATABASE IF EXISTS ${testDb} WITH (FORCE)`).catch((e) => console.error(e.message));
  }
  await adminClient.end().catch(() => {});
}
