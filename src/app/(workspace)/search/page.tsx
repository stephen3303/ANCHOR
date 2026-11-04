"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpDown, Bookmark, BookmarkPlus, Building2, CalendarDays, FileText, HelpCircle, Lock, Search, Sparkles, Tags, Users, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { MESSAGE_CATEGORIES, MESSAGE_TYPES, categoryOf } from "@/lib/message-types";
import { TopicPicker } from "@/components/topic-picker";
import { matchesTopics, topicName, topicPath } from "@/lib/topics";
import type { Message, MessageCategory, MessageType, Precedence } from "@/lib/types";
import { Button, Check, ClassBadge, LifecycleBadge, Panel, PrecedenceBadge, Select, Tabs, Tag, cx } from "@/components/ui";

const TYPES = MESSAGE_TYPES;
const PRECEDENCE: Precedence[] = ["FLASH", "IMMEDIATE", "PRIORITY", "ROUTINE"];

const SAVED = [
  { name: "Readiness reporting (COMSUBLANT)", query: "readiness", types: ["GENADMIN"] as MessageType[] },
  { name: "Cyber controls, last 30 days", query: "cybersecurity", types: [] as MessageType[] },
  { name: "Safety traffic", query: "safety", types: [] as MessageType[] },
  { name: "Equipment casualties", query: "", types: ["CASREP"] as MessageType[] },
  { name: "Personnel policy", query: "personnel", types: ["NAVADMIN", "ALNAV"] as MessageType[] },
  { name: "Training pipeline", query: "training", types: [] as MessageType[] },
  { name: "Port visits", query: "port visit", types: [] as MessageType[] },
];

type Mode = "basic" | "advanced" | "natural" | "saved";

export default function SearchPage() {
  const { log, notify, requestSubscription, messages } = useStore();
  const SOURCES = useMemo(() => [...new Set(messages.map((m) => m.source))], [messages]);
  const [mode, setMode] = useState<Mode>("advanced");
  const [q, setQ] = useState("deployment readiness");
  const [nl, setNl] = useState("Show me readiness messages from COMSUBLANT that need acknowledgement");
  const [cats, setCats] = useState<MessageCategory[]>([]);
  const [types, setTypes] = useState<MessageType[]>(["GENADMIN", "NAVADMIN"]);
  const [sources, setSources] = useState<string[]>([]);
  const [comms, setComms] = useState<string[]>(["readiness"]);
  const [prec, setPrec] = useState<Precedence[]>([]);
  const [range, setRange] = useState("Last 12 months");
  const [includeRetired, setIncludeRetired] = useState(false);
  const [sort, setSort] = useState("Relevance");
  const [nlApplied, setNlApplied] = useState<string | null>(null);

  const toggle = <T,>(arr: T[], v: T, set: (a: T[]) => void) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const results = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const scored = messages.map((m) => {
      const hay = [m.subject, m.reference, m.originator, ...m.topics.map(topicPath), ...m.sections.flatMap((s) => s.body)].join(" ").toLowerCase();
      const score = words.reduce((a, w) => a + (m.subject.toLowerCase().includes(w) ? 3 : 0) + (hay.includes(w) ? 1 : 0), 0);
      return { m, score };
    }).filter(({ m, score }) => {
      if (words.length && score === 0) return false;
      if (mode !== "basic") {
        if (cats.length && !cats.includes(categoryOf(m.type))) return false;
        if (types.length && !types.includes(m.type)) return false;
        if (sources.length && !sources.includes(m.source)) return false;
        if (!matchesTopics(m.topics, comms)) return false;
        if (prec.length && !prec.includes(m.precedence)) return false;
      }
      if (!includeRetired && ["SUPERSEDED", "CANCELLED", "EXPIRED"].includes(m.lifecycle)) return false;
      return true;
    });
    if (sort === "Newest") scored.sort((a, b) => b.m.received.localeCompare(a.m.received));
    else if (sort === "Oldest") scored.sort((a, b) => a.m.received.localeCompare(b.m.received));
    else scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.m);
  }, [messages, q, cats, types, sources, comms, prec, includeRetired, sort, mode]);

  const runSearch = () => log("Search", `Keyword: “${q}”`, `Search returned ${results.length} results.`);

  // Prototype stand-in for a natural-language parser: pick out known terms.
  const applyNatural = () => {
    const t = nl.toLowerCase();
    const kw = ["readiness", "cyber", "safety", "training", "personnel", "maintenance", "port"].filter((k) => t.includes(k));
    setQ(kw.join(" "));
    setSources(SOURCES.filter((s) => t.includes(s.toLowerCase())));
    setTypes(TYPES.filter((ty) => t.includes(ty.toLowerCase())));
    setComms([]);
    setPrec(t.includes("immediate") ? ["IMMEDIATE"] : []);
    setNlApplied(`Keywords: ${kw.join(", ") || "none"} · Sources: ${SOURCES.filter((s) => t.includes(s.toLowerCase())).join(", ") || "any"}`);
    setMode("advanced");
  };

  const saveSearch = () => {
    log("Save Search", q);
    notify(`Saved search "${q}"`);
  };

  const subscribeToSearch = () =>
    requestSubscription({
      name: `Saved search: ${q}`,
      description: `Messages matching "${q}"${types.length ? ` (${types.join(", ")})` : ""}.`,
      criteria: { messageTypes: types, topics: comms, keywords: q.split(/\s+/).filter(Boolean) },
      frequency: "Daily Digest",
      channels: { inApp: true, email: true, teams: false },
      justification: "Created from Advanced Search.",
    });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="rounded-md bg-navy-600 p-2 text-white"><Search className="size-6" aria-hidden /></span>
        <h1 className="text-2xl font-bold sm:text-[28px]">Advanced Search</h1>
        <p className="text-[15px] text-muted">Find authoritative messages, references, and information quickly across all sources.</p>
        <div className="ml-auto flex gap-2">
          <Button icon={Bookmark} onClick={() => setMode("saved")}>Saved Searches</Button>
          <Button icon={HelpCircle} onClick={() => notify("Tip: use quotes for exact phrases, e.g. “readiness report”")}>Search Help</Button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <label className="relative min-w-[260px] flex-1">
          <span className="sr-only">Search terms</span>
          <Search className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            className="w-full rounded-md border border-line bg-white py-3 pl-10 pr-10 text-[17px] focus:outline-2 focus:outline-navy-600"
          />
          {q && (
            <button type="button" aria-label="Clear search" onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted">
              <X className="size-5" />
            </button>
          )}
        </label>
        <Button variant="primary" icon={Search} className="px-8" onClick={runSearch}>Search</Button>
        <Button icon={BookmarkPlus} onClick={saveSearch}>Save Search</Button>
      </div>

      <Tabs
        active={mode}
        onChange={setMode}
        tabs={[
          { id: "basic", label: "Basic Search" },
          { id: "advanced", label: "Advanced Search" },
          { id: "natural", label: "Natural Language" },
          { id: "saved", label: `Saved Searches (${SAVED.length})` },
        ]}
      />

      {mode === "natural" && (
        <Panel className="mb-4">
          <label className="block text-sm font-semibold" htmlFor="nl">Describe what you are looking for</label>
          <textarea id="nl" value={nl} onChange={(e) => setNl(e.target.value)} rows={2} className="mt-1 w-full rounded-md border border-line p-2 text-sm focus:outline-2 focus:outline-navy-600" />
          <div className="mt-2 flex items-center gap-2">
            <Button variant="primary" icon={Sparkles} onClick={applyNatural}>Convert to filters</Button>
            <span className="text-xs text-muted">AI-assisted. You can review and change every filter before searching.</span>
          </div>
        </Panel>
      )}

      {mode === "saved" && (
        <Panel className="mb-4" bodyClassName="p-0">
          <ul className="divide-y divide-line">
            {SAVED.map((s) => (
              <li key={s.name} className="flex items-center gap-3 px-4 py-3 text-sm">
                <Bookmark className="size-4 text-navy-700" />
                <span className="font-medium">{s.name}</span>
                <span className="text-muted">&ldquo;{s.query}&rdquo;</span>
                <Button size="sm" className="ml-auto" onClick={() => { setQ(s.query); setCats([]); setTypes(s.types); setComms([]); setSources([]); setMode("advanced"); }}>Run</Button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {nlApplied && mode === "advanced" && (
        <p className="mb-3 rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900">
          <Sparkles className="mr-1 inline size-4" /> Filters set from your description. {nlApplied}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        {mode !== "basic" && mode !== "saved" ? (
          <Panel bodyClassName="space-y-5 p-4">
            <FilterGroup icon={CalendarDays} title="Date Range">
              <Select value={range} onChange={setRange} options={["Last 30 days", "Last 90 days", "Last 12 months", "All dates"]} />
            </FilterGroup>
            <FilterGroup icon={Tags} title="Category">
              <div className="grid grid-cols-2 gap-x-2">
                {MESSAGE_CATEGORIES.map((c) => <Check key={c} label={c} checked={cats.includes(c)} onChange={() => toggle(cats, c, setCats)} />)}
              </div>
            </FilterGroup>
            <FilterGroup icon={FileText} title="Message Type">
              <div className="grid grid-cols-2 gap-x-2">
                {TYPES.map((t) => <Check key={t} label={t} checked={types.includes(t)} onChange={() => toggle(types, t, setTypes)} />)}
              </div>
            </FilterGroup>
            <FilterGroup icon={Building2} title="Source">
              <div className="grid grid-cols-2 gap-x-2">
                {SOURCES.map((s) => <Check key={s} label={s} checked={sources.includes(s)} onChange={() => toggle(sources, s, setSources)} />)}
              </div>
            </FilterGroup>
            <FilterGroup icon={Tags} title="Precedence">
              <div className="grid grid-cols-2 gap-x-2">
                {PRECEDENCE.map((p) => <Check key={p} label={p} checked={prec.includes(p)} onChange={() => toggle(prec, p, setPrec)} />)}
              </div>
            </FilterGroup>
            <FilterGroup icon={Lock} title="Classification">
              <Check label="Unclassified" checked onChange={() => notify("Higher classifications are not available on this network")} />
            </FilterGroup>
            <FilterGroup icon={Users} title="Topics">
              <TopicPicker value={comms} onChange={setComms} counts={(id) => messages.filter((m) => matchesTopics(m.topics, [id])).length} />
            </FilterGroup>
            <Check label="Include superseded, cancelled & expired" checked={includeRetired} onChange={setIncludeRetired} />
          </Panel>
        ) : (
          <div className="hidden lg:block" />
        )}

        <Panel
          className={cx((mode === "basic" || mode === "saved") && "lg:col-span-2")}
          title={`Search Results (${results.length})`}
          action={
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted">Sort by:</span>
              <Select value={sort} onChange={setSort} options={["Relevance", "Newest", "Oldest"]} />
              <ArrowUpDown className="size-4 text-muted" aria-hidden />
            </div>
          }
          bodyClassName="p-0"
        >
          <ul className="divide-y divide-line">
            {results.map((m) => <ResultRow key={m.id} m={m} />)}
          </ul>
          {!results.length && <p className="py-10 text-center text-sm text-muted">No results. Try fewer filters.</p>}
          {results.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3 text-sm">
              <span className="text-muted">Turn this search into a subscription so new matches reach you automatically.</span>
              <Button size="sm" variant="primary" className="ml-auto" onClick={subscribeToSearch}>Request subscription</Button>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}

function FilterGroup({ icon: Icon, title, children }: { icon: typeof Search; title: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-1.5 flex items-center gap-2 text-[15px] font-bold">
        <Icon className="size-5 text-navy-900" aria-hidden /> {title}
      </legend>
      <div className="pl-7">{children}</div>
    </fieldset>
  );
}

function ResultRow({ m }: { m: Message }) {
  return (
    <li className="flex gap-3 px-4 py-3">
      <FileText className="mt-0.5 size-6 shrink-0 text-ink" strokeWidth={1.5} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/messages/${m.id}`} className="text-[16px] font-semibold text-link hover:underline">{m.subject}</Link>
          <LifecycleBadge l={m.lifecycle} />
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] text-ink">
          <span>{m.reference}</span>|<span>{m.source}</span>|<span>{m.dtg}</span>
          <ClassBadge c={m.classification} />
          <PrecedenceBadge p={m.precedence} />
        </div>
        <p className="mt-1 text-[13px] text-ink">{m.sections[0].body[0]}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {m.topics.map((t) => <Tag key={t} title={topicPath(t)}>{topicName(t)}</Tag>)}
        </div>
      </div>
    </li>
  );
}
