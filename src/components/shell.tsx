"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  Anchor,
  BarChart3,
  BellRing,
  ChevronDown,
  FileText,
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
  WifiOff,
  ClipboardList,
  X,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { CURRENT_USER, MESSAGES } from "@/lib/data";
import { fmtDate, fmtTime } from "@/lib/format";
import { useNow } from "@/lib/use-now";
import { cx } from "./ui";

const NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/messages", label: "Messages", icon: Mail, badge: "unread" as const },
  { href: "/subscriptions", label: "Subscriptions", icon: Network },
  { href: "/search", label: "Search", icon: Search },
  { href: "/briefings", label: "Briefings", icon: FileText },
  { href: "/watch-turnover", label: "Watch Turnover", icon: ClipboardList },
  { href: "/offline", label: "Offline Mode", icon: WifiOff, badge: "sync" as const },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/audit", label: "Audit & Integrity", icon: ShieldCheck },
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
  const { offline } = useStore();
  const [open, setOpen] = useState(false);
  return (
    <header className="no-print sticky top-0 z-40 flex h-16 items-center gap-3 bg-gradient-to-r from-navy-950 via-navy-900 to-navy-800 px-3 text-white shadow-md sm:h-[72px] sm:px-4">
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
        <div className="hidden items-center gap-2 border-l border-white/25 pl-4 xl:flex">
          <Globe className="size-7" aria-hidden />
          <div className="leading-tight">
            <div className="text-sm font-semibold">{offline ? "DISCONNECTED AFLOAT" : "C2OIX FEED ONLINE"}</div>
            <div className="text-[11px] text-white/80">{offline ? "No external network" : "Last ingest 2 min ago"}</div>
          </div>
        </div>
        <div className="border-l border-white/25 pl-4">
          <Clock />
        </div>
        <div className="relative border-l border-white/25 pl-3">
          <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-md p-1 hover:bg-white/10" aria-expanded={open}>
            <span className="flex size-10 items-center justify-center rounded-full border-2 border-gold bg-navy-700 text-sm font-bold">LT</span>
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
                <div className="mt-1 text-xs text-green-700">CAC authenticated</div>
              </div>
              <Link href="/profile" className="flex items-center gap-2 px-3 py-2 hover:bg-navy-50" onClick={() => setOpen(false)}>
                <Settings className="size-4" /> Profile & Settings
              </Link>
              <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-navy-50" onClick={() => setOpen(false)}>
                <LogOut className="size-4" /> Sign out (remove CAC)
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function Sidebar({ open, onClose }: { open: boolean | null; onClose: () => void }) {
  const path = usePathname();
  const { userState, syncQueue, approvals } = useStore();
  const unread = MESSAGES.filter((m) => userState[m.id]?.read !== "read").length;
  const badges = { unread, sync: syncQueue.length, approvals: approvals.length };

  return (
    <>
      {open === true && <div className="no-print fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={onClose} aria-hidden />}
      <nav
        aria-label="Main"
        className={cx(
          "no-print fixed inset-y-0 left-0 z-30 flex w-60 flex-col bg-gradient-to-b from-navy-900 via-navy-950 to-[#04101f] pt-16 text-white transition-transform sm:pt-[72px] lg:sticky lg:top-[72px] lg:h-[calc(100vh-72px-40px)] lg:pt-0",
          open === null ? "-translate-x-full lg:translate-x-0" : open ? "translate-x-0" : "-translate-x-full lg:hidden",
        )}
      >
        <button type="button" onClick={onClose} className="absolute right-2 top-[76px] p-1 lg:hidden" aria-label="Close navigation">
          <X className="size-5" />
        </button>
        <ul className="flex-1 overflow-y-auto py-2">
          {NAV.map(({ href, label, icon: Icon, badge }) => {
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
        <div className="border-t border-white/15 px-6 py-5 text-[15px] font-semibold leading-7 tracking-[0.2em] text-gold">
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
  const { userState, offline } = useStore();
  const pending = MESSAGES.filter((m) => m.ackRequired && m.lifecycle !== "SUPERSEDED" && m.lifecycle !== "CANCELLED" && !userState[m.id]?.acknowledgedAt);
  return (
    <>
      {offline && (
        <div className="no-print flex items-center gap-2 bg-amber-100 px-4 py-2 text-sm text-amber-900">
          <WifiOff className="size-4" aria-hidden />
          <strong>EMCON / offline.</strong> You are working from the local data store. Changes are queued and will sync when connectivity returns.
          <Link href="/offline" className="ml-auto font-semibold underline">Offline status</Link>
        </div>
      )}
      {pending.length > 0 && (
        <div role="alert" className="no-print flex flex-wrap items-center gap-2 bg-red-700 px-4 py-2 text-sm text-white">
          <BellRing className="size-4" aria-hidden />
          <strong>Mandatory:</strong> {pending.length} message{pending.length > 1 ? "s" : ""} require your acknowledgement.
          <Link href="/#acknowledge" className="ml-auto font-semibold underline">Review now</Link>
        </div>
      )}
    </>
  );
}

function Footer() {
  return (
    <footer className="no-print sticky bottom-0 z-40 flex h-10 items-center gap-3 overflow-hidden bg-navy-950 px-4 text-[13px] tracking-wide text-white">
      <span className="hidden sm:inline">UNITED STATES NAVY</span>
      <span className="hidden text-white/40 sm:inline">|</span>
      <span>ANCHOR</span>
      <span className="text-white/40">|</span>
      <span className="truncate text-amber-300">PROTOTYPE · MOCK DATA ONLY · NOT AN OFFICIAL RECORD</span>
      <span className="ml-auto hidden items-center gap-3 border-l-2 border-gold pl-3 md:flex">
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
    <div className="flex min-h-screen flex-col">
      <Header onMenu={toggle} />
      <AlertStrip />
      <div className="flex flex-1">
        <Sidebar open={open} onClose={() => setOpen(false)} />
        <main className="print-full min-w-0 flex-1 px-4 py-5 sm:px-6">{children}</main>
      </div>
      <Footer />
      <Toast />
    </div>
  );
}

