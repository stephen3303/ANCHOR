// Plain-text naval message format: rendering and parsing.
//
// ANCHOR ingests C2OIX traffic as raw text. The raw text is the official
// record: it is hashed at ingestion, stored unchanged, and everything the UI
// shows as "official text" is parsed back out of it. This module is pure (no
// Node or browser APIs) so it can run in the server, the browser and tests.
//
// Layout handled here (a simplified GENADMIN):
//
//   O 241830Z OCT 26                 precedence prosign + DTG
//   FM COMSUBLANT N3
//   TO All COMSUBLANT Units
//   INFO COMSUBFOR, SUBRON Commanders
//   BT
//   UNCLAS                           classification line
//   COMSUBLANT 078/26                serial (the message reference)
//   MSGID/GENADMIN/COMSUBLANT N3/OCT//
//   SUBJ/Submarine Deployment Readiness Reporting Requirements//
//   REF/A/MSG/COMSUBLANT 061/26//
//   NARR/THIS MSG SUPERSEDES REF A.//
//   ACK/261830Z OCT 26//             ANCHOR mandatory acknowledgement, due DTG
//   EXPIRES/15 OCT 2026//            optional
//   RMKS/1. Purpose. To establish ...
//   2. Background. ...
//   5. Enclosures.
//   A. Template
//   B. Guide
//   BT
import type { Classification, Lifecycle, MessageSection, MessageType, Precedence } from "./types";

const PROSIGN: Record<string, Precedence> = { Z: "FLASH", O: "IMMEDIATE", P: "PRIORITY", R: "ROUTINE" };
const PROSIGN_OF: Record<Precedence, string> = { FLASH: "Z", IMMEDIATE: "O", PRIORITY: "P", ROUTINE: "R" };

const CLASS_LINE: Record<Classification, string> = {
  UNCLASSIFIED: "UNCLAS",
  CUI: "CUI",
  CONFIDENTIAL: "CONFIDENTIAL",
  SECRET: "SECRET",
};

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** Lifecycle directive found in NARR, applied to the message named by REF A. */
export type Directive = "SUPERSEDES" | "CANCELS" | "CORRECTS" | "AMENDS";

export interface ParsedMessage {
  precedence: Precedence;
  dtg: string;
  /** ISO time decoded from the DTG */
  received: string;
  originator: string;
  to: string;
  info: string;
  classification: Classification;
  reference: string;
  type: MessageType;
  subject: string;
  references: string[];
  directive?: { kind: Directive; target: string };
  ackDue?: string;
  expires?: string;
  sections: MessageSection[];
}

export class NavalParseError extends Error {}

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO timestamp -> "241830Z OCT 26" */
export function toDtg(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}Z ${MONTHS[d.getUTCMonth()]} ${pad(d.getUTCFullYear() % 100)}`;
}

/** "241830Z OCT 26" -> ISO timestamp, or null if it isn't a DTG. */
export function fromDtg(dtg: string): string | null {
  const m = /^(\d{2})(\d{2})(\d{2})Z\s+([A-Z]{3})\s+(\d{2})$/.exec(dtg.trim().toUpperCase());
  if (!m) return null;
  const month = MONTHS.indexOf(m[4]);
  if (month < 0) return null;
  const d = new Date(Date.UTC(2000 + Number(m[5]), month, Number(m[1]), Number(m[2]), Number(m[3])));
  if (d.getUTCDate() !== Number(m[1]) || Number(m[2]) > 23 || Number(m[3]) > 59) return null;
  return d.toISOString();
}

/** "15 OCT 2026" -> ISO date at 0000Z, or null. */
function fromDate(s: string): string | null {
  const m = /^(\d{1,2})\s+([A-Z]{3})\s+(\d{4})$/.exec(s.trim().toUpperCase());
  if (!m || MONTHS.indexOf(m[2]) < 0) return null;
  return new Date(Date.UTC(Number(m[3]), MONTHS.indexOf(m[2]), Number(m[1]))).toISOString();
}

function toDate(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Message type from the serial line, e.g. "NAVADMIN 236/26" -> NAVADMIN. */
export function typeOf(reference: string, msgidOriginator = ""): MessageType {
  const r = reference.toUpperCase();
  if (/SAFETY/i.test(msgidOriginator)) return "SAFETY MSG";
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
  for (const [re, t] of known) if (re.test(r)) return t;
  return "FLEET MSG";
}

export interface RenderInput {
  precedence: Precedence;
  dtg: string;
  originator: string;
  to: string;
  info: string;
  classification: Classification;
  reference: string;
  type: MessageType;
  subject: string;
  references?: string[];
  directive?: { kind: Directive; target: string };
  ackDue?: string;
  expires?: string;
  sections: MessageSection[];
}

const letter = (i: number) => String.fromCharCode(65 + i);

/** Render a message as raw naval text. Inverse of parseNavalMessage. */
export function renderNavalMessage(m: RenderInput): string {
  const refs = [...(m.references ?? [])];
  if (m.directive && !refs.includes(m.directive.target)) refs.unshift(m.directive.target);
  const lines = [
    `${PROSIGN_OF[m.precedence]} ${m.dtg}`,
    `FM ${m.originator}`,
    `TO ${m.to}`,
    `INFO ${m.info}`,
    "BT",
    CLASS_LINE[m.classification],
    m.reference,
    // Safety traffic keeps its own MSGID so the type survives a round trip.
    `MSGID/GENADMIN/${m.type === "SAFETY MSG" ? `${m.originator} SAFETY` : m.originator}/${m.dtg.slice(-6, -3)}//`,
    `SUBJ/${m.subject}//`,
    ...refs.map((r, i) => `REF/${letter(i)}/MSG/${r}//`),
  ];
  if (m.directive) {
    const i = refs.indexOf(m.directive.target);
    lines.push(`NARR/THIS MSG ${m.directive.kind} REF ${letter(i)}.//`);
  }
  if (m.ackDue) lines.push(`ACK/${toDtg(m.ackDue)}//`);
  if (m.expires) lines.push(`EXPIRES/${toDate(m.expires)}//`);
  m.sections.forEach((s, i) => {
    const head = `${i === 0 ? "RMKS/" : ""}${i + 1}. ${s.heading}.`;
    if (s.body.length === 1) lines.push(`${head} ${s.body[0]}`);
    else {
      lines.push(head);
      s.body.forEach((b, j) => lines.push(`${letter(j)}. ${b}`));
    }
  });
  lines.push("BT");
  return lines.join("\n") + "\n";
}

/** Parse raw naval text. Throws NavalParseError with a reason a user can act on. */
/** Message serials compare without regard to case or spacing ("Alnav  076/26" is ALNAV 076/26). */
export const normRef = (s: string) => s.trim().replace(/\s+/g, " ").toUpperCase();

export function parseNavalMessage(raw: string): ParsedMessage {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n").map((l) => l.trimEnd());
  while (lines.length && !lines[0].trim()) lines.shift();
  let i = 0;
  const fail = (why: string): never => {
    throw new NavalParseError(why);
  };

  const first = /^([ZOPR])\s+(\d{6}Z\s+[A-Z]{3}\s+\d{2})$/i.exec(lines[i++]?.trim() ?? "");
  if (!first) fail("Line 1 must be a precedence prosign and DTG, e.g. \"O 241830Z OCT 26\".");
  const precedence = PROSIGN[first![1].toUpperCase()];
  const dtg = first![2].toUpperCase().replace(/\s+/g, " ");
  const received = fromDtg(dtg) ?? fail(`"${dtg}" is not a valid date-time group.`);

  const header: Record<"FM" | "TO" | "INFO", string> = { FM: "", TO: "", INFO: "" };
  for (; i < lines.length && lines[i].trim() !== "BT"; i++) {
    const h = /^(FM|TO|INFO)\s+(.+)$/.exec(lines[i].trim());
    if (h) header[h[1] as keyof typeof header] = h[2].trim();
  }
  if (i >= lines.length) fail("Missing the opening BT line.");
  if (!header.FM) fail("Missing the FM line.");
  if (!header.TO) fail("Missing the TO line.");
  i++; // past BT

  const cls = lines[i++]?.trim().toUpperCase().replace(/\s*\/\/.*$/, "") ?? "";
  const classification = (Object.entries(CLASS_LINE).find(([, v]) => v === cls)?.[0] as Classification) ??
    fail(`Unknown classification line "${cls}".`);
  if (classification !== "UNCLASSIFIED" && classification !== "CUI")
    fail(`This prototype only accepts UNCLAS or CUI traffic, not ${classification}.`);

  const serial = lines[i++]?.trim() ?? "";
  if (!/^[A-Z][A-Z .]* [\d.-]+(\/\d{2})?$/i.test(serial))
    fail(`Line after the classification must be the message serial, e.g. "NAVADMIN 236/26", not "${serial}".`);
  const reference = normRef(serial);

  let subject = "";
  let msgidOrig = "";
  const refs: { letter: string; ref: string }[] = [];
  let narr = "";
  let ackDue: string | undefined;
  let expires: string | undefined;
  for (; i < lines.length && !lines[i].startsWith("RMKS/"); i++) {
    const l = lines[i].trim();
    let m: RegExpExecArray | null;
    if ((m = /^MSGID\/[^/]*\/([^/]*)\//.exec(l))) msgidOrig = m[1];
    else if ((m = /^SUBJ\/(.*)\/\/$/.exec(l))) subject = m[1].trim();
    else if ((m = /^REF\/([A-Z])\/[^/]*\/(.*)\/\/$/.exec(l))) refs.push({ letter: m[1], ref: m[2].trim() });
    else if ((m = /^NARR\/(.*)\/\/$/.exec(l))) narr = m[1];
    else if ((m = /^ACK\/(.*)\/\/$/.exec(l))) ackDue = fromDtg(m[1]) ?? fail(`ACK due "${m[1]}" is not a valid DTG.`);
    else if ((m = /^EXPIRES\/(.*)\/\/$/.exec(l))) expires = fromDate(m[1]) ?? fail(`EXPIRES "${m[1]}" is not a date like 15 OCT 2026.`);
    else if (l === "BT") break;
  }
  if (!subject) fail("Missing the SUBJ/ line.");
  if (i >= lines.length || !lines[i].startsWith("RMKS/")) fail("Missing the RMKS/ remarks.");

  let directive: ParsedMessage["directive"];
  const d = /THIS MSG (SUPERSEDES|CANCELS|CORRECTS|AMENDS) REF ([A-Z])\b/i.exec(narr);
  if (d) {
    const target = refs.find((r) => r.letter === d[2].toUpperCase());
    if (!target) fail(`NARR names REF ${d[2]} but there is no REF/${d[2]}/ line.`);
    directive = { kind: d[1].toUpperCase() as Directive, target: normRef(target!.ref) };
  }

  // Remarks: "N. Heading. text" paragraphs, optionally followed by "A. item" lines.
  const sections: MessageSection[] = [];
  lines[i] = lines[i].slice("RMKS/".length);
  for (; i < lines.length && lines[i].trim() !== "BT"; i++) {
    const l = lines[i].trim();
    if (!l) continue;
    const para = /^(\d+)\.\s+([^.]+)\.(?:\s+(.*))?$/.exec(l);
    const item = /^([A-Z])\.\s+(.*)$/.exec(l);
    if (para) sections.push({ heading: para[2].trim(), body: para[3] ? [para[3].trim()] : [] });
    else if (item && sections.length) sections[sections.length - 1].body.push(item[2].trim());
    else if (sections.length) {
      const body = sections[sections.length - 1].body;
      if (body.length) body[body.length - 1] += ` ${l}`;
      else body.push(l);
    } else fail("Remarks must start with a numbered paragraph, e.g. \"RMKS/1. Purpose. ...\".");
  }
  if (!sections.length) fail("Remarks are empty.");

  return {
    precedence,
    dtg,
    received,
    originator: header.FM,
    to: header.TO,
    info: header.INFO,
    classification,
    reference,
    type: typeOf(reference, msgidOrig),
    subject,
    references: refs.map((r) => r.ref),
    directive,
    ackDue,
    expires,
    sections,
  };
}

/** The lifecycle the new message itself carries, from its directive. */
export function ownLifecycle(p: ParsedMessage): Lifecycle {
  if (p.directive?.kind === "CORRECTS") return "CORRECTED";
  if (p.directive?.kind === "AMENDS") return "AMENDED";
  return "ACTIVE";
}

/** What the directive does to the message it names, if anything. */
export function targetLifecycle(kind: Directive): Lifecycle | null {
  if (kind === "SUPERSEDES" || kind === "CORRECTS") return "SUPERSEDED";
  if (kind === "CANCELS") return "CANCELLED";
  return null;
}

/** Stable id for a reference: "NAVADMIN 236/26" -> "navadmin-236-26". */
export function idFor(reference: string): string {
  return reference.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
