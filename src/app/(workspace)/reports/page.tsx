"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, BarChart3, BellRing, CheckCircle2, Database, Download, HardDrive, Mail, Send } from "lucide-react";
import { CURRENT_USER, MESSAGES, resolveAckStatus, sentByOwnCommand } from "@/lib/data";
import { fmtDateTime, MOCK_NOW } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { Message } from "@/lib/types";
import { MessageCellsRow, MessageHeaderRow, messageColumns } from "@/components/message-columns";
import { Bar, Button, cx, PageHeader, Panel, StatCard, StatusDot, tableWrap, td, th, theadRow, tbodyRow, type DotTone } from "@/components/ui";

// Messages this command originated that addressees must acknowledge.
const sentMessages = MESSAGES.filter(
  (m) => sentByOwnCommand(m) && m.ackRequired && m.lifecycle !== "SUPERSEDED" && m.lifecycle !== "CANCELLED",
);

type SentStatus = "Complete" | "In Progress" | "Overdue";
const statusTone: Record<SentStatus, DotTone> = { Complete: "green", "In Progress": "amber", Overdue: "red" };

function sentStatus(m: Message, acked: number, total: number): SentStatus {
  if (acked === total) return "Complete";
  return m.ackDue && new Date(m.ackDue) < MOCK_NOW ? "Overdue" : "In Progress";
}

export default function ReportsPage() {
  const { log, notify } = useStore();
  const [selected, setSelected] = useState(sentMessages[0].id);

  const rows = sentMessages.map((m) => {
    const { commands, rollup } = resolveAckStatus(m);
    const acked = commands.filter((c) => c.receipts.length > 0).length;
    return { m, commands, rollup, acked, total: commands.length, status: sentStatus(m, acked, commands.length) };
  });
  const current = rows.find((r) => r.m.id === selected) ?? rows[0];
  const ackedAll = rows.reduce((n, r) => n + r.acked, 0);
  const totalAll = rows.reduce((n, r) => n + r.total, 0);

  const sentCols = messageColumns<(typeof rows)[number]>({
    subject: (r) => r.m.subject,
    reference: { className: "font-semibold", cell: (r) => r.m.reference },
    addressees: (r) => {
      const [first, ...rest] = r.m.addressees;
      return <>{first?.name}{rest.length > 0 && <span className="block text-xs text-muted">+{rest.length} more</span>}</>;
    },
    due: (r) => r.m.ackDue && fmtDateTime(r.m.ackDue),
    acknowledged: (r) => `${r.acked} of ${r.total}`,
    status: (r) => <StatusDot tone={statusTone[r.status]}>{r.status}</StatusDot>,
  });

  return (
    <>
      <PageHeader
        icon={BarChart3}
        title="Reports"
        subtitle={`Acknowledgement of traffic sent by ${CURRENT_USER.commandSource}, and traffic measures.`}
        actions={<Button variant="primary" icon={Download} onClick={() => { log("Generate Report", "Acknowledgement Report (sent messages)"); notify("Report exported"); }}>Export Report</Button>}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={BellRing} value={`${Math.round((ackedAll / totalAll) * 100)}%`} label="Acknowledged" note={`${ackedAll} of ${totalAll} command acknowledgements across ${rows.length} sent messages`} tone="green" />
        <StatCard icon={AlertTriangle} value={totalAll - ackedAll} label="Outstanding" tone="red" note="Escalate at due time" />
        <StatCard icon={Mail} value="−82%" label="Duplicate Email Copies" note="Illustrative. Baseline set in discovery" tone="navy" />
        <StatCard icon={HardDrive} value="1.4 TB" label="Mailbox Storage Avoided" note="Illustrative. Baseline set in discovery" tone="amber" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_400px]">
        <div className="space-y-4">
          <Panel title="Sent Messages Requiring Acknowledgement" icon={Send}>
            <div className={tableWrap}>
              <table className="w-full min-w-[720px]">
                <thead>
                  <MessageHeaderRow cols={sentCols} />
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.m.id}
                      onClick={() => setSelected(r.m.id)}
                      className={cx("cursor-pointer border-b border-line/70", current.m.id === r.m.id ? "bg-navy-100/70" : "hover:bg-navy-50")}
                    >
                      <MessageCellsRow cols={sentCols} row={r} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Acknowledgement Details" icon={CheckCircle2}>
            <p className="text-sm">
              <span className="font-semibold">{current.m.reference}</span>
              <span className="text-muted"> · </span>
              <Link href={`/messages/${current.m.id}`} className="font-semibold text-link hover:underline">{current.m.subject}</Link>
              <span className="text-muted"> · {current.m.originator} · due {current.m.ackDue && fmtDateTime(current.m.ackDue)}</span>
            </p>
            <p className="mb-3 text-xs text-muted">
              {current.rollup.map((r) => `${r.addressee.role} ${r.addressee.name} ${r.acked}/${r.total}`).join(" · ")}
            </p>
            <div className={tableWrap}>
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className={theadRow}>
                    <th className={th}>Command</th>
                    <th className={th}>Via</th>
                    <th className={th}>Role</th>
                    <th className={th}>Status</th>
                    <th className={th}>Acknowledged</th>
                  </tr>
                </thead>
                <tbody>
                  {current.commands.map((c) => {
                    const [firstAt, ...more] = c.receipts;
                    return (
                      <tr key={c.command} className={tbodyRow}>
                        <td className={`${td} font-semibold`}>{c.command}</td>
                        <td className={td}>{c.via.length ? c.via.join(", ") : "Direct"}</td>
                        <td className={td}>{c.role}</td>
                        <td className={td}>{firstAt ? <StatusDot tone="green">Acknowledged</StatusDot> : <StatusDot tone="red">Pending</StatusDot>}</td>
                        <td className={td}>
                          {firstAt ? (
                            <>
                              {fmtDateTime(firstAt)}
                              {more.map((t, i) => <span key={`${t}-${i}`} className="block text-xs text-muted">Again {fmtDateTime(t)}</span>)}
                            </>
                          ) : (
                            <Button size="sm" onClick={() => notify(`Reminder sent to ${c.command}`)}>Send reminder</Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Traffic by Source (30 days)" icon={Database}>
            {[["OPNAV", 78], ["COMSUBLANT", 64], ["SECNAV", 31], ["COMSUBFOR", 22], ["NAVSEA", 18], ["USFF", 12]].map(([k, v]) => (
              <div key={k} className="mb-2 grid grid-cols-[100px_1fr_36px] items-center gap-2 text-sm">
                <span>{k}</span>
                <Bar value={v as number} max={78} />
                <span className="text-right">{v}</span>
              </div>
            ))}
          </Panel>
          <Panel title="Command Acknowledgement Rate by Message">
            {rows.map((r) => (
              <div key={r.m.id} className="mb-2 grid grid-cols-[140px_1fr_40px] items-center gap-2 text-sm">
                <span className="truncate">{r.m.reference}</span>
                <Bar value={r.acked} max={r.total} color={r.acked === r.total ? "bg-green-600" : "bg-amber-500"} />
                <span className="text-right">{Math.round((r.acked / r.total) * 100)}%</span>
              </div>
            ))}
          </Panel>
        </div>
      </div>
    </>
  );
}
