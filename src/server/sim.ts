// The network topology demonstration: an external C2OIX server, the local ANCHOR
// server, and three workstations. An operator forces C2OIX to send its next
// messages and breaks links to show traffic queueing wherever a link is down.
//
// A message that has not left C2OIX has not been transmitted. With the circuit
// down a dropped message is released but waits at C2OIX; when the circuit comes
// back the local server takes the whole backlog. The local server hands what it
// holds to every workstation it can reach, and catches a workstation up when its
// link is restored. Every operator action is appended to the audit chain.
import type { DatabaseSync } from "node:sqlite";
import { tx } from "./db.ts";
import { appendAudit, type Actor } from "./repo.ts";
import type { Precedence } from "../lib/types.ts";
import { STATIONS, type Station, type TopoMessage } from "../lib/topology.ts";

export const LINKS = ["circuit", ...STATIONS] as const;
export type LinkKey = (typeof LINKS)[number];

export const LINK_LABEL: Record<LinkKey, string> = {
  circuit: "C2OIX circuit",
  ws1: "WS-01 link",
  ws2: "WS-02 link",
  ws3: "WS-03 link",
};

/** The most an operator can force out in one press. */
export const MAX_PER_DROP = 10;

/** Example traffic held by the simulated C2OIX server. Fictional. */
const TRAFFIC: { reference: string; subject: string; precedence: Precedence }[] = [
  { reference: "CSL-2614-0187", subject: "Submarine readiness reporting schedule change", precedence: "PRIORITY" },
  { reference: "CSF-2614-0092", subject: "Exercise tasking serial two four seven", precedence: "IMMEDIATE" },
  { reference: "CSL-2614-0191", subject: "Mandatory training reporting for November", precedence: "ROUTINE" },
  { reference: "NVA-2614-0455", subject: "Annual information assurance training requirement", precedence: "ROUTINE" },
  { reference: "CSF-2614-0098", subject: "Severe weather advisory for Norfolk operating area", precedence: "FLASH" },
  { reference: "CSL-2614-0203", subject: "Spare parts requirement validation", precedence: "ROUTINE" },
  { reference: "CSP-2614-0311", subject: "Supply routing change for Pacific units", precedence: "PRIORITY" },
  { reference: "NVA-2614-0461", subject: "Personnel transfer cycle guidance", precedence: "ROUTINE" },
  { reference: "CSF-2614-0104", subject: "Arrival report required for returning units", precedence: "IMMEDIATE" },
  { reference: "CSL-2614-0212", subject: "Command inspection schedule second quarter", precedence: "ROUTINE" },
];

export type SimMessage = TopoMessage;

export interface SimLink {
  key: LinkKey;
  label: string;
  up: boolean;
  changedAt: string;
  changedBy: string;
}

export interface SimState {
  links: SimLink[];
  messages: SimMessage[];
}

export interface DropResult {
  released: number;
  handed: number;
  held: number;
  circuit: "up" | "down";
}

export class SimError extends Error {}

const nowIso = () => new Date().toISOString();

function seedQueue(db: DatabaseSync) {
  const add = db.prepare("INSERT INTO sim_message (seq, reference, subject, precedence, status) VALUES (?, ?, ?, ?, 'queued')");
  TRAFFIC.forEach((m, i) => add.run(i + 1, m.reference, m.subject, m.precedence));
}

/** Create the queue and the links on first use: everything queued, every link up. */
export function ensureSim(db: DatabaseSync) {
  tx(db, () => {
    const at = nowIso();
    const link = db.prepare("INSERT OR IGNORE INTO sim_link (key, up, changed_at, changed_by) VALUES (?, 1, ?, 'demonstration start')");
    LINKS.forEach((key) => link.run(key, at));
    if (!(db.prepare("SELECT COUNT(*) AS n FROM sim_message").get() as { n: number }).n) seedQueue(db);
  });
}

const isUp = (db: DatabaseSync, key: LinkKey) =>
  Boolean((db.prepare("SELECT up FROM sim_link WHERE key = ?").get(key) as { up: number } | undefined)?.up ?? 1);

/** The local server hands everything it holds to each workstation it can reach. */
function deliver(db: DatabaseSync, at: string): number {
  const reachable = STATIONS.filter((s) => isUp(db, s));
  if (!reachable.length) return 0;
  const add = db.prepare(
    `INSERT OR IGNORE INTO sim_delivery (seq, station, delivered_at)
     SELECT seq, ?, ? FROM sim_message WHERE status = 'ingested'`,
  );
  return reachable.reduce((n, s) => n + Number(add.run(s, at).changes), 0);
}

/** Messages reaching the local server, then on to the workstations. */
function ingest(db: DatabaseSync, seqs: number[], at: string) {
  const mark = db.prepare("UPDATE sim_message SET status = 'ingested', ingested_at = ?, released_at = COALESCE(released_at, ?) WHERE seq = ?");
  seqs.forEach((seq) => mark.run(at, at, seq));
  deliver(db, at);
}

export function simState(db: DatabaseSync): SimState {
  ensureSim(db);
  const links = (db.prepare("SELECT key, up, changed_at, changed_by FROM sim_link").all() as { key: LinkKey; up: number; changed_at: string; changed_by: string }[])
    .sort((a, b) => LINKS.indexOf(a.key) - LINKS.indexOf(b.key))
    .map((r) => ({ key: r.key, label: LINK_LABEL[r.key], up: Boolean(r.up), changedAt: r.changed_at, changedBy: r.changed_by }));
  const deliveries = db.prepare("SELECT seq, station, delivered_at FROM sim_delivery").all() as { seq: number; station: Station; delivered_at: string }[];
  const messages = (
    db.prepare("SELECT seq, reference, subject, precedence, status, released_at, ingested_at FROM sim_message ORDER BY seq").all() as {
      seq: number;
      reference: string;
      subject: string;
      precedence: Precedence;
      status: TopoMessage["status"];
      released_at: string | null;
      ingested_at: string | null;
    }[]
  ).map((r) => ({
    seq: r.seq,
    reference: r.reference,
    subject: r.subject,
    precedence: r.precedence,
    status: r.status,
    releasedAt: r.released_at,
    ingestedAt: r.ingested_at,
    deliveries: Object.fromEntries(deliveries.filter((d) => d.seq === r.seq).map((d) => [d.station, d.delivered_at])),
  }));
  return { links, messages };
}

const plural = (n: number) => `${n} ${n === 1 ? "message" : "messages"}`;

/**
 * Force C2OIX to send its next messages now. With the circuit up, what is waiting
 * goes first, then the queue in order, and it all reaches the local server. With
 * the circuit down, the next queued messages are released but wait at C2OIX.
 */
export function simDrop(db: DatabaseSync, actor: Actor, count: number): DropResult {
  if (!Number.isInteger(count) || count < 1 || count > MAX_PER_DROP) throw new SimError(`Drop between 1 and ${MAX_PER_DROP} messages.`);
  ensureSim(db);
  return tx(db, () => {
    const up = isUp(db, "circuit");
    const at = nowIso();
    const next = (
      db
        .prepare(
          up
            ? "SELECT seq, reference FROM sim_message WHERE status IN ('waiting', 'queued') ORDER BY status = 'queued', seq LIMIT ?"
            : "SELECT seq, reference FROM sim_message WHERE status = 'queued' ORDER BY seq LIMIT ?",
        )
        .all(count) as { seq: number; reference: string }[]
    );
    if (up) ingest(db, next.map((m) => m.seq), at);
    else {
      const hold = db.prepare("UPDATE sim_message SET status = 'waiting', released_at = ? WHERE seq = ?");
      next.forEach((m) => hold.run(at, m.seq));
    }
    const refs = next.map((m) => m.reference).join(", ");
    appendAudit(
      db,
      actor,
      "C2OIX Release",
      "Network topology demonstration",
      !next.length
        ? "Drop requested; nothing left in the C2OIX queue."
        : up
          ? `C2OIX forced to send ${plural(next.length)} (${refs}); all reached the ANCHOR server.`
          : `C2OIX forced to release ${plural(next.length)} (${refs}) with the circuit down; held at C2OIX, not transmitted.`,
    );
    return { released: next.length, handed: up ? next.length : 0, held: up ? 0 : next.length, circuit: up ? "up" : "down" };
  });
}

/**
 * Break or restore one link. Restoring the circuit brings in everything waiting at
 * C2OIX; restoring a workstation link catches that workstation up.
 */
export function simSetLink(db: DatabaseSync, actor: Actor & { name: string }, key: LinkKey, up: boolean): { caughtUp: number } {
  if (!LINKS.includes(key)) throw new SimError("Unknown link.");
  ensureSim(db);
  return tx(db, () => {
    const at = nowIso();
    db.prepare("UPDATE sim_link SET up = ?, changed_at = ?, changed_by = ? WHERE key = ?").run(up ? 1 : 0, at, actor.name, key);
    let caughtUp = 0;
    if (up && key === "circuit") {
      const waiting = (db.prepare("SELECT seq FROM sim_message WHERE status = 'waiting' ORDER BY seq").all() as { seq: number }[]).map((r) => r.seq);
      ingest(db, waiting, at);
      caughtUp = waiting.length;
    } else if (up) caughtUp = deliver(db, at);
    appendAudit(
      db,
      actor,
      "Link Reported",
      LINK_LABEL[key],
      up
        ? key === "circuit"
          ? `Circuit restored; ${plural(caughtUp)} waiting at C2OIX taken by the ANCHOR server.`
          : `${LINK_LABEL[key]} restored; ${plural(caughtUp)} held at the ANCHOR server delivered.`
        : key === "circuit"
          ? "Circuit broken; anything C2OIX releases waits there."
          : `${LINK_LABEL[key]} broken; the ANCHOR server holds that workstation's traffic.`,
    );
    return { caughtUp };
  });
}

/** Start the demonstration over: every message back in the C2OIX queue, every link up. */
export function simReset(db: DatabaseSync, actor: Actor & { name: string }) {
  ensureSim(db);
  tx(db, () => {
    db.exec("DELETE FROM sim_delivery; DELETE FROM sim_message;");
    seedQueue(db);
    db.prepare("UPDATE sim_link SET up = 1, changed_at = ?, changed_by = ?").run(nowIso(), actor.name);
    appendAudit(db, actor, "Simulation Reset", "Network topology demonstration", `Example traffic reloaded (${plural(TRAFFIC.length)} queued at C2OIX); every link restored.`);
  });
}
