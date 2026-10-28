"use client";

import { useState } from "react";
import Link from "next/link";
import { BellRing, Check as CheckIcon, Inbox, Lock, ShieldCheck, Upload, UserCog, Users, X } from "lucide-react";
import { hasRole } from "@/lib/users";
import { SAMPLES } from "@/lib/samples";
import { useStore, useUser } from "@/lib/store";
import { Button, EmptyState, PageHeader, Panel, Pill, PrecedenceBadge, tableWrap, td, th, theadRow, tbodyRow } from "@/components/ui";

// Business rules that make delivery mandatory (ANCHOR.txt section 6).
const ALERT_RULES = [
  { rule: "Precedence", match: <><PrecedenceBadge p="FLASH" /> <PrecedenceBadge p="IMMEDIATE" /></>, audience: "All addressed units", ack: "Required, 2h", escalate: "Department Head → XO" },
  { rule: "Message type", match: "SAFETY MSG", audience: "All personnel", ack: "Required, 24h", escalate: "Safety Officer" },
  { rule: "Command applicability", match: "COMSUBLANT action messages", audience: "Commanding Officers, XOs", ack: "Required, 48h", escalate: "SUBRON Commander" },
  { rule: "Role", match: "Cybersecurity directives", audience: "ISSM, IT Chief", ack: "Required, 72h", escalate: "Comms Officer" },
];

const ACCESS = [
  { group: "COMSUBLANT", basis: "Organizational affiliation", members: 412, scope: "All COMSUBLANT traffic" },
  { group: "Pilot Unit Wardroom", basis: "Role", members: 14, scope: "Unit traffic, officer-only" },
  { group: "Comms Division", basis: "Role", members: 9, scope: "Unit traffic, comms admin" },
  { group: "SUBRON Staff", basis: "Group", members: 38, scope: "Squadron traffic" },
];

export default function AdminPage() {
  const { approvals, decideApproval } = useStore();
  const CURRENT_USER = useUser();
  return (
    <>
      <PageHeader icon={UserCog} title="Admin" subtitle="Ingest traffic, approve subscriptions, review mandatory alert rules, and manage command access." />

      {hasRole(CURRENT_USER, "System Admin") && <IngestPanel />}

      <Panel title={`Subscription Approval Queue (${approvals.length})`} icon={CheckIcon} className="mb-4">
        <p className="mb-3 text-sm text-muted">
          {hasRole(CURRENT_USER, "Subscription Approver")
            ? `You hold the Subscription Approver role for ${CURRENT_USER.unit}. Requests are not active until approved, and you can't approve your own.`
            : "You don't hold the Subscription Approver role. Your requests go to your unit's approvers."}
        </p>
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
                      <div className="flex gap-2">
                        <Button size="sm" variant="primary" icon={CheckIcon} onClick={() => decideApproval(a.id, true)}>Approve</Button>
                        <Button size="sm" icon={X} onClick={() => decideApproval(a.id, false)}>Deny</Button>
                      </div>
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

interface IngestResult {
  id: string;
  reference: string;
  sha256: string;
  duplicate: boolean;
  changed: string[];
}

/**
 * Stand-in for the C2OIX gateway feed: paste or upload raw message text and
 * ANCHOR parses, hashes and stores it exactly as it would live traffic.
 */
function IngestPanel() {
  const { refresh, offline, notify } = useStore();
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<IngestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch("/api/ingest", { method: "POST", headers: { "content-type": "text/plain" }, body: raw });
      const d = (await r.json()) as IngestResult & { error?: string };
      if (!r.ok) setError(d.error ?? `Server answered ${r.status}`);
      else {
        setResult(d);
        notify(d.duplicate ? `${d.reference} is already on file` : `Ingested ${d.reference}`);
      }
      await refresh();
    } catch {
      setError("Can't reach the ANCHOR server.");
    } finally {
      setBusy(false);
    }
  };

  const loadFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 256_000) return setError("That file is larger than this prototype accepts (256 KB).");
    setRaw(await f.text());
    setResult(null);
    setError(null);
  };

  return (
    <Panel title="Ingest C2OIX Traffic" icon={Inbox} className="mb-4">
      <p className="mb-3 text-sm text-muted">
        In production this arrives from the C2OIX gateway. Here you can paste raw message text or load a sample. ANCHOR parses it, records its
        SHA-256, stores it unchanged, and applies any SUPERSEDES, CANCELS, CORRECTS or AMENDS directive to the message it names.
      </p>
      <div className="mb-3 flex flex-wrap gap-2">
        {SAMPLES.map((s) => (
          <Button
            key={s.label}
            size="sm"
            onClick={() => {
              setRaw(s.raw);
              setResult(null);
              setError(null);
            }}
          >
            {s.label}
          </Button>
        ))}
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-line bg-white px-2.5 py-1 text-sm font-medium text-ink hover:bg-navy-50">
          <Upload className="size-4" aria-hidden /> Load .txt file
          <input type="file" accept=".txt,text/plain" className="sr-only" onChange={(e) => void loadFile(e.target.files?.[0])} />
        </label>
      </div>
      {SAMPLES.find((s) => s.raw === raw) && <p className="mb-2 text-sm text-navy-800">{SAMPLES.find((s) => s.raw === raw)!.shows}</p>}
      <label className="mb-1 block text-sm font-semibold" htmlFor="raw-msg">Raw message text</label>
      <textarea
        id="raw-msg"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        rows={12}
        spellCheck={false}
        placeholder={"O 241830Z OCT 26\nFM ...\nTO ...\nBT\nUNCLAS\nCOMSUBLANT 084/26\nSUBJ/...//\nRMKS/1. Purpose. ...\nBT"}
        className="w-full rounded-md border border-line bg-white p-2 font-mono text-xs leading-5"
      />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Button variant="primary" icon={Inbox} disabled={busy || offline || !raw.trim()} onClick={() => void submit()}>
          {busy ? "Ingesting…" : "Ingest Message"}
        </Button>
        {offline && <span className="text-sm text-amber-800">Ingestion needs a connection to the ANCHOR server.</span>}
      </div>
      {error && (
        <p role="alert" className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          Rejected: {error}
        </p>
      )}
      {result && (
        <div role="status" className="mt-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">
          {result.duplicate ? "Already on file (identical text): " : "Stored "}
          <Link href={`/messages/${result.id}`} className="font-semibold underline">{result.reference}</Link>
          <span className="ml-1 break-all font-mono text-xs">SHA-256 {result.sha256}</span>
          {result.changed.length > 0 && <div className="mt-1">Lifecycle updated on {result.changed.join(", ")}.</div>}
        </div>
      )}
    </Panel>
  );
}
