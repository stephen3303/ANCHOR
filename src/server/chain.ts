// Hash chain for the audit log. Each event's hash covers its own fields and the
// previous event's hash, so editing, deleting or reordering any past event
// breaks every hash after it. Pure apart from node:crypto, so tests can use it.
import { createHash } from "node:crypto";

export const GENESIS = "0".repeat(64);

export interface ChainFields {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  resource: string;
  classification: string;
  result: string;
  sourceIp: string;
  device: string;
  location: string;
  details: string;
}

export const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

/** Fixed field order, so the hash never depends on object key order. */
export function eventHash(prev: string, e: ChainFields): string {
  const body = [
    e.id, e.timestamp, e.user, e.action, e.resource, e.classification,
    e.result, e.sourceIp, e.device, e.location, e.details,
  ].join("\u001f");
  return sha256(`${prev}\u001e${body}`);
}

export interface ChainCheck {
  ok: boolean;
  /** Events verified; for an account limited to its own entries (see chainCheckFor), the count of those entries */
  checked: number;
  /** id of the first event whose hash doesn't match, when not ok */
  brokenAt?: string;
  /**
   * Hash of the newest event. Write it down outside ANCHOR: a later check whose
   * chain no longer passes through it means events were removed or rewritten.
   */
  head?: string;
}

/** Walk events oldest first and recompute every link. */
export function verifyChain(events: (ChainFields & { prevHash: string; hash: string })[]): ChainCheck {
  let prev = GENESIS;
  for (const e of events) {
    if (e.prevHash !== prev || eventHash(prev, e) !== e.hash) return { ok: false, checked: events.length, brokenAt: e.id };
    prev = e.hash;
  }
  return { ok: true, checked: events.length, head: prev };
}
