"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileText, Link2, Printer, RefreshCw, RotateCcw, ShieldAlert, ShieldCheck, Undo2, Users } from "lucide-react";
import { fmtDate, fmtDateTime, fmtTime, shortHash } from "@/lib/format";
import { useStore } from "@/lib/store";
import { verifyChain, type AuditCategory, type ChainCheck } from "@/lib/audit";
import { Bar, Button, Check, ClassBadge, Donut, PageHeader, Panel, Pill, Select, StatCard, StatusDot, cx, td, th, theadRow } from "@/components/ui";

const ACTION_COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#ef4444", "#8b5cf6", "#94a3b8", "#cbd5e1"];
const CATEGORIES: AuditCategory[] = ["Read", "Act", "Govern", "Admin", "System"];
const CATEGORY_TONE: Record<AuditCategory, string> = {
  Read: "bg-slate-100 text-slate-700",
  Act: "bg-blue-100 text-blue-800",
  Govern: "bg-purple-100 text-purple-800",
  Admin: "bg-amber-100 text-amber-900",
  System: "bg-teal-100 text-teal-800",
};

export default function AuditPage() {
  const { audit, log, notify, tamperAudit, undoTamper, tampered, messages } = useStore();
  const [user, setUser] = useState("All Users");
  const [action, setAction] = useState("All Actions");
  const [category, setCategory] = useState("All Categories");
  const [results, setResults] = useState({ Success: true, Failed: true, Warning: true });
  const [selected, setSelected] = useState(audit[0]?.id);
  const [check, setCheck] = useState<(ChainCheck & { at: string; length: number }) | null>(null);

  const users = ["All Users", ...new Set(audit.map((e) => e.user))];
  const actions = ["All Actions", ...new Set(audit.map((e) => e.action))];
  const rows = useMemo(
    () =>
      audit.filter(
        (e) =>
          (user === "All Users" || e.user === user) &&
          (action === "All Actions" || e.action === action) &&
          (category === "All Categories" || e.category === category) &&
          results[e.result],
      ),
    [audit, user, action, category, results],
  );
  const ev = audit.find((e) => e.id === selected) ?? rows[0];

  const byAction = useMemo(() => {
    const counts = new Map<string, number>();
    audit.forEach((e) => counts.set(e.action, (counts.get(e.action) ?? 0) + 1));
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 6);
    const rest = sorted.slice(6).reduce((n, [, c]) => n + c, 0);
    return rest ? [...top, ["Other", rest] as [string, number]] : top;
  }, [audit]);
  const byCategory = CATEGORIES.map((c) => ({ label: c, value: audit.filter((e) => e.category === c).length }));

  const recompute = () => {
    const result = verifyChain(audit);
    setCheck({ ...result, at: new Date().toISOString(), length: audit.length });
    log("Integrity Check", `Audit chain (${audit.length} events)`, result.ok ? `Chain intact. ${result.checked} events verified.` : `Break at event #${result.breakAt}: ${result.reason}`, result.ok ? "Success" : "Failed");
  };
  // A check is stale once anything has been appended or altered since it ran.
  const stale = check && check.length !== audit.length;
  const tamperTarget = audit.find((e) => e.seq === Math.max(1, Math.floor(audit.length / 2)));

  return (
    <>
      <PageHeader
        icon={ShieldCheck}
        title="Audit & Integrity"
        subtitle="Append-only, hash-chained record of consequential actions. Recompute the chain to prove nothing was altered, reordered or removed."
        actions={
          <>
            <Button icon={FileText} onClick={() => { log("Generate Report", "Audit Report"); notify("Audit report generated"); }}>Generate Audit Report</Button>
            <Button variant="primary" icon={Download} onClick={() => { log("Export", `Audit log (${audit.length} events)`, "Exported with the chain head hash for later verification."); notify("Audit log exported with chain head"); }}>Export</Button>
            <Button icon={Printer} onClick={() => window.print()}>Print</Button>
          </>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={FileText} value={audit.length} label="Events in Chain" note={`Head #${audit[0]?.seq} · ${audit[0] ? shortHash(audit[0].hash) : "-"}`} />
        <StatCard
          icon={check && !check.ok ? ShieldAlert : ShieldCheck}
          value={!check ? "Not run" : check.ok ? "Intact" : `Break #${check.breakAt}`}
          label="Chain Integrity"
          tone={!check ? "navy" : check.ok ? "green" : "red"}
          note={check ? `Recomputed ${fmtDateTime(check.at)}${stale ? " · new events since" : ""}` : "Recompute to verify"}
        />
        <StatCard icon={Users} value={users.length - 1} label="Distinct Actors" note="Accounts and system processes" />
        <StatCard icon={AlertTriangle} value={audit.filter((e) => e.result !== "Success").length} label="Failed or Warned" tone="amber" note="Denied logins, warnings, failed checks" />
      </div>

      <Panel title="Integrity Check" icon={Link2} className="mb-4">
        <div className="flex flex-wrap items-start gap-4">
          <p className="max-w-3xl flex-1 text-sm text-muted">
            Every event carries the SHA-256 hash of the event before it, and its own hash over a canonical form of its contents. Recomputing the chain from what is stored shows whether any event was altered, reordered or removed, and names the first one that doesn&apos;t fit. This is tamper evidence: the log has no edit or delete path, and the chain shows if that was ever bypassed.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" icon={RefreshCw} onClick={recompute}>Recompute chain</Button>
            {tampered ? (
              <Button icon={Undo2} onClick={undoTamper}>Undo demonstration edit</Button>
            ) : (
              tamperTarget && <Button variant="warning" icon={AlertTriangle} onClick={() => tamperAudit(tamperTarget.seq)}>Simulate tampering with #{tamperTarget.seq}</Button>
            )}
          </div>
        </div>
        {check && (
          <div className={cx("mt-3 rounded-md border px-3 py-2 text-sm", check.ok ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50")}>
            <p className="flex items-center gap-1.5 font-semibold">
              {check.ok ? <CheckCircle2 className="size-4 text-green-700" aria-hidden /> : <AlertTriangle className="size-4 text-red-700" aria-hidden />}
              {check.ok ? `Chain intact: ${check.checked} events verified from genesis to head.` : `First break at event #${check.breakAt}. ${check.checked} events before it verified.`}
            </p>
            {!check.ok && <p className="mt-0.5 text-red-900">{check.reason}</p>}
            {stale && <p className="mt-0.5 text-xs text-muted">Events have been appended since this check. Recompute to include them.</p>}
          </div>
        )}
        {tampered && (
          <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Demonstration: one stored event has been edited directly, the way someone with database access might. Recompute the chain to see it caught.
          </p>
        )}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[230px_1fr_360px]">
        <Panel title="Filters" bodyClassName="space-y-4 p-4">
          <Select label="User" value={user} onChange={setUser} options={users} />
          <Select label="Action Type" value={action} onChange={setAction} options={actions} />
          <Select label="Category" value={category} onChange={setCategory} options={["All Categories", ...CATEGORIES]} />
          <fieldset>
            <legend className="mb-1 text-sm font-semibold">Result</legend>
            {(["Success", "Failed", "Warning"] as const).map((r) => (
              <Check key={r} label={r} checked={results[r]} onChange={(v) => setResults({ ...results, [r]: v })} />
            ))}
          </fieldset>
          <Button icon={RotateCcw} className="w-full" onClick={() => { setUser("All Users"); setAction("All Actions"); setCategory("All Categories"); setResults({ Success: true, Failed: true, Warning: true }); }}>Reset Filters</Button>
        </Panel>

        <Panel title={`Audit Log Events (${rows.length} of ${audit.length})`} bodyClassName="p-0">
          <div className="max-h-[480px] overflow-auto">
            <table className="w-full min-w-[760px]">
              <thead className="sticky top-0">
                <tr className={theadRow}>
                  <th className={th}>#</th>
                  <th className={th}>Timestamp</th>
                  <th className={th}>User</th>
                  <th className={th}>Action</th>
                  <th className={th}>Resource</th>
                  <th className={th}>Category</th>
                  <th className={th}>Result</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} onClick={() => setSelected(e.id)} className={cx("cursor-pointer border-b border-line/70", ev?.id === e.id ? "bg-navy-100/70" : "hover:bg-navy-50", check && !check.ok && e.seq === check.breakAt && "bg-red-50")}>
                    <td className={cx(td, "font-mono text-xs font-semibold text-navy-600")}>{e.seq}</td>
                    <td className={cx(td, "whitespace-nowrap")} suppressHydrationWarning>{fmtDate(e.timestamp)} {fmtTime(e.timestamp)}</td>
                    <td className={td}>{e.user}</td>
                    <td className={td}>{e.action}</td>
                    <td className={td}>{e.resource}</td>
                    <td className={td}><Pill className={CATEGORY_TONE[e.category]}>{e.category}</Pill></td>
                    <td className={td}><StatusDot tone={e.result === "Success" ? "green" : e.result === "Failed" ? "red" : "amber"}>{e.result}</StatusDot></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        {ev && (
          <Panel title={`Event #${ev.seq}`} action={<Pill className={ev.result === "Success" ? "bg-green-100 text-green-800" : ev.result === "Failed" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"}>{ev.result}</Pill>}>
            <div className="mb-3 text-lg font-bold">{ev.action}: {ev.resource}</div>
            <dl className="grid grid-cols-[110px_1fr] gap-y-1.5 text-sm">
              <dt className="text-muted">Timestamp</dt><dd suppressHydrationWarning>{fmtDate(ev.timestamp)} {fmtTime(ev.timestamp)}</dd>
              <dt className="text-muted">User</dt><dd>{ev.user}</dd>
              <dt className="text-muted">Category</dt><dd>{ev.category}</dd>
              <dt className="text-muted">Classification</dt><dd><ClassBadge c={ev.classification} /></dd>
              <dt className="text-muted">Source IP</dt><dd>{ev.sourceIp} (local network)</dd>
              <dt className="text-muted">Device</dt><dd>{ev.device}</dd>
              <dt className="text-muted">Location</dt><dd>{ev.location}</dd>
              <dt className="text-muted">Details</dt><dd>{ev.details}</dd>
              <dt className="text-muted">Previous</dt><dd className="break-all font-mono text-xs">{ev.prevHash === "GENESIS" ? "GENESIS" : shortHash(ev.prevHash)}</dd>
              <dt className="text-muted">Hash</dt><dd className="break-all font-mono text-xs">{ev.hash}</dd>
            </dl>
            <p className="mt-3 text-xs text-muted">Audit entries are append-only. They cannot be edited or deleted by any role, administrators included.</p>
          </Panel>
        )}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel title="Events by Action">
          <div className="flex items-center gap-5">
            <Donut center={audit.length} sub="Events" segments={byAction.map(([, v], i) => ({ value: v, color: ACTION_COLORS[i] }))} />
            <ul className="flex-1 space-y-1 text-sm">
              {byAction.map(([label, v], i) => (
                <li key={label} className="flex items-center gap-2"><span className="size-3 rounded-full" style={{ background: ACTION_COLORS[i] }} />{label}<span className="ml-auto">{v}</span></li>
              ))}
            </ul>
          </div>
        </Panel>
        <Panel title="Events by Category">
          {byCategory.map((c) => (
            <div key={c.label} className="mb-3 grid grid-cols-[80px_1fr_40px] items-center gap-2 text-sm">
              <span>{c.label}</span>
              <Bar value={c.value} max={Math.max(1, ...byCategory.map((x) => x.value))} />
              <span className="text-right">{c.value}</span>
            </div>
          ))}
          <p className="text-xs text-muted">Consequential actions only: opening records, acknowledging, searching, printing, subscription decisions, routing and release, admin changes, sync and link reports.</p>
        </Panel>
        <Panel title="Record Hashes at Ingest">
          <table className="w-full">
            <thead><tr className={theadRow}><th className={th}>Resource</th><th className={th}>SHA-256</th><th className={th}>Result</th></tr></thead>
            <tbody>
              {messages.slice(0, 5).map((m) => (
                <tr key={m.id} className="border-b border-line/70">
                  <td className={td}>{m.reference}</td>
                  <td className={cx(td, "font-mono text-xs")}>{shortHash(m.sha256)}</td>
                  <td className={td}><StatusDot tone="green">Recorded</StatusDot></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted">Hash recorded when the message was ingested from C2OIX. Mock values in this prototype.</p>
        </Panel>
      </div>
    </>
  );
}
