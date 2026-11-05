"use client";

// State behind the Comms & Network screen.
//
// The circuit between the two servers is the command's own link state: it is the
// same flag as EMCON / offline mode, so breaking it puts every screen into offline
// mode. Nothing moves by itself: traffic leaves C2OIX only when the Message Admin
// releases it, and waits at the last node it could reach until a link is restored.
// Once a workstation is handed a message it appears in Messages. Released drafts wait
// in the server's transmission queue until the Message Admin transmits them
// (Transmission Queue); the simulator only shows them.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useStore } from "./store";
import { useRouting } from "./routing-store";
import { NODES, STATIONS, seedRepository, toInboxMessage, type LinkState, type SimMessage, type SimTransmission, type Station } from "./sim";

interface SimStore {
  circuitUp: boolean;
  repo: SimMessage[];
  /** Released drafts: transmitted ones are gone, the rest are held at the ANCHOR server. */
  transmissions: SimTransmission[];
  links: Record<Station, LinkState>;

  releaseNext: () => void;
  connect: () => void;
  disconnect: () => void;
  setLink: (s: Station, state: LinkState["state"]) => void;
  restoreAll: () => void;
  /** Put every message back at C2OIX and take the delivered ones out of the inbox. */
  resetMessages: () => void;
}

const Ctx = createContext<SimStore | null>(null);
const nowIso = () => new Date().toISOString();
const ALL_UP: Record<Station, LinkState> = { ws1: { state: "up" }, ws2: { state: "up" }, ws3: { state: "up" } };

/** Hand every ingested message to each workstation whose link is up. */
function forward(repo: SimMessage[], links: Record<Station, LinkState>, at: string) {
  return repo.map((m) => {
    if (m.status !== "ingested") return m;
    const owed = STATIONS.filter((s) => links[s].state === "up" && !m.deliveries[s]);
    if (!owed.length) return m;
    return { ...m, deliveries: { ...m.deliveries, ...Object.fromEntries(owed.map((s) => [s, at])) } };
  });
}

const ingest = (m: SimMessage, at: string): SimMessage => ({ ...m, status: "ingested", ingestedAt: at, attempts: m.attempts + 1, lastError: undefined });
/** Take the deferred backlog from C2OIX. */
const takeBacklog = (repo: SimMessage[], at: string) => repo.map((m) => (m.status === "deferred" ? ingest(m, at) : m));

export function SimProvider({ children }: { children: ReactNode }) {
  const { offline, setOffline, log, notify, addSimMessage, clearSimMessages } = useStore();
  const { drafts } = useRouting();
  const circuitUp = !offline;

  const [repo, setRepo] = useState<SimMessage[]>(seedRepository);
  const [links, setLinks] = useState<Record<Station, LinkState>>(ALL_UP);

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
          status: d.transmittedAt ? "transmitted" : "held",
          attempts: d.transmittedAt ? 1 : 0,
          transmittedAt: d.transmittedAt,
          receipt: d.transmittedAt ? `ANCHOR-${d.id.slice(0, 8).toUpperCase()}` : undefined,
        })),
    [drafts],
  );

  /** Store the new repository and put anything a workstation was just handed into the inbox. */
  const commit = useCallback(
    (next: SimMessage[], at: string) => {
      const before = new Map(repo.map((m) => [m.seq, m]));
      for (const m of next) {
        const was = before.get(m.seq);
        const hadAny = was && STATIONS.some((s) => was.deliveries[s]);
        if (!hadAny && STATIONS.some((s) => m.deliveries[s])) addSimMessage(toInboxMessage(m, at));
      }
      setRepo(next);
    },
    [repo, addSimMessage],
  );

  const store = useMemo<SimStore>(
    () => ({
      circuitUp,
      repo,
      transmissions,
      links,

      releaseNext: () => {
        const next = repo.filter((m) => m.status === "queued").sort((a, b) => a.seq - b.seq)[0];
        if (!next) return notify("Nothing is queued at C2OIX. Reset messages to send them again.");
        const at = nowIso();
        if (!circuitUp) {
          setRepo((r) => r.map((m) => (m.seq === next.seq ? { ...m, status: "deferred", attempts: m.attempts + 1, lastError: "Local server not reachable. Held at C2OIX." } : m)));
          return notify(`${next.reference} held at C2OIX: the circuit is down`);
        }
        commit(forward(repo.map((m) => (m.seq === next.seq ? ingest(m, at) : m)), links, at), at);
        const reach = STATIONS.filter((s) => links[s].state === "up").map((s) => NODES[s].code);
        log("Ingest", next.reference, `${next.subject}. Received from C2OIX; ${reach.length ? `passed to ${reach.join(", ")}` : "held at the ANCHOR server: no workstation reachable"}.`);
        notify(reach.length ? `${next.reference} ingested and passed to ${reach.join(", ")}` : `${next.reference} waiting at the ANCHOR server`);
      },

      connect: () => {
        if (circuitUp) return;
        setOffline(false);
        const at = nowIso();
        const backlog = repo.filter((m) => m.status === "deferred").length;
        commit(forward(takeBacklog(repo, at), links, at), at);
        log("Circuit Up", "C2OIX circuit", `Reconnected. ${backlog} deferred taken.`);
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
        if (state === "up") commit(forward(repo, next, at), at);
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
        const backlog = repo.filter((m) => m.status === "deferred").length;
        commit(forward(takeBacklog(repo, at), up, at), at);
        log("Link Reported", "All connections", `Circuit and all three workstation links restored. ${backlog} deferred taken. Queued releases wait for the Message Admin.`);
        notify("All connections restored");
      },

      resetMessages: () => {
        setRepo(seedRepository());
        clearSimMessages();
        log("Simulator Reset", "C2OIX repository", "Example traffic returned to C2OIX and removed from the inbox for redelivery.");
        notify("Messages reset: all example traffic is back at C2OIX");
      },
    }),
    [circuitUp, repo, transmissions, links, commit, setOffline, log, notify, clearSimMessages],
  );

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useSim() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSim must be used inside SimProvider");
  return s;
}
