"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  Anchor,
  BarChart3,
  BellRing,
  ChevronDown,
  FilePenLine,
  FilePlus2,
  Globe,
  Home,
  LogOut,
  Mail,
  Menu,
  Network,
  Search,
  Settings,
  ShieldCheck,
  UserCog,
  Waypoints,
  WifiOff,
  RadioTower,
  X,
} from "lucide-react";
import { AUDITOR, hasRole, MESSAGE_ADMIN, REPORT_VIEWER, SUBSCRIPTION_APPROVER, type RoleName } from "@/lib/roles";
import { useStore } from "@/lib/store";
import { useRouting } from "@/lib/routing-store";
import { needsOwnAck } from "@/lib/data";
import { useUserSession } from "@/lib/current-user";
import { fmtDate, fmtDateTime, fmtTime } from "@/lib/format";
import { useSim } from "@/lib/sim-store";
import { NODES, STATIONS } from "@/lib/sim";
import { useNow } from "@/lib/use-now";
import { cx } from "./ui";

const NAV: { href: string; label: string; icon: typeof Home; badge?: "unread" | "routing" | "sync" | "approvals"; role?: RoleName }[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/messages", label: "Messages", icon: Mail, badge: "unread" as const },
  { href: "/templates", label: "Message Templates", icon: FilePlus2 },
  { href: "/subscriptions", label: "Subscriptions", icon: Network },
  { href: "/search", label: "Search", icon: Search },
  { href: "/drafting", label: "Drafting & Release", icon: FilePenLine, badge: "routing" as const },
  { href: "/transmissions", label: "Transmission Queue", icon: RadioTower },
  { href: "/reports", label: "Reports", icon: BarChart3, role: REPORT_VIEWER },
  { href: "/audit", label: "Audit & Integrity", icon: ShieldCheck, role: AUDITOR },
  { href: "/network", label: "Comms & Network", icon: Waypoints, badge: "sync" as const },
  { href: "/admin", label: "Admin", icon: UserCog, badge: "approvals" as const },
  { href: "/profile", label: "Profile & Settings", icon: Settings },
];

function Clock() {
  const now = useNow();
  return (
    <div className="hidden text-right leading-tight lg:block">
      <div className="text-[15px] font-semibold">{now ? fmtDate(now) : "--"}</div>
      <div className="text-[15px]">{now ? fmtTime(now) : ""}</div>
    </div>
  );
}

function Header({ onMenu }: { onMenu: () => void }) {
  const { user: CURRENT_USER, signOut } = useUserSession();
  const { offline } = useStore();
  const watchView = usePathname() === "/watch-turnover";
  const [open, setOpen] = useState(false);
  return (
    <header className="no-print relative z-40 flex h-16 shrink-0 items-center gap-3 bg-gradient-to-r from-navy-950 via-navy-900 to-navy-800 px-3 text-white shadow-md sm:h-[72px] sm:px-4">
      <button type="button" onClick={onMenu} aria-label="Toggle navigation" className="rounded-md border border-white/30 p-1.5 hover:bg-white/10">
        <Menu className="size-6" />
      </button>
      <Link href="/" className="flex items-center gap-2">
        <Anchor className="size-8 text-gold" strokeWidth={2.25} aria-hidden />
        <span className="text-2xl font-extrabold tracking-wide sm:text-[34px]">ANCHOR</span>
      </Link>
      <div className="hidden border-l-2 border-gold pl-3 text-[13px] leading-tight tracking-wide md:block xl:text-[15px]">
        AUTHORITATIVE NAVAL COMMUNICATIONS HUB
        <br />
        FOR OFFICIAL RECORDS
      </div>

      <div className="ml-auto flex items-center gap-4">
        <div className="hidden items-center gap-2 sm:flex">
          <span className={cx("size-3.5 rounded-full", offline ? "bg-amber-400" : "bg-green-500")} aria-hidden />
          <div className="leading-tight">
            <div className={cx("text-sm font-semibold", offline ? "text-amber-300" : "text-green-400")}>
              {offline ? "EMCON / OFFLINE" : "UNCLASSIFIED"}
            </div>
            {offline && <div className="text-[11px] text-white/80">Local operations active</div>}
          </div>
        </div>
        <ConnectionStatus watchView={watchView} />
        <div className="border-l border-white/25 pl-4">
          {watchView ? <span className="hidden text-xs lg:block">Reporting clock<br />shown below</span> : <Clock />}
        </div>
        <div className="relative border-l border-white/25 pl-3">
          <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-md p-1 hover:bg-white/10" aria-expanded={open}>
            <span className="flex size-10 items-center justify-center rounded-full border-2 border-gold bg-navy-700 text-sm font-bold">{CURRENT_USER.rank || CURRENT_USER.name.slice(0, 2)}</span>
            <span className="hidden text-left leading-tight sm:block">
              <span className="block text-[15px] font-semibold">{CURRENT_USER.name}</span>
              <span className="block text-xs text-white/80">{CURRENT_USER.community}</span>
            </span>
            <ChevronDown className="size-4" />
          </button>
          {open && (
            <div className="absolute right-0 mt-2 w-60 rounded-md border border-line bg-white py-1 text-sm text-ink shadow-lg" onMouseLeave={() => setOpen(false)}>
              <div className="border-b border-line px-3 py-2">
                <div className="font-semibold">{CURRENT_USER.name}</div>
                <div className="text-xs text-muted">{CURRENT_USER.unit}</div>
                <div className="mt-1 text-xs text-amber-700">Demo account · {CURRENT_USER.commandName}</div>
              </div>
              <Link href="/profile" className="flex items-center gap-2 px-3 py-2 hover:bg-navy-50" onClick={() => setOpen(false)}>
                <Settings className="size-4" /> Profile & Settings
              </Link>
              <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-navy-50" onClick={() => { setOpen(false); void signOut(); }}>
                <LogOut className="size-4" /> Sign out / switch account
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

/** Header connection status: the C2OIX circuit, the workstation links and the sync queue in one place. */
function ConnectionStatus({ watchView }: { watchView: boolean }) {
  const { offline, syncQueue, syncNow, lastSync } = useStore();
  const { links } = useSim();
  const [open, setOpen] = useState(false);
  const reachable = STATIONS.filter((s) => links[s].state === "up");
  const rows: { label: string; value: string; ok: boolean }[] = [
    { label: "C2OIX circuit", value: offline ? "Down (EMCON)" : "Up", ok: !offline },
    { label: "ANCHOR server", value: "Online", ok: true },
    ...STATIONS.map((s) => ({ label: `${NODES[s].code} ${NODES[s].name.replace(" workstation", "")}`, value: links[s].state === "up" ? "Connected" : "Offline", ok: links[s].state === "up" })),
  ];
  return (
    <div className="relative hidden border-l border-white/25 pl-4 xl:block">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex items-center gap-2 rounded-md p-1 text-left hover:bg-white/10">
        <Globe className="size-7" aria-hidden />
        <span className="leading-tight">
          <span className="block text-sm font-semibold">{watchView ? "DEMO FEED · UNVERIFIED" : offline ? "DISCONNECTED AFLOAT" : "C2OIX FEED ONLINE"}</span>
          <span className="block text-[11px] text-white/80">
            {watchView ? "Successful ingest not recorded" : `${reachable.length} of 3 workstations${syncQueue.length ? ` · ${syncQueue.length} to sync` : ""}`}
          </span>
        </span>
        <ChevronDown className="size-4" aria-hidden />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-72 rounded-md border border-line bg-white p-3 text-sm text-ink shadow-lg" onMouseLeave={() => setOpen(false)}>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Connection status</div>
          <ul className="space-y-1">
            {rows.map((r) => (
              <li key={r.label} className="flex items-center justify-between gap-2">
                <span>{r.label}</span>
                <span className={cx("font-semibold", r.ok ? "text-green-700" : "text-red-700")}>{r.value}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 border-t border-line pt-2">
            <div className="flex items-center justify-between gap-2">
              <span>{syncQueue.length ? `${syncQueue.length} item${syncQueue.length === 1 ? "" : "s"} queued for sync` : "Fully synced"}</span>
              <button type="button" className="font-semibold text-link hover:underline disabled:cursor-not-allowed disabled:text-muted disabled:no-underline" disabled={offline || !syncQueue.length} onClick={syncNow}>Sync now</button>
            </div>
            <div className="text-xs text-muted" suppressHydrationWarning>Last sync {fmtDateTime(lastSync)}{offline ? " · syncs when the circuit returns" : ""}</div>
          </div>
          <Link href="/network" onClick={() => setOpen(false)} className="mt-3 block font-semibold text-link hover:underline">Open Comms & Network</Link>
        </div>
      )}
    </div>
  );
}

function Sidebar({ open, onClose }: { open: boolean | null; onClose: () => void }) {
  const path = usePathname();
  const { userState, syncQueue, approvals, messages } = useStore();
  const { drafts, actorId } = useRouting();
  const unread = messages.filter((m) => userState[m.id]?.read !== "read").length;
  const routing = drafts.filter((d) => d.status === "in_routing" && d.route.find((s) => s.status === "current")?.personId === actorId).length;
  const user = useUserSession().user;
  const badges = { unread, sync: syncQueue.length, approvals: hasRole(user, SUBSCRIPTION_APPROVER) ? approvals.length : 0, routing };

  return (
    <>
      {open === true && <div className="no-print fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={onClose} aria-hidden />}
      <nav
        aria-label="Main"
        className={cx(
          "no-print fixed top-0 bottom-10 left-0 z-30 flex min-h-0 w-60 shrink-0 flex-col bg-gradient-to-b from-navy-900 via-navy-950 to-[#04101f] pt-16 text-white transition-transform sm:pt-[72px] lg:static lg:z-auto lg:pt-0",
          open === null ? "-translate-x-full lg:translate-x-0" : open ? "translate-x-0" : "-translate-x-full lg:hidden",
        )}
      >
        <button type="button" onClick={onClose} className="absolute right-2 top-[76px] p-1 lg:hidden" aria-label="Close navigation">
          <X className="size-5" />
        </button>
        <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-2">
          {NAV.filter((item) => !item.role || hasRole(user, item.role)).map(({ href, label, icon: Icon, badge }) => {
            const active = href === "/" ? path === "/" : path.startsWith(href);
            const count = badge ? badges[badge] : 0;
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={() => window.innerWidth < 1024 && onClose()}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "flex items-center gap-3 px-5 py-3 text-[17px] transition-colors",
                    active ? "bg-navy-600 font-semibold" : "hover:bg-white/10",
                  )}
                >
                  <Icon className="size-6 shrink-0" strokeWidth={1.75} aria-hidden />
                  <span className="flex-1">{label}</span>
                  {count > 0 && (
                    <span className={cx("rounded-full px-2 text-xs font-bold", badge === "sync" ? "bg-gold text-navy-950" : "bg-white/20")}>{count}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="shrink-0 border-t border-white/15 px-6 py-5 text-[15px] font-semibold leading-7 tracking-[0.2em] text-gold">
          PEOPLE
          <br />
          INFORMATION
          <br />
          DECISIONS
          <br />
          MISSION SUCCESS
        </div>
      </nav>
    </>
  );
}

function AlertStrip() {
  const { userState, offline, messages, messageSource } = useStore();
  const user = useUserSession().user;
  const pending = messages.filter((m) => needsOwnAck(m) && !userState[m.id]?.acknowledgedAt);
  return (
    <>
      {messageSource === "bundled" && (
        <div role="status" className="no-print flex items-center gap-2 bg-slate-200 px-4 py-2 text-sm text-slate-800">
          <strong>Demo messages only.</strong> The server message store is not set up, so reads and acknowledgements are not saved. Run <code>npm run db:migrate</code> and <code>npm run db:seed:messages</code>.
        </div>
      )}
      {offline && (
        <div className="no-print flex items-center gap-2 bg-amber-100 px-4 py-2 text-sm text-amber-900">
          <WifiOff className="size-4" aria-hidden />
          <strong>EMCON / offline.</strong> You are working from the local data store. Changes are queued and will sync when connectivity returns.
          <Link href="/network" className="ml-auto font-semibold underline">Comms & Network</Link>
        </div>
      )}
      {pending.length > 0 && messageSource !== "loading" && (
        <div role="alert" className="no-print flex flex-wrap items-center gap-2 bg-red-700 px-4 py-2 text-sm text-white">
          <BellRing className="size-4" aria-hidden />
          <strong>Mandatory:</strong> {pending.length} message{pending.length > 1 ? "s" : ""} {pending.length > 1 ? "need" : "needs"} acknowledgement{hasRole(user, MESSAGE_ADMIN) ? " from you" : " by the Message Admin"}.
          <Link href="/#acknowledge" className="ml-auto font-semibold underline">Review now</Link>
        </div>
      )}
    </>
  );
}

function Footer() {
  return (
    <footer className="no-print relative z-40 flex h-10 shrink-0 items-center gap-3 overflow-hidden bg-navy-950 px-4 text-[13px] tracking-wide text-white">
      <span className="hidden sm:inline">UNITED STATES NAVY</span>
      <span className="hidden text-white/40 sm:inline">|</span>
      <span>ANCHOR</span>
      <span className="text-white/40">|</span>
      <span className="truncate text-amber-300">PROTOTYPE · MOCK DATA ONLY · NOT AN OFFICIAL RECORD</span>
      <span className="ml-auto shrink-0 text-white/60" title="App version and build commit">
        v{process.env.NEXT_PUBLIC_APP_VERSION} · {process.env.NEXT_PUBLIC_GIT_COMMIT}
      </span>
      <span className="hidden items-center gap-3 border-l-2 border-gold pl-3 md:flex">
        SECURE <span className="text-white/40">|</span> RELIABLE <span className="text-white/40">|</span> MISSION READY
      </span>
    </footer>
  );
}

function Toast() {
  const { toast } = useStore();
  if (!toast) return null;
  return (
    <div role="status" className="no-print fixed bottom-14 left-1/2 z-50 -translate-x-1/2 rounded-md bg-navy-900 px-4 py-2.5 text-sm text-white shadow-lg">
      {toast}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  // null = automatic: hidden on small screens, shown on large ones.
  const [open, setOpen] = useState<boolean | null>(null);
  const toggle = () => setOpen((o) => (o === null ? window.innerWidth < 1024 : !o));
  return (
    <div className="print-full flex min-h-0 flex-1 flex-col overflow-hidden">
      <Header onMenu={toggle} />
      <AlertStrip />
      <div className="print-full flex min-h-0 flex-1 overflow-hidden">
        <Sidebar open={open} onClose={() => setOpen(false)} />
        <main className="print-full min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">{children}</main>
      </div>
      <Footer />
      <Toast />
    </div>
  );
}

