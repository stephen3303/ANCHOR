"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Database,
  Download,
  FilePlus2,
  FileText,
  Mail,
  NotebookPen,
  RefreshCw,
  Settings,
  Wifi,
  WifiOff,
  Wrench,
} from "lucide-react";
import { MESSAGES } from "@/lib/data";
import { fmtDateTime } from "@/lib/format";
import { useStore } from "@/lib/store";
import { MiniMessageTable } from "@/components/message";
import { Button, Panel, PrecedenceBadge, Select, StatusDot, Tabs, TextInput, Toggle, cx, tableWrap, td, th, theadRow, tbodyRow } from "@/components/ui";

type Tab = "overview" | "cached" | "create" | "queue" | "settings";

export default function OfflinePage() {
  const { offline, setOffline, syncQueue, syncNow, lastSync, queueLocal, notify } = useStore();
  const [tab, setTab] = useState<Tab>("overview");
  const [subject, setSubject] = useState("");
  const [ref, setRef] = useState("");
  const [note, setNote] = useState("");

  const conn = [
    { icon: offline ? WifiOff : Wifi, label: "External Network", value: offline ? "Disconnected" : "Connected", ok: !offline },
    { icon: Database, label: "Local Database", value: "Online", ok: true },
    { icon: FileText, label: "Message Access", value: "Available", ok: true },
    { icon: Settings, label: "Core Features", value: "Operational", ok: true },
  ];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <WifiOff className="mt-1 size-10 text-ink" strokeWidth={1.75} aria-hidden />
          <div>
            <h1 className="text-2xl font-bold sm:text-[28px]">Offline / Resilient Mode</h1>
            <p className="text-[15px] text-muted">Continue mission operations in disconnected or EMCON conditions. Access cached data, create records, and sync when connectivity returns.</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-md border border-line bg-white px-3 py-2">
          <span className="text-sm font-semibold">Simulate EMCON</span>
          <Toggle label="Simulate EMCON / offline" checked={offline} onChange={setOffline} />
        </div>
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-[1.1fr_1.2fr_0.9fr]">
        <div className={cx("flex flex-wrap items-center gap-4 rounded-lg border p-4 shadow-sm", offline ? "border-green-300 bg-green-50" : "border-line bg-white")}>
          <CheckCircle2 className={cx("size-10", offline ? "text-green-600" : "text-navy-600")} />
          <div className="flex-1">
            <div className="text-xl font-bold">{offline ? "Offline Mode Active" : "Online, Offline-Ready"}</div>
            <div className="text-sm">{offline ? "Operating on local data store. All essential functions available." : "Local store is current and ready for EMCON."}</div>
          </div>
          <div className="border-l border-line pl-4 text-sm">
            <div className="text-muted">Last Sync (Successful)</div>
            <div className="font-semibold" suppressHydrationWarning>{fmtDateTime(lastSync)}</div>
          </div>
        </div>
        <Panel title="Connection Status">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {conn.map(({ icon: Icon, label, value, ok }) => (
              <div key={label} className="text-center">
                <Icon className={cx("mx-auto size-7", ok ? "text-green-600" : "text-red-600")} aria-hidden />
                <div className="mt-1 text-sm">{label}</div>
                <div className={cx("text-sm font-semibold", ok ? "text-green-700" : "text-red-700")}>{value}</div>
              </div>
            ))}
          </div>
        </Panel>
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <RefreshCw className="size-8 text-ink" />
            <div>
              <div className="text-lg font-bold">{syncQueue.length ? "Sync Pending" : "Fully Synced"}</div>
              <div className="text-sm">{syncQueue.length} items will sync when connectivity is restored.</div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="warning" onClick={() => setTab("queue")}>View Sync Queue</Button>
            <Button variant="primary" disabled={offline || !syncQueue.length} onClick={syncNow}>Sync Now</Button>
          </div>
        </div>
      </div>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "cached", label: "Cached Messages" },
          { id: "create", label: "Create Record" },
          { id: "queue", label: `Sync Queue (${syncQueue.length})` },
          { id: "settings", label: "Settings" },
        ]}
      />

      {tab === "overview" && (
        <div className="grid gap-4 xl:grid-cols-3">
          <Panel title="Local Data Store" icon={Database}>
            <p className="mb-3 text-sm text-muted">Messages and records available offline.</p>
            <div className="grid grid-cols-2 gap-4">
              {[["1,842", "Messages Cached", Mail], ["24", "Briefings Cached", FileText], ["12", "Templates", FileText], ["128", "Reference Docs", FileText]].map(([v, l, I]) => {
                const Icon = I as typeof Mail;
                return (
                  <div key={l as string} className="flex items-center gap-3">
                    <Icon className="size-7 text-navy-700" />
                    <div><div className="text-xl font-bold">{v as string}</div><div className="text-sm">{l as string}</div></div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex items-center gap-3">
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-200"><div className="h-full w-[63%] bg-green-600" /></div>
              <span className="text-sm font-semibold">63%</span>
            </div>
            <div className="mt-1 text-sm text-muted">3.2 GB of 5 GB used</div>
          </Panel>
          <Panel title="Available Capabilities" icon={Settings}>
            <p className="mb-2 text-sm text-muted">Core functions remain available offline.</p>
            <ul className="space-y-1.5 text-[15px]">
              {["View cached messages and attachments", "Acknowledge messages (queued)", "Create local message records", "Build and view briefings", "Request subscriptions (queued)", "Search cached content", "Execute watch turnover", "Stage items for sync when online"].map((c) => (
                <li key={c} className="flex items-center gap-2"><CheckCircle2 className="size-5 text-green-600" /> {c}</li>
              ))}
            </ul>
          </Panel>
          <QueueTable />
          <Panel title="Recent Messages (Cached)" icon={Mail} className="xl:col-span-2">
            <MiniMessageTable items={MESSAGES.slice(0, 5)} cols={["subject", "reference", "date", "class"]} />
          </Panel>
          <Panel title="Offline Tools" icon={Wrench}>
            <div className="grid gap-2">
              <Button icon={FilePlus2} onClick={() => setTab("create")}>Create Message Record</Button>
              <Button icon={FileText} href="/briefings">Build Briefing</Button>
              <Button icon={NotebookPen} href="/watch-turnover">Add Watch Note</Button>
              <Button icon={Download} onClick={() => notify("Export staged to removable media (encrypted)")}>Export Local Data</Button>
            </div>
          </Panel>
        </div>
      )}

      {tab === "cached" && (
        <Panel title="Cached Messages">
          <MiniMessageTable items={MESSAGES} cols={["subject", "reference", "prec", "date", "class"]} />
        </Panel>
      )}

      {tab === "create" && (
        <Panel title="Create Local Message Record" className="max-w-2xl">
          <p className="mb-3 text-sm text-muted">
            Record traffic received by other means (for example over a broadcast) while disconnected. The record is marked LOCAL and is reconciled against the C2OIX source when the unit reconnects.
          </p>
          <div className="space-y-3">
            <TextInput label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            <TextInput label="Reference / DTG" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. COMSUBLANT 081/26 251200Z OCT 26" />
            <label className="block text-sm">
              <span className="mb-1 block font-semibold">Notes</span>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} className="w-full rounded-md border border-line p-2 text-sm focus:outline-2 focus:outline-navy-600" />
            </label>
            <Button
              variant="primary"
              disabled={!subject.trim()}
              onClick={() => {
                queueLocal("Message Record", `Local record: ${subject}`);
                notify("Local record saved and queued for sync");
                setSubject("");
                setRef("");
                setNote("");
                setTab("queue");
              }}
            >
              Save Local Record
            </Button>
          </div>
        </Panel>
      )}

      {tab === "queue" && <QueueTable />}

      {tab === "settings" && (
        <Panel title="Offline & Sync Settings" className="max-w-2xl">
          <div className="space-y-4 text-sm">
            <Select label="Keep messages available offline for" value="30 days" options={["7 days", "30 days", "90 days"]} />
            <div>
              <div className="mb-1 font-semibold">Bandwidth-aware replication order</div>
              <ol className="ml-5 list-decimal space-y-1">
                <li><PrecedenceBadge p="FLASH" /> and <PrecedenceBadge p="IMMEDIATE" /> traffic and acknowledgements</li>
                <li>Mandatory subscriptions and status changes (superseded, cancelled)</li>
                <li><PrecedenceBadge p="PRIORITY" /> traffic</li>
                <li><PrecedenceBadge p="ROUTINE" /> traffic, then attachments over 1 MB</li>
              </ol>
            </div>
            <div className="flex items-center justify-between"><span>Auto sync when connectivity returns</span><Toggle label="Auto sync" checked onChange={() => notify("Auto sync is required by policy")} /></div>
            <div className="flex items-center justify-between"><span>Defer attachments during low bandwidth</span><Toggle label="Defer attachments" checked onChange={() => {}} /></div>
          </div>
        </Panel>
      )}
    </>
  );
}

function QueueTable() {
  const { syncQueue } = useStore();
  return (
    <Panel title={`Sync Queue (${syncQueue.length})`} icon={RefreshCw}>
      <p className="mb-2 text-sm text-muted">Items that will sync when connectivity is restored.</p>
      {syncQueue.length ? (
        <div className={tableWrap}>
          <table className="w-full">
            <thead><tr className={theadRow}><th className={th}>Type</th><th className={th}>Description</th><th className={th}>Created</th><th className={th}>Status</th></tr></thead>
            <tbody>
              {syncQueue.map((q) => (
                <tr key={q.id} className={tbodyRow}>
                  <td className={td}>{q.type}</td>
                  <td className={td}>{q.description}</td>
                  <td className={td}>{q.created}</td>
                  <td className={td}><StatusDot tone="amber">{q.status}</StatusDot></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="py-6 text-center text-sm text-green-700">Everything is synced.</p>
      )}
    </Panel>
  );
}
