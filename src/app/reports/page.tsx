"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, BarChart3, BellRing, CheckCircle2, Database, Download, HardDrive, Mail } from "lucide-react";
import { ACK_ROSTER } from "@/lib/data";
import { USERS } from "@/lib/users";
import { fmtDateTime } from "@/lib/format";
import { useStore } from "@/lib/store";
import { Bar, Button, PageHeader, Panel, Select, StatCard, StatusDot, tableWrap, td, th, theadRow, tbodyRow } from "@/components/ui";

// Roster members with a demo account show their real acknowledgements from the
// server; the rest of the wardroom is deterministic mock data.
function rosterFor(msgIndex: number, real: (login: string) => string | undefined) {
  return ACK_ROSTER.map((p, i) => {
    const account = USERS.find((u) => u.name === p.name);
    if (account) return { ...p, at: real(account.login) };
    const acked = (i * 7 + msgIndex * 3) % 5 !== 0;
    return { ...p, at: acked ? `2026-10-${String(22 + ((i + msgIndex) % 3)).padStart(2, "0")}T${String(8 + i).padStart(2, "0")}:15:00Z` : undefined };
  });
}

export default function ReportsPage() {
  const { log, notify, messages, acknowledgements } = useStore();
  const ackMessages = messages.filter((m) => m.ackRequired && m.lifecycle !== "SUPERSEDED" && m.lifecycle !== "CANCELLED");
  const [sel, setSel] = useState(ackMessages[0]?.reference);
  const idx = Math.max(0, ackMessages.findIndex((m) => m.reference === sel));
  const m = ackMessages[idx];
  if (!m) return <p className="text-sm text-muted">No messages need acknowledgement.</p>;
  const roster = rosterFor(idx, (login) => acknowledgements.find((a) => a.login === login && a.messageId === m.id)?.at);
  const done = roster.filter((r) => r.at).length;

  return (
    <>
      <PageHeader
        icon={BarChart3}
        title="Reports"
        subtitle="Acknowledgement accountability and traffic measures for your command."
        actions={<Button variant="primary" icon={Download} onClick={() => { log("Generate Report", `Acknowledgement Report (${m.reference})`); notify("Report exported"); }}>Export Report</Button>}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={BellRing} value={`${Math.round((done / roster.length) * 100)}%`} label="Acknowledged" note={`${done} of ${roster.length} for ${m.reference}`} tone="green" />
        <StatCard icon={AlertTriangle} value={roster.length - done} label="Outstanding" tone="red" note="Escalate at suspense" />
        <StatCard icon={Mail} value="−82%" label="Duplicate Email Copies" note="Illustrative. Baseline set in discovery" tone="navy" />
        <StatCard icon={HardDrive} value="1.4 TB" label="Mailbox Storage Avoided" note="Illustrative. Baseline set in discovery" tone="amber" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_400px]">
        <Panel title="Acknowledgement Report" icon={CheckCircle2} action={<Select value={sel} onChange={setSel} options={ackMessages.map((x) => x.reference)} />}>
          <p className="mb-3 text-sm">
            <Link href={`/messages/${m.id}`} className="font-semibold text-link hover:underline">{m.subject}</Link>
            <span className="text-muted"> · due {m.ackDue && fmtDateTime(m.ackDue)}</span>
          </p>
          <div className={tableWrap}>
            <table className="w-full min-w-[520px]">
              <thead>
                <tr className={theadRow}>
                  <th className={th}>Name</th>
                  <th className={th}>Billet</th>
                  <th className={th}>Status</th>
                  <th className={th}>Acknowledged</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((r) => (
                  <tr key={r.name} className={tbodyRow}>
                    <td className={`${td} font-semibold`}>{r.name}</td>
                    <td className={td}>{r.billet}</td>
                    <td className={td}>{r.at ? <StatusDot tone="green">Acknowledged</StatusDot> : <StatusDot tone="red">Pending</StatusDot>}</td>
                    <td className={td}>{r.at ? fmtDateTime(r.at) : <Button size="sm" onClick={() => notify(`Reminder sent to ${r.name}`)}>Send reminder</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

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
          <Panel title="Acknowledgement Rate by Message">
            {ackMessages.map((x, i) => {
              const r = rosterFor(i, (login) => acknowledgements.find((k) => k.login === login && k.messageId === x.id)?.at);
              const n = r.filter((p) => p.at).length;
              return (
                <div key={x.id} className="mb-2 grid grid-cols-[140px_1fr_40px] items-center gap-2 text-sm">
                  <span className="truncate">{x.reference}</span>
                  <Bar value={n} max={r.length} color={n === r.length ? "bg-green-600" : "bg-amber-500"} />
                  <span className="text-right">{Math.round((n / r.length) * 100)}%</span>
                </div>
              );
            })}
          </Panel>
        </div>
      </div>
    </>
  );
}
