import assert from "node:assert/strict";
import test from "node:test";
import { MESSAGES } from "./data";
import { parseNavalMessage } from "./naval";
import { formatReferences, formatReferenceSet, messageKey, parseReferenceSet, splitAmplification, validateReferences, type MessageReference } from "./references";

// NTP 3(J) Annex A, Figure A-1.
const FIGURE_A1 = [
  "REF/A/MSG/DISA WASHINGTON DC/201311ZDEC96/-/NOTAL//",
  "REF/B/DOC/JCS/01JUN96//",
  "REF/C/TEL/CNO N61/21DEC96//",
];

test("REF sets read field by field and write back unchanged", () => {
  const refs = FIGURE_A1.map((line) => parseReferenceSet(line)!);
  assert.deepEqual(refs[0], { letter: "A", kind: "MSG", originator: "DISA WASHINGTON DC", dtg: "201311ZDEC96", notations: ["NOTAL"] });
  assert.deepEqual(refs[1], { letter: "B", kind: "DOC", originator: "JCS", dtg: "01JUN96", notations: [] });
  assert.deepEqual(refs.map(formatReferenceSet), FIGURE_A1);
  const marrep = parseReferenceSet("REF/A/MARREP/J C STENNIS/231410ZSEP96/002/NOTAL/PASEP//")!;
  assert.equal(marrep.serial, "002");
  assert.deepEqual(marrep.notations, ["NOTAL", "PASEP"]);
  assert.equal(formatReferenceSet(marrep), "REF/A/MARREP/J C STENNIS/231410ZSEP96/002/NOTAL/PASEP//");
});

test("a serial containing a slash stays whole", () => {
  const r = parseReferenceSet("REF/A/GENADMIN/COMSUBLANT N3/021430ZOCT26/COMSUBLANT 061/26//")!;
  assert.equal(r.serial, "COMSUBLANT 061/26");
  assert.equal(r.dtg, "021430ZOCT26");
  assert.equal(formatReferenceSet(r), "REF/A/GENADMIN/COMSUBLANT N3/021430ZOCT26/COMSUBLANT 061/26//");
});

test("the older serial-only demo form still reads", () => {
  assert.deepEqual(parseReferenceSet("REF/A/MSG/COMSUBLANT 061/26//"), { letter: "A", kind: "MSG", originator: "", dtg: "", serial: "COMSUBLANT 061/26", notations: [] });
  assert.equal(parseReferenceSet("SUBJ/NOT A REF//"), null);
});

test("sender and DTG identify a message regardless of spacing or case", () => {
  assert.equal(messageKey("COMSUBLANT  n3", "241830Z OCT 26"), messageKey("COMSUBLANT N3", "241830ZOCT26"));
  assert.notEqual(messageKey("CNO N61", "241830ZOCT26"), messageKey("CNO WASHINGTON DC", "241830ZOCT26"));
});

test("NARR text splits into each reference's part", () => {
  const narr = "(U)REF A REQS ASSISTANCE DRAFTING GENADMIN MSG. REF B IS ACP 121 US SUPP-1(F). REF C IS TELCON BETWEEN OPNAV/LT NORTON AND COMNAVCOMTELCOM/MR. JOHNSON.";
  assert.deepEqual(splitAmplification(narr, ["A", "B", "C"]), {
    A: "REF A REQS ASSISTANCE DRAFTING GENADMIN MSG.",
    B: "REF B IS ACP 121 US SUPP-1(F).",
    C: "REF C IS TELCON BETWEEN OPNAV/LT NORTON AND COMNAVCOMTELCOM/MR. JOHNSON.",
  });
  assert.deepEqual(splitAmplification("REF A IS TEMPORARY TF 73 COMPOSITION", ["A"]), { A: "REF A IS TEMPORARY TF 73 COMPOSITION" });
});

const ref = (letter: string, kind: string, amplification?: string): MessageReference =>
  ({ letter, kind, originator: "COMSUBLANT", dtg: "021430ZOCT26", notations: [], ...(amplification ? { amplification } : {}) });

test("one reference gets AMPN; several share one NARR", () => {
  assert.deepEqual(formatReferences([ref("A", "DOC", "COMSUBLANTINST 3500.1A")]), [
    "REF/A/DOC/COMSUBLANT/021430ZOCT26//",
    "AMPN/COMSUBLANTINST 3500.1A//",
  ]);
  assert.deepEqual(formatReferences([ref("A", "CASREP"), ref("B", "DOC", "COMSUBLANTINST 3500.1A"), ref("C", "TEL", "REF C IS TELCON WITH N3")]), [
    "REF/A/CASREP/COMSUBLANT/021430ZOCT26//",
    "REF/B/DOC/COMSUBLANT/021430ZOCT26//",
    "REF/C/TEL/COMSUBLANT/021430ZOCT26//",
    "NARR/REF B IS COMSUBLANTINST 3500.1A. REF C IS TELCON WITH N3.//",
  ]);
  assert.deepEqual(formatReferences([ref("A", "CASREP")]), ["REF/A/CASREP/COMSUBLANT/021430ZOCT26//"]);
  assert.deepEqual(formatReferences([]), []);
});

test("broken reference rules are listed", () => {
  assert.deepEqual(validateReferences([ref("A", "CASREP"), ref("B", "DOC", "ACP 121")], { ampn: 0, narr: 1 }), []);
  const has = (issues: string[], re: RegExp) => assert.ok(issues.some((i) => re.test(i)), issues.join(" | "));
  has(validateReferences([ref("A", "CASREP"), ref("C", "CASREP")]), /REF C is out of order/);
  has(validateReferences([ref("A", "DOC")]), /must be explained in AMPN/);
  has(validateReferences([ref("A", "DOC", "X"), ref("B", "TEL", "Y")], { ampn: 1, narr: 0 }), /AMPN is prohibited/);
  has(validateReferences([ref("A", "DOC", "X")], { ampn: 0, narr: 1 }), /single reference is amplified with AMPN/);
  has(validateReferences(Array.from({ length: 27 }, (_, i) => ref(String.fromCharCode(65 + i), "CASREP"))), /at most 26/);
  has(validateReferences([{ ...ref("A", "CASREP"), dtg: "" }]), /originator and date-time group/);
});

const RAW = `R 051200Z NOV 26
FM COMSUBLANT N3
TO ALL COMSUBLANT UNITS
BT
UNCLAS
SUBJ/QUALIFICATION REPORTING (CHANGE 2)//
MSGID/GENADMIN/COMSUBLANT N3/COMSUBLANT 090/26//
REF/A/GENADMIN/COMSUBLANT N3/021430ZOCT26/COMSUBLANT 061/26//
REF/B/DOC/COMSUBLANT/01OCT26//
REF/C/TEL/COMSUBLANT N7/03NOV26/-/NOTAL//
NARR/THIS MSG SUPERSEDES REF A. REF B IS COMSUBLANTINST 3500.1A.
REF C IS TELCON BETWEEN COMSUBLANT N3 AND N7.//
RMKS/1. PURPOSE. TO REISSUE THE REPORTING REQUIREMENTS.//
BT
NNNN`;

test("a message with several references parses each one with its NARR part", () => {
  const p = parseNavalMessage(RAW);
  assert.equal(p.refs.length, 3);
  assert.deepEqual(p.refs.map((r) => [r.letter, r.kind, r.originator, r.dtg]), [
    ["A", "GENADMIN", "COMSUBLANT N3", "021430ZOCT26"],
    ["B", "DOC", "COMSUBLANT", "01OCT26"],
    ["C", "TEL", "COMSUBLANT N7", "03NOV26"],
  ]);
  assert.deepEqual(p.refs[2].notations, ["NOTAL"]);
  assert.equal(p.refs[1].amplification, "REF B IS COMSUBLANTINST 3500.1A.");
  assert.deepEqual(p.references, ["COMSUBLANT 061/26", "COMSUBLANT 01OCT26", "COMSUBLANT N7 03NOV26"]);
  assert.deepEqual(p.directive, { kind: "SUPERSEDES", target: "COMSUBLANT 061/26", letter: "A" });
  assert.deepEqual(p.referenceIssues, []);
});

test("a directive in AMPN is read, as in NTP 3(J)'s cancellation example", () => {
  const raw = RAW.replace(/REF\/B[\s\S]*?N7\.\/\/\n/, "AMPN/THIS MSG CANCELS REF A.//\n");
  const p = parseNavalMessage(raw);
  assert.equal(p.refs.length, 1);
  assert.deepEqual(p.directive, { kind: "CANCELS", target: "COMSUBLANT 061/26", letter: "A" });
});

test("traffic that breaks reference rules is kept, with the issues listed", () => {
  const raw = RAW.replace("NARR/THIS", "AMPN/THIS");
  const p = parseNavalMessage(raw);
  assert.ok(p.referenceIssues.some((i) => /AMPN is prohibited/.test(i)), p.referenceIssues.join(" | "));
});

test("demo traffic cites its references in NTP form and reads them back", () => {
  const withRefs = MESSAGES.filter((m) => m.refs?.length);
  assert.ok(withRefs.length >= 3);
  for (const m of withRefs) {
    const p = parseNavalMessage(m.rawText);
    assert.deepEqual(p.refs, m.refs, m.reference);
    assert.deepEqual(p.referenceIssues, [], m.reference);
  }
  assert.ok(withRefs.some((m) => m.refs![0].dtg), "at least one demo reference uses sender and DTG");
});
