"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ArrowLeft, Bell, Clock, Copy, Download, FileText, Link2, Mail, Plus, Printer, FilePlus2 } from "lucide-react";
import { messageById } from "@/lib/data";
import { useStore } from "@/lib/store";
import { AckPanel, Attachments, LifecycleNotice, MessageList, MessageTabs, MetadataTable, StarButton } from "@/components/message";
import { Button, ClassBadge, LifecycleBadge, Panel, PrecedenceBadge, Tag } from "@/components/ui";
import type { Message } from "@/lib/types";

export function MessageDetail({ id }: { id: string }) {
  const m = messageById(id)!;
  const { markRead, markUnread, log, notify, briefing, setBriefing } = useStore();

  useEffect(() => {
    markRead(id);
    log("View", `Message (${m.reference})`, "Message opened in reader.");
    // Log once per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const addToBriefing = () => {
    const extra = m.communities.filter((c) => !briefing.communities.includes(c));
    setBriefing({ ...briefing, communities: [...briefing.communities, ...extra] });
    notify(`Added ${m.reference} topics to your briefing`);
  };

  const actions: { icon: typeof Mail; label: string; run: () => void }[] = [
    { icon: Mail, label: "Mark as Unread", run: () => { markUnread(id); notify("Marked unread"); } },
    { icon: FilePlus2, label: "Add to Briefing", run: addToBriefing },
    { icon: Clock, label: "Set Reminder", run: () => notify("Reminder set for 24h before suspense") },
    { icon: Link2, label: "Share Link", run: () => { log("Share Link", m.reference); notify("Link to official record copied"); } },
    { icon: Copy, label: "Copy Reference", run: () => { navigator.clipboard?.writeText(m.reference); notify(`Copied ${m.reference}`); } },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/messages" className="flex items-center gap-1.5 font-medium text-link hover:underline">
          <ArrowLeft className="size-4" /> Back to Messages
        </Link>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button icon={Bell} href="/subscriptions">Subscribe</Button>
          <Button variant="primary" icon={FilePlus2} onClick={addToBriefing}>Add to Briefing</Button>
          <Button variant="primary" icon={Download} onClick={() => { log("Export", `Message (${m.reference})`); notify("Exported PDF with integrity block"); }}>Export PDF</Button>
          <Button icon={Printer} href={`/messages/${m.id}/print`}>Print</Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_400px]">
        <div className="min-w-0 space-y-3">
          <div className="flex items-start gap-3">
            <StarButton id={m.id} />
            <FileText className="size-9 shrink-0 text-ink" strokeWidth={1.5} aria-hidden />
            <div className="min-w-0">
              <h1 className="text-2xl font-bold sm:text-[28px]">{m.subject}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[17px]">
                <span>{m.reference}</span>
                <span className="text-line">|</span>
                <span>{m.originator}</span>
                <span className="text-line">|</span>
                <span>{m.dtg}</span>
                <ClassBadge c={m.classification} />
                <PrecedenceBadge p={m.precedence} />
                <LifecycleBadge l={m.lifecycle} />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {m.communities.map((c) => <Tag key={c}>{c}</Tag>)}
                <button type="button" className="flex items-center gap-1 rounded border border-line px-2 py-0.5 text-xs text-link" onClick={() => notify("Personal tags are visible only to you")}>
                  <Plus className="size-3" /> Add Tag
                </button>
              </div>
            </div>
          </div>
          <LifecycleNotice m={m} />
          <AckPanel m={m} />
          <MessageTabs m={m} />
        </div>

        <div className="space-y-4">
          <Panel title="Message Actions">
            <ul className="space-y-1">
              {actions.map(({ icon: Icon, label, run }) => (
                <li key={label}>
                  <button type="button" onClick={run} className="flex w-full items-center gap-3 rounded px-1 py-1.5 text-left text-[15px] text-link hover:bg-navy-50">
                    <Icon className="size-5 text-navy-700" aria-hidden /> {label}
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Message Information"><MetadataTable m={m} /></Panel>
          <Attachments items={m.attachments} />
          <RelatedPanel m={m} />
        </div>
      </div>
    </div>
  );
}

function RelatedPanel({ m }: { m: Message }) {
  const items = m.related.map(messageById).filter(Boolean) as Message[];
  if (!items.length) return null;
  return (
    <Panel title={`Related Messages (${items.length})`} bodyClassName="p-2">
      <MessageList items={items} />
    </Panel>
  );
}
