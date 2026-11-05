"use client";

import { useCurrentUser } from "@/lib/current-user";
import { hasRole, MESSAGE_ADMIN } from "@/lib/roles";
import { Power, Radio, RefreshCw, Send, Server, Trash2, Zap } from "lucide-react";
import { Button, EmptyState, PageHeader, Panel, Pill, PrecedenceBadge, StatusDot, Toggle, cx, tableWrap, tbodyRow } from "@/components/ui";
import { MessageCellsRow, MessageHeaderRow, messageColumns } from "@/components/message-columns";
import { fmtDateTime } from "@/lib/format";
import { NODES, STATIONS, fullyDelivered } from "@/lib/sim";
import { useSim } from "@/lib/sim-store";
import type { ReactNode } from "react";

const TONE = {
  up: "border-green-300 bg-green-50 text-green-800",
  attention: "border-amber-300 bg-amber-50 text-amber-900",
  error: "border-red-300 bg-red-50 text-red-800",
};

function ServerCard({ title, state, tone, meta, subtitle, facts, children }: { title: string; state: string; tone: keyof typeof TONE; meta: string; subtitle: string; facts: { label: string; value: ReactNode }[]; children: ReactNode }) {
  return (
    <Panel title={title} icon={Server} action={<span className={cx("rounded border px-2 py-0.5 text-xs font-bold", TONE[tone])}>{state}</span>}>
      <p className="text-sm text-muted">{subtitle}</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        {facts.map((f) => (
          <div key={f.label}>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{f.label}</dt>
            <dd className="text-lg font-bold text-ink">{f.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-muted">{meta}</p>
      <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">{children}</div>
    </Panel>
  );
}

export default function SimulatorsPage() {
  const isMessageAdmin = hasRole(useCurrentUser(), MESSAGE_ADMIN);
  const sim = useSim();
  const { external, local, repo, transmissions, circuitUp, lastPulse } = sim;
  const count = (s: string) => repo.filter((m) => m.status === s).length;
  const held = transmissions.filter((t) => t.status === "held").length;

  const repoCols = messageColumns<(typeof repo)[number]>({
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
        <span className="text-amber-800">
          Owed to {STATIONS.filter((s) => !m.deliveries[s]).map((s) => NODES[s].code).join(", ")}
        </span>
      ),
    status: (m) => (
      <>
        <StatusDot tone={m.status === "ingested" ? "green" : m.status === "deferred" ? "amber" : "gray"}>
          {m.status === "ingested" ? "Ingested" : m.status === "deferred" ? "Deferred at C2OIX" : "Queued"}
        </StatusDot>
        {m.lastError && m.status === "deferred" && <div className="text-xs text-muted">{m.lastError}</div>}
      </>
    ),
  });

  const releaseCols = messageColumns<(typeof transmissions)[number]>({
    subject: (t) => t.subject,
    reference: { className: "font-mono text-xs font-semibold", cell: (t) => t.reference },
    released: { className: "whitespace-nowrap", cell: (t) => (t.releasedAt ? fmtDateTime(t.releasedAt) : "-") },
    precedence: (t) => <PrecedenceBadge p={t.precedence} />,
    receipt: { className: "font-mono text-xs", cell: (t) => t.receipt ?? "-" },
    status: (t) => (
      <Pill className={t.status === "held" ? "bg-amber-100 text-amber-900" : "bg-green-100 text-green-800"}>{t.status === "held" ? "Held for transmit" : "Transmitted"}</Pill>
    ),
  });

  return (
    <>
      <PageHeader
        icon={Server}
        title="Server Simulators"
        subtitle="Two stand-in servers. C2OIX holds example traffic and hands the next message over when an operator releases it; the ANCHOR server beats the circuit, ingests what arrives and holds every release for transmit."
        actions={
          <>
            <span className="flex items-center gap-2 text-sm">
              <Toggle label="Auto pulse" checked={sim.autoPulse} onChange={sim.setAutoPulse} />
              Auto pulse
            </span>
            <Button variant="primary" icon={Zap} onClick={sim.pulse}>Pulse both</Button>
          </>
        }
      />

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <ServerCard
          title="External C2OIX Server"
          state={external.feedActive ? "Feed running" : "Feed stopped"}
          tone={external.feedActive ? "up" : "attention"}
          meta={`${external.lastBeatAt ? `Last beat ${fmtDateTime(external.lastBeatAt)}` : "No beat yet"} · ${external.note}`}
          subtitle="Holds the repository of example messages and hands the next one to the ANCHOR server when an operator releases it. Nothing is handed over on the beat. Anything the ANCHOR server can't take is held here as deferred."
          facts={[
            { label: "Queued", value: count("queued") },
            { label: "Deferred here", value: count("deferred") },
            { label: "Ingested by ANCHOR", value: count("ingested") },
            { label: "Releases received", value: external.received },
            { label: "Beats", value: external.beats },
          ]}
        >
          <Button icon={Send} variant="primary" onClick={sim.releaseNext} disabled={!external.feedActive}>Release next message</Button>
          <Button icon={Radio} onClick={() => sim.setFeed(!external.feedActive)}>{external.feedActive ? "Stop the feed" : "Start the feed"}</Button>
          <Button icon={RefreshCw} onClick={sim.seed}>{repo.length ? "Reload example traffic" : "Load example traffic"}</Button>
        </ServerCard>

        <ServerCard
          title="Local ANCHOR Server"
          state={circuitUp ? "Connected to C2OIX" : "Disconnected"}
          tone={circuitUp ? "up" : "error"}
          meta={`${local.lastBeatAt ? `Last beat ${fmtDateTime(local.lastBeatAt)}` : "No beat yet"} · ${local.note}`}
          subtitle="Beats the C2OIX circuit, ingests what is handed over, and holds every released message until the circuit takes it. Disconnect to hold traffic, then reconnect: it takes the deferred backlog and pushes the held releases."
          facts={[
            { label: "Circuit", value: circuitUp ? "Up" : "Down" },
            { label: "Peer", value: `${local.peerState}${local.latencyMs ? ` · ${local.latencyMs} ms` : ""}` },
            { label: "Beats", value: local.beats },
            { label: "Messages received", value: local.received },
            { label: "Held for transmit", value: held },
            { label: "Transmitted", value: transmissions.length - held },
          ]}
        >
          <Button icon={Power} disabled={!isMessageAdmin} title={isMessageAdmin ? undefined : "Only the Message Admin manages comm links."} variant={circuitUp ? "secondary" : "primary"} onClick={circuitUp ? sim.disconnect : sim.connect}>{circuitUp ? "Disconnect from C2OIX" : "Reconnect and drain"}</Button>
          <Button icon={Zap} onClick={sim.pulse}>Beat</Button>
        </ServerCard>
      </div>

      <p className="mb-4 text-sm text-muted">
        {lastPulse
          ? `Last pulse ${fmtDateTime(lastPulse.at)}: ${lastPulse.circuitUp ? `${lastPulse.backlog} deferred taken, ${lastPulse.forwarded} workstation hand-offs, ${lastPulse.pushed} releases transmitted.` : "circuit down, releases held."}`
          : "No pulse yet."}{" "}
        A pulse runs every twenty seconds while auto pulse is on. Disconnecting the circuit puts the whole app into EMCON / offline mode.
      </p>

      <Panel title={`C2OIX Repository (${repo.length})`} className="mb-4" bodyClassName="p-0">
        {repo.length ? (
          <div className={cx(tableWrap, "rounded-none border-0")}>
            <table className="w-full min-w-[860px]">
              <thead>
                <MessageHeaderRow cols={repoCols} />
              </thead>
              <tbody>
                {repo.map((m) => (
                  <tr key={m.seq} className={tbodyRow}>
                    <MessageCellsRow cols={repoCols} row={m} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState>The repository is empty. Load the example traffic to start.</EmptyState>
        )}
      </Panel>

      <Panel title={`Release Queue (${transmissions.length})`} className="mb-4" bodyClassName="p-0">
        {transmissions.length ? (
          <div className={cx(tableWrap, "rounded-none border-0")}>
            <table className="w-full min-w-[760px]">
              <thead>
                <MessageHeaderRow cols={releaseCols} />
              </thead>
              <tbody>
                {transmissions.map((t) => (
                  <tr key={t.id} className={tbodyRow}>
                    <MessageCellsRow cols={releaseCols} row={t} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState>Nothing released yet. Releases from Drafting & Release appear here.</EmptyState>
        )}
      </Panel>

      <Button variant="danger" icon={Trash2} onClick={sim.reset}>Clear the repository and the queue</Button>
    </>
  );
}
