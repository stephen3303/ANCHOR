"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Download, FileCheck2, FileText, Printer, RotateCcw, ShieldAlert, ShieldCheck, Users } from "lucide-react";
import { AUDIT_BY_ACTION, AUDIT_BY_CLASSIFICATION, MESSAGES } from "@/lib/data";
import { fmtDate, fmtTime, shortHash } from "@/lib/format";
import { useStore } from "@/lib/store";
import { Bar, Button, Check, ClassBadge, Delta, Donut, PageHeader, Panel, Pill, Select, StatCard, StatusDot, cx, td, th, theadRow } from "@/components/ui";

const ACTION_COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#ef4444", "#8b5cf6", "#94a3b8", "#cbd5e1"];
const CLASS_COLORS = ["bg-green-600", "bg-purple-500", "bg-blue-600", "bg-red-600"];

export default function AuditPage() {
  const { audit, log, notify } = useStore();
  const [user, setUser] = useState("All Users");
  const [action, setAction] = useState("All Actions");
  const [results, setResults] = useState({ Success: true, Failed: true, Warning: true });
  const [selected, setSelected] = useState(audit[0]?.id);

  const users = ["All Users", ...new Set(audit.map((e) => e.user))];
  const actions = ["All Actions", ...new Set(audit.map((e) => e.action))];
  const rows = useMemo(
    () => audit.filter((e) => (user === "All Users" || e.user === user) && (action === "All Actions" || e.action === action) && results[e.result]),
    [audit, user, action, results],
  );
  const ev = audit.find((e) => e.id === selected) ?? rows[0];

  return (
    <>
      <PageHeader
        icon={ShieldCheck}
        title="Audit & Integrity"
        subtitle="Ensure the confidentiality, integrity, and accountability of all records and system activity."
        actions={
          <>
            <Button icon={FileText} onClick={() => { log("Generate Report", "Audit Report"); notify("Audit report generated"); }}>Generate Audit Report</Button>
            <Button variant="primary" icon={Download} onClick={() => notify("Audit log exported (signed)")}>Export</Button>
            <Button icon={Printer} onClick={() => window.print()}>Print</Button>
          </>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={FileText} value={(12475 + audit.length).toLocaleString("en-US")} label="Total Audit Events" note={<Delta dir="up" good>8% from last 7 days</Delta>} />
        <StatCard icon={ShieldAlert} value={0} label="Integrity Violations" tone="red" note="No unauthorized changes" />
        <StatCard icon={Users} value={37} label="Unique Users" note={<Delta dir="up" good>2 new this week</Delta>} />
        <StatCard icon={FileCheck2} value="100%" label="Records Validated" tone="green" note="No data tampering detected" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[230px_1fr_360px]">
        <Panel title="Filters" bodyClassName="space-y-4 p-4">
          <Select label="Date Range" value="Last 30 days" options={["Last 24 hours", "Last 7 days", "Last 30 days"]} />
          <Select label="User" value={user} onChange={setUser} options={users} />
          <Select label="Action Type" value={action} onChange={setAction} options={actions} />
          <Select label="Classification" value="All Classifications" options={["All Classifications"]} />
          <fieldset>
            <legend className="mb-1 text-sm font-semibold">Result</legend>
            {(["Success", "Failed", "Warning"] as const).map((r) => (
              <Check key={r} label={r} checked={results[r]} onChange={(v) => setResults({ ...results, [r]: v })} />
            ))}
          </fieldset>
          <Button icon={RotateCcw} className="w-full" onClick={() => { setUser("All Users"); setAction("All Actions"); setResults({ Success: true, Failed: true, Warning: true }); }}>Reset Filters</Button>
        </Panel>

        <Panel title={`Audit Log Events (${rows.length})`} bodyClassName="p-0">
          <div className="max-h-[440px] overflow-auto">
            <table className="w-full min-w-[720px]">
              <thead className="sticky top-0">
                <tr className={theadRow}>
                  <th className={th}>Timestamp</th>
                  <th className={th}>User</th>
                  <th className={th}>Action</th>
                  <th className={th}>Resource</th>
                  <th className={th}>Classification</th>
                  <th className={th}>Result</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} onClick={() => setSelected(e.id)} className={cx("cursor-pointer border-b border-line/70", ev?.id === e.id ? "bg-navy-100/70" : "hover:bg-navy-50")}>
                    <td className={cx(td, "whitespace-nowrap")} suppressHydrationWarning>{fmtDate(e.timestamp)} {fmtTime(e.timestamp)}</td>
                    <td className={td}>{e.user}</td>
                    <td className={td}>{e.action}</td>
                    <td className={td}>{e.resource}</td>
                    <td className={td}><ClassBadge c={e.classification} /></td>
                    <td className={td}><StatusDot tone={e.result === "Success" ? "green" : e.result === "Failed" ? "red" : "amber"}>{e.result}</StatusDot></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        {ev && (
          <Panel title="Event Details" action={<Pill className={ev.result === "Success" ? "bg-green-100 text-green-800" : ev.result === "Failed" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"}>{ev.result}</Pill>}>
            <div className="mb-3 text-lg font-bold">{ev.action}: {ev.resource}</div>
            <dl className="grid grid-cols-[110px_1fr] gap-y-1.5 text-sm">
              <dt className="text-muted">Timestamp</dt><dd suppressHydrationWarning>{fmtDate(ev.timestamp)} {fmtTime(ev.timestamp)}</dd>
              <dt className="text-muted">User</dt><dd>{ev.user}</dd>
              <dt className="text-muted">Action</dt><dd>{ev.action}</dd>
              <dt className="text-muted">Resource</dt><dd>{ev.resource}</dd>
              <dt className="text-muted">Classification</dt><dd><ClassBadge c={ev.classification} /></dd>
              <dt className="text-muted">Source IP</dt><dd>{ev.sourceIp} (local network)</dd>
              <dt className="text-muted">Device</dt><dd>{ev.device}</dd>
              <dt className="text-muted">Location</dt><dd>{ev.location}</dd>
              <dt className="text-muted">Details</dt><dd>{ev.details}</dd>
              {ev.hash && (<><dt className="text-muted">Integrity</dt><dd className="flex items-center gap-1 font-mono text-xs text-green-700"><CheckCircle2 className="size-4" /> SHA-256 {shortHash(ev.hash)} (verified)</dd></>)}
            </dl>
            <p className="mt-3 text-xs text-muted">Audit entries are append-only. They cannot be edited or deleted by any role.</p>
          </Panel>
        )}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel title="Audit Events by Action Type">
          <div className="flex items-center gap-5">
            <Donut center="12.5K" sub="Events" segments={AUDIT_BY_ACTION.map((a, i) => ({ value: a.pct, color: ACTION_COLORS[i] }))} />
            <ul className="flex-1 space-y-1 text-sm">
              {AUDIT_BY_ACTION.map((a, i) => (
                <li key={a.label} className="flex items-center gap-2"><span className="size-3 rounded-full" style={{ background: ACTION_COLORS[i] }} />{a.label}<span className="ml-auto">{a.pct}%</span></li>
              ))}
            </ul>
          </div>
        </Panel>
        <Panel title="Audit Events by Classification">
          {AUDIT_BY_CLASSIFICATION.map((c, i) => (
            <div key={c.label} className="mb-3 grid grid-cols-[110px_1fr_60px] items-center gap-2 text-sm">
              <span>{c.label}</span>
              <Bar value={c.value} max={AUDIT_BY_CLASSIFICATION[0].value} color={CLASS_COLORS[i]} />
              <span className="text-right">{c.value.toLocaleString("en-US")}</span>
            </div>
          ))}
          <p className="text-xs text-muted">Counts across all enclaves; this network displays UNCLASSIFIED only.</p>
        </Panel>
        <Panel title="Recent Integrity Checks">
          <table className="w-full">
            <thead><tr className={theadRow}><th className={th}>Resource</th><th className={th}>Hash</th><th className={th}>Result</th></tr></thead>
            <tbody>
              {MESSAGES.slice(0, 5).map((m) => (
                <tr key={m.id} className="border-b border-line/70">
                  <td className={td}>{m.reference}</td>
                  <td className={cx(td, "font-mono text-xs")}>{shortHash(m.sha256)}</td>
                  <td className={td}><StatusDot tone="green">Pass</StatusDot></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </>
  );
}
