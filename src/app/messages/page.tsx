"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCheck, Download, Filter, Mail, Paperclip, Search, Star } from "lucide-react";
import { MESSAGES } from "@/lib/data";
import { useStore } from "@/lib/store";
import type { Lifecycle, Message, MessageType, ReadState } from "@/lib/types";
import { MessageReaderNavigation, StarButton } from "@/components/message";
import { MessageDetail } from "./[id]/detail";
import {
  Button,
  Check,
  LifecycleBadge,
  Panel,
  PrecedenceBadge,
  ReadStatus,
  Select,
  cx,
  td,
  th,
  theadRow,
} from "@/components/ui";

const SOURCES = [...new Set(MESSAGES.map((m) => m.source))];
const TYPES = [...new Set(MESSAGES.map((m) => m.type))];
const count = <K extends keyof Message>(k: K, v: Message[K]) => MESSAGES.filter((m) => m[k] === v).length;
const RETIRED: Lifecycle[] = ["SUPERSEDED", "CANCELLED", "EXPIRED"];

export default function MessagesPage() {
  const { userState, markAllRead, log, notify } = useStore();
  const [q, setQ] = useState("");
  const [sources, setSources] = useState<string[]>([]);
  const [types, setTypes] = useState<MessageType[]>([]);
  const [states, setStates] = useState<ReadState[]>([]);
  const [starredOnly, setStarredOnly] = useState(false);
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
    return MESSAGES.filter((m) => {
      const st = userState[m.id];
      if (needle && ![m.subject, m.reference, m.originator, ...m.sections.flatMap((s) => s.body)].join(" ").toLowerCase().includes(needle)) return false;
      if (sources.length && !sources.includes(m.source)) return false;
      if (types.length && !types.includes(m.type)) return false;
      if (states.length && !states.includes(st.read)) return false;
      if (starredOnly && !st.starred) return false;
      if (ackOnly && !(m.ackRequired && !st.acknowledgedAt)) return false;
      if (!showRetired && RETIRED.includes(m.lifecycle)) return false;
      return true;
    });
  }, [q, sources, types, states, starredOnly, ackOnly, showRetired, userState]);

  // Keep the list mounted and its scroll containers untouched beneath the reader.
  // A same-document history entry also makes browser Back/Forward work.
  useEffect(() => {
    const sync = () => {
      const id = window.history.state?.messageReader;
      setSelected(MESSAGES.some((m) => m.id === id) ? id : null);
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

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

  const clearAll = () => {
    setSources([]);
    setTypes([]);
    setStates([]);
    setStarredOnly(false);
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
            Messages <span className="font-semibold text-muted">({rows.length} of {MESSAGES.length})</span>
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

        <Panel bodyClassName="p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
            <Button size="sm" icon={CheckCheck} onClick={() => { markAllRead(); notify("All messages marked read"); }}>Mark All Read</Button>
            <Button size="sm" icon={Download} disabled={!checked.size} onClick={() => { log("Export", `Messages (${checked.size} selected)`); notify(`Exported ${checked.size} messages with integrity data`); }}>
              Export{checked.size ? ` (${checked.size})` : ""}
            </Button>
            <Button size="sm" variant="primary" icon={Filter} className="ml-auto" onClick={() => setShowFilters((s) => !s)}>
              Filter
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px]">
              <thead>
                <tr className={theadRow}>
                  <th className={cx(th, "w-8")}>
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      className="size-4 accent-navy-600"
                      checked={checked.size > 0 && checked.size === rows.length}
                      onChange={(e) => setChecked(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
                    />
                  </th>
                  <th className={cx(th, "w-8")}><Star className="size-4" aria-label="Starred" /></th>
                  <th className={cx(th, "w-8")}><Paperclip className="size-4" aria-label="Attachments" /></th>
                  <th className={th}>Subject</th>
                  <th className={th}>Reference</th>
                  <th className={th}>From</th>
                  <th className={th}>Date-Time Group</th>
                  <th className={th}>Precedence</th>
                  <th className={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => {
                  const st = userState[m.id];
                  const retired = RETIRED.includes(m.lifecycle);
                  return (
                    <tr
                      key={m.id}
                      onClick={() => open(m.id)}
                      className={cx(
                        "cursor-pointer border-b border-line/70 last:border-0 hover:bg-navy-50",
                        retired && "text-muted",
                      )}
                    >
                      <td className={td} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Select ${m.subject}`}
                          className="size-4 accent-navy-600"
                          checked={checked.has(m.id)}
                          onChange={() => setChecked((s) => { const n = new Set(s); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); return n; })}
                        />
                      </td>
                      <td className={td}><StarButton id={m.id} /></td>
                      <td className={td}>{m.attachments.length > 0 && <Paperclip className="size-4 text-muted" aria-label="Has attachments" />}</td>
                      <td className={cx(td, st.read !== "read" && "font-semibold")}>
                        <span className="flex items-center gap-2">
                          <button type="button" onClick={(e) => { e.stopPropagation(); open(m.id); }} className={cx("text-left hover:underline", retired && "line-through decoration-slate-400")}>{m.subject}</button>
                          <LifecycleBadge l={m.lifecycle} />
                          {m.ackRequired && !st.acknowledgedAt && <span className="rounded bg-red-600 px-1.5 text-[10px] font-bold text-white">ACK</span>}
                        </span>
                      </td>
                      <td className={cx(td, "whitespace-nowrap")}>{m.reference}</td>
                      <td className={cx(td, "whitespace-nowrap")}>{m.originator}</td>
                      <td className={cx(td, "whitespace-nowrap")}>{m.dtg}</td>
                      <td className={td}><PrecedenceBadge p={m.precedence} /></td>
                      <td className={td}><ReadStatus r={st.read} /></td>
                    </tr>
                  );
                })}
                {!rows.length && (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-sm text-muted">No messages match these filters.</td>
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
                  <Check key={s} label={s[0].toUpperCase() + s.slice(1)} count={MESSAGES.filter((m) => userState[m.id].read === s).length} checked={states.includes(s)} onChange={() => toggle(states, s, setStates)} />
                ))}
                <Check label="Starred" checked={starredOnly} onChange={setStarredOnly} />
                <Check label="Needs acknowledgement" checked={ackOnly} onChange={setAckOnly} />
                <Check label="Show superseded, cancelled & expired" checked={showRetired} onChange={setShowRetired} />
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
