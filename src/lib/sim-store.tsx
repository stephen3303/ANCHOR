"use client";

// State behind the Server Simulators and Network Topology screens.
//
// The circuit between the two servers is the command's own link state: it is the
// same flag as EMCON / offline mode, so breaking it here puts every screen into
// offline mode, and restoring connectivity anywhere lets the next pulse drain the
// backlog. Released drafts wait in the server's transmission queue until the
// Message Admin transmits them (Transmission Queue); the simulator only shows them.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useStore } from "./store";
import { useRouting } from "./routing-store";
import {
  NODES,
  STATIONS,
  seedRepository,
  type ExternalServer,
  type LinkState,
  type LocalServer,
  type SimMessage,
  type SimTransmission,
  type Station,
} from "./sim";

const PULSE_MS = 20_000;

export interface PulseResult {
  at: string;
  backlog: number;
  forwarded: number;
  pushed: number;
  circuitUp: boolean;
}

interface SimStore {
  circuitUp: boolean;
  external: ExternalServer;
  local: LocalServer;
  repo: SimMessage[];
  /** Released drafts: transmitted ones carry a receipt, the rest are held at the ANCHOR server. */
  transmissions: SimTransmission[];
  links: Record<Station, LinkState>;
  autoPulse: boolean;
  setAutoPulse: (v: boolean) => void;
  lastPulse: PulseResult | null;

  seed: () => void;
  setFeed: (active: boolean) => void;
  releaseNext: () => void;
  pulse: () => void;
  connect: () => void;
  disconnect: () => void;
  setLink: (s: Station, state: LinkState["state"]) => void;
  restoreAll: () => void;
  reset: () => void;
}

const Ctx = createContext<SimStore | null>(null);
const nowIso = () => new Date().toISOString();

/** Hand every ingested message to each workstation whose link is up. */
function forward(repo: SimMessage[], links: Record<Station, LinkState>, at: string) {
  let count = 0;
  const next = repo.map((m) => {
    if (m.status !== "ingested") return m;
    const owed = STATIONS.filter((s) => links[s].state === "up" && !m.deliveries[s]);
    if (!owed.length) return m;
    count += owed.length;
    return { ...m, deliveries: { ...m.deliveries, ...Object.fromEntries(owed.map((s) => [s, at])) } };
  });
  return { repo: next, count };
}

const ingest = (m: SimMessage, at: string): SimMessage => ({ ...m, status: "ingested", ingestedAt: at, attempts: m.attempts + 1, lastError: undefined });

export function SimProvider({ children }: { children: ReactNode }) {
  const { offline, setOffline, log, notify } = useStore();
  const { drafts } = useRouting();
  const circuitUp = !offline;

  // Releases made before this session count as already received by C2OIX, so receipt serials don't repeat.
  const [external, setExternal] = useState<ExternalServer>(() => ({
    feedActive: true,
    beats: 0,
    received: drafts.filter((d) => d.status === "released").length,
    note: "Example traffic loaded. Feed running.",
  }));
  const [local, setLocal] = useState<LocalServer>({ beats: 0, received: 0, peerState: "unknown", note: "Awaiting first beat." });
  const [repo, setRepo] = useState<SimMessage[]>(seedRepository);
  const [sent, setSent] = useState<Record<string, { at: string; receipt: string }>>(() =>
    Object.fromEntries(drafts.filter((d) => d.status === "released").map((d, i) => [d.id, { at: d.releasedAt ?? nowIso(), receipt: `C2OIX-${String(i + 1).padStart(4, "0")}-SEED` }])),
  );
  const [links, setLinks] = useState<Record<Station, LinkState>>({ ws1: { state: "up" }, ws2: { state: "up" }, ws3: { state: "up" } });
  const [autoPulse, setAutoPulse] = useState(true);
  const [lastPulse, setLastPulse] = useState<PulseResult | null>(null);

  const transmissions = useMemo<SimTransmission[]>(
    () =>
      drafts
        .filter((d) => d.status === "released")
        .map((d) => ({
          id: `tx-${d.id}`,
          draftId: d.id,
          reference: `${d.type} ${d.localSequence ?? ""}`.trim(),
          subject: d.subject,
          precedence: d.precedence,
          releasedAt: d.releasedAt ?? "",
          status: d.transmittedAt || sent[d.id] ? "transmitted" : "held",
          attempts: d.transmittedAt || sent[d.id] ? 1 : 0,
          transmittedAt: d.transmittedAt ?? sent[d.id]?.at,
          receipt: sent[d.id]?.receipt ?? (d.transmittedAt ? `ANCHOR-${d.id.slice(0, 8).toUpperCase()}` : undefined),
        })),
    [drafts, sent],
  );

  /** With the circuit up: take the deferred backlog and pass traffic on. Transmitting is the Message Admin's. */
  const drain = useCallback(
    (at: string) => {
      const deferred = repo.filter((m) => m.status === "deferred");
      const pulled = repo.map((m) => (m.status === "deferred" ? ingest(m, at) : m));
      const fwd = forward(pulled, links, at);
      setRepo(fwd.repo);
      deferred.forEach((m) => log("Ingest", m.reference, `Deferred backlog taken from C2OIX on reconnect. ${m.subject}`));
      setLocal((l) => ({ ...l, received: l.received + deferred.length }));
      return { backlog: deferred.length, forwarded: fwd.count, pushed: 0 };
    },
    [repo, links, log],
  );

  const pulse = useCallback(() => {
    const at = nowIso();
    setExternal((e) => ({ ...e, beats: e.beats + 1, lastBeatAt: circuitUp ? at : e.lastBeatAt }));
    setLocal((l) => ({
      ...l,
      beats: l.beats + 1,
      lastBeatAt: at,
      peerState: circuitUp ? "up" : "down",
      latencyMs: circuitUp ? 40 + Math.floor(Math.random() * 80) : undefined,
      note: circuitUp ? "Beat answered by C2OIX." : "Beat unanswered: the circuit is down. Releases held.",
    }));
    const result = circuitUp ? drain(at) : { backlog: 0, forwarded: forward(repo, links, at).count, pushed: 0 };
    if (!circuitUp) setRepo((r) => forward(r, links, at).repo);
    setLastPulse({ at, circuitUp, ...result });
  }, [circuitUp, drain, repo, links]);

  // Keep the interval calling the latest pulse without restarting it on every change.
  const pulseRef = useRef(pulse);
  useEffect(() => {
    pulseRef.current = pulse;
  }, [pulse]);
  useEffect(() => {
    if (!autoPulse) return;
    const id = window.setInterval(() => pulseRef.current(), PULSE_MS);
    return () => window.clearInterval(id);
  }, [autoPulse]);

  const store = useMemo<SimStore>(
    () => ({
      circuitUp,
      external,
      local,
      repo,
      transmissions,
      links,
      autoPulse,
      setAutoPulse,
      lastPulse,

      seed: () => {
        setRepo(seedRepository());
        setExternal((e) => ({ ...e, feedActive: true, note: "Example traffic loaded. Feed running." }));
        log("Simulator Reset", "C2OIX repository", "Example traffic reloaded at the C2OIX simulator.");
        notify("Example traffic loaded at C2OIX");
      },
      setFeed: (active) => {
        setExternal((e) => ({ ...e, feedActive: active, note: active ? "Feed started." : "Feed stopped." }));
        notify(active ? "C2OIX feed started" : "C2OIX feed stopped");
      },

      releaseNext: () => {
        if (!external.feedActive) return notify("The C2OIX feed is stopped. Start it first.");
        const next = repo.filter((m) => m.status === "queued").sort((a, b) => a.seq - b.seq)[0];
        if (!next) return notify("Nothing is queued at C2OIX");
        const at = nowIso();
        if (!circuitUp) {
          setRepo((r) => r.map((m) => (m.seq === next.seq ? { ...m, status: "deferred", attempts: m.attempts + 1, lastError: "Local server not reachable. Held at C2OIX." } : m)));
          setExternal((e) => ({ ...e, note: `Held ${next.reference}: the ANCHOR server is not reachable.` }));
          return notify(`${next.reference} held at C2OIX: the circuit is down`);
        }
        const fwd = forward(repo.map((m) => (m.seq === next.seq ? ingest(m, at) : m)), links, at);
        setRepo(fwd.repo);
        setExternal((e) => ({ ...e, lastBeatAt: at, note: `Released ${next.reference} to the ANCHOR server.` }));
        setLocal((l) => ({ ...l, received: l.received + 1, note: `Ingested ${next.reference}.` }));
        const reach = STATIONS.filter((s) => links[s].state === "up").map((s) => NODES[s].code);
        log("Ingest", next.reference, `${next.subject}. Received from C2OIX; ${reach.length ? `passed to ${reach.join(", ")}` : "held at the ANCHOR server: no workstation reachable"}.`);
        notify(reach.length ? `${next.reference} ingested and passed to ${reach.join(", ")}` : `${next.reference} waiting at the ANCHOR server`);
      },

      pulse,

      connect: () => {
        if (circuitUp) return;
        setOffline(false);
        const r = drain(nowIso());
        log("Circuit Up", "C2OIX circuit", `Reconnected. ${r.backlog} deferred taken.`);
      },
      disconnect: () => {
        if (!circuitUp) return;
        setOffline(true);
        log("Circuit Down", "C2OIX circuit", "Circuit broken. Releases are held at the ANCHOR server and C2OIX defers traffic for this command.");
      },

      setLink: (s, state) => {
        if (links[s].state === state) return;
        const at = nowIso();
        const next = { ...links, [s]: { state, reportedAt: at } };
        setLinks(next);
        if (state === "up") setRepo((r) => forward(r, next, at).repo);
        log(
          "Link Reported",
          `${NODES[s].code} link`,
          state === "up"
            ? `${NODES[s].name} reconnected to the ANCHOR server and took the traffic waiting for it.`
            : `${NODES[s].name} cannot reach the ANCHOR server. Traffic for it waits at the server.`,
        );
        notify(state === "up" ? `${NODES[s].code} link restored` : `${NODES[s].code} link broken`);
      },

      restoreAll: () => {
        const at = nowIso();
        const up = Object.fromEntries(STATIONS.map((s) => [s, { state: "up", reportedAt: at }])) as Record<Station, LinkState>;
        setLinks(up);
        if (!circuitUp) setOffline(false);
        // Drain against the restored links.
        const deferred = repo.filter((m) => m.status === "deferred").length;
        const fwd = forward(repo.map((m) => (m.status === "deferred" ? ingest(m, at) : m)), up, at);
        setRepo(fwd.repo);
        setLocal((l) => ({ ...l, received: l.received + deferred }));
        log("Link Reported", "All connections", `Circuit and all three workstation links restored. ${deferred} deferred taken. Queued releases wait for the Message Admin.`);
        notify("All connections restored");
      },

      reset: () => {
        setRepo([]);
        setSent({});
        setExternal({ feedActive: false, beats: 0, received: 0, note: "Repository cleared." });
        setLocal({ beats: 0, received: 0, peerState: "unknown", note: "Queue cleared." });
        setLastPulse(null);
        log("Simulator Reset", "C2OIX repository and release queue", "Cleared from the Server Simulators screen. Released drafts return to the release queue as held.");
        notify("Repository and release queue cleared");
      },
    }),
    [circuitUp, external, local, repo, transmissions, links, autoPulse, lastPulse, pulse, drain, setOffline, log, notify],
  );

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useSim() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSim must be used inside SimProvider");
  return s;
}
