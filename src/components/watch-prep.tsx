"use client";

import Link from "next/link";
import { useState } from "react";
import { CURRENT_USER, MESSAGES } from "@/lib/data";
import { MOCK_NOW, fmtDateTime } from "@/lib/format";
import { useStore } from "@/lib/store";
import { HOUR, isCurrent, needsAck, screeningMessages, watchDeadlines } from "@/lib/watch-prep";
import { LifecycleBadge, Panel, PrecedenceBadge } from "@/components/ui";

const input = "mt-1 block rounded-md border border-line bg-white px-3 py-2 text-sm text-ink";
const types = [...new Set(MESSAGES.map((m) => m.type))];
type Focus = "all" | "unread" | "ack" | "urgent" | "changes";

export function WatchPrep() {
  const { userState, offline, syncQueue, lastSync } = useStore();
  const [hours, setHours] = useState("24");
  const [asOf, setAsOf] = useState(MOCK_NOW.toISOString().slice(0, 16));
  const [customStart, setCustomStart] = useState(new Date(MOCK_NOW.getTime() - 24 * HOUR).toISOString().slice(0, 16));
  const [focus, setFocus] = useState<Focus>("all");
  const [type, setType] = useState("all");
  const end = Date.parse(asOf + "Z");
  const start = hours === "custom" ? Date.parse(customStart + "Z") : end - Number(hours) * HOUR;
  const valid = Number.isFinite(start) && Number.isFinite(end) && start <= end;
  const windowMessages = valid ? screeningMessages(MESSAGES, start, end) : [];
  const unread = (m: typeof MESSAGES[number]) => userState[m.id]?.read !== "read";
  const urgent = (m: typeof MESSAGES[number]) => isCurrent(m) && ["FLASH", "IMMEDIATE"].includes(m.precedence);
  const changed = (m: typeof MESSAGES[number]) => m.lifecycle !== "ACTIVE" || !!m.relatesTo;
  const counts: Record<Focus, number> = {
    all: windowMessages.length,
    unread: windowMessages.filter(unread).length,
    ack: windowMessages.filter((m) => needsAck(m, userState, CURRENT_USER.commandSource)).length,
    urgent: windowMessages.filter(urgent).length,
    changes: windowMessages.filter(changed).length,
  };
  const labels: Record<Focus, string> = { all: "All messages", unread: "Unread", ack: "Pending acknowledgement", urgent: "FLASH / IMMEDIATE", changes: "Status / instruction changes" };
  const visible = windowMessages.filter((m) => (type === "all" || m.type === type) &&
    (focus === "all" || (focus === "unread" && unread(m)) || (focus === "ack" && needsAck(m, userState, CURRENT_USER.commandSource)) || (focus === "urgent" && urgent(m)) || (focus === "changes" && changed(m))));
  // Forward-looking obligations must include traffic older than the screening range.
  const known = MESSAGES.filter((m) => Date.parse(m.received) <= end);
  const deadlines = valid ? watchDeadlines(known, userState, end, CURRENT_USER.commandSource) : [];
  const carryover = valid ? known.filter((m) => Date.parse(m.received) < start && (needsAck(m, userState, CURRENT_USER.commandSource) || (urgent(m) && unread(m)))) : [];

  return <section className="mb-6 space-y-4" aria-label="Watch preparation">
    <Panel title="Prepare for Watch · Time Horizon">
      <p className="mb-3 text-sm text-muted">Screen received traffic, identify obligations, and review carryover before assuming the watch. All times are UTC (Zulu).</p>
      <div className="flex flex-wrap items-end gap-4">
        <label className="text-sm font-semibold">Screen messages from
          <select className={input} value={hours} onChange={(e) => setHours(e.target.value)}>
            {[4, 8, 12, 24, 48, 72, 168].map((h) => <option key={h} value={h}>Previous {h === 168 ? "7 days" : `${h} hours`}</option>)}
            <option value="custom">Custom range</option>
          </select>
        </label>
        {hours === "custom" && <label className="text-sm font-semibold">Start (UTC)<input className={input} type="datetime-local" value={customStart} onChange={(e) => setCustomStart(e.target.value)} /></label>}
        <label className="text-sm font-semibold">Preparation time / range end (UTC)<input className={input} type="datetime-local" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></label>
        <button className="rounded-md border border-line px-3 py-2 text-sm hover:bg-slate-50" onClick={() => { setAsOf(MOCK_NOW.toISOString().slice(0, 16)); setHours("24"); setFocus("all"); setType("all"); }}>Reset to demo watch</button>
      </div>
      <p className="mt-3 text-xs text-muted">Fictional prototype · default simulated watch: {fmtDateTime(MOCK_NOW)}. Selection uses received time, including both endpoints. State resets on reload.</p>
      {!valid && <p role="alert" className="mt-3 text-sm text-red-700">Enter a valid start and end; start must be at or before preparation time.</p>}
      {valid && <p className="mt-3 text-sm font-semibold">Screening {fmtDateTime(new Date(start))} – {fmtDateTime(new Date(end))}</p>}
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {(Object.keys(labels) as Focus[]).map((key) => <button key={key} aria-pressed={focus === key} onClick={() => setFocus(key)} className={`rounded-lg border p-3 text-left ${focus === key ? "border-navy-600 bg-navy-50" : "border-line hover:bg-slate-50"}`}><span className="block text-2xl font-bold">{counts[key]}</span><span className="text-sm">{labels[key]}</span></button>)}
      </div>
      <div className="mt-4 flex flex-wrap gap-2" aria-label="Message type counts">
        <button className="rounded border border-line px-3 py-1 text-sm" aria-pressed={type === "all"} onClick={() => setType("all")}>All types ({windowMessages.length})</button>
        {types.map((t) => <button key={t} aria-pressed={type === t} onClick={() => setType(t)} className={`rounded border px-3 py-1 text-sm ${type === t ? "border-navy-600 bg-navy-50" : "border-line"}`}>{t} ({windowMessages.filter((m) => m.type === t).length})</button>)}
      </div>
      <p className="mt-2 text-xs text-muted">Counts use recorded message types. OPREP: 0 (no OPREP records in this dataset). NAVADMIN / ALNAV are shown separately rather than inferred as GEN ADMIN. Summary counts overlap and cover the whole time window.</p>
    </Panel>

    <div className="grid items-start gap-4 xl:grid-cols-2">
      <Panel title={`Screening Queue (${visible.length})`}>
        <p className="mb-3 text-sm text-muted">{labels[focus]} · {type === "all" ? "all types" : type}. Open the official message to review text and acknowledge.</p>
        <ul className="max-h-[480px] space-y-3 overflow-auto">
          {visible.map((m) => <li key={m.id} className="rounded-md border border-line p-3 text-sm">
            <div className="mb-1 flex flex-wrap gap-2"><PrecedenceBadge p={m.precedence} /><LifecycleBadge l={m.lifecycle} /><span>{m.type}</span></div>
            <Link href={`/messages/${m.id}`} className="font-semibold text-link hover:underline">{m.subject}</Link>
            <p className="mt-1 text-xs text-muted">{m.reference} · {fmtDateTime(m.received)} · {unread(m) ? "Unread" : "Read"}</p>
            {needsAck(m, userState, CURRENT_USER.commandSource) && <p className="mt-1 text-amber-800">Acknowledgement pending{m.ackDue ? ` · due ${fmtDateTime(m.ackDue)}` : " · no deadline recorded"}</p>}
            {m.replacedBy && <p className="mt-1 text-red-700">Replaced by {m.replacedBy}; consult the current instruction.</p>}
            {m.relatesTo && <p className="mt-1 text-muted">Changes / replaces {m.relatesTo}; compare instructions.</p>}
          </li>)}
        </ul>
        {!visible.length && <p className="py-4 text-sm text-muted">No messages match this window and filter. Expand the horizon or select All messages / All types.</p>}
      </Panel>
      <div className="space-y-4">
        <Panel title={`Due in Next 24 Hours (${deadlines.filter((d) => d.due >= end).length}) · Overdue (${deadlines.filter((d) => d.due < end).length})`}>
          <p className="mb-3 text-sm text-muted">All known current messages, regardless of screening filter. Next 24 hours begins at preparation time. Action completion is not tracked; confirm with the listed owner. Date-only action suspenses use end of day UTC.</p>
          <ul className="space-y-3">{deadlines.map((d) => <li key={`${d.message.id}-${d.kind}`} className={`rounded-md border p-3 text-sm ${d.due < end ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
            <p className="font-semibold">{d.due < end ? "OVERDUE" : "DUE"} · {fmtDateTime(new Date(d.due))}{d.dateOnly ? " (date only)" : ""}</p>
            <p>{d.kind} · {d.owner}</p><Link href={`/messages/${d.message.id}`} className="text-link hover:underline">{d.message.reference} · View official message</Link>
          </li>)}</ul>
          {!deadlines.length && <p className="text-sm">No recorded overdue or next-24-hour deadlines. Review official text for obligations without structured deadlines.</p>}
        </Panel>
        <Panel title={`Carryover Outside Selected Period (${carryover.length})`}>
          <p className="mb-2 text-sm text-muted">Older current messages with pending acknowledgements or unread FLASH / IMMEDIATE traffic.</p>
          <ul className="space-y-2 text-sm">{carryover.map((m) => <li key={m.id}><Link href={`/messages/${m.id}`} className="text-link hover:underline">{m.reference} · {m.subject}</Link></li>)}</ul>
          {!carryover.length && <p className="text-sm">No matching carryover.</p>}
        </Panel>
        <Panel title="Before Assuming the Watch">
          <ul className="list-disc space-y-2 pl-5 text-sm">
            <li>{offline ? "EMCON / offline: verify cached traffic and alternate communications with the outgoing watch." : "Online mode: confirm message feed currency with the outgoing watch."} Last recorded sync: {fmtDateTime(lastSync)}. This prototype does not verify live feed health.</li>
            <li>{syncQueue.filter((q) => q.status === "Pending").length} items pending sync. An offline acknowledgement may still need transmission. <Link href="/offline" className="text-link hover:underline">Review sync queue</Link>.</li>
            <li>Confirm the owner, next report time, and escalation contact for each open action; escalate overdue obligations using command procedures.</li>
            <li>Compare amendments, corrections and replacements before acting. Review applicable standing orders, ongoing topics, and outgoing-watch notes below.</li>
            <li>Confirm alternate communications, unresolved incidents, and expected events with the outgoing watch. Message counts alone do not establish watch readiness.</li>
          </ul>
        </Panel>
      </div>
    </div>
  </section>;
}
