import assert from "node:assert/strict";
import { test } from "node:test";
import { EXAMPLE_SIM_TRAFFIC, MESSAGES } from "./data";
import { EXAMPLE_SPECS } from "./example-traffic";
import { isKnownKey } from "./message-types";
import { parseNavalMessage } from "./naval";
import { messageKey } from "./references";
import { seedRepository, toInboxMessage } from "./sim";

const TEMPLATES = ["ALNAV", "CASREP", "EXORD", "NAVADMIN", "OPREP", "PLANORD", "Standard Message"];

test("every template has three to five examples, at least one in the simulator", () => {
  for (const t of TEMPLATES) {
    const list = EXAMPLE_SPECS.filter((s) => s.template === t);
    assert.ok(list.length >= 3 && list.length <= 5, `${t}: ${list.length}`);
    assert.ok(list.some((s) => s.sim), `${t} has no simulator example`);
    assert.ok(list.some((s) => !s.sim), `${t} has no stored example`);
  }
});

test("a typed template's examples carry its fixed Type in MSGID field 2", () => {
  for (const s of EXAMPLE_SPECS.filter((x) => x.template !== "Standard Message")) assert.equal(s.type, s.template);
  for (const s of EXAMPLE_SPECS) assert.ok(isKnownKey(s.type), `${s.serial}: ${s.type}`);
});

test("examples are unclassified, vary precedence, and keep administrative traffic at PRIORITY or below", () => {
  const stored = MESSAGES.filter((m) => m.c2oixId.startsWith("C2OIX-26-EX"));
  assert.ok(stored.every((m) => m.classification === "UNCLASSIFIED"));
  assert.deepEqual(new Set(stored.map((m) => m.precedence)), new Set(["FLASH", "IMMEDIATE", "PRIORITY", "ROUTINE"]));
  for (const s of EXAMPLE_SPECS.filter((x) => ["ALNAV", "NAVADMIN", "Standard Message"].includes(x.template))) {
    assert.ok(s.prec === "P" || s.prec === "R", `${s.serial} is administrative but ${s.prec}`);
  }
});

test("every reference to a message names one ANCHOR holds, by sender and DTG", () => {
  const held = new Set(MESSAGES.map((m) => messageKey(m.originator, m.dtg)));
  const all = [...MESSAGES.filter((m) => m.c2oixId.startsWith("C2OIX-26-EX")), ...EXAMPLE_SIM_TRAFFIC.map((e) => ({ reference: e.parsed.reference, refs: e.parsed.refs }))];
  let cited = 0;
  for (const m of all) {
    for (const r of m.refs ?? []) {
      if (["DOC", "LTR", "CON", "TEL"].includes(r.kind)) continue;
      cited++;
      assert.ok(held.has(messageKey(r.originator, r.dtg)), `${m.reference} REF ${r.letter} (${r.originator} ${r.dtg}) is not held`);
    }
  }
  assert.ok(cited >= 10, `only ${cited} message references`);
});

test("stored examples reparse to their records, and a correction supersedes its target", () => {
  for (const m of MESSAGES.filter((x) => x.c2oixId.startsWith("C2OIX-26-EX"))) {
    const p = parseNavalMessage(m.rawText);
    assert.equal(p.reference, m.reference);
    assert.equal(p.dtg, m.dtg);
    assert.equal(p.type, m.type);
    assert.deepEqual(p.referenceIssues, []);
  }
  const corrected = MESSAGES.find((m) => m.reference === "NAVADMIN 238/26")!;
  assert.equal(corrected.lifecycle, "SUPERSEDED");
  assert.equal(corrected.replacedBy, "NAVADMIN 244/26");
});

test("simulator examples arrive with their type, references and full text", () => {
  const repo = seedRepository();
  const casCor = repo.find((m) => m.reference === "IRONFIN CASREP 26-013")!;
  const inbox = toInboxMessage(casCor, "2026-11-05T13:00:00Z");
  assert.equal(inbox.type, "CASREP");
  assert.equal(inbox.refs?.[0].serial, "IRONFIN CASREP 26-011");
  assert.equal(inbox.rawText, casCor.rawText);
  const safety = toInboxMessage(repo.find((m) => m.reference === "COMSUBLANT 088/26")!, "2026-11-05T17:00:00Z");
  assert.equal(`${safety.type}:${safety.subtag}`, "SAFETY:HEAVY-WEATHER");
  // No simulator example duplicates a stored message.
  const stored = new Set(MESSAGES.map((m) => m.reference));
  assert.ok(repo.every((m) => !stored.has(m.reference)));
});

test("the classification line a template writes as a set still parses", () => {
  const raw = MESSAGES.find((m) => m.reference === "ALNAV 082/26")!.rawText.replace("\nUNCLAS\n", "\nUNCLAS//\n");
  assert.equal(parseNavalMessage(raw).classification, "UNCLASSIFIED");
});
