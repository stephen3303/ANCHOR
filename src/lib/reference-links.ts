// Links each REF set to the message it names, when that message is held on
// this ANCHOR server. Pure, and runs over messages already in memory, so a held
// reference opens with no round trip, including offline.
//
// A message is identified the way the legacy system does it: sender plus DTG,
// compared exactly apart from case and spacing. A reference that also gives a
// serial (or the older serial-only demo form) falls back to the serial.
// CON, DOC, LTR and TEL references are never messages, so they never link.
import { normRef, parseNavalMessage } from "./naval";
import { isNonMessage, messageKey, type MessageReference } from "./references";
import type { Message } from "./types";

export type ReferenceStatus = "held" | "not-held" | "not-a-message";
export interface ResolvedReference {
  ref: MessageReference;
  status: ReferenceStatus;
  target?: Message;
}

/**
 * The message's REF sets. Records stored before references were kept in full
 * are read back from their raw text; text that doesn't parse has none.
 */
export function referencesOf(m: Message): MessageReference[] {
  if (m.refs) return m.refs;
  try {
    return parseNavalMessage(m.rawText).refs;
  } catch {
    return [];
  }
}

export interface ReferenceIndex {
  resolve: (m: Message) => ResolvedReference[];
  /** Held messages that cite this one, newest first. */
  citedBy: (m: Message) => Message[];
}

export function buildReferenceIndex(messages: readonly Message[]): ReferenceIndex {
  const byKey = new Map<string, Message>();
  const bySerial = new Map<string, Message>();
  for (const m of messages) {
    if (m.kind === "draft") continue;
    if (m.originator && m.dtg) {
      const key = messageKey(m.originator, m.dtg);
      if (!byKey.has(key)) byKey.set(key, m);
    }
    if (m.reference && !bySerial.has(normRef(m.reference))) bySerial.set(normRef(m.reference), m);
  }
  const find = (ref: MessageReference) =>
    (ref.originator && ref.dtg ? byKey.get(messageKey(ref.originator, ref.dtg)) : undefined) ??
    (ref.serial ? bySerial.get(normRef(ref.serial)) : undefined);

  const resolved = new Map<string, ResolvedReference[]>();
  const resolve = (m: Message) => {
    let list = resolved.get(m.id);
    if (!list) {
      list = referencesOf(m).map((ref): ResolvedReference => {
        if (isNonMessage(ref.kind)) return { ref, status: "not-a-message" };
        const target = find(ref);
        return target && target.id !== m.id ? { ref, status: "held", target } : { ref, status: "not-held" };
      });
      resolved.set(m.id, list);
    }
    return list;
  };

  let citing: Map<string, Message[]> | null = null;
  const citedBy = (m: Message) => {
    if (!citing) {
      citing = new Map();
      for (const source of messages) {
        if (source.kind === "draft") continue;
        for (const r of resolve(source)) {
          if (!r.target) continue;
          const list = citing.get(r.target.id) ?? [];
          if (!list.includes(source)) list.push(source);
          citing.set(r.target.id, list);
        }
      }
      for (const list of citing.values()) list.sort((a, b) => b.received.localeCompare(a.received));
    }
    return citing.get(m.id) ?? [];
  };
  return { resolve, citedBy };
}

/** What the Message Admin needs to look at: rule breaks, and message references this server doesn't hold. */
export function referenceProblems(m: Message, index: ReferenceIndex): string[] {
  const issues = [...(m.referenceIssues ?? [])];
  for (const r of index.resolve(m)) {
    if (r.status === "not-held") issues.push(`REF ${r.ref.letter} (${citation(r.ref)}) is not held on this server.`);
  }
  return issues;
}

/** A short human citation: "COMSUBLANT N3 021430ZOCT26 (COMSUBLANT 061/26)". */
export function citation(r: MessageReference): string {
  const id = [r.originator, r.dtg].filter(Boolean).join(" ");
  if (!id) return r.serial ?? r.kind;
  return r.serial ? `${id} (${r.serial})` : id;
}
