"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Clock, RefreshCw, X } from "lucide-react";
import { CURRENT_USER, ONGOING_TOPICS } from "@/lib/data";
import { MOCK_NOW, fmtDateTime } from "@/lib/format";
import { useStore } from "@/lib/store";
import { useCurrentUser } from "@/lib/current-user";
import { hasRole, MESSAGE_ADMIN } from "@/lib/roles";
import { HOUR, screeningMessages } from "@/lib/watch-prep";
import { changesInWindow, issueThreads, deadlineState, remaining, watchActions, type WatchAction, type ActionUpdate } from "@/lib/watch-workspace";
import { MessageReaderNavigation } from "@/components/message";
import { MessageDetail } from "@/app/(workspace)/messages/[id]/detail";
import { Button, Panel, PrecedenceBadge } from "@/components/ui";
import { WatchIssues } from "@/components/watch-issues";

type TrafficFilter = "all" | "unread" | "changes";
type ActionFilter = "open" | "ack" | "task" | "overdue" | "next24" | "watch" | "carryover" | "complete";
const field = "mt-1 block w-full rounded-md border border-line bg-white px-3 py-2 text-sm";
const link = "text-left font-medium text-link underline decoration-transparent underline-offset-2 hover:decoration-current";

export function WatchPrep() {
  const { userState, offline, syncQueue, lastSync, watchIssues, watchActionUpdates, messages } = useStore();
  const types: string[] = [...new Set(["OPREP", "GENADMIN", ...messages.map((m) => m.type)])];
  const [hours, setHours] = useState("24");
  const [asOf, setAsOf] = useState(MOCK_NOW.toISOString().slice(0, 16));
  const [customStart, setCustomStart] = useState(new Date(MOCK_NOW.getTime() - 24 * HOUR).toISOString().slice(0, 16));
  const [watchHours, setWatchHours] = useState("8");
  const [refreshed, setRefreshed] = useState<string | null>(null);
  const [trafficFilter, setTrafficFilter] = useState<TrafficFilter>("all");
  const [actionFilter, setActionFilter] = useState<ActionFilter>("open");
  const [type, setType] = useState("all");
  const [precedence, setPrecedence] = useState("all");
  const [query, setQuery] = useState("");
  const [showAllActions, setShowAllActions] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const reader = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const trafficRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => { const timer = setTimeout(() => setRefreshed(new Date().toISOString()), 0); return () => clearTimeout(timer); }, []);
  useEffect(() => {
    const dialog = reader.current;
    if (selected && dialog && !dialog.open) dialog.showModal();
    if (!selected && dialog?.open) { dialog.close(); opener.current?.focus({ preventScroll: true }); }
  }, [selected]);

  const end = Date.parse(asOf + "Z");
  const start = hours === "custom" ? Date.parse(customStart + "Z") : end - Number(hours) * HOUR;
  const valid = Number.isFinite(start) && Number.isFinite(end) && start <= end;
  const traffic = valid ? screeningMessages(messages, start, end) : [];
  const known = valid ? messages.filter((m) => Date.parse(m.received) <= end) : [];
  const actions = valid ? watchActions(known, userState, watchActionUpdates, start, end, CURRENT_USER.commandSource) : [];
  const open = actions.filter((a) => a.status !== "Complete");
  const carryover = open.filter((a) => a.carryover);
  const deadlines = deadlineState(actions, end);
  const changes = valid ? changesInWindow(known, start, end) : [];
  const threads = issueThreads(known).filter((group) => group.some((m) => traffic.some((t) => t.id === m.id)));
  const duringWatch = open.filter((a) => a.due !== null && a.due >= end && a.due <= end + Number(watchHours) * HOUR);
  const unresolvedIssues = watchIssues.filter((i) => i.status !== "Resolved");
  const pendingSync = syncQueue.filter((q) => q.status === "Pending").length;
  const stale = valid && lastSync.getTime() < end - HOUR;
  const unread = traffic.filter((m) => userState[m.id]?.read !== "read").length;
  const visibleTraffic = traffic.filter((m) => (type === "all" || m.type === type) && (precedence === "all" || m.precedence === precedence) &&
    (trafficFilter === "all" || (trafficFilter === "unread" && userState[m.id]?.read !== "read") || (trafficFilter === "changes" && changes.some((c) => c.message.id === m.id))) &&
    `${m.subject} ${m.reference} ${m.originator} ${m.sections.map((s) => s.body.join(" ")).join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  const actionLabels: Record<ActionFilter, string> = { open: "All open", ack: "Acknowledgements", task: "Tasks", overdue: "Overdue", next24: "Due within 24h", watch: "Due during watch", carryover: "Carryover", complete: "Reported complete" };
  const filteredActions = actions.filter((a) => actionFilter === "complete" ? a.status === "Complete" : a.status !== "Complete" &&
    (actionFilter === "open" || (actionFilter === "ack" && a.kind === "Acknowledgement") || (actionFilter === "task" && a.kind === "Task") ||
      (actionFilter === "overdue" && a.due !== null && a.due < end) || (actionFilter === "next24" && deadlines.next24.includes(a)) ||
      (actionFilter === "watch" && duringWatch.includes(a)) || (actionFilter === "carryover" && a.carryover)));
  const openSource = (id: string) => { if (!selected) opener.current = document.activeElement as HTMLElement; setSelected(id); reader.current?.scrollTo(0, 0); };
  const showTraffic = (filter: TrafficFilter, selectedType = "all") => { setTrafficFilter(filter); setType(selectedType); setQuery(""); setPrecedence("all"); trafficRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  const showActions = (filter: ActionFilter) => { setActionFilter(filter); setShowAllActions(true); actionsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  const reset = () => { setTrafficFilter("all"); setActionFilter("open"); setType("all"); setPrecedence("all"); setQuery(""); setShowAllActions(false); };
  const sourceButton = (id: string, text: string) => <button className={link} onClick={() => openSource(id)}>{text}</button>;
  return <>
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="flex items-center gap-2 text-2xl font-bold"><Clock className="size-7" aria-hidden />Watch Turnover</h1><p className="mt-1 text-sm text-muted">What happened. What needs action. Where to verify.</p></div>
    </div>

    <section className="space-y-4" aria-label="Watch turnover workspace">
      <Panel title="Reporting period">
        <div>
          <div className="no-print flex flex-wrap items-center gap-1" aria-label="Message time horizon">
            <span className="mr-2 text-xs font-semibold text-muted">Traffic received</span>
            {[4, 8, 12, 24, 48, 72, 168].map((h) => <button key={h} aria-pressed={hours === String(h)} onClick={() => { setHours(String(h)); reset(); }} className={`rounded-md px-3 py-2 text-sm font-semibold ${hours === String(h) ? "bg-navy-800 text-white" : "bg-slate-50 hover:bg-slate-100"}`}>{h === 168 ? "7d" : `${h}h`}</button>)}
            <button aria-pressed={hours === "custom"} onClick={() => setHours("custom")} className={`rounded px-3 py-2 text-sm ${hours === "custom" ? "bg-navy-800 text-white" : "bg-slate-50"}`}>Custom</button>
            <button disabled title="No recorded turnover time is available" className="rounded px-2 py-2 text-xs text-muted disabled:opacity-60">Since last turnover (unavailable)</button>
          </div>
          <p className="mt-2 text-sm font-semibold" data-testid="reporting-window">{valid ? `${fmtDateTime(new Date(start))} → ${fmtDateTime(new Date(end))}` : "Invalid reporting period"}</p>
          <p className="mt-1 text-xs text-muted">DEMO reporting clock · all times UTC/Zulu. Last view refresh: {refreshed ? fmtDateTime(refreshed) : "Loading…"} (actual UTC; does not refresh ingest).</p>
          <details open={hours === "custom" ? true : undefined} className="no-print mt-2 text-sm"><summary className="cursor-pointer text-link">Adjust reporting dates &amp; watch length</summary><div className="mt-3 grid gap-3 sm:grid-cols-3">
            {hours === "custom" && <label>Start (UTC)<input className={field} type="datetime-local" value={customStart} onChange={(e) => setCustomStart(e.target.value)} /></label>}
            <label>Watch starts / reporting end (UTC)<input className={field} type="datetime-local" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></label>
            <label>Incoming watch length<select className={field} value={watchHours} onChange={(e) => setWatchHours(e.target.value)}>{[4, 8, 12, 24].map((h) => <option key={h} value={h}>{h} hours</option>)}</select></label>
          </div></details>
          {!valid && <p role="alert" className="mt-2 text-sm text-red-700">Enter valid dates with start at or before end.</p>}
        </div>
      </Panel>

      <div className={`flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs ${offline || stale ? "border-amber-300 bg-amber-50 text-amber-950" : "border-line bg-slate-50"}`} role="status">
        <span><strong>{offline ? "OFFLINE · cached demo" : "Demo online mode · live feed unverified"}</strong> · Last successful ingest: unavailable · Last sync: {fmtDateTime(lastSync)}{stale ? " · STALE against reporting clock" : ""}</span>
        <div className="flex items-center gap-3"><Link href="/network" className={link}>{pendingSync} pending sync</Link><button className={link} onClick={() => setRefreshed(new Date().toISOString())}><RefreshCw className="mr-1 inline size-3" />Refresh view</button></div>
      </div>



      <div className="rounded-lg border border-line bg-white p-3" aria-label="Traffic and action counts">
        <div className="flex flex-wrap gap-2">
          {([['Traffic', traffic.length, 'all', trafficFilter === 'all'], ['Unread', unread, 'unread', trafficFilter === 'unread'], ['Changed / corrected', changes.length, 'changes', trafficFilter === 'changes']] as const).map(([label, count, filter, active]) => <button key={label} aria-pressed={active} className={`rounded-md border px-3 py-2 text-sm ${active ? "border-navy-700 bg-navy-50" : "border-line"}`} onClick={() => showTraffic(filter)}><strong className="mr-2">{count}</strong>{label}</button>)}
          {([['Ack required', open.filter(a => a.kind === 'Acknowledgement').length, 'ack'], ['Overdue', deadlines.overdue.length, 'overdue'], ['Due within 24h', deadlines.next24.length, 'next24']] as const).map(([label, count, filter]) => <button key={filter} aria-pressed={actionFilter === filter} className={`rounded-md border px-3 py-2 text-sm ${actionFilter === filter ? "border-navy-700 bg-navy-50" : filter === 'overdue' && count ? "border-red-300 bg-red-50 text-red-800" : "border-line"}`} onClick={() => showActions(filter)}><strong className="mr-2">{count}</strong>{label}</button>)}
          <button className="ml-auto text-xs text-link underline" onClick={reset}>Reset filters</button>
        </div>
        <p className="mt-2 text-xs text-muted">Traffic counts: selected received period. Action counts: all known current messages, including carryover. Status counts overlap. User state and notes reflect this session, not a historical snapshot.</p>
        <div className="mt-2 flex flex-wrap gap-2" aria-label="Message type counts">{types.map((t) => <button key={t} aria-pressed={type === t} className={`rounded px-2 py-1 text-xs ${type === t ? "bg-navy-800 text-white" : "bg-slate-100"}`} onClick={() => showTraffic("all", t)}>{t} <strong>{traffic.filter((m) => m.type === t).length}</strong></button>)}</div>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <div ref={actionsRef} className="scroll-mt-4" id="watch-actions"><Panel title="Watch Action Queue" action={<span className="text-xs text-muted">{open.length} unresolved</span>}>
            <div className="no-print mb-3 flex flex-wrap items-center gap-2"><label className="text-xs">Show <select aria-label="Action filter" className="ml-2 rounded border border-line bg-white px-2 py-1.5 text-sm" value={actionFilter} onChange={(e) => { setActionFilter(e.target.value as ActionFilter); setShowAllActions(true); }}>{Object.entries(actionLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><span className="text-xs text-muted">Overdue → earliest deadline → no recorded deadline</span></div>
            <p className="mb-3 text-xs text-muted">Tasks start open with completion unverified. Reading or acknowledging does not close them. Updates below are watch-reported, not verified.</p>
            <div className="divide-y divide-line">{(showAllActions ? filteredActions : filteredActions.slice(0, 4)).map((action) => <ActionRow key={action.id} action={action} asOf={end} openSource={openSource} />)}</div>
            {!filteredActions.length && <p className="py-4 text-sm text-muted">{valid ? "No matching tracked actions. Check source text for unrecorded requirements." : "Action information unavailable until reporting dates are valid."}</p>}
            {!showAllActions && filteredActions.length > 4 && <button onClick={() => setShowAllActions(true)} className="mt-3 text-sm text-link underline">Show all {filteredActions.length} actions</button>}
          </Panel></div>
          <Panel title="Changes Since Last Watch" action={<span className="text-xs text-muted">Selected-period proxy</span>}>
            <p className="mb-3 text-xs text-muted">No previous-watch snapshot or turnover time exists. These are recorded lifecycle changes received in the selected period; resolved issues below are watch-reported.</p>
            {changes.map((change) => <details key={change.message.id} className="border-t border-line py-3 first:border-0">
              <summary className="cursor-pointer text-sm font-semibold">{change.message.reference} · {change.message.lifecycle === "ACTIVE" ? "Linked new direction" : change.message.lifecycle}</summary>
              <p className="mt-2 text-sm">{change.explanation}</p>
              {change.deadlineChanged && <p className="mt-1 text-xs text-amber-900">Recorded task suspense differs: {change.previous?.actionItem?.suspense || "Not recorded"} → {change.message.actionItem?.suspense || "Not recorded"}. Verify scope in both messages.</p>}
              <div className="mt-2 flex flex-wrap gap-3 text-sm">{sourceButton(change.message.id, "Current record")}{change.previous && sourceButton(change.previous.id, "Earlier version")}{change.replacement && sourceButton(change.replacement.id, "Replacement")}</div>
              {change.previous && <div className="mt-2 space-y-2 text-xs"><p><strong>Earlier action passage:</strong> {change.oldPassage || "Not recorded"}</p><p><strong>New action passage:</strong> {change.newPassage || "Not recorded"}</p></div>}
            </details>)}
            {!changes.length && <p className="text-sm text-muted">No lifecycle changes recorded in this period; no claim about unrecorded changes.</p>}
            {threads.length > 0 && <details className="mt-3 border-t border-line pt-3"><summary className="cursor-pointer text-sm text-link">Developing issues · explicitly linked traffic ({threads.length})</summary><ul className="mt-3 space-y-3 text-sm">{threads.map((group) => <li key={group[0].id}><p className="font-semibold">{group[0].subject}</p><div className="mt-1 flex flex-wrap gap-3">{group.map((m) => <button key={m.id} className={link} onClick={() => openSource(m.id)}>{m.reference} · {m.lifecycle}</button>)}</div></li>)}</ul><p className="mt-2 text-xs text-muted">Grouped by recorded relationships, not inferred operational implications.</p></details>}
            {watchIssues.filter((i) => i.status === "Resolved").map((i) => <p key={i.id} className="mt-2 text-sm">Watch-reported resolved issue: {i.issue} · {i.by} · {fmtDateTime(i.at)}</p>)}
          </Panel>
        </div>
        <aside className="space-y-4" aria-label="Deadlines and carryover">
          <Panel title="Upcoming deadlines">
            <p className="text-xs text-muted">From watch start: {valid ? fmtDateTime(new Date(end)) : "Unavailable"}. Separate from traffic received.</p>
            <div className="my-3 flex flex-wrap gap-2"><button className="rounded bg-amber-50 px-3 py-2 text-sm" onClick={() => showActions("watch")}><strong>{duringWatch.length}</strong> during {watchHours}h watch</button><button className="rounded bg-slate-50 px-3 py-2 text-sm" onClick={() => showActions("next24")}><strong>{deadlines.next24.length}</strong> next 24h</button></div>
            <p className="mb-3 text-sm text-muted">{valid ? deadlines.message : "Deadline information unavailable: invalid reporting dates."}</p>
            {[...deadlines.overdue, ...deadlines.next24].map((a) => <button key={a.id} onClick={() => openSource(a.message.id)} className={`mb-3 block w-full border-l-2 pl-3 text-left text-sm ${a.due! < end ? "border-red-600" : "border-amber-400"}`}><span className="block font-semibold">{a.text}</span><span className={`block text-xs ${a.due! < end ? "text-red-700" : "text-muted"}`}>{remaining(a.due, end)} · {fmtDateTime(new Date(a.due!))}</span></button>)}
            <button className="text-xs text-link underline" onClick={() => showActions("open")}>{deadlines.unknown.length} open requirements without usable deadlines</button>
            <p className="mt-3 text-xs text-muted">Structured deadline coverage only. Missing / unreviewed source text can contain additional requirements. Date-only suspenses use end of UTC day.</p>
          </Panel>
          <Panel title="Unresolved carryover" action={<button className="text-xs text-link underline" onClick={() => showActions("carryover")}>View {carryover.length}</button>}>
            <p className="mb-2 text-xs text-muted">Older requirements remain visible outside the received window.</p>
            {carryover.slice(0, 4).map((a) => <div key={a.id} className="mb-3 text-sm"><button className={link} onClick={() => openSource(a.message.id)}>{a.text}</button><p className="text-xs text-muted">{a.owner} · {remaining(a.due, end)} · Carryover</p></div>)}
            {!carryover.length && <p className="text-sm text-muted">No older structured requirements found. Review outgoing-watch notes below.</p>}
            {unresolvedIssues.map((issue) => <p key={issue.id} className="mt-2 text-sm"><a href="#watch-notes" className={link}>{issue.issue}</a> · {issue.status} · {issue.owner || "Unassigned"}</p>)}
          </Panel>
          <details className="rounded-lg border border-line bg-white p-4"><summary className="cursor-pointer text-sm font-semibold">Ongoing topics ({ONGOING_TOPICS.length})</summary><ul className="mt-3 space-y-2 text-sm">{ONGOING_TOPICS.map((t) => <li key={t.topic}>{t.topic} · {t.status}<span className="block text-xs text-muted">Last update: {t.lastUpdate} · mock context, not a verified current assessment</span></li>)}</ul></details>
        </aside>
      </div>

      <div ref={trafficRef} className="scroll-mt-4" id="watch-traffic"><Panel title={`Message traffic · ${visibleTraffic.length}`} action={<span className="text-xs text-muted">Source records</span>}>
        <div className="no-print mb-3 flex flex-wrap gap-3">
          <label className="min-w-0 flex-1 text-xs">Search traffic<input className={field} placeholder="Subject, reference, originator or text" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
          <label className="text-xs">Traffic status<select className={field} value={trafficFilter} onChange={(e) => setTrafficFilter(e.target.value as TrafficFilter)}><option value="all">All traffic</option><option value="unread">Unread</option><option value="changes">Changed / corrected</option></select></label>
          <label className="text-xs">Message type<select className={field} value={type} onChange={(e) => setType(e.target.value)}><option value="all">All types</option>{types.map((t) => <option key={t}>{t}</option>)}</select></label>
          <label className="text-xs">Precedence<select className={field} value={precedence} onChange={(e) => setPrecedence(e.target.value)}><option value="all">All precedences</option>{["FLASH", "IMMEDIATE", "PRIORITY", "ROUTINE"].map((p) => <option key={p}>{p}</option>)}</select></label>
        </div>
        <p className="mb-3 text-xs text-muted">Precedence describes transmission priority, not a task deadline. OPREP / GENADMIN zero counts reflect absent demo records.</p>
        <ul className="divide-y divide-line">{visibleTraffic.map((m) => <li key={m.id} className="py-3"><div className="flex flex-wrap items-center gap-2 text-xs text-muted"><span>{m.reference}</span><PrecedenceBadge p={m.precedence} /><span>{m.type}</span><span>{m.lifecycle}</span><span>{userState[m.id]?.read === "read" ? "Read" : "Unread"}</span></div><button className={`${link} mt-1 text-sm`} onClick={() => openSource(m.id)}>{m.subject}</button><p className="mt-1 text-xs text-muted">Received {fmtDateTime(m.received)} · {m.originator}</p></li>)}</ul>
        {!visibleTraffic.length && <p className="py-4 text-sm">No matching received traffic. Carryover and actions remain above; expand the period or reset filters.</p>}
      </Panel></div>
      <div id="watch-notes" className="scroll-mt-4"><WatchIssues openSource={openSource} /></div>
    </section>

    <dialog ref={reader} aria-label="Watch source reader" onCancel={(e) => { e.preventDefault(); setSelected(null); }} className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-full max-w-[1100px] overflow-y-auto overscroll-contain border-l border-line bg-white p-4 text-ink shadow-2xl backdrop:bg-black/40 sm:p-6">
      {selected && <MessageReaderNavigation value={openSource}>
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-line pb-3"><p className="text-sm font-semibold">Source detail · watch turnover stays in place</p><Button icon={X} onClick={() => setSelected(null)}>Close source</Button></div>
        <p className="mb-3 text-xs text-muted"><a href={`/messages/${selected}`} target="_blank" rel="noreferrer" className={link}>Open dedicated message record in a new tab →</a></p>
        <MessageDetail key={selected} id={selected} onBack={() => setSelected(null)} backLabel="Back to Watch Turnover" />
        <Panel title="Watch context · separate from official text" className="mt-4">
          <h3 className="text-sm font-semibold">Action history</h3>
          {actions.filter((a) => a.message.id === selected).map((a) => <div key={a.id} className="mt-2 text-sm"><p>{a.text} · {a.status}</p>{a.history.length ? a.history.map((h, i) => <p className="text-xs text-muted" key={i}>{h.status} · {h.note || "No note"} · {h.by} · {fmtDateTime(h.at)} (actual UTC)</p>) : <p className="text-xs text-muted">No watch-reported action updates.</p>}</div>)}
          <h3 className="mt-3 text-sm font-semibold">Linked watch notes</h3>{watchIssues.filter((i) => i.sourceId === selected).map((i) => <p key={i.id} className="mt-1 text-sm">{i.issue} · {i.status} · Next: {i.nextStep || "Not recorded"} · {i.owner || "Unassigned"} · {i.by} · {fmtDateTime(i.at)}</p>)}
          {!watchIssues.some((i) => i.sourceId === selected) && <p className="text-xs text-muted">No linked structured notes. Narrative notes remain in the briefing.</p>}
          <h3 className="mt-3 text-sm font-semibold">Verified version links</h3>{known.filter(m => m.id === selected || m.reference === known.find(k => k.id === selected)?.relatesTo || m.reference === known.find(k => k.id === selected)?.replacedBy).map(m => <button key={m.id} className={`${link} mr-3 text-sm`} onClick={() => openSource(m.id)}>{m.reference} · {m.lifecycle}</button>)}
        </Panel>
      </MessageReaderNavigation>}
    </dialog>
  </>;
}

function ActionRow({ action, asOf, openSource }: { action: WatchAction; asOf: number; openSource: (id: string) => void }) {
  const { updateWatchAction, acknowledge, offline } = useStore();
  const [status, setStatus] = useState<ActionUpdate["status"]>(action.status);
  const [note, setNote] = useState("");
  const canAck = hasRole(useCurrentUser(), MESSAGE_ADMIN);
  const overdue = action.due !== null && action.due < asOf && action.status !== "Complete";
  const last = action.history.at(-1);
  return <article className="py-3" data-testid="watch-action">
    <div className="flex flex-wrap items-center gap-2 text-xs"><span className={`rounded px-2 py-0.5 font-semibold ${overdue ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"}`}>{overdue ? "OVERDUE" : action.status === "Complete" ? "Reported complete" : action.status}{action.kind === "Task" && !action.history.length ? " · completion unverified" : ""}</span><span>{action.kind}</span>{action.carryover && <span className="font-semibold">Carryover</span>}<span className="text-muted">{remaining(action.due, asOf)}</span></div>
    <h3 className="mt-2 text-sm font-semibold">{action.text}</h3>
    <p className="mt-1 text-xs text-muted">{action.message.source} · {action.owner} · {action.due !== null ? fmtDateTime(new Date(action.due)) : "No deadline recorded"}{action.dateOnly ? " (date only; exact time unverified)" : ""}</p>
    <details className="mt-2 text-sm"><summary className="cursor-pointer text-link">Action details &amp; next step</summary>
      <p className="mt-2"><strong>Subject:</strong> {action.message.subject}</p>
      <p className="mt-1"><strong>Significance:</strong> Recorded {action.kind === "Task" ? "task assigned in the source" : "receipt acknowledgement requirement"}. Operational impact is not assessed.</p>
      <p className="mt-1"><strong>Blocker / update:</strong> {last?.note || "Not recorded; confirm with owner."}</p>
      <p className="mt-1"><strong>Next:</strong> {action.kind === "Acknowledgement" ? "Review official text, then acknowledge receipt. Substantive tasks stay open." : "Confirm progress and completion evidence with the owner. Report changes below."}</p>
      <p className="mt-2 text-xs font-semibold">Source passage · {action.message.reference} · Action section</p><blockquote className="mt-1 whitespace-pre-wrap border-l-2 border-line pl-3 text-xs">{action.passage}</blockquote>
      <div className="mt-2 flex flex-wrap items-center gap-3"><button className={link} onClick={() => openSource(action.message.id)}>Open full source</button><PrecedenceBadge p={action.message.precedence} /><span className="text-xs text-muted">Transmission precedence only</span></div>
      {action.message.aiSummary && <details className="mt-2 border-l-2 border-purple-300 pl-3 text-xs"><summary className="cursor-pointer text-purple-800">Generated summary · not authoritative</summary><p className="mt-1">{action.message.aiSummary}</p></details>}
      {action.kind === "Acknowledgement" ? (canAck ? <Button className="mt-3" size="sm" onClick={() => acknowledge(action.message.id)}>Acknowledge receipt{offline ? " (queue offline)" : ""}</Button> : <p className="mt-3 text-sm font-semibold text-red-800">The Message Admin sends this acknowledgement.</p>) : <form className="no-print mt-3 space-y-2 rounded bg-slate-50 p-3" onSubmit={(e) => { e.preventDefault(); updateWatchAction(action.id, status, note.trim()); setNote(""); }}>
        <label className="block text-xs">Watch-reported task status<select className={field} value={status} onChange={(e) => setStatus(e.target.value as ActionUpdate["status"])}>{["Open", "In progress", "Blocked", "Complete"].map((s) => <option key={s}>{s}</option>)}</select></label>
        <label className="block text-xs">Progress / blocker / completion evidence<textarea required maxLength={2000} rows={2} className={field} value={note} onChange={(e) => setNote(e.target.value)} /></label><Button type="submit" size="sm" disabled={!note.trim()}>Save task update</Button>
      </form>}
      {action.history.length > 0 && <ul className="mt-3 space-y-1 text-xs text-muted">{action.history.map((h, i) => <li key={i}>{h.status} · {h.note} · {h.by} · {fmtDateTime(h.at)} (actual UTC)</li>)}</ul>}
    </details>
  </article>;
}
