"use client";

import { hasRole, SUBSCRIPTION_APPROVER } from "@/lib/roles";
import { useEffect, useState } from "react";
import { BellRing, Check as CheckIcon, Lock, ShieldCheck, UserCog, Users, X } from "lucide-react";
import { useCurrentUser } from "@/lib/current-user";
import { useStore } from "@/lib/store";
import { Button, EmptyState, PageHeader, Panel, Pill, PrecedenceBadge, Tabs, tableWrap, td, th, theadRow, tbodyRow } from "@/components/ui";
import { RoutingAdminPanel } from "@/components/routing-admin";
import { UserAdminPanel } from "@/components/user-admin";

// Business rules that make delivery mandatory (ANCHOR.txt section 6).
const ALERT_RULES = [
  { rule: "Precedence", match: <><PrecedenceBadge p="FLASH" /> <PrecedenceBadge p="IMMEDIATE" /></>, audience: "All addressed units", ack: "Required, 2h", escalate: "Department Head → XO" },
  { rule: "Message type", match: "SAFETY MSG", audience: "All personnel", ack: "Required, 24h", escalate: "Safety Officer" },
  { rule: "Command applicability", match: "COMSUBLANT action messages", audience: "Commanding Officers, XOs", ack: "Required, 48h", escalate: "SUBRON Commander" },
  { rule: "Role", match: "Cybersecurity directives", audience: "ISSM, IT Chief", ack: "Required, 72h", escalate: "Comms Officer" },
];

const ACCESS = [
  { group: "COMSUBLANT", basis: "Organizational affiliation", members: 412, scope: "All COMSUBLANT traffic" },
  { group: "COMSUBLANT N6", basis: "Role", members: 14, scope: "Directorate traffic, officer-only" },
  { group: "Comms Division", basis: "Role", members: 9, scope: "Unit traffic, comms admin" },
  { group: "SUBRON Staff", basis: "Group", members: 38, scope: "Squadron traffic" },
];

type AdminTab = "overview" | "users" | "routing";
const TABS: { id: AdminTab; label: string }[] = [
  { id: "overview", label: "Approvals & Access" },
  { id: "users", label: "Users" },
  { id: "routing", label: "Routing & Release" },
];
const tabFromHash = (hash: string): AdminTab => TABS.find((t) => t.id !== "overview" && `#${t.id}` === hash)?.id ?? "overview";

export default function AdminPage() {
  const [tab, setTab] = useState<AdminTab>("overview");
  // The tab lives in the URL hash so /admin#users or /admin#routing links straight to it.
  useEffect(() => {
    const sync = () => setTab(tabFromHash(window.location.hash));
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const choose = (next: AdminTab) => {
    setTab(next);
    window.history.replaceState(null, "", next === "overview" ? window.location.pathname : `#${next}`);
  };
  return (
    <>
      <PageHeader
        icon={UserCog}
        title="Admin"
        subtitle="Review legacy approval demos and alert rules, manage users and command access, and set routing and release. Message-type subscriptions need no approval."
      />
      <Tabs tabs={TABS} active={tab} onChange={choose} />
      {tab === "users" ? <UserAdminPanel /> : tab === "routing" ? <RoutingAdminPanel /> : <Overview />}
    </>
  );
}

function Overview() {
  const CURRENT_USER = useCurrentUser();
  const { approvals, decideApproval } = useStore();
  const approver = hasRole(CURRENT_USER, SUBSCRIPTION_APPROVER);
  return (
    <>
      <Panel title={`Legacy Subscription Approval Demo (${approvals.length})`} icon={CheckIcon} className="mb-4">
        <p className="mb-3 text-sm text-muted">{approver ? "You hold the Subscription Approver role for this command." : "Only a Subscription Approver can decide these requests."} Requests are not active until approved.</p>
        {approvals.length ? (
          <div className={tableWrap}>
            <table className="w-full min-w-[760px]">
              <thead>
                <tr className={theadRow}>
                  <th className={th}>Requester</th>
                  <th className={th}>Subscription</th>
                  <th className={th}>Message Types</th>
                  <th className={th}>Justification</th>
                  <th className={th}>Requested</th>
                  <th className={th}>Decision</th>
                </tr>
              </thead>
              <tbody>
                {approvals.map((a) => (
                  <tr key={a.id} className={tbodyRow}>
                    <td className={`${td} font-semibold`}>{a.requester}</td>
                    <td className={td}>{a.name}</td>
                    <td className={td}>{a.criteria.messageTypes.join(", ")}</td>
                    <td className={td}>{a.justification}</td>
                    <td className={td}>{a.requestedOn}</td>
                    <td className={td}>
                      {approver ? (
                        <div className="flex gap-2">
                          <Button size="sm" variant="primary" icon={CheckIcon} onClick={() => decideApproval(a.id, true)}>Approve</Button>
                          <Button size="sm" icon={X} onClick={() => decideApproval(a.id, false)}>Deny</Button>
                        </div>
                      ) : <span className="text-muted">Awaiting approver</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState>No requests waiting. Nice work.</EmptyState>
        )}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Mandatory Alert Rules" icon={BellRing} action={<Pill className="bg-navy-100 text-navy-800"><Lock className="size-3" /> Set by COMSUBLANT N6</Pill>}>
          <div className={tableWrap}>
            <table className="w-full min-w-[560px]">
              <thead>
                <tr className={theadRow}>
                  <th className={th}>Rule</th>
                  <th className={th}>Matches</th>
                  <th className={th}>Audience</th>
                  <th className={th}>Acknowledgement</th>
                  <th className={th}>Escalates to</th>
                </tr>
              </thead>
              <tbody>
                {ALERT_RULES.map((r) => (
                  <tr key={r.rule} className={tbodyRow}>
                    <td className={`${td} font-semibold`}>{r.rule}</td>
                    <td className={td}>{r.match}</td>
                    <td className={td}>{r.audience}</td>
                    <td className={td}>{r.ack}</td>
                    <td className={td}>{r.escalate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Command Access Groups" icon={Users}>
          <p className="mb-3 text-sm text-muted">Access is granted by CAC/PKI identity plus command, role and group. Changes require System Admin.</p>
          <div className={tableWrap}>
            <table className="w-full min-w-[480px]">
              <thead>
                <tr className={theadRow}>
                  <th className={th}>Group</th>
                  <th className={th}>Basis</th>
                  <th className={th}>Members</th>
                  <th className={th}>Scope</th>
                </tr>
              </thead>
              <tbody>
                {ACCESS.map((g) => (
                  <tr key={g.group} className={tbodyRow}>
                    <td className={`${td} font-semibold`}>{g.group}</td>
                    <td className={td}>{g.basis}</td>
                    <td className={td}>{g.members}</td>
                    <td className={td}>{g.scope}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted"><ShieldCheck className="size-4" /> Designated Release Authority processes remain outside ANCHOR.</p>
        </Panel>
      </div>
    </>
  );
}
