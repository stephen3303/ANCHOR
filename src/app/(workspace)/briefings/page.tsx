"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, FolderOpen, RotateCcw, Save, Sparkles } from "lucide-react";
import { selectBriefing } from "@/lib/briefing";
import { DEFAULT_BRIEFING, useStore } from "@/lib/store";
import { countUnder, keyOf, keyPath } from "@/lib/message-types";
import { MessageTypePicker } from "@/components/message-type-picker";
import { hoursAgo } from "@/lib/format";
import { Button, Check, ImportanceBadge, LifecycleBadge, PageHeader, Panel, Select, Tag, TextInput } from "@/components/ui";

export default function BriefingBuilder() {
  const router = useRouter();
  const { briefing: b, setBriefing, userState, log, notify, messages } = useStore();
  const set = (p: Partial<typeof b>) => setBriefing({ ...b, ...p });
  const preview = selectBriefing(b, (id) => userState[id]?.read === "read", messages);

  const generate = () => {
    log("Create Briefing", b.name, `Briefing generated from ${preview.length} messages.`);
    router.push("/briefings/generated");
  };

  return (
    <>
      <PageHeader
        icon={FileText}
        title="Tailored Briefing Builder"
        subtitle="Create a customized briefing from relevant messages, message types, and timeframes."
        actions={
          <>
            <Button icon={FolderOpen} onClick={() => { setBriefing(DEFAULT_BRIEFING); notify("Loaded template: Watch Turnover"); }}>Load Template</Button>
            <Button icon={Save} onClick={() => notify("Saved as template")}>Save as Template</Button>
            <Button icon={FolderOpen} href="/briefings/generated">My Briefings</Button>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_560px]">
        <Panel bodyClassName="space-y-6 p-5">
          <section>
            <h2 className="mb-2 text-lg font-bold">1. Briefing Details</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextInput label="Briefing Name *" value={b.name} onChange={(e) => set({ name: e.target.value })} />
              <Select label="Date Range" value={b.range} onChange={(v) => set({ range: v })} options={["Last 24 hours", "Last 7 days", "Last 14 days", "Last 30 days"]} />
              <Select label="Purpose / Audience" value={b.purpose} onChange={(v) => set({ purpose: v })} options={["Watch Turnover", "Commanding Officer", "Department Heads", "Daily Brief"]} />
              <Select label="Output Format" value={b.format} onChange={(v) => set({ format: v })} options={["Executive Summary", "Detailed Brief", "Action Items Only"]} />
            </div>
          </section>

          <section>
            <h2 className="text-lg font-bold">2. Message Types</h2>
            <p className="mb-2 text-sm text-muted">Pick the MSGID types to include. A type covers all of its subtags; leave everything clear to include all traffic.</p>
            <div className="max-h-80 overflow-y-auto rounded-md border border-line p-3">
              <MessageTypePicker value={b.messageTypes} onChange={(v) => set({ messageTypes: v })} counts={(k) => countUnder(k, messages)} />
            </div>
            {b.messageTypes.length > 0 && <Button size="sm" className="mt-2" onClick={() => set({ messageTypes: [] })}>Clear all</Button>}
          </section>

          <section>
            <h2 className="text-lg font-bold">3. Message Filters</h2>
            <p className="mb-2 text-sm text-muted">Refine which messages to include in the briefing.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-3">
                <Select label="Classification" value="Unclassified" options={["Unclassified"]} />
                <Select label="Message Type" value="All Types" options={["All Types"]} />
                <Select label="Source" value="All Sources" options={["All Sources"]} />
              </div>
              <fieldset className="rounded-md border border-line p-3">
                <legend className="px-1 text-sm font-semibold">Additional Filters</legend>
                <Check label="High Priority Only" checked={b.highOnly} onChange={(v) => set({ highOnly: v })} />
                <Check label="Action Items Only" checked={b.actionOnly} onChange={(v) => set({ actionOnly: v })} />
                <Check label="Unread Messages Only" checked={b.unreadOnly} onChange={(v) => set({ unreadOnly: v })} />
                <Check label="Include superseded & cancelled" checked={b.includeSuperseded} onChange={(v) => set({ includeSuperseded: v })} />
                <Check label="Include AI-assisted summary (labeled)" checked={b.includeAiSummary} onChange={(v) => set({ includeAiSummary: v })} />
              </fieldset>
            </div>
          </section>

          <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
            <Button icon={RotateCcw} className="py-3" onClick={() => setBriefing(DEFAULT_BRIEFING)}>Reset</Button>
            <Button variant="primary" icon={Sparkles} className="py-3 text-base" disabled={!b.name.trim() || !preview.length} onClick={generate}>Generate Briefing</Button>
          </div>
        </Panel>

        <Panel title={`Preview (${preview.length} messages)`} action={<span className="text-xs text-muted">Updates as you change filters</span>} bodyClassName="p-0">
          <ul className="divide-y divide-line">
            {preview.map((m) => (
              <li key={m.id} className="flex gap-3 px-4 py-3">
                <FileText className="mt-0.5 size-5 shrink-0 text-ink" />
                <div className="min-w-0 flex-1">
                  <Link href={`/messages/${m.id}`} className="font-semibold text-link hover:underline">{m.subject}</Link> <LifecycleBadge l={m.lifecycle} />
                  <div className="text-[13px]">{m.reference} | {m.source} | {m.dtg}</div>
                  <div className="mt-1 flex flex-wrap gap-1"><Tag title={keyPath(keyOf(m))}>{keyOf(m)}</Tag></div>
                </div>
                <div className="text-right">
                  <ImportanceBadge i={m.importance} />
                  <div className="mt-1 text-xs text-muted">{hoursAgo(m.received)}</div>
                </div>
              </li>
            ))}
            {!preview.length && <li className="py-10 text-center text-sm text-muted">No messages match. Widen the date range or message types.</li>}
          </ul>
        </Panel>
      </div>
    </>
  );
}
