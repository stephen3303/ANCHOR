// What each node of the topology demonstration holds, worked out from the
// simulation state. Shared by the page and the tests.
import type { Precedence } from "./types.ts";

export type Station = "ws1" | "ws2" | "ws3";
export const STATIONS: Station[] = ["ws1", "ws2", "ws3"];

export interface TopoMessage {
  seq: number;
  reference: string;
  subject: string;
  precedence: Precedence;
  status: "queued" | "waiting" | "ingested";
  releasedAt: string | null;
  ingestedAt: string | null;
  deliveries: Partial<Record<Station, string>>;
}

export interface StationTraffic {
  count: number;
  /** Held at the ANCHOR server for this workstation. */
  owed: number;
  last: TopoMessage | null;
  lastAt: string | null;
}

export interface Traffic {
  queued: TopoMessage[];
  waiting: TopoMessage[];
  ingested: TopoMessage[];
  /** What the next drop sends. */
  next: TopoMessage | null;
  atC2oix: number;
  lastIngested: TopoMessage | null;
  stations: Record<Station, StationTraffic>;
}

const latest = <T>(list: T[], key: (t: T) => string) => list.reduce<T | null>((best, t) => (!best || key(t) > key(best) ? t : best), null);
const order = (m: TopoMessage) => String(m.seq).padStart(5, "0");

/**
 * A message that has not left C2OIX has not been transmitted: it is queued there,
 * or released while the circuit was down and waiting there. The ANCHOR server
 * holds what it has ingested; each workstation holds what it has been handed.
 */
export function deriveTraffic(messages: TopoMessage[], circuitUp: boolean): Traffic {
  const bySeq = (a: TopoMessage, b: TopoMessage) => a.seq - b.seq;
  const queued = messages.filter((m) => m.status === "queued").sort(bySeq);
  const waiting = messages.filter((m) => m.status === "waiting").sort(bySeq);
  const ingested = messages.filter((m) => m.status === "ingested");
  const stations = Object.fromEntries(
    STATIONS.map((s) => {
      const got = ingested.filter((m) => m.deliveries[s]);
      const last = latest(got, (m) => `${m.deliveries[s]}|${m.ingestedAt ?? ""}|${order(m)}`);
      return [s, { count: got.length, owed: ingested.length - got.length, last, lastAt: last?.deliveries[s] ?? null }];
    }),
  ) as Record<Station, StationTraffic>;
  return {
    queued,
    waiting,
    ingested,
    next: circuitUp ? (waiting[0] ?? queued[0] ?? null) : (queued[0] ?? null),
    atC2oix: queued.length + waiting.length,
    lastIngested: latest(ingested, (m) => `${m.ingestedAt ?? ""}|${order(m)}`),
    stations,
  };
}
