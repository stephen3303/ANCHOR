// Parser for raw record-message text as it arrives from C2OIX.
//
// The raw text is the official record: the server hashes it at ingestion and
// stores it unchanged, and a newly ingested message's fields are parsed back
// out of it. This module is pure (no Node or browser APIs), so the server, the
// seed script and the tests all use the same code.
//
// Layout handled (a simplified GENADMIN, the same form the Raw Text tab shows):
//
//   O 241830Z OCT 26                 precedence prosign + DTG
//   FM COMSUBLANT N3
//   TO ALL COMSUBLANT UNITS          comma-separated addressees
//   INFO COMSUBFOR, SUBRON COMMANDERS
//   BT
//   UNCLAS                           classification line
//   SUBJ/SUBMARINE DEPLOYMENT .../   sets may wrap; each ends with //
//   MSGID/GENADMIN/COMSUBLANT N3/COMSUBLANT 078/26//   originator / serial
//   REF/A/GENADMIN/COMSUBLANT N3/021430ZOCT26/COMSUBLANT 061/26//
//   REF/B/DOC/COMSUBLANT/01OCT26//                     REF sets per NTP 3(J) (see references.ts)
//   NARR/THIS MSG SUPERSEDES REF A. REF B IS ...//     AMPN (one REF) or NARR (several); may carry a lifecycle directive
//   ACK/261830Z OCT 26//                                optional: acknowledgement due
//   POC/...//
//   RMKS/1. PURPOSE. TEXT ...
//     CONTINUATION
//   2. ENCLOSURES.
//     A. ITEM//
//   BT
//   #1001                            optional channel serial
//   NNNN                             optional end of message
import { parseReferenceSet, splitAmplification, validateReferences, type MessageReference } from "./references";
import type { Classification, Lifecycle, MessageSection, MessageType, Precedence } from "./types";

const PROSIGN: Record<string, Precedence> = { Z: "FLASH", O: "IMMEDIATE", P: "PRIORITY", R: "ROUTINE" };

/** Classification lines this prototype accepts. Classified traffic is refused outright. */
const CLASS_LINES: Record<string, Classification> = {
  UNCLAS: "UNCLASSIFIED",
  "UNCLAS//CUI": "CUI",
  CUI: "CUI",
};
const CLASSIFIED = /^(C ?O ?N ?F ?I ?D ?E ?N ?T ?I ?A ?L|S ?E ?C ?R ?E ?T|TOP SECRET)\b/;

/** A line that opens a new set; seeing one before the previous set's // means that set was left open. */
const SET_START = /^(SUBJ|MSGID|REF|NARR|ACK|POC|RMKS|AMPN|GENTEXT)\//;

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** Lifecycle directive found in NARR, applied to the message named by the REF it points at. */
export type Directive = "SUPERSEDES" | "CANCELS" | "CORRECTS" | "AMENDS";

export interface ParsedMessage {
  precedence: Precedence;
  /** Date-time group as written, e.g. "241830Z OCT 26" */
  dtg: string;
  /** ISO time decoded from the DTG */
  received: string;
  originator: string;
  to: string;
  info: string;
  /** TO and INFO split into individual addressees, in order */
  addressees: { name: string; role: "TO" | "INFO" }[];
  classification: Classification;
  /** Message serial from MSGID, normalised (see normRef) */
  reference: string;
  type: MessageType;
  subject: string;
  /** Each REF set's label: its serial, or "SENDER DTG" when it has none */
  references: string[];
  /** Each REF set in full, with its part of the AMPN or NARR text */
  refs: MessageReference[];
  /** The AMPN or NARR text as sent */
  amplification?: string;
  /** NTP 3(J) reference rules this message breaks. Reported, never refused. */
  referenceIssues: string[];
  directive?: { kind: Directive; target: string; letter: string };
  ackDue?: string;
  poc?: string;
  sections: MessageSection[];
}

export class NavalParseError extends Error {}

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO timestamp -> "241830Z OCT 26" */
export function toDtg(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}Z ${MONTHS[d.getUTCMonth()]} ${pad(d.getUTCFullYear() % 100)}`;
}

/** "241830Z OCT 26" -> ISO timestamp, or null when it isn't a valid DTG. */
export function fromDtg(dtg: string): string | null {
  const m = /^(\d{2})(\d{2})(\d{2})Z\s+([A-Z]{3})\s+(\d{2})$/.exec(dtg.trim().toUpperCase());
  if (!m) return null;
  const month = MONTHS.indexOf(m[4]);
  if (month < 0 || Number(m[2]) > 23 || Number(m[3]) > 59) return null;
  const d = new Date(Date.UTC(2000 + Number(m[5]), month, Number(m[1]), Number(m[2]), Number(m[3])));
  if (d.getUTCDate() !== Number(m[1])) return null;
  return d.toISOString();
}

/** Serials compare without regard to case or spacing ("Alnav  076/26" is ALNAV 076/26). */
export const normRef = (s: string) => s.trim().replace(/\s+/g, " ").toUpperCase();

/** Stable id for a serial: "NAVADMIN 236/26" -> "navadmin-236-26". */
export const idFor = (reference: string) =>
  reference.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Message type from the serial, e.g. "NAVADMIN 236/26" -> NAVADMIN. */
export function typeOf(reference: string, originator = ""): MessageType {
  if (/\bSAFETY\b/i.test(originator)) return "SAFETY MSG";
  const known: [RegExp, MessageType][] = [
    [/^NAVADMIN\b/, "NAVADMIN"],
    [/^ALNAV\b/, "ALNAV"],
    [/^OPNAVINST\b/, "OPNAVINST"],
    [/^MARADMIN\b/, "MARADMIN"],
    [/^NAVSEAINST\b/, "NAVSEAINST"],
    [/^COMSUBFOR INST\b/, "COMSUBFOR INST"],
    [/^COMSUBLANT\b/, "COMSUBLANT MSG"],
    [/^SAFETY\b/, "SAFETY MSG"],
  ];
  for (const [re, t] of known) if (re.test(reference.toUpperCase())) return t;
  return "FLEET MSG";
}

/** How a reference is named in lists and lifecycle links: its serial, else sender and DTG. */
export const referenceLabel = (r: MessageReference) => r.serial ? normRef(r.serial) : normRef(`${r.originator} ${r.dtg}`);

/** The lifecycle a new message carries itself, from its directive. */
export function ownLifecycle(p: Pick<ParsedMessage, "directive">): Lifecycle {
  if (p.directive?.kind === "CORRECTS") return "CORRECTED";
  if (p.directive?.kind === "AMENDS") return "AMENDED";
  return "ACTIVE";
}

/** What a directive does to the message it names, or null when it leaves it alone. */
export function targetLifecycle(kind: Directive): Lifecycle | null {
  if (kind === "SUPERSEDES" || kind === "CORRECTS") return "SUPERSEDED";
  if (kind === "CANCELS") return "CANCELLED";
  return null;
}

const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
const splitAddressees = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

/** Parse raw message text. Throws NavalParseError with a reason an operator can act on. */
export function parseNavalMessage(raw: string): ParsedMessage {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n").map((l) => l.trimEnd());
  while (lines.length && !lines[0].trim()) lines.shift();
  const fail = (why: string): never => {
    throw new NavalParseError(why);
  };
  let i = 0;

  const first = /^([ZOPR])\s+(\d{6}Z\s+[A-Z]{3}\s+\d{2})$/i.exec(lines[i++]?.trim() ?? "");
  if (!first) fail('Line 1 must be a precedence prosign and date-time group, e.g. "O 241830Z OCT 26".');
  const precedence = PROSIGN[first![1].toUpperCase()];
  const dtg = first![2].toUpperCase().replace(/\s+/g, " ");
  const received = fromDtg(dtg) ?? fail(`"${dtg}" is not a valid date-time group.`);

  const header = { FM: "", TO: "", INFO: "" };
  for (; i < lines.length && lines[i].trim() !== "BT"; i++) {
    const h = /^(FM|TO|INFO)\s+(.+)$/.exec(lines[i].trim());
    if (h) header[h[1] as keyof typeof header] = h[2].trim();
  }
  if (i >= lines.length) fail("Missing the BT line that opens the text.");
  if (!header.FM) fail("Missing the FM line.");
  if (!header.TO) fail("Missing the TO line.");
  i++; // past BT

  const classLine = lines[i++]?.trim().toUpperCase() ?? "";
  if (CLASSIFIED.test(classLine)) fail("This prototype accepts only UNCLAS or CUI traffic. Classified text was refused and not stored.");
  const classification = CLASS_LINES[classLine] ?? fail(`Unknown classification line "${classLine}".`);

  // Sets run until a line ending in "//". RMKS is the last set and runs to BT.
  const sets: string[] = [];
  let rmks: string[] | null = null;
  let current: string[] = [];
  for (; i < lines.length && lines[i].trim() !== "BT"; i++) {
    const line = lines[i];
    if (rmks) {
      rmks.push(line);
      continue;
    }
    if (!current.length && line.trim().startsWith("RMKS/")) {
      rmks = [line.trim().slice("RMKS/".length)];
      continue;
    }
    if (!line.trim()) continue;
    if (current.length && SET_START.test(line.trim())) fail(`The set starting "${current[0].slice(0, 30)}" is not closed with //.`);
    current.push(line.trim());
    if (line.trim().endsWith("//")) {
      sets.push(current.join(" "));
      current = [];
    }
  }
  if (current.length) fail(`The set starting "${current[0].slice(0, 30)}" is not closed with //.`);
  if (i >= lines.length) fail("Missing the BT line that closes the text.");

  let subject = "";
  let originator = header.FM;
  let serial = "";
  let narr = "";
  let ampn = "";
  const counts = { ampn: 0, narr: 0, ampnMisplaced: false };
  let ackDue: string | undefined;
  let poc: string | undefined;
  const refs: MessageReference[] = [];
  let previous = "";
  for (const set of sets) {
    const body = set.slice(0, -2);
    let m: RegExpExecArray | null;
    let ref: MessageReference | null;
    if ((m = /^SUBJ\/(.*)$/.exec(body))) subject = m[1].trim();
    // The serial itself may contain a slash ("COMSUBLANT 078/26"), so it takes the rest of the set.
    else if ((m = /^MSGID\/[^/]*\/([^/]*)\/(.*)$/.exec(body))) {
      originator = m[1].trim() || originator;
      serial = m[2].trim();
    } else if ((ref = parseReferenceSet(body))) refs.push(ref);
    else if ((m = /^NARR\/(.*)$/.exec(body))) { narr = m[1].trim(); counts.narr++; }
    else if ((m = /^AMPN\/(.*)$/.exec(body))) {
      ampn = m[1].trim();
      counts.ampn++;
      if (!/^REF\//.test(previous)) counts.ampnMisplaced = true;
    }
    else if ((m = /^ACK\/(.*)$/.exec(body))) ackDue = fromDtg(m[1]) ?? fail(`ACK due "${m[1]}" is not a valid date-time group.`);
    else if ((m = /^POC\/(.*)$/.exec(body))) poc = m[1].trim();
    previous = body;
  }
  if (!subject) fail("Missing the SUBJ/ set.");
  if (!serial) fail('Missing the message serial in MSGID, e.g. "MSGID/GENADMIN/COMSUBLANT N3/COMSUBLANT 078/26//".');
  if (!/^[A-Z][A-Z .]* [\d.-]+(\/\d{2})?$/i.test(serial)) fail(`"${serial}" is not a message serial like "NAVADMIN 236/26".`);
  if (!rmks) fail("Missing the RMKS/ remarks.");

  // One amplification set serves all references; each keeps its own part of it.
  const amplification = [ampn, narr].filter(Boolean).join(" ");
  const parts = splitAmplification(amplification, refs.map((r) => r.letter));
  for (const r of refs) if (parts[r.letter]) r.amplification = parts[r.letter];
  const referenceIssues = validateReferences(refs, counts);

  let directive: ParsedMessage["directive"];
  const d = /THIS MSG (SUPERSEDES|CANCELS|CORRECTS|AMENDS) REF ([A-Z])\b/i.exec(amplification);
  if (d) {
    const target = refs.find((r) => r.letter === d[2].toUpperCase()) ?? fail(`${ampn ? "AMPN" : "NARR"} names REF ${d[2]} but there is no REF/${d[2]}/ set.`);
    directive = { kind: d[1].toUpperCase() as Directive, target: referenceLabel(target), letter: target.letter };
  }

  // Remarks: "N. HEADING. TEXT" paragraphs, continuation lines, and "A. ITEM" sub-items.
  const sections: MessageSection[] = [];
  for (const line of rmks!) {
    const l = line.trim().replace(/\/\/$/, "").trim();
    if (!l) continue;
    const para = /^(\d+)\.\s+([^.]+)\.(?:\s+(.*))?$/.exec(l);
    const item = /^([A-Z])\.\s+(.*)$/.exec(l);
    const last = sections.at(-1);
    if (para) sections.push({ heading: titleCase(para[2].trim()), body: para[3] ? [para[3].trim()] : [] });
    else if (item && last) last.body.push(item[2].trim());
    else if (last) {
      if (last.body.length) last.body[last.body.length - 1] += ` ${l}`;
      else last.body.push(l);
    } else fail('Remarks must start with a numbered paragraph, e.g. "RMKS/1. PURPOSE. ...".');
  }
  if (!sections.length) fail("The remarks are empty.");

  const reference = normRef(serial);
  return {
    precedence,
    dtg,
    received,
    originator,
    to: header.TO,
    info: header.INFO,
    addressees: [
      ...splitAddressees(header.TO).map((name) => ({ name, role: "TO" as const })),
      ...splitAddressees(header.INFO).map((name) => ({ name, role: "INFO" as const })),
    ],
    classification,
    reference,
    type: typeOf(reference, originator),
    subject,
    references: refs.map(referenceLabel),
    refs,
    ...(amplification ? { amplification } : {}),
    referenceIssues,
    directive,
    ackDue,
    poc,
    sections,
  };
}
