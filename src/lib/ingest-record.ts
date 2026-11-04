// Turns parsed C2OIX text into the Message record the screens use. Pure, so the
// server, the seed script and the tests share it.
import { COMMAND_GROUPS } from "./data";
import { idFor, ownLifecycle, type ParsedMessage } from "./naval";
import type { Addressee, Importance, Message, Precedence } from "./types";

const IMPORTANCE: Record<Precedence, Importance> = { FLASH: "High", IMMEDIATE: "High", PRIORITY: "Medium", ROUTINE: "Low" };

/** Addressee names that match a pub/sub group (any case) expand to its member commands. */
export function toAddressees(parsed: ParsedMessage["addressees"]): Addressee[] {
  return parsed.map(({ name, role }) => {
    const group = COMMAND_GROUPS.find((g) => g.name.toUpperCase() === name.toUpperCase());
    return group ? { name: group.name, role, kind: "group" as const } : { name, role, kind: "command" as const };
  });
}

/** The originating command's source code: "COMSUBLANT N3" -> "COMSUBLANT", "USS Ironfin" -> "USS IRONFIN". */
export function sourceOf(originator: string) {
  const words = originator.trim().toUpperCase().split(/\s+/);
  return /^(USS|USNS)$/.test(words[0]) && words[1] ? `${words[0]} ${words[1]}` : words[0];
}

export interface Integrity {
  c2oixId: string;
  sha256: string;
  sizeBytes: number;
}

/** A Message built entirely from what the raw text says. */
export function messageFromParsed(p: ParsedMessage, raw: string, integrity: Integrity): Message {
  return {
    id: idFor(p.reference),
    dtg: p.dtg,
    received: p.received,
    subject: p.subject,
    reference: p.reference,
    type: p.type,
    originator: p.originator,
    source: sourceOf(p.originator),
    to: p.to,
    info: p.info,
    precedence: p.precedence,
    classification: p.classification,
    importance: IMPORTANCE[p.precedence],
    lifecycle: ownLifecycle(p),
    relatesTo: p.directive?.target,
    communities: [],
    attachments: [],
    sections: p.poc ? [...p.sections, { heading: "Point of Contact", body: [p.poc] }] : p.sections,
    rawText: raw,
    ackRequired: !!p.ackDue,
    ackDue: p.ackDue,
    c2oixId: integrity.c2oixId,
    sha256: integrity.sha256,
    sizeKb: Math.max(1, Math.ceil(integrity.sizeBytes / 1024)),
    retention: "Permanent",
    distribution: [],
    addressees: toAddressees(p.addressees),
    related: p.references.map(idFor),
  };
}
