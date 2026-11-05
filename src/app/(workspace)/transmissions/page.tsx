"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, RadioTower, Send, Undo2 } from "lucide-react";
import { Button, EmptyState, PageHeader, Panel, Pill, PrecedenceBadge, tableWrap, td, th, theadRow, tbodyRow } from "@/components/ui";
import { fieldCls } from "@/components/routing";
import { useCurrentUser } from "@/lib/current-user";
import { fmtDateTime } from "@/lib/format";
import { hasRole, MESSAGE_ADMIN, RELEASE_AUTHORITY } from "@/lib/roles";
import { useStore } from "@/lib/store";
import { referenceProblems } from "@/lib/reference-links";
import type { Transmission } from "@/lib/transmissions";
import { useTransmissions } from "@/lib/use-transmissions";

const STATUS: Record<Transmission["status"], { label: string; className: string }> = {
  queued: { label: "Awaiting transmission", className: "bg-amber-100 text-amber-900" },
  transmitted: { label: "Transmitted", className: "bg-green-100 text-green-800" },
  cancelled: { label: "Release withdrawn", className: "bg-slate-200 text-slate-700" },
};

export default function TransmissionsPage() {
  const user = useCurrentUser();
  const { offline, notify, messages, references } = useStore();
  const { transmissions, loading, busy, error, act } = useTransmissions();
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [failure, setFailure] = useState("");
  const isMessageAdmin = hasRole(user, MESSAGE_ADMIN);
  const isReleaseAuthority = hasRole(user, RELEASE_AUTHORITY);
  const queued = transmissions.filter((t) => t.status === "queued");
  const log = transmissions.filter((t) => t.status !== "queued");
  const problems = isMessageAdmin ? messages.filter((m) => m.kind !== "draft").map((m) => ({ m, issues: referenceProblems(m, references) })).filter((p) => p.issues.length) : [];

  const run = async (t: Transmission, action: "transmit" | "revoke") => {
    setFailure("");
    const result = await act(t.id, action, reason.trim());
    if (!result.ok) return setFailure(result.reason);
    notify(action === "transmit" ? `${t.reference} transmitted` : `Release of ${t.reference} withdrawn`);
    setWithdrawing(null); setReason("");
  };

  return (
    <>
      <PageHeader icon={RadioTower} title="Transmission Queue"
        subtitle="Released traffic waits here until the Message Admin transmits it. Everyone in the command can see the queue." />
      {error && <p role="alert" className="mb-4 rounded bg-red-50 p-3 text-red-800">{error}</p>}
      {failure && <p role="alert" className="mb-4 rounded bg-red-50 p-3 text-red-800">{failure}</p>}
      {!isMessageAdmin && <p className="mb-4 text-sm text-muted">Only the Message Admin transmits. The person who released a message, or the Release Authority, can withdraw the release until it is transmitted.</p>}
      {isMessageAdmin && offline && <p role="alert" className="mb-4 rounded bg-amber-50 p-3 text-sm text-amber-900">The C2OIX circuit is down. Restore it on Comms & Network before transmitting.</p>}
      {loading && <p role="status">Loading the transmission queue…</p>}

      <Panel title={`Awaiting transmission (${queued.length})`} icon={Send} className="mb-4" bodyClassName="p-0">
        {queued.length ? (
          <ul className="divide-y divide-line/70">
            {queued.map((t) => {
              const canWithdraw = t.releasedBy === user.id || isReleaseAuthority;
              return (
                <li key={t.id} className="space-y-2 px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <PrecedenceBadge p={t.precedence} />
                    <span className="font-semibold">{t.reference}</span>
                    <span>{t.subject}</span>
                  </div>
                  <p className="text-xs text-muted">Released by {t.queuedByName} · {fmtDateTime(t.queuedAt)}</p>
                  <details><summary className="cursor-pointer text-xs">Message text</summary><pre className="mt-1 whitespace-pre-wrap break-words rounded bg-slate-50 p-2 font-mono text-xs">{t.body}</pre></details>
                  {withdrawing === t.id ? (
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold">Why is the release being withdrawn?
                        <textarea className={fieldCls} rows={2} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} />
                      </label>
                      <div className="flex gap-2">
                        <Button variant="primary" icon={Undo2} disabled={busy || !reason.trim()} onClick={() => void run(t, "revoke")}>Withdraw release</Button>
                        <Button variant="ghost" onClick={() => { setWithdrawing(null); setReason(""); }}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {isMessageAdmin && <Button variant="primary" size="sm" icon={Send} disabled={busy || offline} onClick={() => void run(t, "transmit")}>Transmit</Button>}
                      {canWithdraw && <Button size="sm" icon={Undo2} disabled={busy} onClick={() => setWithdrawing(t.id)}>Withdraw release</Button>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : <EmptyState>Nothing is waiting to be transmitted.</EmptyState>}
      </Panel>

      <Panel title="Transmission log" bodyClassName="p-0">
        {log.length ? (
          <div className={tableWrap}>
            <table className="w-full min-w-[720px]">
              <thead><tr className={theadRow}><th className={th}>Reference</th><th className={th}>Kind</th><th className={th}>Status</th><th className={th}>By</th><th className={th}>When</th></tr></thead>
              <tbody>
                {log.map((t) => (
                  <tr key={t.id} className={tbodyRow}>
                    <td className={td}><div className="font-semibold">{t.reference}</div><div className="text-xs text-muted">{t.subject}{t.note && ` · ${t.note}`}</div></td>
                    <td className={td}>{t.kind === "release" ? "Released message" : "Acknowledgement"}</td>
                    <td className={td}><Pill className={STATUS[t.status].className}>{STATUS[t.status].label}</Pill></td>
                    <td className={td}>{t.closedByName}</td>
                    <td className={td}>{t.closedAt && fmtDateTime(t.closedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState>No transmissions yet.</EmptyState>}
      </Panel>

      {isMessageAdmin && (
        <Panel title={`Reference problems (${problems.length})`} icon={AlertTriangle} className="mt-4" bodyClassName="p-0">
          {problems.length ? (
            <ul className="divide-y divide-line/70">
              {problems.map(({ m, issues }) => (
                <li key={m.id} className="space-y-1 px-4 py-3 text-sm">
                  <Link href={`/messages/${m.id}`} className="font-semibold text-link hover:underline">{m.reference}: {m.subject}</Link>
                  <ul className="ml-5 list-disc text-amber-900">{issues.map((i) => <li key={i}>{i}</li>)}</ul>
                </li>
              ))}
            </ul>
          ) : <EmptyState>Every message reference is held on this server and follows NTP 3(J).</EmptyState>}
        </Panel>
      )}
    </>
  );
}
