import assert from "node:assert/strict";
import test from "node:test";
import { MESSAGES } from "./data";
import { buildReferenceIndex, citation, referenceProblems, referencesOf } from "./reference-links";
import type { Message } from "./types";

const byRef = (reference: string) => MESSAGES.find((m) => m.reference === reference)!;

function citing(refs: Message["refs"], extra: Partial<Message> = {}): Message {
  return { ...byRef("NAVADMIN 228/26"), id: "test-citing", reference: "TEST 001/26", refs, ...extra };
}

test("a demo reference links to the held message by sender and DTG", () => {
  const index = buildReferenceIndex(MESSAGES);
  const [a] = index.resolve(byRef("COMSUBLANT 078/26"));
  assert.equal(a.status, "held");
  assert.equal(a.target?.reference, "COMSUBLANT 061/26");
  assert.ok(index.citedBy(byRef("COMSUBLANT 061/26")).some((m) => m.reference === "COMSUBLANT 078/26"));
});

test("sender plus DTG wins without a serial; a near-miss sender does not link", () => {
  const target = byRef("NAVADMIN 235/26");
  const exact = { letter: "A", kind: "GENADMIN", originator: target.originator.toLowerCase(), dtg: target.dtg, notations: [], amplification: "X" };
  const other = { ...exact, letter: "B", originator: "OPNAV WASHINGTON DC" };
  const doc = { letter: "C", kind: "DOC", originator: "OPNAV", dtg: "01OCT26", notations: [], amplification: "OPNAVINST 5239.1" };
  const m = citing([exact, other, doc]);
  const [a, b, c] = buildReferenceIndex([...MESSAGES, m]).resolve(m);
  assert.equal(a.target?.id, target.id);
  assert.equal(b.status, "not-held");
  assert.equal(c.status, "not-a-message");
});

test("unheld message references and rule breaks are reported for the Message Admin", () => {
  const m = citing([{ letter: "A", kind: "GENADMIN", originator: "COMSUBPAC", dtg: "010000ZJAN26", notations: [], amplification: "X" }], { referenceIssues: ["REF A is out of order."] });
  const problems = referenceProblems(m, buildReferenceIndex([...MESSAGES, m]));
  assert.deepEqual(problems, ["REF A is out of order.", "REF A (COMSUBPAC 010000ZJAN26) is not held on this server."]);
  assert.ok(referenceProblems(byRef("COMSUBLANT 074/26"), buildReferenceIndex(MESSAGES)).some((p) => /COMSUBLANT 070\/26/.test(p)));
  assert.deepEqual(referenceProblems(byRef("COMSUBLANT 078/26"), buildReferenceIndex(MESSAGES)), []);
});

test("a stored record without refs reads them from its raw text", () => {
  const m = byRef("COMSUBLANT 078/26");
  const { refs, ...old } = m;
  assert.deepEqual(referencesOf(old as Message), refs);
  assert.deepEqual(referencesOf({ ...old, rawText: "not a message" } as Message), []);
  assert.equal(citation({ letter: "A", kind: "MSG", originator: "", dtg: "", serial: "X 1/26", notations: [] }), "X 1/26");
});
