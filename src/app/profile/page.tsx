"use client";

import { useState } from "react";
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  Clock,
  Database,
  FileText,
  History,
  KeyRound,
  Lock,
  Mail,
  Megaphone,
  Monitor,
  Pencil,
  RefreshCw,
  RotateCcw,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
  User,
  Users,
  Volume2,
  List,
} from "lucide-react";
import { CURRENT_USER } from "@/lib/data";
import { fmtDateTime } from "@/lib/format";
import { useStore } from "@/lib/store";
import { Button, PageHeader, Panel, Pill, Select, Toggle, th, theadRow } from "@/components/ui";

const NOTIF_TYPES = [
  { key: "high", label: "High Priority Messages", icon: AlertCircle, locked: true },
  { key: "subs", label: "New Subscription Traffic", icon: Mail },
  { key: "ack", label: "Acknowledgement Due", icon: Bell, locked: true },
  { key: "actions", label: "Action Item Assignments", icon: FileText },
  { key: "watch", label: "Watch Turnover Updates", icon: Users },
  { key: "sys", label: "System Announcements", icon: Megaphone },
  { key: "sec", label: "Security Alerts", icon: ShieldAlert, locked: true },
];

export default function ProfilePage() {
  const { notify, syncNow, offline, lastSync } = useStore();
  const [prefs, setPrefs] = useState({ previews: true, sounds: true, desktop: true, compact: false });
  const [view, setView] = useState("Home");
  const [perPage, setPerPage] = useState("25");
  const [notif, setNotif] = useState<Record<string, [boolean, boolean, boolean]>>({
    high: [true, true, true],
    subs: [true, true, false],
    ack: [true, true, true],
    actions: [true, true, false],
    watch: [true, false, false],
    sys: [true, true, false],
    sec: [true, true, true],
  });

  return (
    <>
      <PageHeader icon={Settings} title="Profile & Settings" subtitle="Manage your account, preferences, and system configuration." />

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="User Profile" icon={User} action={<Button size="sm" icon={Pencil} onClick={() => notify("Profile data comes from your CAC and command personnel record")}>Edit Profile</Button>}>
          <div className="mb-4 flex items-center gap-4">
            <span className="flex size-24 items-center justify-center rounded-full border-4 border-gold bg-navy-800 text-3xl font-bold text-white">LT</span>
            <div>
              <div className="text-xl font-bold">{CURRENT_USER.name}</div>
              <div className="text-link">{CURRENT_USER.community}</div>
              <div className="text-link">{CURRENT_USER.billet}</div>
              <Pill className="mt-1 bg-green-100 text-green-800"><CheckCircle2 className="size-3" /> Active</Pill>
            </div>
          </div>
          <dl className="grid grid-cols-[90px_1fr] gap-y-2 border-t border-line pt-3 text-sm">
            <dt className="text-muted">Rank</dt><dd>{CURRENT_USER.rank}</dd>
            <dt className="text-muted">Command</dt><dd>{CURRENT_USER.command}</dd>
            <dt className="text-muted">Unit</dt><dd>{CURRENT_USER.unit}</dd>
            <dt className="text-muted">Email (NIPR)</dt><dd>{CURRENT_USER.email}</dd>
            <dt className="text-muted">Phone (DSN)</dt><dd>{CURRENT_USER.dsn}</dd>
            <dt className="text-muted">Groups</dt><dd>{CURRENT_USER.groups.join(", ")}</dd>
          </dl>
        </Panel>

        <Panel title="Roles & Permissions" icon={KeyRound} action={<Button size="sm" icon={Users} onClick={() => notify("Role changes are requested through your System Admin")}>Request Role</Button>}>
          <p className="mb-3 text-sm text-muted">Your roles determine access to features and data.</p>
          <ul className="space-y-2">
            {CURRENT_USER.roles.map((r) => (
              <li key={r.name} className="flex items-center gap-3">
                <FileText className="size-6 text-navy-700" />
                <div className="flex-1">
                  <div className="font-semibold">{r.name}</div>
                  <div className="text-xs text-muted">{r.detail}</div>
                </div>
                {r.granted ? <Pill className="bg-green-100 text-green-800">Granted</Pill> : <Pill className="bg-slate-200 text-slate-600">Not Granted</Pill>}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Preferences" icon={SlidersHorizontal} action={<Button size="sm" icon={RotateCcw} onClick={() => setPrefs({ previews: true, sounds: true, desktop: true, compact: false })}>Reset to Default</Button>}>
          <div className="space-y-3">
            <Select label="Default View" value={view} onChange={setView} options={["Home", "Messages", "Briefings", "Watch Turnover"]} />
            <Select label="Items per Page" value={perPage} onChange={setPerPage} options={["25", "50", "100"]} />
            <Select label="Date Format" value="DD MMM YYYY" options={["DD MMM YYYY", "YYYY-MM-DD"]} />
            <Select label="Time Format" value="Zulu (1830Z)" options={["Zulu (1830Z)", "Local 24 hour (1830L)"]} />
            {([
              ["previews", "Show Message Previews", Mail],
              ["sounds", "Play Notification Sounds", Volume2],
              ["desktop", "Enable Desktop Notifications", Bell],
              ["compact", "Compact View", List],
            ] as const).map(([k, label, Icon]) => (
              <div key={k} className="flex items-center gap-3 text-sm">
                <Icon className="size-5 text-navy-700" />
                <span className="flex-1">{label}</span>
                <Toggle label={label} checked={prefs[k]} onChange={(v) => setPrefs({ ...prefs, [k]: v })} />
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Notification Settings" icon={Bell}>
          <p className="mb-2 text-sm text-muted">Locked rows are mandatory by command policy.</p>
          <table className="w-full text-sm">
            <thead>
              <tr className={theadRow}>
                <th className={th}>Type</th>
                <th className={th}>In-App</th>
                <th className={th}>Email</th>
                <th className={th}>Teams</th>
              </tr>
            </thead>
            <tbody>
              {NOTIF_TYPES.map(({ key, label, icon: Icon, locked }) => (
                <tr key={key} className="border-b border-line/70">
                  <td className="py-2 pr-2">
                    <span className="flex items-center gap-2">
                      <Icon className="size-4 text-navy-700" /> {label} {locked && <Lock className="size-3 text-muted" aria-label="Mandatory" />}
                    </span>
                  </td>
                  {[0, 1, 2].map((i) => (
                    <td key={i} className="py-2">
                      <Toggle
                        label={`${label} channel ${i + 1}`}
                        checked={notif[key][i]}
                        disabled={locked && i < 2}
                        onChange={(v) => {
                          const next = [...notif[key]] as [boolean, boolean, boolean];
                          next[i] = v;
                          setNotif({ ...notif, [key]: next });
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="Data & Storage" icon={Database}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span>Local Cache Usage: 3.2 GB of 5 GB</span>
            <Button size="sm" icon={Trash2} onClick={() => notify("Cache cleared except mandatory and unsynced items")}>Clear Cache</Button>
          </div>
          <div className="mb-4 flex items-center gap-2">
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-200"><div className="h-full w-[64%] bg-green-600" /></div>
            <span className="text-sm">64%</span>
          </div>
          <Select label="Keep messages available offline for" value="30 days" options={["7 days", "30 days", "90 days"]} />
          <div className="my-4 flex items-center justify-between text-sm">
            <div><div className="font-semibold">Auto Sync</div><div className="text-xs text-muted">Sync automatically when connectivity is restored</div></div>
            <Toggle label="Auto sync" checked onChange={() => notify("Auto sync is required by policy")} />
          </div>
          <div className="flex items-center gap-4">
            <Button icon={RefreshCw} disabled={offline} onClick={syncNow}>Sync Now</Button>
            <div className="text-sm">
              <div className="font-semibold">Last Sync</div>
              <div suppressHydrationWarning>{fmtDateTime(lastSync)}</div>
              <div className="flex items-center gap-1 text-green-700"><CheckCircle2 className="size-4" /> Successful</div>
            </div>
          </div>
        </Panel>

        <Panel title="Security Settings" icon={Lock}>
          <p className="mb-3 text-sm text-muted">Manage your authentication and session settings.</p>
          <div className="space-y-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-semibold">CAC/PKI Authentication</span>
              <span className="flex items-center gap-1 text-green-700"><CheckCircle2 className="size-4" /> Enabled</span>
            </div>
            <Select label="Session Timeout" value="15 minutes idle" options={["15 minutes idle", "30 minutes idle"]} />
            <div className="flex items-center justify-between">
              <div><div className="font-semibold">Require Re-Authentication</div><div className="text-xs text-muted">For sensitive actions (export, admin)</div></div>
              <Toggle label="Require re-authentication" checked disabled />
            </div>
            <div className="flex items-center justify-between"><span className="font-semibold">Device Management</span><Button size="sm" icon={Monitor} onClick={() => notify("2 devices: ANCHOR-OPS-01, ANCHOR-WS-03")}>View Devices</Button></div>
            <div className="flex items-center justify-between"><span className="font-semibold">Login History</span><Button size="sm" icon={History} href="/audit">View Activity</Button></div>
            <div className="flex items-center gap-1 text-xs text-muted"><Clock className="size-3" /> Signed in with CAC at 24 OCT 2026 1515Z</div>
          </div>
        </Panel>
      </div>
    </>
  );
}
