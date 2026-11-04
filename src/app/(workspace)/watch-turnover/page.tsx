"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertCircle, CheckSquare, Clock, Download, FileText, Pencil, Printer, Users, FilePlus2 } from "lucide-react";
import { ONGOING_TOPICS, TURNOVER_CHECKLIST, actionItems, needsOwnAck } from "@/lib/data";
import { fmtTime } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { Message } from "@/lib/types";
import { WatchPrep } from "@/components/watch-prep";
import { MessageCellsRow, MessageHeaderRow, messageColumns } from "@/components/message-columns";
import { Button, Check, ImportanceBadge, LifecycleBadge, Panel, StatusDot, Tabs, tableWrap, td, th, theadRow, tbodyRow, type DotTone } from "@/components/ui";

type Tab = "summary" | "actions" | "topics" | "recent" | "notes";
const statusTone: Record<string, DotTone> = { Open: "red", "In Progress": "amber", "Not Started": "gray", Done: "green", Active: "green", Monitoring: "amber" };

export default function WatchTurnover() {
  const { userState, watchNotes, setWatchNotes, checklist, toggleChecklist, log, notify, messages } = useStore();
  const [tab, setTab] = useState<Tab>("summary");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const high = messages.filter((m) => m.importance === "High" && !["SUPERSEDED", "CANCELLED", "EXPIRED"].includes(m.lifecycle));
  const actions = actionItems(messages);
  const pendingAck = messages.filter((m) => needsOwnAck(m) && !userState[m.id].acknowledgedAt);
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
            <p className="text-[15px] text-muted">Review traffic. Resolve priorities. Take the watch.</p>
          </div>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <Button variant="primary" icon={FileText} onClick={() => { log("Generate Report", "Watch Turnover Package"); notify("Turnover package generated"); }}>Prepare package</Button>
          <Button icon={FilePlus2} href="/briefings/generated">Briefing</Button>
          <Button icon={Download} onClick={() => { log("Export", "Watch Turnover"); notify("Exported turnover PDF"); }}>Export</Button>
          <Button icon={Printer} onClick={() => window.print()}>Print</Button>
        </div>
      </div>

      <WatchPrep />

      <details className="rounded-lg border border-line bg-white p-4">
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 font-semibold">
          <span>Turnover notes &amp; checklist <span className="ml-2 text-sm font-normal text-link">Expand ↓</span></span>
          <span className={`text-sm ${ready ? "text-green-700" : "text-amber-800"}`}>{done}/{TURNOVER_CHECKLIST.length} checks complete</span>
        </summary>
        <div className="mt-4">
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "summary", label: "Incoming Watch Summary" },
          { id: "actions", label: `Open Actions (${actions.length})` },
          { id: "topics", label: `Ongoing Topics (${ONGOING_TOPICS.length})` },
          { id: "recent", label: `Recent Messages (${messages.length})` },
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
                  <li>Confirm operational status and escalation needs with the outgoing watch; review deadlines and carryover above.</li>
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
                {messages.map((m) => (
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
        </div>
      </details>
    </>
  );
}

function HighPriority({ items }: { items: Message[] }) {
  const { userState } = useStore();
  const cols = messageColumns<Message>({
    subject: (m) => <Link href={`/messages/${m.id}`} className="hover:underline">{m.subject}</Link>,
    reference: (m) => m.reference,
    received: (m) => `${m.dtg.slice(0, 2)} OCT ${fmtTime(m.received)}`,
    priority: (m) => <ImportanceBadge i={m.importance} />,
    summary: (m) => `${m.aiSummary?.split(".")[0] ?? m.sections[0].body[0].split(".")[0]}.`,
    status: (m) => {
      const st = userState[m.id];
      return needsOwnAck(m)
        ? st.acknowledgedAt ? <StatusDot tone="green">Acknowledged</StatusDot> : <StatusDot tone="red">Ack pending</StatusDot>
        : st.read === "read" ? <StatusDot tone="green">Read</StatusDot> : <StatusDot tone="red">Unread</StatusDot>;
    },
  });
  return (
    <Panel title="2. High-Priority Messages" icon={AlertCircle} action={<Link href="/messages" className="text-sm text-link">View All ({items.length})</Link>}>
      <div className={tableWrap}>
        <table className="w-full min-w-[700px]">
          <thead>
            <MessageHeaderRow cols={cols} />
          </thead>
          <tbody>
            {items.map((m) => (
              <tr key={m.id} className={tbodyRow}>
                <MessageCellsRow cols={cols} row={m} />
              </tr>
            ))}
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
