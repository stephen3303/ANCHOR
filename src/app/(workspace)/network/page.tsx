"use client";

import { useCurrentUser } from "@/lib/current-user";
import { hasRole, MESSAGE_ADMIN } from "@/lib/roles";
import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Inbox, Monitor, RadioTower, RotateCcw, Send, Server, Undo2, Waypoints, X } from "lucide-react";
import { Button, EmptyState, PageHeader, Panel, PrecedenceBadge, StatusDot, cx, tableWrap, tbodyRow } from "@/components/ui";
import { MessageCellsRow, MessageHeaderRow, messageColumns } from "@/components/message-columns";
import { fmtDateTime } from "@/lib/format";
import { NODES, STATIONS, fullyDelivered, owedTo, type NodeKey, type Station } from "@/lib/sim";
import { useSim } from "@/lib/sim-store";

type Tone = "up" | "attention" | "error";
const TILE: Record<Tone, string> = {
  up: "border-green-300 bg-green-50",
  attention: "border-amber-300 bg-amber-50",
  error: "border-red-300 bg-red-50",
};

interface Pipe {
  waiting: number;
  processed: number;
  live: boolean;
}

/** Everything the diagram draws, worked out from the simulator state. */
function useTopology() {
  const sim = useSim();
  const { repo, transmissions, links, circuitUp } = sim;
  const atC2oix = repo.filter((m) => m.status === "queued" || m.status === "deferred").length;
  const ingested = repo.filter((m) => m.status === "ingested");
  const held = transmissions.filter((t) => t.status === "held").length;
  const transmitted = transmissions.length - held;
  const reachable = STATIONS.filter((s) => links[s].state === "up");
  const pipes: Record<NodeKey, { inbound: Pipe; outbound: Pipe }> = {
    c2oix: { inbound: { waiting: atC2oix, processed: ingested.length, live: circuitUp }, outbound: { waiting: 0, processed: transmitted, live: circuitUp } },
    anchor: {
      inbound: { waiting: ingested.filter((m) => !fullyDelivered(m)).length, processed: ingested.filter(fullyDelivered).length, live: true },
      outbound: { waiting: held, processed: transmitted, live: circuitUp },
    },
    ...(Object.fromEntries(
      STATIONS.map((s) => [
        s,
        {
          inbound: { waiting: ingested.filter((m) => owedTo(m, s)).length, processed: ingested.filter((m) => m.deliveries[s]).length, live: links[s].state === "up" },
          outbound: { waiting: 0, processed: 0, live: links[s].state === "up" },
        },
      ]),
    ) as Record<Station, { inbound: Pipe; outbound: Pipe }>),
  };
  return { ...sim, pipes, reachable, held, atC2oix };
}

export default function NetworkPage() {
  const t = useTopology();
  const isMessageAdmin = hasRole(useCurrentUser(), MESSAGE_ADMIN);
  const [queueNode, setQueueNode] = useState<NodeKey | null>(null);
  const down = STATIONS.filter((s) => t.links[s].state === "down");

  const tiles: { label: string; value: string; tone: Tone }[] = [
    { label: "Command posture", value: t.circuitUp ? "Normal operations" : "EMCON / offline", tone: t.circuitUp ? "up" : "attention" },
    { label: "Connections up", value: `${(t.circuitUp ? 1 : 0) + t.reachable.length} of 4`, tone: t.circuitUp && !down.length ? "up" : "error" },
    { label: "Workstations reachable", value: `${t.reachable.length} of 3`, tone: down.length ? "error" : "up" },
  ];

  return (
    <>
      <PageHeader
        icon={Waypoints}
        title="Comms & Network"
        subtitle={isMessageAdmin
          ? "The command's links: the C2OIX circuit, the ANCHOR server and three workstations. Release traffic one message at a time and break any link to see where it waits. Breaking the circuit puts every screen into EMCON / offline mode."
          : "The command's two servers and three workstations. Release example traffic one message at a time to see where it goes. The Message Admin manages the links."}
        actions={
          <>
            {/* Demo controls: anyone can release and reset example traffic. */}
            <Button icon={Undo2} onClick={t.resetMessages} disabled={!t.repo.some((m) => m.status !== "queued")}>Reset messages</Button>
            {isMessageAdmin && <Button icon={RotateCcw} onClick={t.restoreAll} disabled={t.circuitUp && !down.length}>Restore all connections</Button>}
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {tiles.map((tile) => (
          <div key={tile.label} className={cx("rounded-lg border px-4 py-3 shadow-sm", TILE[tile.tone])}>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">{tile.label}</div>
            <div className="mt-0.5 text-lg font-bold text-ink">{tile.value}</div>
          </div>
        ))}
      </div>

      <Panel title="Command Links" className="mb-4" action={<span className="text-xs text-muted">{isMessageAdmin ? "Click a connection to break or restore it" : "View only. The Message Admin manages links."}</span>}>
        <div className="mx-auto flex max-w-5xl flex-col items-center">
          <NodeCard node="c2oix" status={t.circuitUp ? "Reachable" : "Unreachable"} up={t.circuitUp} pipes={t.pipes.c2oix} onQueue={() => setQueueNode("c2oix")}>
            <div>{t.atC2oix} waiting for this command</div>
            <Button size="sm" variant="primary" icon={Send} className="mt-2" onClick={t.releaseNext} disabled={!t.atC2oix}>Release next message</Button>
          </NodeCard>

          <LinkButton label="C2OIX circuit" up={t.circuitUp} disabled={!isMessageAdmin} onClick={t.circuitUp ? t.disconnect : t.connect} />

          <NodeCard node="anchor" status="Online" up pipes={t.pipes.anchor} onQueue={() => setQueueNode("anchor")}>
            <div>Circuit {t.circuitUp ? "up" : "down"} · {t.reachable.length} of 3 workstations reachable · {t.held} held for transmit</div>
            <Button size="sm" icon={RadioTower} href="/transmissions" className="mt-2">Transmission Queue</Button>
          </NodeCard>

          <div className="h-5 w-0.5 bg-slate-300" aria-hidden />
          <div className="hidden h-0.5 w-2/3 bg-slate-300 md:block" aria-hidden />
          <div className="grid w-full gap-4 md:grid-cols-3">
            {STATIONS.map((s) => {
              const up = t.links[s].state === "up";
              return (
                <div key={s} className="flex flex-col items-center">
                  <LinkButton label={`${NODES[s].code} link`} up={up} disabled={!isMessageAdmin} onClick={() => t.setLink(s, up ? "down" : "up")} />
                  <NodeCard node={s} status={up ? "Connected" : "Offline"} up={up} pipes={t.pipes[s]} onQueue={() => setQueueNode(s)} compact>
                    <div>{up ? "Reaches ANCHOR" : "Cannot reach ANCHOR: holds work locally"}</div>
                    {t.links[s].reportedAt && <div>Reported {fmtDateTime(t.links[s].reportedAt!)}</div>}
                  </NodeCard>
                </div>
              );
            })}
          </div>
        </div>
      </Panel>

      <RepositoryPanel />

      {queueNode && <QueueDialog node={queueNode} onClose={() => setQueueNode(null)} />}
    </>
  );
}

function PipeRow({ dir, pipe }: { dir: "in" | "out"; pipe: Pipe }) {
  const Icon = dir === "in" ? ArrowDown : ArrowUp;
  return (
    <div className={cx("flex flex-wrap items-center gap-x-1.5 text-xs", !pipe.live && "text-red-700")}>
      <Icon className="size-3.5" aria-hidden />
      <span className="w-16 font-semibold">{dir === "in" ? "Inbound" : "Outbound"}</span>
      <span>{pipe.waiting} waiting</span>
      <span className="text-muted">·</span>
      <span>{pipe.processed} done</span>
      {!pipe.live && <span className="font-semibold">· no path</span>}
    </div>
  );
}

function NodeCard({
  node,
  status,
  up,
  pipes,
  onQueue,
  compact,
  children,
}: {
  node: NodeKey;
  status: string;
  up: boolean;
  pipes: { inbound: Pipe; outbound: Pipe };
  onQueue: () => void;
  compact?: boolean;
  children?: ReactNode;
}) {
  const info = NODES[node];
  const Icon = node === "c2oix" || node === "anchor" ? Server : Monitor;
  return (
    <div className={cx("w-full rounded-lg border-2 bg-white p-3 shadow-sm", up ? "border-green-500" : "border-red-400", !compact && "max-w-md")}>
      <div className="flex items-start gap-2">
        <Icon className={cx("mt-0.5 size-6 shrink-0", up ? "text-navy-800" : "text-red-600")} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold">{info.code}</span>
            <span className={cx("rounded px-1.5 py-0.5 text-[11px] font-bold uppercase", up ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800")}>{status}</span>
          </div>
          <div className="text-sm font-semibold">{info.name}</div>
          {!compact && <div className="text-xs text-muted">{info.detail}</div>}
        </div>
      </div>
      <div className="mt-2 space-y-0.5">
        <PipeRow dir="in" pipe={pipes.inbound} />
        {node !== "ws1" && node !== "ws2" && node !== "ws3" && <PipeRow dir="out" pipe={pipes.outbound} />}
      </div>
      <div className="mt-2 text-xs text-muted">{children}</div>
      <button type="button" onClick={onQueue} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-link hover:underline">
        <Inbox className="size-3.5" aria-hidden /> What&apos;s here
      </button>
    </div>
  );
}

function LinkButton({ label, up, onClick, disabled }: { label: string; up: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <div className="flex flex-col items-center py-1">
      <div className={cx("h-5 w-1", up ? "bg-green-500" : "border-l-4 border-dashed border-red-500")} aria-hidden />
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-pressed={!up}
        title={disabled ? "Only the Message Admin manages comm links." : up ? `Break the ${label}` : `Restore the ${label}`}
        className={cx(
          "rounded-full border-2 px-3 py-1 text-xs font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-600 disabled:cursor-not-allowed disabled:opacity-80",
          up ? "border-green-500 bg-green-50 text-green-800 hover:bg-green-100" : "border-red-500 bg-red-50 text-red-800 hover:bg-red-100",
        )}
      >
        {label}: {up ? "up" : "down"}{!disabled && ` · ${up ? "break" : "restore"}`}
      </button>
      <div className={cx("h-5 w-1", up ? "bg-green-500" : "border-l-4 border-dashed border-red-500")} aria-hidden />
    </div>
  );
}

function QueueDialog({ node, onClose }: { node: NodeKey; onClose: () => void }) {
  const { repo, transmissions } = useSim();
  const info = NODES[node];
  const atC2oix = repo.filter((m) => m.status === "queued" || m.status === "deferred");
  const sections: { title: string; items: { key: string; ref: string; subject: string; p: (typeof repo)[number]["precedence"]; note: string }[] }[] =
    node === "c2oix"
      ? [{ title: "Waiting for this command", items: atC2oix.map((m) => ({ key: `m${m.seq}`, ref: m.reference, subject: m.subject, p: m.precedence, note: m.status === "deferred" ? "Deferred: circuit was down" : "Queued" })) }]
      : node === "anchor"
        ? [
            {
              title: "Owed to a workstation",
              items: repo
                .filter((m) => m.status === "ingested" && !fullyDelivered(m))
                .map((m) => ({ key: `m${m.seq}`, ref: m.reference, subject: m.subject, p: m.precedence, note: `For ${STATIONS.filter((s) => owedTo(m, s)).map((s) => NODES[s].code).join(", ")}` })),
            },
            {
              title: "Held for transmit",
              items: transmissions.filter((x) => x.status === "held").map((x) => ({ key: x.id, ref: x.reference, subject: x.subject, p: x.precedence, note: "Waiting for the circuit" })),
            },
          ]
        : [
            { title: "Waiting at ANCHOR for this workstation", items: repo.filter((m) => owedTo(m, node)).map((m) => ({ key: `m${m.seq}`, ref: m.reference, subject: m.subject, p: m.precedence, note: "Link down" })) },
            {
              title: "Received",
              items: repo
                .filter((m) => m.deliveries[node])
                .sort((a, b) => (b.deliveries[node] ?? "").localeCompare(a.deliveries[node] ?? ""))
                .map((m) => ({ key: `m${m.seq}`, ref: m.reference, subject: m.subject, p: m.precedence, note: fmtDateTime(m.deliveries[node]!) })),
            },
          ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`${info.code} queue`} className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="font-bold">{info.code} · {info.name}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 hover:bg-navy-50"><X className="size-5" /></button>
        </header>
        <div className="space-y-4 p-4">
          {sections.map((s) => (
            <section key={s.title}>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{s.title} ({s.items.length})</h3>
              {s.items.length ? (
                <ul className="divide-y divide-line/70 rounded-md border border-line">
                  {s.items.map((i) => (
                    <li key={i.key} className="px-3 py-2 text-sm">
                      <div className="flex items-center gap-2"><PrecedenceBadge p={i.p} /><span className="font-mono text-xs font-semibold">{i.ref}</span></div>
                      <div>{i.subject}</div>
                      <div className="text-xs text-muted">{i.note}</div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">Nothing.</p>
              )}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Every example message and how far it has got. */
function RepositoryPanel() {
  const { repo } = useSim();
  const cols = messageColumns<(typeof repo)[number]>({
    seq: { className: "font-mono text-xs", cell: (m) => m.seq },
    subject: (m) => m.subject,
    reference: { className: "font-mono text-xs font-semibold", cell: (m) => m.reference },
    from: (m) => m.originator,
    precedence: (m) => <PrecedenceBadge p={m.precedence} />,
    workstations: (m) =>
      m.status !== "ingested" ? (
        <span className="text-muted">-</span>
      ) : fullyDelivered(m) ? (
        <span className="text-green-700">All three</span>
      ) : (
        <span className="text-amber-800">Owed to {STATIONS.filter((s) => owedTo(m, s)).map((s) => NODES[s].code).join(", ")}</span>
      ),
    status: (m) => (
      <>
        <StatusDot tone={m.status === "ingested" ? "green" : m.status === "deferred" ? "amber" : "gray"}>
          {m.status === "ingested" ? "Ingested" : m.status === "deferred" ? "Deferred at C2OIX" : "Queued at C2OIX"}
        </StatusDot>
        {m.lastError && m.status === "deferred" && <div className="text-xs text-muted">{m.lastError}</div>}
      </>
    ),
  });
  return (
    <Panel title={`Example Traffic (${repo.length})`} className="mb-4" bodyClassName="p-0">
      {repo.length ? (
        <div className={cx(tableWrap, "rounded-none border-0")}>
          <table className="w-full min-w-[860px]">
            <thead>
              <MessageHeaderRow cols={cols} />
            </thead>
            <tbody>
              {repo.map((m) => (
                <tr key={m.seq} className={tbodyRow}>
                  <MessageCellsRow cols={cols} row={m} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState>No example traffic.</EmptyState>
      )}
    </Panel>
  );
}
