"use client";

import Link from "next/link";
import { AlertTriangle, BellRing, CheckCircle2, ClipboardList, FileText, Home, Mail, ShieldCheck, WifiOff } from "lucide-react";
import { needsOwnAck } from "@/lib/data";
import { useCurrentUser } from "@/lib/current-user";
import { fmtDateTime, hoursUntil } from "@/lib/format";
import { useStore } from "@/lib/store";
import { MiniMessageTable } from "@/components/message";
import { MessageCellsRow, MessageHeaderRow, messageColumns } from "@/components/message-columns";
import type { Message } from "@/lib/types";
import { Button, LifecycleBadge, PageHeader, Panel, PrecedenceBadge, StatCard, tableWrap, tbodyRow } from "@/components/ui";

export default function HomePage() {
  const CURRENT_USER = useCurrentUser();
  const { userState, acknowledge, subscriptions, syncQueue, offline, approvals, messages } = useStore();
  const needAck = messages.filter(needsOwnAck);
  const pending = needAck.filter((m) => !userState[m.id].acknowledgedAt);
  const unread = messages.filter((m) => userState[m.id].read !== "read").length;
  const changed = messages.filter((m) => m.lifecycle !== "ACTIVE").slice(0, 5);

  const ackCols = messageColumns<Message>({
    subject: (m) => (
      <>
        <Link href={`/messages/${m.id}`} className="text-link hover:underline">{m.subject}</Link> <LifecycleBadge l={m.lifecycle} />
      </>
    ),
    reference: (m) => m.reference,
    precedence: (m) => <PrecedenceBadge p={m.precedence} />,
    due: (m) => {
      const h = m.ackDue ? hoursUntil(m.ackDue) : 99;
      return (
        <>
          {m.ackDue ? fmtDateTime(m.ackDue) : "—"}
          {!userState[m.id].acknowledgedAt && h <= 24 && (
            <span className="ml-2 inline-flex items-center gap-1 text-xs font-semibold text-red-700">
              <AlertTriangle className="size-3" /> escalates in {Math.max(h, 0)}h
            </span>
          )}
        </>
      );
    },
    status: (m) =>
      userState[m.id].acknowledgedAt ? (
        <span className="inline-flex items-center gap-1 text-green-700"><CheckCircle2 className="size-4" /> Acknowledged</span>
      ) : (
        <Button size="sm" variant="danger" onClick={() => acknowledge(m.id)}>Acknowledge</Button>
      ),
  });

  return (
    <>
      <PageHeader icon={Home} title={`Welcome back, ${CURRENT_USER.name}`} subtitle={`${CURRENT_USER.billet} · ${CURRENT_USER.unit}`} />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Mail} value={unread} label="Unread Messages" note="From your approved subscriptions" />
        <StatCard icon={BellRing} value={pending.length} label="Awaiting Your Acknowledgement" tone="red" note="Mandatory by precedence or command rule" />
        <StatCard icon={ClipboardList} value={subscriptions.filter((s) => s.status === "Active").length} label="Active Subscriptions" tone="green" note={`${subscriptions.filter((s) => s.status === "Pending Approval").length} pending approval`} />
        <StatCard icon={offline ? WifiOff : ShieldCheck} value={offline ? syncQueue.length : "100%"} label={offline ? "Items Queued for Sync" : "Records Validated"} tone={offline ? "amber" : "green"} note={offline ? "EMCON: local store active" : "No tampering detected"} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <div id="acknowledge" className="scroll-mt-24">
            <Panel title="Acknowledgements" icon={BellRing} action={<span className="text-sm text-muted">{needAck.length - pending.length} of {needAck.length} complete</span>}>
              <div className={tableWrap}>
                <table className="w-full min-w-[640px]">
                  <thead>
                    <MessageHeaderRow cols={ackCols} />
                  </thead>
                  <tbody>
                    {needAck.map((m) => (
                      <tr key={m.id} className={tbodyRow}>
                        <MessageCellsRow cols={ackCols} row={m} />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>

          <Panel title="Latest Traffic" icon={Mail} action={<Link href="/messages" className="text-sm text-link">View All</Link>}>
            <MiniMessageTable items={messages.slice(0, 6)} cols={["subject", "reference", "dtg", "precedence"]} />
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Status Changes" icon={AlertTriangle}>
            <p className="mb-2 text-sm text-muted">Messages amended, corrected, superseded, cancelled or expired.</p>
            <ul className="space-y-2">
              {changed.map((m) => (
                <li key={m.id} className="flex items-start gap-2 text-sm">
                  <span className="w-24 shrink-0"><LifecycleBadge l={m.lifecycle} /></span>
                  <span>
                    <Link href={`/messages/${m.id}`} className="text-link hover:underline">{m.reference}</Link>
                    {m.replacedBy && <span className="block text-xs text-muted">Replaced by {m.replacedBy}</span>}
                    {m.relatesTo && <span className="block text-xs text-muted">Updates {m.relatesTo}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Quick Actions" icon={FileText}>
            <div className="grid gap-2">
              <Button variant="primary" href="/briefings">Build a Briefing</Button>
              <Button href="/watch-turnover">Start Watch Turnover</Button>
              <Button href="/search">Advanced Search</Button>
              {approvals.length > 0 && <Button variant="warning" href="/admin">Review {approvals.length} subscription requests</Button>}
            </div>
          </Panel>
          <Panel title="About This Prototype" icon={ShieldCheck}>
            <p className="text-sm text-muted">
              ANCHOR ingests official traffic from C2OIX into an immutable store and presents it through one CAC-authenticated interface. It does not replace C2OIX, NC2 or Designated Release Authority processes. All data on this site is mock data.
            </p>
          </Panel>
        </div>
      </div>
    </>
  );
}
