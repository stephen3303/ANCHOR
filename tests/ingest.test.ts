import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/server/db.ts";
import { seedIfEmpty } from "../src/server/seed.ts";
import { applyAction } from "../src/server/actions.ts";
import { getMessage, ingestRaw, IngestError, listApprovals, userState, verifyAudit, verifyMessages } from "../src/server/repo.ts";
import { SAMPLES } from "../src/lib/samples.ts";
import { USERS } from "../src/lib/users.ts";
import { parseNavalMessage, NavalParseError } from "../src/lib/naval.ts";

const fresh = () => {
  const db = openDb(":memory:");
  seedIfEmpty(db);
  return db;
};
const [taylor, ramirez, hale] = USERS;
const actor = (u: (typeof USERS)[number]) => ({ login: u.login, name: u.name });

test("FLASH sample becomes a mandatory acknowledgement due in 2 hours", () => {
  const db = fresh();
  const { message: m } = ingestRaw(db, SAMPLES[0].raw);
  assert.equal(m.precedence, "FLASH");
  assert.equal(m.ackRequired, true);
  assert.equal(new Date(m.ackDue!).getTime() - new Date(m.received).getTime(), 2 * 3_600_000);
  assert.equal(userState(db, taylor.login)[m.id].read, "new");
});

test("CANCELS and CORRECTS update the message they name", () => {
  const db = fresh();
  const r1 = ingestRaw(db, SAMPLES[1].raw);
  assert.deepEqual(r1.changed, ["ALNAV 076/26"]);
  assert.equal(getMessage(db, "alnav-076-26")!.lifecycle, "CANCELLED");
  assert.equal(getMessage(db, "alnav-076-26")!.replacedBy, "ALNAV 080/26");

  const r2 = ingestRaw(db, SAMPLES[2].raw);
  assert.equal(r2.message.lifecycle, "CORRECTED");
  assert.equal(r2.message.type, "SAFETY MSG");
  assert.equal(getMessage(db, "comsublant-080-26")!.lifecycle, "SUPERSEDED");
});

test("a directive that arrives before its target is applied when the target lands", () => {
  const db = openDb(":memory:");
  const target = SAMPLES[0].raw; // COMSUBLANT 082/26
  const canceller = `R 281800Z OCT 26
FM COMSUBLANT N3
TO All COMSUBLANT Units
BT
UNCLAS
COMSUBLANT 084/26
SUBJ/Cancel Sortie Readiness Check//
REF/A/MSG/COMSUBLANT 082/26//
NARR/THIS MSG CANCELS REF A.//
RMKS/1. Purpose. Cancels reference (a).
BT
`;
  ingestRaw(db, canceller);
  const { message } = ingestRaw(db, target);
  assert.equal(message.lifecycle, "CANCELLED");
  assert.equal(message.replacedBy, "COMSUBLANT 084/26");
});

test("identical text is a no-op; changed text under an existing reference is refused", () => {
  const db = fresh();
  const a = ingestRaw(db, SAMPLES[0].raw);
  const b = ingestRaw(db, SAMPLES[0].raw.replace(/\n/g, "\r\n"));
  assert.equal(b.duplicate, true);
  assert.equal(b.message.id, a.message.id);
  assert.throws(() => ingestRaw(db, SAMPLES[0].raw.replace("2 hours", "3 hours")), IngestError);
});

test("malformed traffic is rejected with a reason and audited", () => {
  const db = fresh();
  assert.throws(() => ingestRaw(db, "hello"), /precedence prosign/);
  assert.throws(() => parseNavalMessage(SAMPLES[0].raw.replace("UNCLAS", "SECRET")), NavalParseError);
  assert.equal(verifyAudit(db).ok, true);
});

test("source artifacts and the audit log refuse edits and deletes", () => {
  const db = fresh();
  assert.throws(() => db.exec("UPDATE artifacts SET raw = 'x'"), /immutable/);
  assert.throws(() => db.exec("DELETE FROM artifacts"), /immutable/);
  assert.throws(() => db.exec("UPDATE audit SET details = 'x'"), /append-only/);
  assert.throws(() => db.exec("DELETE FROM audit"), /append-only/);
  assert.ok(verifyMessages(db).every((c) => c.ok));
});

test("tampering that bypasses the triggers is caught by the hash checks", () => {
  const db = fresh();
  db.exec("DROP TRIGGER artifacts_no_update; DROP TRIGGER audit_no_update;");
  db.exec("UPDATE artifacts SET raw = replace(raw, 'NLT 07 NOV 2026', 'NLT 30 NOV 2026') WHERE c2oix_id = (SELECT c2oix_id FROM messages WHERE id = 'comsublant-078-26')");
  const bad = verifyMessages(db).filter((c) => !c.ok);
  assert.deepEqual(bad.map((b) => b.id), ["comsublant-078-26"]);
  db.exec("UPDATE audit SET user = 'Someone' WHERE seq = 3");
  const chain = verifyAudit(db);
  assert.equal(chain.ok, false);
});

test("acknowledgement: first one stands, offline time is kept, not-required is refused", () => {
  const db = fresh();
  const at = new Date(Date.now() - 3_600_000).toISOString();
  const got = applyAction(db, ramirez, actor(ramirez), { type: "ack", id: "comsublant-080-26", at }, true);
  assert.equal(got, at);
  const again = applyAction(db, ramirez, actor(ramirez), { type: "ack", id: "comsublant-080-26" });
  assert.equal(again, at);
  const future = applyAction(db, hale, actor(hale), { type: "ack", id: "comsublant-080-26", at: "2099-01-01T00:00:00Z" }, true) as string;
  assert.ok(new Date(future).getTime() <= Date.now());
  assert.throws(() => applyAction(db, ramirez, actor(ramirez), { type: "ack", id: "navadmin-228-26" }), /does not require/);
});

test("subscriptions: approval needs the role and never your own request", () => {
  const db = fresh();
  applyAction(db, ramirez, actor(ramirez), { type: "requestSubscription", sub: { name: "Safety traffic", category: "Safety", description: "", criteria: { messageTypes: ["SAFETY MSG"] }, frequency: "Real-time", channels: { inApp: true, email: false, teams: false }, justification: "Safety PO" } });
  assert.throws(() => applyAction(db, ramirez, actor(ramirez), { type: "decideApproval", id: listApprovals(db, taylor.login)[0].id, approve: true }), /Approver role/);
  const mine = listApprovals(db, hale.login).find((a) => a.requestedBy === taylor.name)!;
  assert.ok(mine, "Taylor's own pending request is visible to Hale");
  assert.ok(!listApprovals(db, taylor.login).some((a) => a.id === mine.id), "but not to Taylor");
  assert.throws(() => applyAction(db, taylor, actor(taylor), { type: "decideApproval", id: mine.id, approve: true }), /own request/);
  const ok = applyAction(db, hale, actor(hale), { type: "decideApproval", id: mine.id, approve: true }) as { status: string };
  assert.equal(ok.status, "Active");
  assert.throws(() => applyAction(db, hale, actor(hale), { type: "decideApproval", id: mine.id, approve: false }), /already/);
  assert.equal(verifyAudit(db).ok, true);
});

test("only known browser events can be written to the audit log", () => {
  const db = fresh();
  applyAction(db, taylor, actor(taylor), { type: "log", action: "Export", resource: "Message (X)" });
  assert.throws(() => applyAction(db, taylor, actor(taylor), { type: "log", action: "Approve Subscription", resource: "x" }), /can't be logged/);
});
