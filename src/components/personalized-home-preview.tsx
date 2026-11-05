"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, BellRing, CalendarClock, Check, ChevronRight, Home, Mail, Plus, Settings2, Star, X } from "lucide-react";
import { useCurrentUser } from "@/lib/current-user";
import { useStore } from "@/lib/store";
import { hasRole, MESSAGE_ADMIN } from "@/lib/roles";
import { needsOwnAck } from "@/lib/data";
import { MOCK_NOW, fmtDateTime, fmtTime } from "@/lib/format";
import { currentMessage, actionDeadline, remaining } from "@/lib/watch-workspace";
import { Button, Panel, PrecedenceBadge } from "@/components/ui";
import { MessageReaderNavigation } from "@/components/message";
import { MessageDetail } from "@/app/(workspace)/messages/[id]/detail";
import type { Community, Message } from "@/lib/types";

const HOUR = 3_600_000;
const TOPICS: Community[] = ["Readiness", "Training & Education", "Safety", "Cybersecurity", "Personnel", "Maintenance", "Policy", "Submarine Warfare"];
type View = { id: string; name: string; topics: Community[]; personal?: boolean; description: string };
const EXAMPLES: View[] = [
  { id: "watch", name: "Watch Officer", topics: [], description: "Traffic, outstanding requirements, and changes for the incoming watch." },
  { id: "training", name: "Training Officer", topics: ["Training & Education"], description: "Training-related traffic and recorded requirements." },
  { id: "safety", name: "Safety Officer", topics: ["Safety"], description: "Safety messages and recorded follow-up requirements." },
];
const input = "mt-1 block w-full rounded-md border border-line bg-white px-3 py-2 text-sm";
const textLink = "text-left text-link hover:underline";
type Preferences = { defaultId: string; personal: View[] };

function readPreferences(key: string): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    if (!value || !Array.isArray(value.personal)) return { defaultId: "watch", personal: [] };
    const personal: View[] = value.personal.slice(0, 8).filter((v: View) => typeof v.id === "string" && v.id.startsWith("personal-") && typeof v.name === "string" && v.name.trim() && v.name.length <= 60 && Array.isArray(v.topics) && v.topics.every((t) => TOPICS.includes(t))).map((v: View) => ({ id: v.id, name: v.name, topics: v.topics, personal: true, description: "Your saved topic view." }));
    const defaultId = [...EXAMPLES, ...personal].some((v) => v.id === value.defaultId) ? value.defaultId : "watch";
    return { defaultId, personal };
  } catch { return { defaultId: "watch", personal: [] }; }
}

export function PersonalizedHomePreview() {
  const user = useCurrentUser();
  const { messages, messageSource, userState, acknowledge, offline, syncQueue } = useStore();
  const [preferences, setPreferences] = useState<Preferences>({ defaultId: "watch", personal: [] });
  const [viewId, setViewId] = useState("watch");
  const [hours, setHours] = useState("24");
  const [scope, setScope] = useState("all");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [manage, setManage] = useState(false);
  const [name, setName] = useState("");
  const [topics, setTopics] = useState<Community[]>([]);
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const drawer = useRef<HTMLDialogElement>(null);
  const focusBefore = useRef<HTMLElement | null>(null);
  const traffic = useRef<HTMLDivElement>(null);
  const attention = useRef<HTMLDivElement>(null);
  const deadlines = useRef<HTMLDivElement>(null);
  const key = `anchor:personalized-home-preview:${user.id}`;
  useEffect(() => {
    const timer = setTimeout(() => { const saved = readPreferences(key); setPreferences(saved); setViewId(saved.defaultId); }, 0);
    return () => clearTimeout(timer);
  }, [key]);
  useEffect(() => {
    if (selected && !drawer.current?.open) drawer.current?.showModal();
    if (!selected && drawer.current?.open) { drawer.current.close(); focusBefore.current?.focus({ preventScroll: true }); }
  }, [selected]);
  const save = (next: Preferences) => {
    setPreferences(next);
    try { localStorage.setItem(key, JSON.stringify(next)); setNotice("Saved for your account in this browser. Preview preferences do not sync between devices."); }
    catch { setNotice("Browser storage is unavailable. This preview choice will last only for this visit."); }
  };
  const views = [...EXAMPLES, ...preferences.personal];
  const view = views.find((v) => v.id === viewId) || EXAMPLES[0];
  const isDefault = view.id === preferences.defaultId;
  const end = MOCK_NOW.getTime();
  const start = end - Number(hours) * HOUR;
  const known = messages.filter((m) => Date.parse(m.received) <= end);
  const mine = (m: Message) => !!m.actionItem?.assignedTo && [user.name.toLowerCase(), user.login.toLowerCase()].includes(m.actionItem.assignedTo.toLowerCase());
  const matches = (m: Message) => !view.topics.length || m.communities.some((t) => view.topics.includes(t));
  const relevant = known.filter((m) => matches(m) && (scope === "all" || (scope === "mine" ? mine(m) : !mine(m))) && Date.parse(m.received) >= start).sort((a,b) => Date.parse(b.received) - Date.parse(a.received));
  const pending = known.filter((m) => needsOwnAck(m) && currentMessage(m) && !userState[m.id]?.acknowledgedAt);
  const taskDeadlines = known.filter((m) => currentMessage(m) && m.actionItem).map((m) => ({ message: m, text: m.actionItem!.text, owner: m.actionItem!.assignedTo || "Unassigned", ...actionDeadline(m.actionItem!.suspense) }));
  const overdueMine = taskDeadlines.filter((d) => mine(d.message) && d.due !== null && d.due < end);
  const upcoming = [
    ...pending.map((m) => ({ message: m, text: `Acknowledge ${m.reference}`, owner: "Message Admin", ...actionDeadline(m.ackDue) })),
    ...taskDeadlines.filter((d) => matches(d.message)),
  ].filter((d) => d.due !== null && d.due >= end).sort((a,b) => a.due! - b.due!);
  const due24 = upcoming.filter((d) => d.due! <= end + 24 * HOUR);
  const unread = relevant.filter((m) => userState[m.id]?.read !== "read").length;
  const changed = relevant.filter((m) => m.lifecycle !== "ACTIVE" || m.relatesTo || m.replacedBy);
  const visible = relevant.filter((m) => (filter === "all" || (filter === "unread" && userState[m.id]?.read !== "read") || (filter === "changed" && changed.includes(m))) && `${m.subject} ${m.reference} ${m.originator}`.toLowerCase().includes(search.toLowerCase()));
  const canAck = hasRole(user, MESSAGE_ADMIN);
  const open = (id: string) => { if (!selected) focusBefore.current = document.activeElement as HTMLElement; setSelected(id); drawer.current?.scrollTo(0,0); };
  const setView = (id: string) => { setViewId(id); setScope("all"); setFilter("all"); setSearch(""); setNotice(""); };
  const defaultName = views.find((v) => v.id === preferences.defaultId)?.name || "Watch Officer";

  return <div className="mx-auto max-w-[1500px] space-y-5 pb-4">
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted"><span className="flex items-center gap-2"><Home className="size-3.5" aria-hidden /> Home <ChevronRight className="size-3" aria-hidden /> My Briefing</span><span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 font-semibold text-amber-900">INTERACTIVE DESIGN PREVIEW</span></div>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="mb-1 text-sm text-muted">Welcome back, {user.name}</p><h1 className="text-3xl font-bold tracking-tight text-navy-950">My Briefing</h1><p className="mt-1.5 text-sm text-muted">Your responsibilities. The messages that matter.</p></div>
      <div className="text-xs leading-relaxed text-muted sm:text-right"><span className="font-semibold text-ink">Demo reporting clock</span><br />{fmtDateTime(MOCK_NOW)}<br /><span>{offline ? "Offline · cached traffic" : messageSource === "server" ? "Local message store" : "Bundled demo traffic"}</span></div>
    </div>

    <section className="rounded-xl border border-line bg-white shadow-sm" aria-label="View controls">
      <div className="flex flex-wrap items-center gap-4 p-4 sm:p-5">
        <div className="min-w-0 flex-1 sm:min-w-60"><label className="text-xs font-semibold uppercase tracking-wider text-muted" htmlFor="personalized-view">Viewing as</label><div className="mt-1 flex flex-wrap items-center gap-2"><select id="personalized-view" className="max-w-full rounded-lg border border-line bg-slate-50 px-3 py-2 text-lg font-bold text-navy-900" value={view.id} onChange={(e) => setView(e.target.value)}><optgroup label="Example duty views (not official assignments)">{EXAMPLES.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</optgroup>{preferences.personal.length > 0 && <optgroup label="My personal views">{preferences.personal.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</optgroup>}</select>{isDefault && <span className="inline-flex items-center gap-1 rounded-full bg-navy-50 px-2 py-1 text-xs font-semibold text-navy-800"><Star className="size-3 fill-current" aria-hidden />My default</span>}</div><p className="mt-2 text-xs text-muted">{view.description}</p></div>
        <div className="flex flex-wrap items-end gap-2"><label className="text-xs text-muted">Received period<select aria-label="Received period" className="mt-1 block rounded-md border border-line bg-white px-3 py-2 text-sm text-ink" value={hours} onChange={(e) => setHours(e.target.value)}>{[4,8,12,24,48,72,168].map((h) => <option value={h} key={h}>{h === 168 ? "Last 7 days" : `Last ${h} hours`}</option>)}</select></label><Button size="sm" icon={Star} disabled={isDefault} onClick={() => save({ ...preferences, defaultId: view.id })}>Set as default</Button><Button size="sm" icon={Settings2} onClick={() => setManage(!manage)}>Manage views</Button></div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-slate-50 px-4 py-2.5 text-xs text-muted"><span>Received {fmtDateTime(new Date(start))} → {fmtDateTime(MOCK_NOW)}</span><span>Default: <strong className="text-ink">{defaultName}</strong> · Switching views keeps your time period</span></div>
    </section>
    {notice && <p role="status" className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">{notice}</p>}
    {manage && <Panel title="Manage my views" action={<button aria-label="Close view manager" onClick={() => setManage(false)}><X className="size-4" /></button>}>
      <p className="mb-3 text-sm text-muted">Official duty assignments will come from administrators. These three example duties demonstrate the design. Personal views and defaults below are saved only in this browser.</p>
      <form onSubmit={(e) => { e.preventDefault(); const id = `personal-${crypto.randomUUID()}`; const newView: View = { id, name: name.trim(), topics, personal: true, description: "Your saved topic view." }; save({ ...preferences, personal: [...preferences.personal, newView] }); setView(id); setName(""); setTopics([]); }} className="space-y-3 rounded-lg bg-slate-50 p-3">
        <label className="block text-sm font-semibold">Personal view name<input required maxLength={60} className={input} placeholder="e.g. Readiness & training" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <fieldset><legend className="mb-2 text-xs text-muted">Include topics · select at least one</legend><div className="flex flex-wrap gap-2">{TOPICS.map((t) => <label key={t} className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs ${topics.includes(t) ? "border-navy-700 bg-navy-50" : "border-line bg-white"}`}><input type="checkbox" checked={topics.includes(t)} onChange={(e) => setTopics(e.target.checked ? [...topics,t] : topics.filter(x=>x!==t))} />{t}</label>)}</div></fieldset>
        <Button type="submit" size="sm" variant="primary" icon={Plus} disabled={!name.trim() || !topics.length || preferences.personal.length >= 8}>Create personal view</Button>
      </form>
      {preferences.personal.map((v) => <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm" key={v.id}><span>{v.name} · {v.topics.join(", ")}</span><button className="text-xs text-link underline" onClick={() => { const next = { defaultId: preferences.defaultId === v.id ? "watch" : preferences.defaultId, personal: preferences.personal.filter(p=>p.id!==v.id) }; save(next); if(view.id===v.id)setView("watch"); }}>Remove personal view</button></div>)}
    </Panel>}

    <div className="grid gap-3 sm:grid-cols-3">
      <button onClick={() => attention.current?.scrollIntoView({behavior:"smooth"})} className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-left"><span className="rounded-lg bg-white p-2.5 text-amber-800"><BellRing className="size-5" aria-hidden /></span><div><strong className="text-2xl text-amber-950">{pending.length + overdueMine.length}</strong><span className="ml-2 text-sm font-semibold text-amber-950">Need attention</span><p className="mt-0.5 text-xs text-amber-900">Mandatory items across every view</p></div></button>
      <button onClick={() => { setFilter("unread"); traffic.current?.scrollIntoView({behavior:"smooth"}); }} className="flex items-center gap-3 rounded-xl border border-line bg-white p-4 text-left"><span className="rounded-lg bg-navy-50 p-2.5 text-navy-700"><Mail className="size-5" aria-hidden /></span><div><strong className="text-2xl text-navy-950">{unread}</strong><span className="ml-2 text-sm font-semibold">Unread in this view</span><p className="mt-0.5 text-xs text-muted">Within your selected received period</p></div></button>
      <button onClick={() => deadlines.current?.scrollIntoView({behavior:"smooth"})} className="flex items-center gap-3 rounded-xl border border-line bg-white p-4 text-left"><span className="rounded-lg bg-navy-50 p-2.5 text-navy-700"><CalendarClock className="size-5" aria-hidden /></span><div><strong className="text-2xl text-navy-950">{due24.length}</strong><span className="ml-2 text-sm font-semibold">Due within 24 hours</span><p className="mt-0.5 text-xs text-muted">Includes recorded older requirements</p></div></button>
    </div>

    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-4">
        <div ref={attention} className="scroll-mt-4"><Panel title="Needs my attention" action={<span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-900">Always visible</span>}>
          {pending.map((m) => <article key={m.id} className="border-b border-line pb-3 last:border-0 last:pb-0"><div className="mb-1 flex flex-wrap items-center gap-2 text-xs"><span className="font-semibold text-amber-900">Acknowledgement required</span><span className="text-muted">Command-wide · {m.reference}</span></div><button className={`${textLink} text-sm font-semibold`} onClick={() => open(m.id)}>{m.subject}</button><div className="mt-2 flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-muted">{m.ackDue ? `Due ${fmtDateTime(m.ackDue)}` : "No deadline recorded"} · Receipt only</span>{canAck ? <Button size="sm" onClick={() => acknowledge(m.id)}>Acknowledge receipt</Button> : <span className="text-xs text-muted">Awaiting Message Admin</span>}</div></article>)}
          {overdueMine.map((d) => <article key={d.message.id} className="mt-3 rounded border border-red-200 bg-red-50 p-3 text-sm"><strong className="text-xs text-red-800">OVERDUE · MINE</strong><button className={`mt-1 block ${textLink}`} onClick={() => open(d.message.id)}>{d.text}</button><p className="mt-1 text-xs">{remaining(d.due,end)} · Completion not verified</p></article>)}
          {!pending.length && !overdueMine.length && <p className="text-sm text-muted">No recorded mandatory acknowledgements or overdue tasks assigned to you. This is not a live operational all-clear.</p>}
          <p className="mt-3 text-[11px] text-muted">Pinned items ignore view and received-period filters. A command-designated alert feed is not connected in this preview.</p>
        </Panel></div>
        <div ref={traffic} className="scroll-mt-4"><Panel title={`Relevant messages · ${visible.length}`} action={<button className="text-xs text-link underline" onClick={() => { setScope("all");setFilter("all");setSearch(""); }}>Reset filters</button>}>
          <div className="mb-3 flex flex-wrap gap-1.5" aria-label="Message scope">{[{id:"all",label:"All relevant"},{id:"mine",label:"Mine"},{id:"department",label:"My department"},{id:"command",label:"Command-wide"}].map((s) => <button key={s.id} disabled={s.id==="department"} title={s.id==="department"?"Department assignments are not connected yet":undefined} aria-pressed={scope===s.id} onClick={() => setScope(s.id)} className={`rounded-full px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${scope===s.id?"bg-navy-800 text-white":"bg-slate-100 text-muted"}`}>{s.label}</button>)}</div>
          <div className="mb-2 flex flex-wrap gap-3 border-b border-line pb-3"><input aria-label="Search relevant messages" placeholder="Search this view…" className="min-w-0 flex-1 rounded-md border border-line px-3 py-2 text-sm" value={search} onChange={(e)=>setSearch(e.target.value)} /><select aria-label="Message status filter" className="rounded-md border border-line bg-white px-2 text-sm" value={filter} onChange={(e)=>setFilter(e.target.value)}><option value="all">All messages</option><option value="unread">Unread</option><option value="changed">New direction / changes</option></select></div>
          <ul className="divide-y divide-line">{visible.map((m) => <li key={m.id} className="py-3.5"><div className="flex items-start gap-3"><span aria-label={userState[m.id]?.read==="read"?"Read":"Unread"} className={`mt-1.5 size-2 shrink-0 rounded-full ${userState[m.id]?.read==="read"?"bg-slate-200":"bg-blue-600"}`} /><div className="min-w-0 flex-1"><div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] text-muted"><span>{m.reference}</span><span>· {fmtTime(m.received)}</span>{m.lifecycle!=="ACTIVE"&&<span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-ink">{m.lifecycle}</span>}</div><button className={`${textLink} text-sm font-semibold leading-snug`} onClick={()=>open(m.id)}>{m.subject}</button><div className="mt-2 flex flex-wrap items-center justify-between gap-2"><span className="text-[11px] text-muted">{mine(m)?"Mine · exact recorded owner match":view.topics.length?`Topic match · ${m.communities.filter(t=>view.topics.includes(t)).join(", ")}`:"Command-wide · watch traffic"}</span><PrecedenceBadge p={m.precedence}/></div></div><button className="mt-5 shrink-0 text-muted hover:text-link" aria-label={`Read ${m.reference}`} onClick={()=>open(m.id)}><ChevronRight className="size-4" /></button></div></li>)}</ul>
          {!visible.length&&<div className="py-8 text-center"><Mail className="mx-auto mb-2 size-6 text-muted" aria-hidden/><p className="text-sm font-semibold">No matching traffic</p><p className="mt-1 text-xs text-muted">Try 7 days or reset filters. Mandatory items stay above.</p></div>}
        </Panel></div>
      </div>
      <aside className="space-y-4">
        <div ref={deadlines} className="scroll-mt-4"><Panel title="Next deadlines" icon={CalendarClock}>
          <p className="mb-3 text-xs text-muted">Recorded requirements · separate from when traffic arrived.</p>
          <ul className="space-y-4">{upcoming.slice(0,4).map((d,i)=><li key={`${d.message.id}-${i}`} className="border-l-2 border-gold pl-3"><p className="text-xs font-semibold text-navy-900">{fmtDateTime(new Date(d.due!))}</p><button onClick={()=>open(d.message.id)} className={`${textLink} mt-1 text-sm font-semibold`}>{d.text}</button><p className="mt-1 text-xs text-muted">{d.owner} · {remaining(d.due,end)}</p>{d.dateOnly&&<span className="text-[10px] text-muted">Date-only suspense; exact hour unverified</span>}</li>)}</ul>
          {!upcoming.length&&<p className="text-sm text-muted">No upcoming deadlines recorded for this view. Review sources for untracked requirements.</p>}
        </Panel></div>
        <Panel title="Your responsibilities"><p className="mb-3 text-xs text-muted">Example duty switcher · official assignments will be administrator-managed.</p><div className="space-y-1">{EXAMPLES.map(v=><button key={v.id} className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm ${view.id===v.id?"bg-navy-50 font-semibold text-navy-900":"hover:bg-slate-50"}`} onClick={()=>setView(v.id)}><span>{v.name}</span>{view.id===v.id?<Check className="size-4" aria-hidden/>:<ChevronRight className="size-3.5 text-muted" aria-hidden/>}</button>)}</div><button className="mt-3 flex items-center gap-1 text-xs font-semibold text-link" onClick={()=>setManage(true)}><Plus className="size-3.5" aria-hidden/>Create a personal view</button></Panel>
        <div className="rounded-xl border border-line bg-navy-950 p-4 text-white"><p className="font-semibold">Taking the watch?</p><p className="mt-1 text-xs leading-relaxed text-white/75">Use Watch Turnover for handoff notes, carryover, and the turnover checklist.</p><Link href="/watch-turnover" className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-gold">Open Watch Turnover <ArrowRight className="size-3.5" aria-hidden/></Link></div>
      </aside>
    </div>
    <details className="rounded-md border border-line bg-white px-3 py-2 text-xs text-muted"><summary className="cursor-pointer">About this preview</summary><p className="mt-2">This is a design preview of the future Home page. Duty choices are examples, not official assignments. Personal views/defaults are browser-local and account-specific. Department mappings and command alert rules are not yet connected. Existing access and acknowledgement permissions are unchanged. Message data is fictional; no AI narrative is generated. {offline?"Offline mode is active.":"Live external ingestion is not verified."} {syncQueue.filter(q=>q.status==="Pending").length} items await sync.</p></details>
    <dialog ref={drawer} aria-label="Personalized message reader" onCancel={(e)=>{e.preventDefault();setSelected(null);}} className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-full max-w-[1100px] overflow-y-auto border-l border-line bg-white p-4 text-ink shadow-2xl backdrop:bg-black/40 sm:p-6">{selected&&<MessageReaderNavigation value={open}><div className="mb-4 flex justify-end"><Button icon={X} onClick={()=>setSelected(null)}>Close message</Button></div><MessageDetail key={selected} id={selected} onBack={()=>setSelected(null)} backLabel="Back to My Briefing"/></MessageReaderNavigation>}</dialog>
  </div>;
}
