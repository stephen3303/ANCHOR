import assert from "node:assert/strict";
import test from "node:test";
import { MESSAGES, resolveAckStatus } from "./data";
import { messageFromParsed } from "./ingest-record";
import { fromDtg, NavalParseError, normRef, ownLifecycle, parseNavalMessage, targetLifecycle, toDtg } from "./naval";

const SAMPLE = `O 041530Z NOV 26
FM COMSUBFOR N3
TO ALL COMSUBLANT UNITS, USS STONEFISH (SSN-901)
INFO COMSUBLANT
BT
UNCLAS
SUBJ/WATCH TEAM QUALIFICATION STANDARDS (CHANGE 1)//
MSGID/GENADMIN/COMSUBFOR N3/COMSUBFOR INST 3500.2//
REF/A/MSG/COMSUBFOR INST 3500.1//
NARR/THIS MSG SUPERSEDES REF A.//
ACK/061200Z NOV 26//
POC/COMSUBFOR N3 TRAINING, DSN 312-555-0707//
RMKS/1. PURPOSE. TO REISSUE THE WATCH TEAM QUALIFICATION
  STANDARDS WITH CHANGE 1 INCORPORATED.
2. ENCLOSURES.
  A. STANDARDS
  B. CROSSWALK//
BT
#2001
NNNN`;

test("every demo message's raw text parses back to its record", () => {
  for (const m of MESSAGES) {
    const p = parseNavalMessage(m.rawText);
    assert.equal(p.reference, normRef(m.reference), m.reference);
    assert.equal(p.dtg, m.dtg, m.reference);
    assert.equal(Date.parse(p.received), Date.parse(m.received), m.reference);
    assert.equal(p.precedence, m.precedence, m.reference);
    assert.equal(p.classification, m.classification, m.reference);
    assert.equal(p.originator.toUpperCase(), m.originator.toUpperCase(), m.reference);
    assert.equal(p.subject, m.subject.toUpperCase(), m.reference);
    assert.ok(p.sections.length > 0, m.reference);
  }
});

test("NARR, ACK, wrapped remarks and lettered items are read", () => {
  const p = parseNavalMessage(SAMPLE);
  assert.equal(p.reference, "COMSUBFOR INST 3500.2");
  assert.equal(p.type, "COMSUBFOR INST");
  assert.deepEqual(p.directive, { kind: "SUPERSEDES", target: "COMSUBFOR INST 3500.1" });
  assert.equal(p.ackDue, "2026-11-06T12:00:00.000Z");
  assert.deepEqual(p.sections, [
    { heading: "Purpose", body: ["TO REISSUE THE WATCH TEAM QUALIFICATION STANDARDS WITH CHANGE 1 INCORPORATED."] },
    { heading: "Enclosures", body: ["STANDARDS", "CROSSWALK"] },
  ]);
  assert.equal(p.poc, "COMSUBFOR N3 TRAINING, DSN 312-555-0707");
  assert.equal(ownLifecycle(p), "ACTIVE");
  assert.equal(targetLifecycle("SUPERSEDES"), "SUPERSEDED");
  assert.equal(targetLifecycle("CANCELS"), "CANCELLED");
  assert.equal(targetLifecycle("AMENDS"), null);
});

test("a parsed message becomes a record with groups, source and acknowledgement", () => {
  const p = parseNavalMessage(SAMPLE);
  const m = messageFromParsed(p, SAMPLE, { c2oixId: "C2OIX-26-060000", sha256: "a".repeat(64), sizeBytes: SAMPLE.length });
  assert.equal(m.id, "comsubfor-inst-3500-2");
  assert.equal(m.source, "COMSUBFOR");
  assert.equal(m.importance, "High");
  assert.equal(m.ackRequired, true);
  assert.equal(m.relatesTo, "COMSUBFOR INST 3500.1");
  assert.deepEqual(m.addressees, [
    { name: "All COMSUBLANT Units", role: "TO", kind: "group" },
    { name: "USS STONEFISH (SSN-901)", role: "TO", kind: "command" },
    { name: "COMSUBLANT", role: "INFO", kind: "command" },
  ]);
  assert.equal(m.sections.at(-1)?.heading, "Point of Contact");
});

test("bad traffic is refused with a reason", () => {
  const refuse = (raw: string, why: RegExp) => assert.throws(() => parseNavalMessage(raw), (e: unknown) => e instanceof NavalParseError && why.test(e.message));
  refuse(SAMPLE.replace("UNCLAS\n", "SECRET\n"), /only UNCLAS or CUI/);
  refuse(SAMPLE.replace("O 041530Z NOV 26", "O 321530Z NOV 26"), /not a valid date-time group/);
  refuse(SAMPLE.replace(/SUBJ\/.*\n/, ""), /SUBJ/);
  refuse(SAMPLE.replace("DSN 312-555-0707//", "DSN 312-555-0707"), /not closed/);
  refuse(SAMPLE.replace("NARR/THIS MSG SUPERSEDES REF A.//", "NARR/THIS MSG SUPERSEDES REF B.//"), /no REF\/B\//);
  refuse(SAMPLE.replace(/MSGID\/.*\n/, ""), /serial/);
  refuse("hello", /Line 1/);
});

test("DTGs round trip", () => {
  assert.equal(fromDtg("241830Z OCT 26"), "2026-10-24T18:30:00.000Z");
  assert.equal(toDtg("2026-10-24T18:30:00.000Z"), "241830Z OCT 26");
  assert.equal(fromDtg("311200Z NOV 26"), null);
});

test("sent-traffic status counts only the receipts it is given", () => {
  const m = MESSAGES.find((x) => x.id === "comsublant-080-26")!;
  assert.equal(resolveAckStatus(m, []).commands.filter((c) => c.receipts.length).length, 0);
  const { commands } = resolveAckStatus(m, [{ command: "SUBRON 4", at: "2026-10-24T05:40:00Z" }]);
  assert.deepEqual(commands.filter((c) => c.receipts.length).map((c) => c.command), ["SUBRON 4"]);
});
