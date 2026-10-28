"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, CheckSquare, Clock, Download, FileText, Pencil, Printer, Users, FilePlus2 } from "lucide-react";
import { ONGOING_TOPICS, TURNOVER_CHECKLIST, actionItems } from "@/lib/data";
import type { Message } from "@/lib/types";
import { fmtTime } from "@/lib/format";
import { useStore } from "@/lib/store";
import { Button, Check, Delta, ImportanceBadge, LifecycleBadge, Panel, StatCard, StatusDot, Tabs, tableWrap, td, th, theadRow, tbodyRow, type DotTone } from "@/components/ui";

type Tab = "summary" | "actions" | "topics" | "recent" | "notes";
const statusTone: Record<string, DotTone> = { Open: "red", "In Progress": "amber", "Not Started": "gray", Done: "green", Active: "green", Monitoring: "amber" };

export default function WatchTurnover() {
  const { userState, watchNotes, setWatchNotes, checklist, toggleChecklist, log, notify, messages: MESSAGES } = useStore();
  const [tab, setTab] = useState<Tab>("summary");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const high = MESSAGES.filter((m) => m.importance === "High" && !["SUPERSEDED", "CANCELLED", "EXPIRED"].includes(m.lifecycle));
  const actions = actionItems(MESSAGES);
  const pendingAck = MESSAGES.filter((m) => m.ackRequired && !userState[m.id]?.acknowledgedAt && m.lifecycle !== "SUPERSEDED");
  const done = TURNOVER_CHECKLIST.filter((c) => checklist[c]).length;
  const ready = done === TURNOVER_CHECKLIST.length;

  const startEdit = () => {
    setDraft(watchNotes.join("\n"));
    setEditing(true);
  };
  const saveNotes = () => {
    setWatchNotes(draft.split("\n").map((l) => l.trim()).filter(Boolean));
    setEditing(false);
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Clock className="mt-1 size-10 text-ink" strokeWidth={1.75} aria-hidden />
          <div>
            <h1 className="text-2xl font-bold sm:text-[28px]">Watch Turnover</h1>
            <p className="text-[15px] text-muted">Ensure a smooth transition of duties with a complete operational picture.</p>
          </div>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <Button variant="primary" icon={FileText} onClick={() => { log("Generate Report", "Watch Turnover Package"); notify("Turnover package generated"); }}>Generate Turnover Package</Button>
          <Button icon={FilePlus2} href="/briefings/generated">Use Latest Briefing</Button>
          <Button variant="primary" icon={Download} onClick={() => { log("Export", "Watch Turnover"); notify("Exported turnover PDF"); }}>Export</Button>
          <Button icon={Printer} onClick={() => window.print()}>Print</Button>
        </div>
      </div>

      <div className="mb-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard icon={FileText} value={MESSAGES.filter((m) => m.received >= "2026-10-23T19:00:00Z").length} label="New This Watch" note={<Delta dir="down" good>25% from last watch</Delta>} />
        <StatCard icon={AlertTriangle} value={high.length} label="High Priority" tone="red" note={<Delta dir="up">1 from last watch</Delta>} />
        <StatCard icon={CheckSquare} value={actions.length} label="Action Items" tone="amber" note={<Delta dir="up">2 from last watch</Delta>} />
        <StatCard icon={Users} value={ONGOING_TOPICS.length} label="Ongoing Topics" note="Require continued monitoring" />
        <div className={`rounded-lg border p-4 shadow-sm ${ready ? "border-green-300 bg-green-50" : "border-amber-300 bg-amber-50"}`}>
          <div className="flex items-start gap-2">
            {ready ? <CheckCircle2 className="size-8 text-green-600" /> : <AlertCircle className="size-8 text-amber-600" />}
            <div>
              <div className="text-[17px] font-bold">{ready ? "Turnover Package Ready" : `${TURNOVER_CHECKLIST.length - done} checklist item${TURNOVER_CHECKLIST.length - done === 1 ? "" : "s"} left`}</div>
              <div className="text-sm">Includes messages, actions, acknowledgements and notes.</div>
            </div>
          </div>
          <Button variant="primary" icon={Download} className="mt-3 w-full" disabled={!ready} onClick={() => notify("Downloaded turnover package")}>Download Turnover Package</Button>
        </div>
      </div>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "summary", label: "Incoming Watch Summary" },
          { id: "actions", label: `Open Actions (${actions.length})` },
          { id: "topics", label: `Ongoing Topics (${ONGOING_TOPICS.length})` },
          { id: "recent", label: `Recent Messages (${MESSAGES.length})` },
          { id: "notes", label: "Watch Notes" },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_480px]">
        <div className="min-w-0 space-y-4">
          {tab === "summary" && (
            <>
              <Panel>
                <h2 className="mb-1 flex items-center gap-2 text-lg font-bold"><FileText className="size-5" /> 1. Situation Overview</h2>
                <p className="mb-2 text-[15px]">Key information for the incoming watch. Review high-priority messages, open actions, and ongoing topics.</p>
                <ul className="list-disc space-y-0.5 rounded-md bg-navy-50 py-3 pl-10 pr-3 text-[15px]">
                  <li>Normal operations. No critical issues require immediate escalation.</li>
                  <li>{high.length} high-priority messages require attention.</li>
                  <li>{pendingAck.length} mandatory acknowledgements are still open for this watch.</li>
                  <li>{actions.length} action items remain open from previous watches.</li>
                  <li>Status changes: NAVADMIN 235/26 superseded by 236/26; COMSUBLANT 061/26 superseded by 078/26.</li>
                </ul>
              </Panel>
              <HighPriority items={high} />
              <ActionTable items={actions} />
            </>
          )}
          {tab === "actions" && <ActionTable items={actions} />}
          {tab === "topics" && <Topics />}
          {tab === "recent" && (
            <Panel title="Recent Messages" bodyClassName="p-0">
              <ul className="divide-y divide-line">
                {MESSAGES.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 px-4 py-2 text-sm">
                    <Link href={`/messages/${m.id}`} className="text-link hover:underline">{m.subject}</Link>
                    <LifecycleBadge l={m.lifecycle} />
                    <span className="ml-auto text-muted">{m.reference} · {m.dtg}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {tab === "notes" && <NotesPanel editing={editing} draft={draft} setDraft={setDraft} startEdit={startEdit} save={saveNotes} />}
        </div>

        <div className="space-y-4">
          {tab !== "notes" && <NotesPanel editing={editing} draft={draft} setDraft={setDraft} startEdit={startEdit} save={saveNotes} />}
          {tab !== "topics" && <Topics />}
          <Panel title="Turnover Checklist" icon={CheckSquare} action={<span className="text-sm">{done} of {TURNOVER_CHECKLIST.length} complete</span>}>
            <div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full bg-green-600" style={{ width: `${(done / TURNOVER_CHECKLIST.length) * 100}%` }} />
            </div>
            <div className="grid gap-x-4 sm:grid-cols-2">
              {TURNOVER_CHECKLIST.map((c) => <Check key={c} label={c} checked={!!checklist[c]} onChange={() => toggleChecklist(c)} />)}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}

function HighPriority({ items }: { items: Message[] }) {
  const { userState } = useStore();
  return (
    <Panel title="2. High-Priority Messages" icon={AlertCircle} action={<Link href="/messages" className="text-sm text-link">View All ({items.length})</Link>}>
      <div className={tableWrap}>
        <table className="w-full min-w-[700px]">
          <thead><tr className={theadRow}><th className={th}>Priority</th><th className={th}>Subject</th><th className={th}>Source</th><th className={th}>Received</th><th className={th}>Summary</th><th className={th}>Status</th></tr></thead>
          <tbody>
            {items.map((m) => {
              const st = userState[m.id];
              const acked = !!st.acknowledgedAt;
              return (
                <tr key={m.id} className={tbodyRow}>
                  <td className={td}><ImportanceBadge i={m.importance} /></td>
                  <td className={td}><Link href={`/messages/${m.id}`} className="hover:underline">{m.subject}</Link></td>
                  <td className={td}>{m.reference}</td>
                  <td className={td}>{m.dtg.slice(0, 2)} OCT {fmtTime(m.received)}</td>
                  <td className={td}>{m.aiSummary?.split(".")[0] ?? m.sections[0].body[0].split(".")[0]}.</td>
                  <td className={td}>
                    {m.ackRequired ? (acked ? <StatusDot tone="green">Acknowledged</StatusDot> : <StatusDot tone="red">Ack pending</StatusDot>) : st.read === "read" ? <StatusDot tone="green">Read</StatusDot> : <StatusDot tone="red">Unread</StatusDot>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function ActionTable({ items }: { items: ReturnType<typeof actionItems> }) {
  return (
    <Panel title="3. Open Action Items" icon={CheckSquare}>
      <div className={tableWrap}>
        <table className="w-full min-w-[640px]">
          <thead><tr className={theadRow}><th className={th}>Priority</th><th className={th}>Action Item</th><th className={th}>Source</th><th className={th}>Assigned To</th><th className={th}>Suspense</th><th className={th}>Status</th></tr></thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.id} className={tbodyRow}>
                <td className={td}><ImportanceBadge i={a.importance} /></td>
                <td className={td}>{a.text}</td>
                <td className={td}>{a.source}</td>
                <td className={td}>{a.assignedTo}</td>
                <td className={td}>{a.suspense}</td>
                <td className={td}><StatusDot tone={statusTone[a.status]}>{a.status}</StatusDot></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function Topics() {
  return (
    <Panel title="Ongoing Topics" icon={Users}>
      <table className="w-full">
        <thead><tr className={theadRow}><th className={th}>Topic</th><th className={th}>Last Update</th><th className={th}>Status</th></tr></thead>
        <tbody>
          {ONGOING_TOPICS.map((t) => (
            <tr key={t.topic} className={tbodyRow}>
              <td className={td}>{t.topic}</td>
              <td className={td}>{t.lastUpdate}</td>
              <td className={td}><StatusDot tone={statusTone[t.status]}>{t.status}</StatusDot></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function NotesPanel({ editing, draft, setDraft, startEdit, save }: { editing: boolean; draft: string; setDraft: (s: string) => void; startEdit: () => void; save: () => void }) {
  const { watchNotes } = useStore();
  return (
    <Panel title="Watch Notes" icon={FileText} action={editing ? <Button size="sm" variant="primary" onClick={save}>Save Notes</Button> : <Button size="sm" icon={Pencil} onClick={startEdit}>Edit Notes</Button>}>
      {editing ? (
        <textarea aria-label="Watch notes, one per line" value={draft} onChange={(e) => setDraft(e.target.value)} rows={7} className="w-full rounded-md border border-line p-2 text-sm focus:outline-2 focus:outline-navy-600" />
      ) : (
        <ul className="list-disc space-y-1 rounded-md bg-amber-50 py-3 pl-8 pr-3 text-[15px]">
          {watchNotes.map((n) => <li key={n}>{n}</li>)}
        </ul>
      )}
    </Panel>
  );
}
