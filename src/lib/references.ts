// References (REF, AMPN and NARR sets) per NTP 3(J) para 711 and Annex A
// (A102e, A102l). Pure, so the parser, drafting, the seed script and the tests
// share it.
//
//   REF/serial letter/message identifier or communication code
//      /originator/date-time group/message serial number/special notation//
//
// Each reference is its own REF set, lettered A, B, C in order. One reference
// is amplified by an AMPN set right after it; several references share one
// NARR set after the last REF. AMPN after individual REF sets is prohibited
// when there is more than one reference.

/** Communication codes for references that aren't formatted messages (Annex A, A102l). */
export const COMMUNICATION_CODES = ["CON", "DOC", "LTR", "MSG", "TEL"] as const;
/** Codes that are never a message, so there is nothing on the server to open. */
export const NON_MESSAGE_CODES = ["CON", "DOC", "LTR", "TEL"] as const;
/** Field 7 notations. BOM (by other means) is DSSCS only, but is read when present. */
export const NOTATIONS = ["NOTAL", "PASEP", "BOM"] as const;
export type Notation = (typeof NOTATIONS)[number];
/** NTP letters references alphabetically and says nothing past Z. */
export const MAX_REFERENCES = 26;

export interface MessageReference {
  /** Serial letter, "A" to "Z" */
  letter: string;
  /** Field 3: the referenced message's MSGID type (GENADMIN, CASREP...) or CON | DOC | LTR | MSG | TEL */
  kind: string;
  /** Field 4: the originator (sender) as written. Empty for an old serial-only reference. */
  originator: string;
  /** Field 5: date-time group ("201311ZDEC96") or a date ("01JUN96") as written. Empty for an old serial-only reference. */
  dtg: string;
  /** Field 6: message serial number, when given */
  serial?: string;
  notations: Notation[];
  /** This reference's part of the AMPN or NARR text */
  amplification?: string;
}

const clean = (s: string) => s.trim().replace(/\s+/g, " ").toUpperCase();
/** Date-time groups compare without spaces: "241830Z OCT 26" is "241830ZOCT26". */
export const normDtg = (s: string) => s.replace(/\s+/g, "").toUpperCase();
/** Senders compare without regard to case or spacing. Matching is exact otherwise. */
export const normSender = clean;
/** The key the legacy system identifies a message by: sender plus DTG. */
export const messageKey = (sender: string, dtg: string) => `${normSender(sender)}|${normDtg(dtg)}`;

const DTG = /^\d{6}Z ?[A-Z]{3} ?\d{2}$/i;
const DATE = /^\d{1,2} ?[A-Z]{3} ?\d{2,4}$/i;
/** Field 5 holds a date-time group, or a date for a document, letter, call or meeting. */
export const isDateField = (s: string) => DTG.test(s.trim()) || DATE.test(s.trim());

/** An older ANCHOR demo reference that names only a serial, with no sender or DTG. */
export const isSerialOnly = (r: MessageReference) => !r.originator && !r.dtg && !!r.serial;
export const isNonMessage = (kind: string) => (NON_MESSAGE_CODES as readonly string[]).includes(clean(kind));
/** Para 711b7 and A102l: these must be explained in AMPN or NARR. */
export const needsAmplification = (kind: string) => [...COMMUNICATION_CODES, "GENADMIN"].includes(clean(kind) as never);

/**
 * Reads one REF set (without its closing //). Returns null when the text isn't
 * a REF set. Older ANCHOR demo traffic wrote "REF/A/MSG/COMSUBLANT 061/26//"
 * with only a serial; that still reads, as a reference with no sender or DTG.
 */
export function parseReferenceSet(body: string): MessageReference | null {
  const m = /^REF\/([A-Z])\/([^/]*)\/(.*)$/i.exec(body.trim().replace(/\/\/$/, ""));
  if (!m) return null;
  const letter = m[1].toUpperCase();
  const kind = clean(m[2]);
  const rest = m[3].split("/").map((f) => f.trim());
  if (rest.length < 2 || !isDateField(rest[1])) {
    return { letter, kind, originator: "", dtg: "", serial: clean(m[3]), notations: [] };
  }
  const [originator, dtg, ...tail] = rest;
  const notations: Notation[] = [];
  const serialParts: string[] = [];
  for (const field of tail) {
    const f = clean(field);
    if ((NOTATIONS as readonly string[]).includes(f)) notations.push(f as Notation);
    else if (notations.length === 0 && f && f !== "-") serialParts.push(field.trim());
  }
  // A serial may itself contain a slash ("COMSUBLANT 061/26"), so its parts rejoin.
  const serial = serialParts.length ? clean(serialParts.join("/")) : undefined;
  return { letter, kind, originator: clean(originator), dtg: clean(dtg), ...(serial ? { serial } : {}), notations };
}

/**
 * Splits AMPN or NARR text into each reference's part. Text that names "REF X"
 * is assigned to X until the next "REF Y". With one reference, the whole text
 * belongs to it. A leading classification marking such as "(U)" is dropped.
 */
export function splitAmplification(text: string, letters: string[]): Record<string, string> {
  const body = text.trim().replace(/^\([A-Z/]+\)\s*/, "");
  if (!body) return {};
  if (letters.length === 1) return { [letters[0]]: body };
  const out: Record<string, string> = {};
  const marks = [...body.matchAll(/\bREFS? ([A-Z])\b/g)].filter((mark) => letters.includes(mark[1]));
  // Only the first mention of each letter starts its part; later mentions are inside it.
  const starts = marks.filter((mark, i) => marks.findIndex((other) => other[1] === mark[1]) === i);
  starts.forEach((mark, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].index : body.length;
    out[mark[1]] = body.slice(mark.index, end).trim();
  });
  return out;
}

const field = (s: string | undefined) => clean(s ?? "").replace(/\//g, " ");

/** One REF line. Field 6 holds "-" when a notation follows without a serial, as in Figure A-1. */
export function formatReferenceSet(r: MessageReference): string {
  const fields = ["REF", r.letter, field(r.kind), field(r.originator), normDtg(r.dtg)];
  if (r.serial || r.notations.length) fields.push(r.serial ? clean(r.serial) : "-");
  fields.push(...r.notations);
  return `${fields.join("/")}//`;
}

/**
 * The REF lines followed by one AMPN (one reference) or one NARR (several), or
 * by nothing when no reference is amplified. Each NARR part starts "REF X"
 * unless the drafter already wrote that. A lifecycle directive ("THIS MSG
 * SUPERSEDES REF A.") opens the AMPN or NARR, where the parser reads it.
 */
export function formatReferences(refs: readonly MessageReference[], directive?: { kind: Directive; letter: string }): string[] {
  const lines = refs.map(formatReferenceSet);
  const amplified = refs.filter((r) => r.amplification?.trim());
  if (!amplified.length && !directive) return lines;
  const text = (s: string) => clean(s).replace(/\/\//g, "/");
  const sentence = (p: string) => (/[.!?]$/.test(p) ? p : `${p}.`);
  const lead = directive ? [`THIS MSG ${directive.kind} REF ${directive.letter}.`] : [];
  // A single AMPN is the subject as written; only the directive is its own sentence.
  if (refs.length === 1) return [...lines, `AMPN/${[...lead, ...amplified.map((r) => text(r.amplification!))].join(" ")}//`];
  const parts = amplified.map((r) => {
    const a = text(r.amplification!);
    return sentence(new RegExp(`^REFS? ${r.letter}\\b`).test(a) ? a : `REF ${r.letter} IS ${a}`);
  });
  return [...lines, `NARR/${[...lead, ...parts].join(" ")}//`];
}

export const DIRECTIVES = ["SUPERSEDES", "CANCELS", "CORRECTS", "AMENDS"] as const;
export type Directive = (typeof DIRECTIVES)[number];

/** A reference as the drafter enters it: from a message held on this server (messageId), or typed in. */
export interface DraftReference extends MessageReference {
  messageId?: string;
  /** This message supersedes, cancels, corrects or amends the referenced one. At most one per message. */
  directive?: Directive;
}

const MAX_FIELD = 200;
const MAX_AMPLIFICATION = 2000;

/**
 * Reads a References input value: a JSON list of draft references, or "" for
 * none. Letters are reassigned A, B, C in list order. Throws with a message for
 * the drafter when the value is malformed.
 */
export function parseReferenceValue(value: unknown): DraftReference[] {
  if (value === "" || value === undefined) return [];
  if (typeof value !== "string" || value.length > 100000) throw new Error("References must be a list.");
  let list: unknown;
  try { list = JSON.parse(value); } catch { throw new Error("References must be a list."); }
  if (!Array.isArray(list)) throw new Error("References must be a list.");
  if (list.length > MAX_REFERENCES) throw new Error(`A message can list at most ${MAX_REFERENCES} references (A to Z).`);
  return list.map((item, i): DraftReference => {
    const letter = String.fromCharCode(65 + i);
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`REF ${letter} is not a reference.`);
    const r = item as Record<string, unknown>;
    const str = (key: string, max = MAX_FIELD) => {
      const v = r[key] ?? "";
      if (typeof v !== "string" || v.length > max || /[\0\r\n]/.test(v)) throw new Error(`REF ${letter} ${key} must be one line of at most ${max} characters.`);
      return v.trim();
    };
    const notations = r.notations ?? [];
    if (!Array.isArray(notations) || notations.some((n) => !(NOTATIONS as readonly unknown[]).includes(n))) throw new Error(`REF ${letter} notations must be NOTAL, PASEP or BOM.`);
    if (r.directive !== undefined && !(DIRECTIVES as readonly unknown[]).includes(r.directive)) throw new Error(`REF ${letter} has an unknown directive.`);
    const messageId = str("messageId");
    if (messageId && !/^[a-z0-9-]{1,120}$/.test(messageId)) throw new Error(`REF ${letter} names an invalid message.`);
    const serial = str("serial");
    const amplification = str("amplification", MAX_AMPLIFICATION);
    return {
      letter, kind: str("kind").toUpperCase(), originator: str("originator").toUpperCase(), dtg: normDtg(str("dtg")),
      ...(serial ? { serial: serial.toUpperCase() } : {}), notations: [...new Set(notations as Notation[])],
      ...(amplification ? { amplification } : {}), ...(messageId ? { messageId } : {}),
      ...(r.directive ? { directive: r.directive as Directive } : {}),
    };
  });
}

/** Everything wrong with drafted references, for the drafter to fix before saving. */
export function draftReferenceIssues(refs: readonly DraftReference[]): string[] {
  const issues = validateReferences(refs);
  if (refs.filter((r) => r.directive).length > 1) issues.push("Only one reference can be superseded, cancelled, corrected or amended by a message.");
  return issues;
}

/** The REF, AMPN and NARR lines for drafted references, with any directive. */
export function formatDraftReferences(refs: readonly DraftReference[]): string[] {
  const target = refs.find((r) => r.directive);
  const plain = refs.map((r): MessageReference => ({ letter: r.letter, kind: r.kind, originator: r.originator, dtg: r.dtg, ...(r.serial ? { serial: r.serial } : {}), notations: r.notations, ...(r.amplification ? { amplification: r.amplification } : {}) }));
  return formatReferences(plain, target ? { kind: target.directive!, letter: target.letter } : undefined);
}

/** The references as a stored message keeps them: what the parser would read back. */
export const storedReferences = (refs: readonly DraftReference[]): MessageReference[] =>
  refs.map((r) => ({ letter: r.letter, kind: r.kind, originator: r.originator, dtg: r.dtg, ...(r.serial ? { serial: r.serial } : {}), notations: r.notations, ...(r.amplification ? { amplification: r.amplification } : {}) }));

/** Rules the drafter or the sender broke. An empty list means the references follow NTP 3(J). */
export function validateReferences(refs: readonly MessageReference[], sets: { ampn: number; narr: number; ampnMisplaced?: boolean } = { ampn: 0, narr: 0 }): string[] {
  const issues: string[] = [];
  if (refs.length > MAX_REFERENCES) issues.push(`A message can list at most ${MAX_REFERENCES} references (A to Z).`);
  refs.forEach((r, i) => {
    const expected = String.fromCharCode(65 + i);
    if (r.letter !== expected) issues.push(`REF ${r.letter} is out of order; the ${ordinal(i + 1)} reference should be REF ${expected}.`);
    // Older ANCHOR demo traffic cited only a serial; it predates these rules.
    if (isSerialOnly(r)) return;
    if (!r.kind) issues.push(`REF ${r.letter} needs a message identifier or a communication code (CON, DOC, LTR, MSG, TEL).`);
    if (!r.originator || !r.dtg) issues.push(`REF ${r.letter} needs its originator and date-time group.`);
    else if (!isDateField(r.dtg)) issues.push(`REF ${r.letter} date "${r.dtg}" is not a date-time group or date.`);
    if (needsAmplification(r.kind) && !r.amplification?.trim()) issues.push(`REF ${r.letter} (${r.kind}) must be explained in ${refs.length > 1 ? "NARR" : "AMPN"}.`);
  });
  if (sets.ampn && sets.narr) issues.push("Use AMPN or NARR for references, not both.");
  if (sets.ampn > 1 || sets.narr > 1) issues.push(`Use one ${sets.narr > 1 ? "NARR" : "AMPN"} set for references.`);
  if (sets.ampn && refs.length > 1) issues.push("AMPN is prohibited when a message lists several references; use one NARR after the last REF.");
  if (sets.narr && refs.length === 1) issues.push("A single reference is amplified with AMPN, not NARR.");
  if (sets.ampnMisplaced) issues.push("AMPN must immediately follow the REF set.");
  if ((sets.ampn || sets.narr) && !refs.length) issues.push(`${sets.ampn ? "AMPN" : "NARR"} appears with no REF set.`);
  return issues;
}

const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;
