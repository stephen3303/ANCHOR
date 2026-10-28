"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Monitor, RotateCcw, Send, Server, Waypoints } from "lucide-react";
import { fmtDateTime } from "@/lib/format";
import { useStore } from "@/lib/store";
import { deriveTraffic, type Station, type TopoMessage } from "@/lib/topology";
import { Button, PageHeader, Panel, PrecedenceBadge, cx } from "@/components/ui";

type LinkKey = "circuit" | Station;
interface Link {
  key: LinkKey;
  label: string;
  up: boolean;
  changedAt: string;
  changedBy: string;
}
interface Sim {
  links: Link[];
  messages: TopoMessage[];
  canDrive: boolean;
}

const STATION_NODES: { key: Station; code: string; name: string }[] = [
  { key: "ws1", code: "WS-01", name: "Watch Officer workstation" },
  { key: "ws2", code: "WS-02", name: "Traffic desk workstation" },
  { key: "ws3", code: "WS-03", name: "Drafting workstation" },
];

const POLL_MS = 3000;

const readSim = async (): Promise<Sim | null> => {
  const r = await fetch("/api/topology").catch(() => null);
  return r?.ok ? ((await r.json()) as Sim) : null;
};

/** How many messages a node holds, and the one message it shows. */
function NodeTraffic({ countLabel, count, attention, note, msgLabel, msg, at, empty }: {
  countLabel: string;
  count: number;
  attention: boolean;
  note: string;
  msgLabel: string;
  msg: TopoMessage | null;
  at?: string | null;
  empty: string;
}) {
  return (
    <>
      <div className="mt-3 flex items-stretch gap-2">
        <div className={cx("flex w-28 shrink-0 flex-col justify-center rounded-md border px-2.5 py-2", attention ? "border-amber-300 bg-amber-50" : "border-line bg-navy-50")}>
          <div className="text-[11px] font-semibold uppercase leading-tight tracking-wide text-muted">{countLabel}</div>
          <div className="mt-0.5 text-3xl font-bold leading-none text-ink" aria-live="polite">{count}</div>
        </div>
        <div className="min-w-0 flex-1 rounded-md border border-line px-2.5 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{msgLabel}</div>
          {msg ? (
            <>
              <div className="mt-0.5 flex items-center gap-2">
                <span className="truncate font-mono text-[13px] font-semibold" title={msg.reference}>{msg.reference}</span>
                <PrecedenceBadge p={msg.precedence} />
              </div>
              <div className="truncate text-[13px] text-muted" title={msg.subject}>{msg.subject}</div>
              {at && <div className="text-[12px] text-muted" suppressHydrationWarning>{fmtDateTime(at)}</div>}
            </>
          ) : (
            <div className="mt-0.5 text-[13px] text-muted">{empty}</div>
          )}
        </div>
      </div>
      <div className="mt-1 text-[12px] text-muted">{note}</div>
    </>
  );
}

function Node({ icon: Icon, code, name, up, upLabel, downLabel, warning, children }: {
  icon: typeof Server;
  code: string;
  name: string;
  up: boolean;
  upLabel: string;
  downLabel: string;
  warning?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx("w-full rounded-lg border bg-white p-3 shadow-sm", up ? "border-line" : "border-red-300")}>
      <div className="flex items-center gap-2">
        <Icon className="size-5 shrink-0 text-navy-800" aria-hidden />
        <div className="min-w-0">
          <div className="truncate text-sm font-bold">{name}</div>
          <div className="font-mono text-[11px] uppercase tracking-wider text-muted">{code}</div>
        </div>
        <span className={cx("ml-auto flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-[11px] font-semibold uppercase", up ? "border-green-300 bg-green-50 text-green-700" : "border-red-300 bg-red-50 text-red-700")}>
          <span className={cx("size-2 rounded-full", up ? "bg-green-500" : "bg-red-600")} aria-hidden />
          {up ? upLabel : downLabel}
        </span>
      </div>
      {warning && <p className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-[12px] text-red-800">{warning}</p>}
      {children}
    </div>
  );
}

function LinkToggle({ link, disabled, onToggle }: { link: Link; disabled: boolean; onToggle: () => void }) {
  return (
    <div className="flex flex-col items-center py-1">
      <span className={cx("h-4 w-0.5", link.up ? "bg-green-500" : "border-l-2 border-dashed border-red-500")} aria-hidden />
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        className={cx(
          "rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
          link.up ? "border-green-300 bg-green-50 text-green-800 hover:bg-green-100" : "border-red-300 bg-red-50 text-red-800 hover:bg-red-100",
        )}
        aria-label={`${link.label} is ${link.up ? "up" : "down"}. ${link.up ? "Break" : "Restore"} it.`}
      >
        {link.label}: {link.up ? "up · break" : "down · restore"}
      </button>
      <span className={cx("h-4 w-0.5", link.up ? "bg-green-500" : "border-l-2 border-dashed border-red-500")} aria-hidden />
    </div>
  );
}

export default function TopologyPage() {
  const { notify, refresh } = useStore();
  const [sim, setSim] = useState<Sim | null>(null);
  const [working, setWorking] = useState("");

  useEffect(() => {
    let alive = true;
    const read = () =>
      readSim().then((s) => {
        if (alive && s) setSim(s);
      });
    read();
    const t = setInterval(() => document.visibilityState === "visible" && read(), POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const send = async (key: string, body: object, done: (result: Record<string, number | string>) => string) => {
    setWorking(key);
    try {
      const r = await fetch("/api/topology", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? `Server answered ${r.status}`);
      setSim(data as Sim);
      notify(done(data.result ?? {}));
      await refresh();
    } catch (e) {
      notify(e instanceof Error ? e.message : "That didn't go through");
    } finally {
      setWorking("");
    }
  };

  if (!sim) return <PageHeader icon={Waypoints} title="Network Topology" subtitle="Reading link state…" />;

  const link = (key: LinkKey) => sim.links.find((l) => l.key === key)!;
  const circuitUp = link("circuit").up;
  const t = deriveTraffic(sim.messages, circuitUp);
  const reachable = STATION_NODES.filter((s) => link(s.key).up).length;
  const owedTotal = STATION_NODES.reduce((n, s) => n + t.stations[s.key].owed, 0);
  const ready = circuitUp ? t.atC2oix : t.queued.length;
  const busy = Boolean(working) || !sim.canDrive;
  const plural = (n: number) => `${n} ${n === 1 ? "message" : "messages"}`;

  const drop = (count: number, key: string) =>
    send(key, { op: "drop", count }, (r) =>
      !r.released ? "Nothing left to drop" : r.circuit === "up" ? `C2OIX dropped ${plural(Number(r.released))} to the ANCHOR server` : `${plural(Number(r.released))} released and waiting at C2OIX: circuit down`,
    );
  const toggle = (l: Link) =>
    send(l.key, { op: "link", key: l.key, up: !l.up }, (r) =>
      l.up ? `${l.label} broken` : `${l.label} restored${Number(r.caughtUp) ? `: ${plural(Number(r.caughtUp))} came through` : ""}`,
    );

  const tiles = [
    { label: "Command posture", value: circuitUp ? "Normal operations" : "Circuit down", ok: circuitUp },
    { label: "Waiting at C2OIX, not transmitted", value: String(t.waiting.length), ok: !t.waiting.length },
    { label: "Workstations reachable", value: `${reachable} of ${STATION_NODES.length}`, ok: reachable === STATION_NODES.length },
  ];

  return (
    <>
      <PageHeader
        icon={Waypoints}
        title="Network Topology"
        subtitle="The command's links: the C2OIX server, the ANCHOR server and three workstations. Force C2OIX to send, break a link, and watch the messages queue where the link is down."
        actions={
          <Button icon={RotateCcw} disabled={busy} onClick={() => send("reset", { op: "reset" }, () => "Example traffic reloaded and every link restored")}>
            Reset demonstration
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {tiles.map((tile) => (
          <div key={tile.label} className={cx("rounded-lg border px-4 py-3 shadow-sm", tile.ok ? "border-green-300 bg-green-50" : "border-amber-300 bg-amber-50")}>
            <div className="text-[12px] font-semibold uppercase tracking-wide text-muted">{tile.label}</div>
            <div className="mt-0.5 text-xl font-bold">{tile.value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <Panel title="Command links" action={<span className="text-[13px] text-muted">{sim.canDrive ? "Click a link to break or restore it" : "Read only"}</span>}>
          <div className="flex flex-col items-center">
            <div className="w-full max-w-md">
              <Node icon={Server} code="C2OIX" name="External C2OIX server" up={circuitUp} upLabel="Reachable" downLabel="Unreachable"
                warning={!circuitUp && t.waiting.length ? `${plural(t.waiting.length)} released and waiting here. Not yet transmitted.` : undefined}>
                <NodeTraffic countLabel="At C2OIX" count={t.atC2oix} attention={t.waiting.length > 0}
                  note={`${t.queued.length} queued · ${t.waiting.length} waiting for the circuit`}
                  msgLabel="Next in queue" msg={t.next} empty={t.atC2oix ? "Waiting for the circuit" : "Queue empty"} />
              </Node>
            </div>

            <LinkToggle link={link("circuit")} disabled={busy} onToggle={() => toggle(link("circuit"))} />

            <div className="w-full max-w-md">
              <Node icon={Server} code="ANCHOR" name="Local ANCHOR server" up upLabel="Online" downLabel="Offline">
                <NodeTraffic countLabel="At ANCHOR" count={t.ingested.length} attention={owedTotal > 0}
                  note={owedTotal ? `${plural(owedTotal)} held for cut-off workstations` : "All handed on"}
                  msgLabel="Last received" msg={t.lastIngested} at={t.lastIngested?.ingestedAt} empty="Nothing received yet" />
              </Node>
            </div>

            <div className="hidden w-full flex-col items-center sm:flex" aria-hidden>
              <span className="h-4 w-0.5 bg-line" />
              <span className="h-0.5 w-2/3 bg-line" />
            </div>

            <div className="grid w-full gap-4 sm:grid-cols-3">
              {STATION_NODES.map((s) => {
                const st = t.stations[s.key];
                const l = link(s.key);
                return (
                  <div key={s.key} className="flex flex-col items-center">
                    <LinkToggle link={l} disabled={busy} onToggle={() => toggle(l)} />
                    <Node icon={Monitor} code={s.code} name={s.name} up={l.up} upLabel="Connected" downLabel="Offline"
                      warning={l.up ? undefined : "Cannot reach the ANCHOR server. Its traffic waits there."}>
                      <NodeTraffic countLabel="Here" count={st.count} attention={st.owed > 0}
                        note={st.owed ? `${plural(st.owed)} waiting at ANCHOR` : "Up to date"}
                        msgLabel="Last received" msg={st.last} at={st.lastAt} empty="Nothing received yet" />
                    </Node>
                  </div>
                );
              })}
            </div>
          </div>
        </Panel>

        <Panel title="C2OIX release" icon={Send}>
          <p className="mb-3 text-sm">
            {circuitUp
              ? "The circuit is up. A drop sends the next message from C2OIX to the ANCHOR server, which hands it to every workstation it can reach."
              : "The circuit is down. A drop releases the next message at C2OIX, but it cannot leave: it waits there, not transmitted, until the circuit is restored."}
          </p>
          <div className="grid gap-2">
            <Button variant="primary" icon={Send} disabled={busy || !ready} onClick={() => drop(1, "drop-1")}>Drop 1 message</Button>
            <Button icon={Send} disabled={busy || !ready} onClick={() => drop(Math.min(3, ready), "drop-3")}>Drop 3 messages</Button>
            <Button icon={Send} disabled={busy || !ready} onClick={() => drop(Math.min(10, ready), "drop-all")}>Drop all ({ready})</Button>
          </div>
          <p className="mt-3 text-[13px] text-muted">
            {sim.canDrive
              ? `${plural(ready)} ready to drop. Every drop and every link change is recorded in the audit trail.`
              : "Only a System Admin drives the simulated servers. The counts still update live."}
          </p>
          <p className="mt-2 text-[13px] text-muted">Simulation only: these messages are example traffic, not official records.</p>
        </Panel>
      </div>
    </>
  );
}
