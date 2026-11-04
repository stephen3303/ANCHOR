import assert from "node:assert/strict";
import test from "node:test";
import { MESSAGES, resolveAckStatus } from "./data";
import { messageFromParsed } from "./ingest-record";
import { categoryOf, formatForType, precedenceAdvisory, PRECEDENCE_OBJECTIVE } from "./message-types";
import { isTopic, matchesTopics } from "./topics";
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
    assert.equal(p.type, m.type, m.reference);
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

test("the MSGID message identifier sets the type, and general messages go by title", () => {
  const withMsgid = (msgid: string) => parseNavalMessage(SAMPLE.replace(/MSGID\/.*\n/, `${msgid}\n`)).type;
  assert.equal(withMsgid("MSGID/CASREP/USS STONEFISH/STONEFISH CASREP 26-004//"), "CASREP");
  assert.equal(withMsgid("MSGID/OPREP-3/USS STONEFISH/STONEFISH SITREP 003/26//"), "OPREP-3");
  assert.equal(withMsgid("MSGID/MOVREP/USS STONEFISH/STONEFISH MOVREP 012/26//"), "MOVREP");
  assert.equal(withMsgid("MSGID/LOGREQ/USS STONEFISH/STONEFISH LOGREQ 007/26//"), "LOGREQ");
  assert.equal(withMsgid("MSGID/GENADMIN/COMSUBLANT N3/COMSUBLANT 090/26//"), "GENADMIN");
  assert.equal(withMsgid("MSGID/GENADMIN/CNO WASHINGTON DC/NAVADMIN 240/26//"), "NAVADMIN");
  assert.equal(withMsgid("MSGID/GENADMIN/CMC WASHINGTON DC/ALMAR 012/26//"), "ALMAR");
  assert.equal(withMsgid("MSGID/SOMEMTF/USFF N7/USFF 2026-12//"), "GENADMIN");
});

test("categories follow NTP 3(J): operational reports versus administrative traffic", () => {
  for (const t of ["MOVREP", "LOGREQ", "OPREP-3", "OPREP-5", "CASREP", "INDIGO"] as const) assert.equal(categoryOf(t), "Operational", t);
  for (const t of ["GENADMIN", "NAVADMIN", "ALNAV", "ALMAR", "MARADMIN"] as const) assert.equal(categoryOf(t), "Administrative", t);
  assert.equal(formatForType("NAVADMIN"), "GENADMIN");
  assert.equal(formatForType("CASREP"), "CASREP");
});

test("precedence objectives and the administrative precedence ceiling", () => {
  assert.deepEqual(Object.values(PRECEDENCE_OBJECTIVE).map((o) => [o.prosign, o.minutes]), [["Z", 10], ["O", 30], ["P", 180], ["R", 360]]);
  assert.equal(precedenceAdvisory("GENADMIN", "PRIORITY"), null);
  assert.match(precedenceAdvisory("GENADMIN", "IMMEDIATE") ?? "", /death, serious illness/);
  assert.equal(precedenceAdvisory("OPREP-3", "FLASH"), null);
});

test("demo topic tags are all known, and a topic covers its subtopics", () => {
  for (const m of MESSAGES) {
    assert.ok(m.topics.length, m.reference);
    for (const t of m.topics) assert.ok(isTopic(t), `${m.reference}: ${t}`);
  }
  assert.equal(matchesTopics(["safety.electrical"], ["safety"]), true);
  assert.equal(matchesTopics(["safety.electrical"], ["safety.motorcycle"]), false);
  assert.equal(matchesTopics(["safety"], ["safety.electrical"]), false);
  assert.equal(matchesTopics(["policy.records"], []), true);
});
