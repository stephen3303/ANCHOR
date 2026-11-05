"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCheck, Download, Filter, Mail, Paperclip, Search } from "lucide-react";
import { needsOwnAck } from "@/lib/data";
import { useStore } from "@/lib/store";
import { MESSAGE_CATEGORIES, MESSAGE_TYPES, categoryOf } from "@/lib/message-types";
import { subscribedMessages } from "@/lib/message-topics";
import type { Lifecycle, Message, MessageCategory, MessageType, ReadState } from "@/lib/types";
import { MessageReaderNavigation } from "@/components/message";
import { MessageCellsRow, MessageHeaderRow, messageColumns } from "@/components/message-columns";
import { MessageDetail } from "./[id]/detail";
import {
  Button,
  CategoryBadge,
  Check,
  LifecycleBadge,
  MessageTypeLabel,
  Panel,
  PrecedenceBadge,
  ReadStatus,
  Select,
  cx,
} from "@/components/ui";

const RETIRED: Lifecycle[] = ["SUPERSEDED", "CANCELLED", "EXPIRED"];

export default function MessagesPage() {
  const { messages, userState, markAllRead, markRead, log, notify, messageTopics, topicsLoaded, topicsError, refreshTopics } = useStore();
  const [feed, setFeed] = useState<"all" | "subscriptions">("all");
  const scopedMessages = useMemo(() => feed === "all" ? messages : subscribedMessages(messages, messageTopics), [feed, messages, messageTopics]);
  const SOURCES = useMemo(() => [...new Set(scopedMessages.map((m) => m.source))], [scopedMessages]);
  const TYPES = useMemo(() => MESSAGE_TYPES.filter((t) => scopedMessages.some((m) => m.type === t)), [scopedMessages]);
  const count = <K extends keyof Message>(k: K, v: Message[K]) => scopedMessages.filter((m) => m[k] === v).length;
  const [q, setQ] = useState("");
  const [sources, setSources] = useState<string[]>([]);
  const [categories, setCategories] = useState<MessageCategory[]>([]);
  const [types, setTypes] = useState<MessageType[]>([]);
  const [states, setStates] = useState<ReadState[]>([]);
  const [ackOnly, setAckOnly] = useState(false);
  const [showRetired, setShowRetired] = useState(true);
  const [range, setRange] = useState("Last 30 days");
  const [selected, setSelected] = useState<string | null>(null);
  const reader = useRef<HTMLDialogElement>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(true);

  const toggle = <T,>(arr: T[], v: T, set: (a: T[]) => void) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return scopedMessages.filter((m) => {
      const st = userState[m.id];
      if (needle && ![m.subject, m.reference, m.originator, ...m.sections.flatMap((s) => s.body)].join(" ").toLowerCase().includes(needle)) return false;
      if (sources.length && !sources.includes(m.source)) return false;
      if (categories.length && !categories.includes(categoryOf(m.type))) return false;
      if (types.length && !types.includes(m.type)) return false;
      if (states.length && !states.includes(st.read)) return false;
      if (ackOnly && !(needsOwnAck(m) && !st.acknowledgedAt)) return false;
      if (!showRetired && RETIRED.includes(m.lifecycle)) return false;
      return true;
    });
  }, [scopedMessages, q, sources, categories, types, states, ackOnly, showRetired, userState]);

  // Keep the list mounted and its scroll containers untouched beneath the reader.
  // A same-document history entry also makes browser Back/Forward work.
  useEffect(() => {
    const sync = () => {
      const id = window.history.state?.messageReader;
      setSelected(messages.some((m) => m.id === id) ? id : null);
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [messages]);

  useEffect(() => {
    const dialog = reader.current;
    if (!dialog) return;
    if (selected && !dialog.open) dialog.showModal();
    if (!selected && dialog.open) dialog.close();
  }, [selected]);

  const open = (id: string) => {
    const state = { ...window.history.state, messageReader: id };
    // Related messages stay in this reader; Back still returns to the list.
    if (selected) window.history.replaceState(state, "");
    else window.history.pushState(state, "");
    setSelected(id);
    reader.current?.scrollTo(0, 0);
  };
  const close = () => window.history.back();

  const toggleChecked = (id: string) =>
    setChecked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const selectedCount = feed === "all" ? checked.size : rows.filter((message) => checked.has(message.id)).length;
  const cols = messageColumns<Message>({
    select: {
      header: (
        <input
          type="checkbox"
          aria-label="Select all"
          className="size-4 accent-navy-600"
          checked={selectedCount > 0 && selectedCount === rows.length}
          onChange={(e) => setChecked(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
        />
      ),
      headerClassName: "w-8",
      stopRowClick: true,
      cell: (m) => (
        <input type="checkbox" aria-label={`Select ${m.subject}`} className="size-4 accent-navy-600" checked={checked.has(m.id)} onChange={() => toggleChecked(m.id)} />
      ),
    },
    attachments: {
      header: <Paperclip className="size-4" aria-label="Attachments" />,
      headerClassName: "w-8",
      cell: (m) => m.attachments.length > 0 && <Paperclip className="size-4 text-muted" aria-label="Has attachments" />,
    },
    subject: {
      className: (m) => userState[m.id].read !== "read" && "font-semibold",
      cell: (m) => (
        <span className="flex items-center gap-2">
          <button type="button" onClick={(e) => { e.stopPropagation(); open(m.id); }} className={cx("text-left hover:underline", RETIRED.includes(m.lifecycle) && "line-through decoration-slate-400")}>{m.subject}</button>
          <LifecycleBadge l={m.lifecycle} />
          {needsOwnAck(m) && !userState[m.id].acknowledgedAt && <span className="rounded bg-red-600 px-1.5 text-[10px] font-bold text-white">ACK</span>}
        </span>
      ),
    },
    reference: { className: "whitespace-nowrap", cell: (m) => m.reference },
    from: { className: "whitespace-nowrap", cell: (m) => m.originator },
    dtg: { className: "whitespace-nowrap", cell: (m) => m.dtg },
    precedence: (m) => <PrecedenceBadge p={m.precedence} />,
    category: (m) => <CategoryBadge c={categoryOf(m.type)} />,
    type: { className: "whitespace-nowrap", cell: (m) => <MessageTypeLabel t={m.type} subtag={m.subtag} /> },
    status: (m) => <ReadStatus r={userState[m.id].read} />,
  });

  const clearAll = () => {
    setSources([]);
    setCategories([]);
    setTypes([]);
    setStates([]);
    setAckOnly(false);
    setShowRetired(true);
  };

  return (
    <>
    <div className="flex flex-col gap-4 xl:flex-row">
      <div className="min-w-0 flex-1 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Mail className="size-9 text-navy-700" strokeWidth={1.75} aria-hidden />
          <h1 className="text-2xl font-bold sm:text-[28px]">
            Messages <span className="font-semibold text-muted">({rows.length} of {scopedMessages.length})</span>
          </h1>
          <label className="relative ml-auto min-w-[240px] flex-1 sm:max-w-xl">
            <span className="sr-only">Search messages</span>
            <Search className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search messages, subjects, references, or keywords..."
              className="w-full rounded-md border border-line bg-white py-2.5 pl-10 pr-3 text-sm focus:outline-2 focus:outline-navy-600"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Message feed" className="flex gap-1 rounded-md border border-line p-1">
            <Button size="sm" aria-pressed={feed === "subscriptions"} variant={feed === "subscriptions" ? "primary" : "ghost"} onClick={() => { setFeed("subscriptions"); setChecked(new Set()); void refreshTopics(); }}>Subscriptions</Button>
            <Button size="sm" aria-pressed={feed === "all"} variant={feed === "all" ? "primary" : "ghost"} onClick={() => { setFeed("all"); setChecked(new Set()); }}>All Messages</Button>
          </div>
          <Button size="sm" href="/subscriptions">Manage subscriptions</Button>
        </div>
        {feed === "subscriptions" && !topicsLoaded && <p role="status">{topicsError ? "Subscriptions could not be loaded." : "Loading subscriptions…"}</p>}
        {feed === "subscriptions" && topicsError && <div role="alert" className="text-sm text-red-700">{topicsError} <Button size="sm" onClick={() => void refreshTopics()}>Retry subscriptions</Button></div>}

        <Panel bodyClassName="p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
            <Button size="sm" icon={CheckCheck} onClick={() => { if (feed === "all") { markAllRead(); notify("All messages marked read"); } else { rows.forEach((message) => markRead(message.id)); notify("Visible subscribed messages marked read"); } }}>Mark All Read</Button>
            <Button size="sm" icon={Download} disabled={!selectedCount} onClick={() => { log("Export", `Messages (${selectedCount} selected)`); notify(`Exported ${selectedCount} messages with integrity data`); }}>
              Export{selectedCount ? ` (${selectedCount})` : ""}
            </Button>
            <Button size="sm" variant="primary" icon={Filter} className="ml-auto" onClick={() => setShowFilters((s) => !s)}>
              Filter
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px]">
              <thead>
                <MessageHeaderRow cols={cols} />
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr
                    key={m.id}
                    data-testid={`message-row-${m.id}`}
                    onClick={() => open(m.id)}
                    className={cx(
                      "cursor-pointer border-b border-line/70 last:border-0 hover:bg-navy-50",
                      RETIRED.includes(m.lifecycle) && "text-muted",
                    )}
                  >
                    <MessageCellsRow cols={cols} row={m} />
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td colSpan={cols.length} className="py-10 text-center text-sm text-muted">{feed === "subscriptions" && !scopedMessages.length ? "No messages from your subscribed types. Choose types in Manage subscriptions." : "No messages match these filters."}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      {showFilters && (
        <aside className="w-full shrink-0 xl:w-64">
          <Panel title="Filters" action={<button type="button" onClick={clearAll} className="text-sm text-link">Clear All</button>}>
            <div className="space-y-4">
              <Select label="Date Range" value={range} onChange={setRange} options={["Last 24 hours", "Last 7 days", "Last 30 days", "Last 12 months", "All"]} />
              <fieldset>
                <legend className="mb-1 text-sm font-semibold">Source</legend>
                {SOURCES.map((s) => <Check key={s} label={s} count={count("source", s)} checked={sources.includes(s)} onChange={() => toggle(sources, s, setSources)} />)}
              </fieldset>
              <fieldset>
                <legend className="mb-1 text-sm font-semibold">Status</legend>
                {(["new", "unread", "read"] as ReadState[]).map((s) => (
                  <Check key={s} label={s[0].toUpperCase() + s.slice(1)} count={scopedMessages.filter((m) => userState[m.id].read === s).length} checked={states.includes(s)} onChange={() => toggle(states, s, setStates)} />
                ))}
                <Check label="Needs acknowledgement" checked={ackOnly} onChange={setAckOnly} />
                <Check label="Show superseded, cancelled & expired" checked={showRetired} onChange={setShowRetired} />
              </fieldset>
              <fieldset>
                <legend className="mb-1 text-sm font-semibold">Category</legend>
                {MESSAGE_CATEGORIES.map((c) => (
                  <Check key={c} label={c} count={scopedMessages.filter((m) => categoryOf(m.type) === c).length} checked={categories.includes(c)} onChange={() => toggle(categories, c, setCategories)} />
                ))}
              </fieldset>
              <fieldset>
                <legend className="mb-1 text-sm font-semibold">Message Type</legend>
                {TYPES.map((t) => <Check key={t} label={t} count={count("type", t)} checked={types.includes(t)} onChange={() => toggle(types, t, setTypes)} />)}
              </fieldset>
            </div>
          </Panel>
        </aside>
      )}
    </div>
    <dialog
      ref={reader}
      aria-label="Message reader"
      onCancel={(e) => { e.preventDefault(); close(); }}
      className="m-auto h-[calc(100dvh-2rem)] max-h-none w-[calc(100%-2rem)] max-w-none overflow-y-auto overscroll-contain rounded-lg border border-line bg-white p-4 text-ink shadow-2xl backdrop:bg-black/40 sm:p-6"
    >
      {selected && (
        <MessageReaderNavigation value={open}>
          <MessageDetail key={selected} id={selected} onBack={close} />
        </MessageReaderNavigation>
      )}
    </dialog>
    </>
  );
}
