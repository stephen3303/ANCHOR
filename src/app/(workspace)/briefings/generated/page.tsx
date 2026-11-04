"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertCircle, AlertTriangle, BellRing, Download, FileText, Link2, Mail, Pencil, Printer, RefreshCw, Share2, Users } from "lucide-react";
import { selectBriefing, topicCounts } from "@/lib/briefing";
import { useStore } from "@/lib/store";
import { fmtDate } from "@/lib/format";
import { MESSAGES } from "@/lib/data";
import { AiSummary } from "@/components/message";
import { Bar, Button, Donut, ImportanceBadge, LifecycleBadge, Panel, PrecedenceBadge, StatCard, Tabs, Delta, tableWrap, td, th, theadRow, tbodyRow } from "@/components/ui";

type Tab = "summary" | "takeaways" | "actions" | "messages" | "charts";

export default function GeneratedBriefing() {
  const { briefing: b, userState, log, notify } = useStore();
  const [tab, setTab] = useState<Tab>("summary");
  const items = selectBriefing(b, (id) => userState[id]?.read === "read");
  const high = items.filter((m) => m.importance === "High");
  const med = items.filter((m) => m.importance === "Medium");
  const low = items.filter((m) => m.importance === "Low");
  const actions = items.filter((m) => m.actionItem);
  const topics = topicCounts(items);
  const statusChanges = MESSAGES.filter((m) => m.lifecycle !== "ACTIVE" && b.communities.some((c) => m.communities.includes(c)));
  const pct = (n: number) => (items.length ? Math.round((n / items.length) * 100) : 0);

  const summary = `This briefing covers ${items.length} messages from the ${b.range.toLowerCase()} relevant to ${b.communities.slice(0, 3).join(", ")}${b.communities.length > 3 ? " and other topics" : ""}. ${high.length} are high priority and ${actions.length} carry action items. ${statusChanges.length ? `${statusChanges.length} messages changed status (superseded, corrected, amended or cancelled), so confirm you are working from the current version.` : ""}`;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <FileText className="mt-1 size-10 text-ink" strokeWidth={1.5} aria-hidden />
          <div>
            <h1 className="text-2xl font-bold sm:text-[28px]">Generated Briefing</h1>
            <div className="text-xl font-bold">{b.name}</div>
            <div className="text-lg font-semibold">{b.format}</div>
            <div className="text-[15px] text-muted">
              Generated: {fmtDate(new Date("2026-10-24T19:00:00Z"))} 1900Z | {items.length} Messages | {b.communities.slice(0, 3).join(", ")}
            </div>
          </div>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <Button icon={Pencil} href="/briefings">Edit Briefing</Button>
          <Button icon={RefreshCw} onClick={() => notify("Briefing regenerated from latest traffic")}>Regenerate</Button>
          <Button variant="primary" icon={Download} onClick={() => { log("Export", b.name); notify("Exported briefing PDF"); }}>Export</Button>
          <Button variant="primary" icon={Share2} onClick={() => { log("Share Link", b.name); notify("Share link copied (CAC required to open)"); }}>Share</Button>
          <Button icon={Printer} onClick={() => window.print()}>Print</Button>
        </div>
      </div>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "summary", label: "Executive Summary" },
          { id: "takeaways", label: `Key Takeaways (${Math.min(items.length, 8)})` },
          { id: "actions", label: `Action Items (${actions.length})` },
          { id: "messages", label: `Detailed Messages (${items.length})` },
          { id: "charts", label: "Charts & Trends" },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_400px]">
        <div className="min-w-0 space-y-4">
          {(tab === "summary" || tab === "takeaways") && (
            <Panel>
              {tab === "summary" && (
                <>
                  <h2 className="mb-2 text-xl font-bold">Executive Summary</h2>
                  {b.includeAiSummary ? <AiSummary text={summary} from="the official messages in this briefing" /> : <p className="mb-4 text-sm text-muted">AI summary turned off for this briefing.</p>}
                  <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <StatCard icon={Mail} value={items.length} label="Total Messages" note={<Delta dir="up" good>+6 from last briefing</Delta>} />
                    <StatCard icon={AlertCircle} value={high.length} label="High Priority" tone="red" note={<Delta dir="up">+1 from last briefing</Delta>} />
                    <StatCard icon={AlertTriangle} value={actions.length} label="Action Items" tone="amber" note={<Delta dir="down" good>−2 from last briefing</Delta>} />
                    <StatCard icon={Users} value={topics.length} label="Communities" note={topics.slice(0, 3).map((t) => t.topic.split(" ")[0]).join(", ")} />
                  </div>
                </>
              )}
              <h2 className="mb-2 text-xl font-bold">Key Takeaways</h2>
              <ol className="divide-y divide-line">
                {items.slice(0, 8).map((m, i) => (
                  <li key={m.id} className="flex items-start gap-3 py-2.5">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-navy-600 text-sm font-bold text-white">{i + 1}</span>
                    <ImportanceBadge i={m.importance} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/messages/${m.id}`} className="font-semibold hover:underline">{m.subject}</Link> <LifecycleBadge l={m.lifecycle} />
                      <p className="text-[13px]">{m.aiSummary ?? m.sections[2].body[0]}</p>
                    </div>
                    <div className="text-right text-[13px]">
                      <div>{m.reference}</div>
                      <div>{fmtDate(m.received)}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </Panel>
          )}

          {tab === "actions" && (
            <Panel title="Action Items">
              <div className={tableWrap}>
                <table className="w-full min-w-[640px]">
                  <thead><tr className={theadRow}><th className={th}>Priority</th><th className={th}>Action</th><th className={th}>Source</th><th className={th}>Assigned To</th><th className={th}>Suspense</th></tr></thead>
                  <tbody>
                    {actions.map((m) => (
                      <tr key={m.id} className={tbodyRow}>
                        <td className={td}><ImportanceBadge i={m.importance} /></td>
                        <td className={td}>{m.actionItem!.text}</td>
                        <td className={td}><Link href={`/messages/${m.id}`} className="text-link hover:underline">{m.reference}</Link></td>
                        <td className={td}>{m.actionItem!.assignedTo}</td>
                        <td className={td}>{m.actionItem!.suspense}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}

          {tab === "messages" && (
            <Panel title="Detailed Messages" bodyClassName="p-0">
              <ul className="divide-y divide-line">
                {items.map((m) => (
                  <li key={m.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <PrecedenceBadge p={m.precedence} />
                      <Link href={`/messages/${m.id}`} className="font-semibold text-link hover:underline">{m.subject}</Link>
                      <LifecycleBadge l={m.lifecycle} />
                      <span className="ml-auto text-[13px] text-muted">{m.reference} · {m.dtg}</span>
                    </div>
                    <p className="mt-1 text-sm"><span className="font-semibold">Purpose:</span> {m.sections[0].body[0]}</p>
                    <p className="text-sm"><span className="font-semibold">Action:</span> {m.sections[2].body[0]}</p>
                    <p className="mt-1 text-xs text-muted">Quoted from the official record.</p>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {tab === "charts" && (
            <Panel title="Traffic over the period">
              <div className="flex h-48 items-end gap-2">
                {[3, 5, 2, 4, 6, 3, 8].map((v, i) => (
                  <div key={i} className="flex flex-1 flex-col items-center gap-1">
                    <div className="w-full rounded-t bg-navy-600" style={{ height: `${v * 20}px` }} />
                    <span className="text-xs text-muted">{18 + i} OCT</span>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </div>

        <div className="space-y-4">
          <Panel title="Topics in This Briefing">
            {topics.map((t) => (
              <div key={t.topic} className="mb-2.5 grid grid-cols-[150px_1fr_24px] items-center gap-2 text-sm">
                <span>{t.topic}</span>
                <Bar value={t.n} max={topics[0].n} />
                <span className="text-right">{t.n}</span>
              </div>
            ))}
          </Panel>
          <Panel title="Priority Distribution">
            <div className="flex items-center gap-6">
              <Donut
                center={items.length}
                sub="Messages"
                segments={[
                  { value: high.length || 0.0001, color: "#dc2626" },
                  { value: med.length || 0.0001, color: "#facc15" },
                  { value: low.length || 0.0001, color: "#2563eb" },
                ]}
              />
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2"><span className="size-3 rounded-full bg-red-600" /> High <span className="ml-4">{high.length} ({pct(high.length)}%)</span></li>
                <li className="flex items-center gap-2"><span className="size-3 rounded-full bg-yellow-400" /> Medium <span className="ml-4">{med.length} ({pct(med.length)}%)</span></li>
                <li className="flex items-center gap-2"><span className="size-3 rounded-full bg-blue-600" /> Low <span className="ml-4">{low.length} ({pct(low.length)}%)</span></li>
              </ul>
            </div>
          </Panel>
          <Panel title="Recent Activity">
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2"><FileText className="size-4" /> Briefing generated <span className="ml-auto text-muted">24 OCT 1900Z</span></li>
              <li className="flex items-center gap-2"><BellRing className="size-4 text-red-600" /> {high.length} high priority messages <span className="ml-auto text-muted">24 OCT 1830Z</span></li>
              <li className="flex items-center gap-2"><Link2 className="size-4" /> {statusChanges.length} status changes <span className="ml-auto text-muted">24 OCT 1207Z</span></li>
              <li className="flex items-center gap-2"><Users className="size-4" /> Subscription updated <span className="ml-auto text-muted">23 OCT 1800Z</span></li>
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}
