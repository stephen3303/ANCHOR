import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/server/db.ts";
import { seedIfEmpty, rawFor } from "../src/server/seed.ts";
import { listMessages, verifyMessages, verifyAudit, searchMessages } from "../src/server/repo.ts";
import { MESSAGES } from "../src/lib/data.ts";
import { parseNavalMessage } from "../src/lib/naval.ts";

test("every demo message round-trips through the naval text format", () => {
  for (const m of MESSAGES) {
    const p = parseNavalMessage(rawFor(m));
    assert.equal(p.reference, m.reference);
    assert.equal(p.dtg, m.dtg);
    assert.equal(p.received, new Date(m.received).toISOString());
    assert.equal(p.precedence, m.precedence);
    assert.equal(p.subject, m.subject);
    assert.equal(p.type, m.type, m.reference);
    assert.deepEqual(p.sections, m.sections);
  }
});

test("seeded store reproduces the demo data's lifecycle and acknowledgement rules", () => {
  const db = openDb(":memory:");
  assert.equal(seedIfEmpty(db), true);
  assert.equal(seedIfEmpty(db), false);
  const got = new Map(listMessages(db, new Date("2026-10-28T00:00:00Z")).map((m) => [m.id, m]));
  for (const m of MESSAGES) {
    const g = got.get(m.id)!;
    assert.ok(g, m.id);
    assert.equal(g.lifecycle, m.lifecycle, m.reference);
    assert.equal(g.replacedBy, m.replacedBy, m.reference);
    assert.equal(g.ackRequired, m.ackRequired, m.reference);
    if (m.ackRequired) assert.equal(g.ackDue, new Date(m.ackDue!).toISOString(), m.reference);
  }
  assert.ok(verifyMessages(db).every((c) => c.ok));
  assert.equal(verifyAudit(db).ok, true);
  assert.ok(searchMessages(db, "readiness").includes("comsublant-078-26"));
});
