import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb, tx } from "../src/server/db.ts";
import { seedIfEmpty } from "../src/server/seed.ts";
import { applyAction } from "../src/server/actions.ts";
import { getArtifact, getMessage, ingestRaw, IngestError, listSubscriptions, priorSync, recordSync, verifyAudit } from "../src/server/repo.ts";
import { sha256 } from "../src/server/chain.ts";
import { SAMPLES } from "../src/lib/samples.ts";
import { USERS } from "../src/lib/users.ts";

const fresh = () => {
  const db = openDb(":memory:");
  seedIfEmpty(db);
  return db;
};
const [taylor, ramirez] = USERS;
const actor = (u: (typeof USERS)[number]) => ({ login: u.login, name: u.name });

test("setting a subscription's status twice leaves it where it was set", () => {
  const db = fresh();
  const sub = listSubscriptions(db, taylor.login).find((s) => s.status === "Active" && !s.mandatory)!;
  applyAction(db, taylor, actor(taylor), { type: "setSubscription", id: sub.id, status: "Paused" }, true);
  applyAction(db, taylor, actor(taylor), { type: "setSubscription", id: sub.id, status: "Paused" }, true);
  assert.equal(listSubscriptions(db, taylor.login).find((s) => s.id === sub.id)!.status, "Paused");
});

test("a sync item is recorded once per account, with its result", () => {
  const db = fresh();
  assert.equal(priorSync(db, taylor.login, "q1"), undefined);
  recordSync(db, taylor.login, { qid: "q1", ok: true });
  recordSync(db, taylor.login, { qid: "q1", ok: false, error: "late" });
  assert.deepEqual(priorSync(db, taylor.login, "q1"), { qid: "q1", ok: true, replay: true });
  assert.equal(priorSync(db, ramirez.login, "q1"), undefined);
});

test("subscription requests keep only known fields", () => {
  const db = fresh();
  const sub = { name: "Cyber", category: "Cybersecurity", description: "", criteria: { messageTypes: ["NAVADMIN"] }, frequency: "Weekly", channels: { inApp: true, email: false, teams: false }, justification: "ISSM", approver: "Me", status: "Active" };
  applyAction(db, ramirez, actor(ramirez), { type: "requestSubscription", sub: sub as never });
  const saved = listSubscriptions(db, ramirez.login).at(-1)!;
  assert.equal(saved.status, "Pending Approval");
  assert.equal(saved.approver, undefined);
});

test("not an action object: refused with a reason, not a crash", () => {
  const db = fresh();
  assert.throws(() => applyAction(db, taylor, actor(taylor), null as never), IngestError);
});

test("the exact bytes received are hashed and stored; a CRLF retransmission is a duplicate", () => {
  const db = fresh();
  const crlf = SAMPLES[0].raw.replace(/\n/g, "\r\n");
  const { message } = ingestRaw(db, crlf);
  const a = getArtifact(db, message.id)!;
  assert.equal(a.raw, crlf);
  assert.equal(message.sha256, sha256(crlf));
  assert.equal(ingestRaw(db, SAMPLES[0].raw).duplicate, true);
});

test("directive targets match regardless of case and spacing; a message can't cancel itself", () => {
  const db = fresh();
  const r = ingestRaw(db, SAMPLES[1].raw.replace("REF/A/MSG/ALNAV 076/26//", "REF/A/MSG/Alnav  076/26//"));
  assert.deepEqual(r.changed, ["ALNAV 076/26"]);
  assert.equal(getMessage(db, "alnav-076-26")?.lifecycle, "CANCELLED");
  const self = SAMPLES[1].raw.replace("REF/A/MSG/ALNAV 076/26//", "REF/A/MSG/ALNAV 081/26//").replace("ALNAV 080/26", "ALNAV 081/26");
  assert.throws(() => ingestRaw(db, self), /names itself/);
});

test("nested transactions roll back only the inner part", () => {
  const db = fresh();
  const before = verifyAudit(db).checked;
  tx(db, () => {
    assert.throws(() => tx(db, () => {
      applyAction(db, taylor, actor(taylor), { type: "log", action: "View", resource: "inner" });
      throw new Error("inner fails");
    }));
    applyAction(db, taylor, actor(taylor), { type: "log", action: "View", resource: "outer" });
  });
  const after = verifyAudit(db);
  assert.equal(after.ok, true);
  assert.equal(after.checked, before + 1);
});
