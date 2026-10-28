import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/server/db.ts";
import { seedIfEmpty } from "../src/server/seed.ts";
import { listAudit, verifyAudit } from "../src/server/repo.ts";
import { SimError, simDrop, simReset, simSetLink, simState } from "../src/server/sim.ts";
import { deriveTraffic } from "../src/lib/topology.ts";

const fresh = () => {
  const db = openDb(":memory:");
  seedIfEmpty(db);
  return db;
};
const op = { login: "op", name: "Operator" };
const traffic = (db: ReturnType<typeof fresh>) => {
  const s = simState(db);
  return deriveTraffic(s.messages, s.links.find((l) => l.key === "circuit")!.up);
};

test("a drop with the circuit up reaches the ANCHOR server and every workstation", () => {
  const db = fresh();
  assert.equal(traffic(db).atC2oix, 10);
  assert.equal(traffic(db).next?.seq, 1);
  assert.deepEqual(simDrop(db, op, 2), { released: 2, handed: 2, held: 0, circuit: "up" });
  const t = traffic(db);
  assert.equal(t.atC2oix, 8);
  assert.equal(t.ingested.length, 2);
  assert.equal(t.next?.seq, 3);
  for (const s of ["ws1", "ws2", "ws3"] as const) assert.deepEqual([t.stations[s].count, t.stations[s].owed], [2, 0]);
});

test("with the circuit down a dropped message waits at C2OIX until the circuit is back", () => {
  const db = fresh();
  simSetLink(db, op, "circuit", false);
  assert.deepEqual(simDrop(db, op, 3), { released: 3, handed: 0, held: 3, circuit: "down" });
  let t = traffic(db);
  assert.equal(t.waiting.length, 3);
  assert.equal(t.atC2oix, 10, "nothing has left C2OIX");
  assert.equal(t.ingested.length, 0);
  assert.equal(t.next?.seq, 4, "the next drop takes the next queued message, not one already waiting");

  assert.deepEqual(simSetLink(db, op, "circuit", true), { caughtUp: 3 });
  t = traffic(db);
  assert.equal(t.waiting.length, 0);
  assert.equal(t.ingested.length, 3);
  assert.equal(t.stations.ws1.count, 3);
});

test("a cut-off workstation's traffic waits at ANCHOR and catches up when restored", () => {
  const db = fresh();
  simSetLink(db, op, "ws2", false);
  simDrop(db, op, 2);
  let t = traffic(db);
  assert.equal(t.stations.ws1.count, 2);
  assert.deepEqual([t.stations.ws2.count, t.stations.ws2.owed], [0, 2]);
  assert.equal(t.stations.ws2.last, null);

  assert.deepEqual(simSetLink(db, op, "ws2", true), { caughtUp: 2 });
  t = traffic(db);
  assert.deepEqual([t.stations.ws2.count, t.stations.ws2.owed], [2, 0]);
  assert.equal(t.stations.ws2.last?.seq, 2);
});

test("drops are bounded, the queue runs dry cleanly, and every action is audited", () => {
  const db = fresh();
  const before = listAudit(db, 1000).length;
  assert.throws(() => simDrop(db, op, 0), SimError);
  assert.throws(() => simDrop(db, op, 11), SimError);
  simDrop(db, op, 10);
  assert.equal(simDrop(db, op, 1).released, 0);
  simSetLink(db, op, "ws3", false);
  simReset(db, op);
  assert.equal(traffic(db).atC2oix, 10);
  assert.ok(simState(db).links.every((l) => l.up));
  assert.equal(listAudit(db, 1000).length, before + 4);
  assert.equal(verifyAudit(db).ok, true);
});

test("the demo script's sequence ends with every workstation caught up; a repeated press changes nothing", () => {
  const db = fresh();
  const before = listAudit(db, 1000).length;
  simDrop(db, op, 1);
  simSetLink(db, op, "circuit", false);
  simDrop(db, op, 3);
  assert.equal(traffic(db).atC2oix, 9);
  simSetLink(db, op, "ws2", false);
  assert.deepEqual(simSetLink(db, op, "ws2", false), { caughtUp: 0, unchanged: true });
  simSetLink(db, op, "circuit", true);
  let t = traffic(db);
  assert.deepEqual([t.atC2oix, t.ingested.length, t.stations.ws1.count, t.stations.ws2.count, t.stations.ws2.owed], [6, 4, 4, 1, 3]);
  simSetLink(db, op, "ws2", true);
  t = traffic(db);
  assert.equal(t.stations.ws2.last?.reference, "NVA-2614-0455");
  assert.equal(listAudit(db, 1000).length, before + 6, "the repeated press wrote no audit entry");
});
