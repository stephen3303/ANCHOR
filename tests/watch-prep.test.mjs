import assert from "node:assert/strict";
import test from "node:test";
import { screeningMessages, watchDeadlines, needsAck, HOUR } from "../src/lib/watch-prep.ts";

const now = Date.parse("2026-10-24T19:00:00Z");
const message = (id, patch = {}) => ({
  id, received: new Date(now - HOUR).toISOString(), lifecycle: "ACTIVE",
  ackRequired: true, ackDue: new Date(now + HOUR).toISOString(), ...patch,
});

test("screening includes both boundaries, excludes outside traffic, and sorts newest first", () => {
  const start = message("start", { received: new Date(now - 24 * HOUR).toISOString() });
  const end = message("end", { received: new Date(now).toISOString() });
  const old = message("old", { received: new Date(now - 25 * HOUR).toISOString() });
  const future = message("future", { received: new Date(now + 1).toISOString() });
  assert.deepEqual(screeningMessages([start, old, end, future], now - 24 * HOUR, now).map((m) => m.id), ["end", "start"]);
});

test("deadlines retain older obligations and overdue items but exclude closed and later acknowledgements", () => {
  const old = message("old", { received: new Date(now - 48 * HOUR).toISOString() });
  const edge = message("edge", { ackDue: new Date(now + 24 * HOUR).toISOString() });
  const overdue = message("overdue", { ackDue: new Date(now - HOUR).toISOString() });
  const acked = message("acked");
  const state = { acked: { acknowledgedAt: "2026-10-24T18:00:00Z" } };
  const inactive = ["SUPERSEDED", "CANCELLED", "EXPIRED"].map((lifecycle) => message(lifecycle, { lifecycle }));
  const later = message("later", { ackDue: new Date(now + 24 * HOUR + 1).toISOString() });
  assert.equal(needsAck(acked, state), false);
  assert.deepEqual(watchDeadlines([old, edge, overdue, acked, later, ...inactive], state, now).map((d) => d.message.id), ["overdue", "old", "edge"]);
});

test("date-only actions use end of UTC day and preserve owner; malformed suspenses are omitted", () => {
  const action = message("action", { ackRequired: false, actionItem: { text: "Submit report", suspense: "25 OCT 2026", assignedTo: "Operations" } });
  assert.equal(watchDeadlines([action], {}, now).length, 0);
  const [due] = watchDeadlines([action], {}, now + 24 * HOUR);
  assert.equal(due.due, Date.parse("2026-10-25T23:59:59Z"));
  assert.equal(due.dateOnly, true);
  assert.equal(due.owner, "Operations");
  assert.equal(watchDeadlines([message("bad", { ackDue: "unknown" })], {}, now).length, 0);
});

test("outgoing command traffic does not create a personal acknowledgement obligation", () => {
  const sent = message("sent", { source: "COMSUBLANT" });
  assert.equal(needsAck(sent, {}, "COMSUBLANT"), false);
  assert.equal(watchDeadlines([sent], {}, now, "COMSUBLANT").length, 0);
});
