"use client";

import Link from "next/link";
import { useState } from "react";
import { CURRENT_USER } from "@/lib/data";
import { MOCK_NOW, fmtDateTime, fmtTime } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { Message } from "@/lib/types";
import { HOUR, isCurrent, needsAck, screeningMessages, watchDeadlines } from "@/lib/watch-prep";
import { Panel, PrecedenceBadge } from "@/components/ui";

const input = "mt-1 block w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink";
type Focus = "all" | "unread" | "ack" | "urgent" | "changes";

export function WatchPrep() {
  const { userState, offline, syncQueue, lastSync, messages } = useStore();
  const types = [...new Set(messages.map((m) => m.type))];
  const [hours, setHours] = useState("24");
  const [asOf, setAsOf] = useState(MOCK_NOW.toISOString().slice(0, 16));
  const [customStart, setCustomStart] = useState(new Date(MOCK_NOW.getTime() - 24 * HOUR).toISOString().slice(0, 16));
  const [focus, setFocus] = useState<Focus>("all");
  const [type, setType] = useState("all");
  const end = Date.parse(asOf + "Z");
  const start = hours === "custom" ? Date.parse(customStart + "Z") : end - Number(hours) * HOUR;
  const valid = Number.isFinite(start) && Number.isFinite(end) && start <= end;
  const windowMessages = valid ? screeningMessages(messages, start, end) : [];
  const unread = (m: Message) => userState[m.id]?.read !== "read";
  const urgent = (m: Message) => isCurrent(m) && ["FLASH", "IMMEDIATE"].includes(m.precedence);
  const changed = (m: Message) => m.lifecycle !== "ACTIVE" || !!m.relatesTo;
  const counts: Record<Focus, number> = {
    all: windowMessages.length,
    unread: windowMessages.filter(unread).length,
    ack: windowMessages.filter((m) => needsAck(m, userState, CURRENT_USER.commandSource)).length,
    urgent: windowMessages.filter(urgent).length,
    changes: windowMessages.filter(changed).length,
  };
  const labels: Record<Focus, string> = { all: "All messages", unread: "Unread", ack: "Need ack", urgent: "Urgent", changes: "Changed" };
  const visible = windowMessages.filter((m) => (type === "all" || m.type === type) &&
    (focus === "all" || (focus === "unread" && unread(m)) || (focus === "ack" && needsAck(m, userState, CURRENT_USER.commandSource)) || (focus === "urgent" && urgent(m)) || (focus === "changes" && changed(m))));
  // Forward-looking obligations must include traffic older than the screening range.
  const known = messages.filter((m) => Date.parse(m.received) <= end);
  const deadlines = valid ? watchDeadlines(known, userState, end, CURRENT_USER.commandSource) : [];
  const carryover = valid ? known.filter((m) => Date.parse(m.received) < start && (needsAck(m, userState, CURRENT_USER.commandSource) || (urgent(m) && unread(m)))) : [];

  const overdue = deadlines.filter((d) => d.due < end).length;
  const pendingSync = syncQueue.filter((q) => q.status === "Pending").length;
  const activeTypes = types.filter((t) => windowMessages.some((m) => m.type === t));

  return <section className="mb-5 space-y-4" aria-label="Watch preparation">
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Your watch at a glance</h2>
          <p className="mt-1 text-xs text-muted">Demo watch · {valid ? fmtDateTime(new Date(end)) : "Choose a valid time"} · UTC</p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1" aria-label="Message time horizon">
          {[4, 8, 12, 24, 48, 72, 168].map((h) => <button key={h} aria-pressed={hours === String(h)} onClick={() => setHours(String(h))} className={`rounded-md px-3 py-2 text-sm font-semibold ${hours === String(h) ? "bg-navy-800 text-white shadow-sm" : "text-muted hover:bg-white"}`}>{h === 168 ? "7d" : `${h}h`}</button>)}
          <button aria-pressed={hours === "custom"} onClick={() => setHours("custom")} className={`rounded-md px-3 py-2 text-sm font-semibold ${hours === "custom" ? "bg-navy-800 text-white" : "text-muted hover:bg-white"}`}>Custom</button>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="Message counts">
        {(Object.keys(labels) as Focus[]).map((key) => <button key={key} aria-pressed={focus === key} onClick={() => setFocus(key)} className={`rounded-lg border px-4 py-3 text-left transition-colors ${focus === key ? "border-navy-700 bg-navy-50 ring-1 ring-navy-700" : "border-line hover:bg-slate-50"}`}><span className={`block text-2xl font-bold ${key === "urgent" && counts[key] ? "text-red-700" : key === "ack" && counts[key] ? "text-amber-800" : "text-ink"}`}>{counts[key]}</span><span className="text-sm text-muted">{labels[key]}</span></button>)}
      </div>
      <details open={hours === "custom" ? true : undefined} className="mt-3 text-sm">
        <summary className="w-fit cursor-pointer text-link">Dates &amp; options</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {hours === "custom" && <label>From (UTC)<input className={input} type="datetime-local" value={customStart} onChange={(e) => setCustomStart(e.target.value)} /></label>}
          <label>Watch starts / range ends (UTC)<input className={input} type="datetime-local" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></label>
        </div>
        {valid && <p className="mt-2 text-xs text-muted">Received {fmtDateTime(new Date(start))} – {fmtDateTime(new Date(end))}, inclusive. Counts may overlap.</p>}
        <button className="mt-3 text-sm text-link underline" onClick={() => { setAsOf(MOCK_NOW.toISOString().slice(0, 16)); setHours("24"); setFocus("all"); setType("all"); }}>Reset demo</button>
      </details>
      {!valid && <p role="alert" className="mt-3 text-sm text-red-700">Choose valid dates. Start must be before or equal to end.</p>}
    </Panel>

    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Panel title={`Messages to review · ${visible.length}`} bodyClassName="p-0" action={<button onClick={() => { setFocus("all"); setType("all"); }} className="text-xs text-link hover:underline">Clear filters</button>}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <label className="text-sm text-muted" htmlFor="watch-message-type">Type</label>
          <select id="watch-message-type" className="min-w-0 max-w-full rounded-md border border-line bg-white px-2 py-1.5 text-sm" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">All types ({windowMessages.length})</option>
            {types.map((t) => <option key={t} value={t}>{t} ({windowMessages.filter((m) => m.type === t).length})</option>)}
          </select>
          <span className="ml-auto text-xs text-muted">{labels[focus]}</span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-line bg-slate-50 px-4 py-2 text-xs text-muted" aria-label="Message types in this period">
          {activeTypes.map((t) => <span key={t}><strong className="text-ink">{windowMessages.filter((m) => m.type === t).length}</strong> {t}</span>)}
          {!activeTypes.length && <span>No traffic in this period</span>}
        </div>
        <ul className="divide-y divide-line">
          {visible.map((m) => <li key={m.id} className="px-4 py-4 hover:bg-slate-50/70">
            <div className="flex items-start gap-3">
              <span className={`mt-2 size-2 shrink-0 rounded-full ${unread(m) ? "bg-blue-600" : "bg-slate-200"}`} aria-label={unread(m) ? "Unread" : "Read"} />
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span>{m.reference}</span><span>· {fmtTime(m.received)}</span>
                  {urgent(m) && <PrecedenceBadge p={m.precedence} />}
                  {needsAck(m, userState, CURRENT_USER.commandSource) && <span className="rounded bg-amber-100 px-2 py-0.5 font-semibold text-amber-900">Ack needed</span>}
                  {m.lifecycle !== "ACTIVE" && <span className="rounded bg-slate-100 px-2 py-0.5 font-semibold">{m.lifecycle}</span>}
                </div>
                <Link href={`/messages/${m.id}`} className="text-[15px] font-semibold leading-snug text-link hover:underline">{m.subject}</Link>
                <details className="mt-2 text-xs text-muted">
                  <summary className="w-fit cursor-pointer hover:text-link">Details</summary>
                  <div className="mt-2 space-y-1 border-l-2 border-line pl-3">
                    <p>{m.type} · {m.precedence} · Received {fmtDateTime(m.received)}</p>
                    {needsAck(m, userState, CURRENT_USER.commandSource) && <p className="text-amber-800">Ack due: {m.ackDue ? fmtDateTime(m.ackDue) : "Not recorded"}</p>}
                    {m.replacedBy && <p className="text-red-700">Replaced by {m.replacedBy}. Use the current instruction.</p>}
                    {m.relatesTo && <p>Updates {m.relatesTo}. Compare before acting.</p>}
                    <Link href={`/messages/${m.id}`} className="inline-block text-link underline">Open official message →</Link>
                  </div>
                </details>
              </div>
            </div>
          </li>)}
        </ul>
        {!visible.length && <div className="px-4 py-10 text-center"><p className="font-semibold">No matching messages</p><p className="mt-1 text-sm text-muted">Try a longer period or clear your filters.</p></div>}
      </Panel>
      <aside className="space-y-4" aria-label="Watch priorities">
        <Panel title="Deadlines" action={<span className="text-xs text-muted">Next 24h</span>}>
          <div className="mb-3 grid grid-cols-2 gap-3">
            <div className={`rounded-md p-3 ${overdue ? "bg-red-50 text-red-800" : "bg-slate-50"}`}><strong className="block text-xl">{overdue}</strong><span className="text-xs">Overdue</span></div>
            <div className="rounded-md bg-amber-50 p-3 text-amber-900"><strong className="block text-xl">{deadlines.length - overdue}</strong><span className="text-xs">Due soon</span></div>
          </div>
          <ul className="space-y-3">{deadlines.map((d) => <li key={`${d.message.id}-${d.kind}`} className="border-l-2 border-amber-400 pl-3 text-sm">
            <p className={`text-xs font-semibold ${d.due < end ? "text-red-700" : "text-amber-800"}`}>{d.due < end ? "Overdue" : "Due"} · {fmtDateTime(new Date(d.due))}</p>
            <Link href={`/messages/${d.message.id}`} className="font-semibold text-link hover:underline">{d.kind}</Link>
            <p className="text-xs text-muted">{d.owner} · {d.message.reference}{d.dateOnly ? " · date only" : ""}</p>
          </li>)}</ul>
          {!deadlines.length && <p className="text-sm text-muted">No recorded deadlines in the next 24h.</p>}
          <p className="mt-3 text-xs text-muted">Includes older traffic.</p>
        </Panel>
        <Panel title={`Carryover · ${carryover.length}`}>
          {carryover.length ? <ul className="space-y-3 text-sm">{carryover.map((m) => <li key={m.id}><Link href={`/messages/${m.id}`} className="font-semibold text-link hover:underline">{m.reference}</Link><p className="mt-0.5 text-xs text-muted">{m.subject}</p></li>)}</ul> : <p className="text-sm text-muted">No older urgent or unacknowledged traffic.</p>}
        </Panel>
        <div className="rounded-lg border border-line bg-white px-4 py-3 text-sm">
          <div className="flex items-center justify-between gap-2"><span className="font-semibold">{offline ? "Offline / EMCON" : "Online mode"}</span><Link href="/offline" className="text-xs text-link hover:underline">{pendingSync} pending sync →</Link></div>
          <details className="mt-2 text-xs text-muted"><summary className="cursor-pointer">Watch reminders &amp; data notes</summary>
            <ul className="mt-3 list-disc space-y-2 pl-4">
              <li>Last recorded sync: {fmtDateTime(lastSync)}. Verify feed currency and alternate communications with the outgoing watch.</li>
              <li>Confirm action owners, next reports, escalation contacts, and standing orders.</li>
              <li>Check changed instructions and unresolved incidents. Offline acknowledgements may need sync.</li>
              <li>Action completion is not tracked. Confirm with the owner; date-only deadlines use end of day UTC.</li>
              <li>Fictional demo data; state resets on reload. OPREP: 0 in this dataset. Types use recorded labels.</li>
            </ul>
          </details>
        </div>
      </aside>
    </div>
  </section>;
}
