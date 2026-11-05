"use client";

import { useMemo, useState } from "react";
import { Network, RefreshCw } from "lucide-react";
import { useStore } from "@/lib/store";
import { Button, PageHeader, Panel } from "@/components/ui";

export default function SubscriptionsPage() {
  const { messageTopics, topicsLoaded, topicsError, pendingTopic, refreshTopics, setTopicSubscription, offline } = useStore();
  const [q, setQ] = useState("");
  const [mine, setMine] = useState(false);
  const topics = useMemo(() => messageTopics.filter((topic) => (!mine || topic.subscribed) && topic.name.toLowerCase().includes(q.trim().toLowerCase())), [messageTopics, q, mine]);
  return <div className="space-y-4">
    <PageHeader icon={Network} title="Message Subscriptions" subtitle="Choose the published message types you want in your Subscriptions feed." />
    <p className="text-sm text-muted">Types come from each published message&apos;s Type/MSGID value, not its workflow category. Subscribe or unsubscribe freely—no approval required. Preferences are personal and saved to the server. All Messages remains available.</p>
    {offline && <p role="status" className="text-sm text-amber-800">Connect to the server to change subscriptions.</p>}
    {topicsError && <p role="alert" className="text-sm text-red-700">{topicsError}</p>}
    <div className="flex flex-wrap items-center gap-3">
      <label className="min-w-56 flex-1 text-sm">Search message types<input aria-label="Search message types" className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2" value={q} onChange={(event) => setQ(event.target.value)} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={mine} onChange={(event) => setMine(event.target.checked)} />My subscriptions only</label>
      <Button icon={RefreshCw} disabled={offline || !!pendingTopic} onClick={() => void refreshTopics()}>Refresh types</Button>
      <Button href="/messages">Messages</Button>
    </div>
    <Panel title={`Published message types (${topics.length})`}>
      {!topicsLoaded ? <p role="status">{topicsError ? "Message types could not be loaded. Use Refresh types to retry." : "Loading message types…"}</p> : topics.length ? <ul className="divide-y divide-line">
        {topics.map((topic) => <li key={topic.id} data-testid={`message-topic-${topic.id}`} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div><h2 className="font-semibold">{topic.name}</h2><p className="text-sm text-muted">{topic.messageCount} published message{topic.messageCount === 1 ? "" : "s"}{topic.subscribed ? " · Subscribed" : ""}</p></div>
          <Button aria-label={`${topic.subscribed ? "Unsubscribe from" : "Subscribe to"} ${topic.name}`} aria-pressed={topic.subscribed} variant={topic.subscribed ? "secondary" : "primary"} disabled={offline || !!pendingTopic} onClick={() => void setTopicSubscription(topic.id, !topic.subscribed)}>{pendingTopic === topic.id ? "Saving…" : topic.subscribed ? "Unsubscribe" : "Subscribe"}</Button>
        </li>)}
      </ul> : <p className="text-sm text-muted">{q || mine ? "No message types match your selection." : "No published message types yet. Types become available after messages are transmitted or received into the published store."}</p>}
    </Panel>
  </div>;
}
