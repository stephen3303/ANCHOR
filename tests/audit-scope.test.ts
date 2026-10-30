import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/server/db.ts";
import { seedIfEmpty } from "../src/server/seed.ts";
import { appendAudit, auditStats, listAudit } from "../src/server/repo.ts";
import { canReadFullAudit, USERS } from "../src/lib/users.ts";

const fresh = () => {
  const db = openDb(":memory:");
  seedIfEmpty(db);
  return db;
};

test("only a System Admin may read the full audit log", () => {
  for (const u of USERS) assert.equal(canReadFullAudit(u), u.roles.some((r) => r.name === "System Admin" && r.granted), u.login);
  assert.ok(USERS.some(canReadFullAudit), "the demo keeps one account that can read the whole log");
  assert.ok(USERS.some((u) => !canReadFullAudit(u)), "and at least one that cannot");
});

test("an account without the role gets only the entries its own actions wrote", () => {
  const db = fresh();
  const reader = USERS.find((u) => !canReadFullAudit(u))!;
  const other = USERS.find((u) => u.login !== reader.login)!;
  appendAudit(db, { login: reader.login }, "View", "Message A", "");
  appendAudit(db, { login: other.login }, "View", "Message B", "");
  appendAudit(db, { login: reader.login }, "Acknowledge", "Message C", "");

  const own = listAudit(db, 300, reader.login);
  assert.deepEqual(own.map((e) => e.resource), ["Message C", "Message A"], "newest first, nobody else's");
  assert.ok(own.every((e) => e.user === reader.login));
  assert.deepEqual(auditStats(db, reader.login), { events: own.length, users: 1 });

  const all = listAudit(db, 1000);
  assert.ok(all.some((e) => e.user === other.login) && all.length > own.length);
  assert.equal(auditStats(db).events, all.length);
  assert.equal(listAudit(db, 1, reader.login).length, 1, "the limit still applies");
});
