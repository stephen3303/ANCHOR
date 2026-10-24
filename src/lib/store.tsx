"use client";

// Client-side app state for the prototype. Everything lives in memory and
// resets on reload; a real build would back this with the ANCHOR API.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import {
  APPROVAL_QUEUE,
  AUDIT_EVENTS,
  CURRENT_USER,
  INITIAL_USER_STATE,
  MESSAGES,
  SUBSCRIPTIONS,
  SYNC_QUEUE,
  TURNOVER_CHECKLIST,
  WATCH_NOTES,
} from "./data";
import { MOCK_NOW } from "./format";
import type { AuditEvent, Community, MessageUserState, Subscription, SyncItem } from "./types";

export interface BriefingConfig {
  name: string;
  purpose: string;
  range: string;
  format: string;
  communities: Community[];
  highOnly: boolean;
  actionOnly: boolean;
  unreadOnly: boolean;
  includeSuperseded: boolean;
  includeAiSummary: boolean;
}

export const DEFAULT_BRIEFING: BriefingConfig = {
  name: "Watch Turnover - 24 OCT 2026",
  purpose: "Watch Turnover",
  range: "Last 7 days",
  format: "Executive Summary",
  communities: ["Submarine Warfare", "Cybersecurity", "Readiness", "Policy"],
  highOnly: false,
  actionOnly: false,
  unreadOnly: false,
  includeSuperseded: false,
  includeAiSummary: true,
};

type ApprovalRequest = (typeof APPROVAL_QUEUE)[number];

interface Store {
  userState: Record<string, MessageUserState>;
  markRead: (id: string) => void;
  markUnread: (id: string) => void;
  markAllRead: () => void;
  toggleStar: (id: string) => void;
  acknowledge: (id: string) => void;

  subscriptions: Subscription[];
  toggleSubscription: (id: string) => void;
  requestSubscription: (s: Omit<Subscription, "id" | "status" | "subscribedOn" | "lastUpdated" | "requestedBy" | "mandatory">) => void;
  approvals: ApprovalRequest[];
  decideApproval: (id: string, approve: boolean) => void;

  offline: boolean;
  setOffline: (v: boolean) => void;
  syncQueue: SyncItem[];
  syncNow: () => void;
  lastSync: Date;

  audit: AuditEvent[];
  log: (action: string, resource: string, details?: string) => void;

  watchNotes: string[];
  setWatchNotes: (n: string[]) => void;
  checklist: Record<string, boolean>;
  toggleChecklist: (item: string) => void;

  briefing: BriefingConfig;
  setBriefing: (b: BriefingConfig) => void;

  toast: string | null;
  notify: (msg: string) => void;
}

const Ctx = createContext<Store | null>(null);

let seq = 0;
const nextId = (p: string) => `${p}-${Date.now()}-${seq++}`;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [userState, setUserState] = useState(INITIAL_USER_STATE);
  const [subscriptions, setSubscriptions] = useState(SUBSCRIPTIONS);
  const [approvals, setApprovals] = useState(APPROVAL_QUEUE);
  const [offline, setOfflineState] = useState(false);
  const [syncQueue, setSyncQueue] = useState<SyncItem[]>(SYNC_QUEUE);
  const [lastSync, setLastSync] = useState(new Date("2026-10-21T18:00:00Z"));
  const [audit, setAudit] = useState(AUDIT_EVENTS);
  const [watchNotes, setWatchNotes] = useState(WATCH_NOTES);
  const [checklist, setChecklist] = useState<Record<string, boolean>>(
    Object.fromEntries(TURNOVER_CHECKLIST.map((c, i) => [c, i < TURNOVER_CHECKLIST.length - 1])),
  );
  const [briefing, setBriefing] = useState(DEFAULT_BRIEFING);
  const [toast, setToast] = useState<string | null>(null);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 3500);
  }, []);

  const log = useCallback(
    (action: string, resource: string, details = "") => {
      setAudit((a) => [
        {
          id: nextId("evt"),
          timestamp: new Date().toISOString(),
          user: CURRENT_USER.login,
          action,
          resource,
          classification: "UNCLASSIFIED",
          result: "Success",
          sourceIp: "10.15.32.18",
          device: "ANCHOR-OPS-01",
          location: CURRENT_USER.unit,
          details: details || (offline ? "Recorded locally; will sync when connectivity returns." : "Recorded."),
        },
        ...a,
      ]);
    },
    [offline],
  );

  const queue = useCallback((type: SyncItem["type"], description: string) => {
    setSyncQueue((q) => [{ id: nextId("sync"), type, description, created: "Now", status: "Pending" }, ...q]);
  }, []);

  const patch = (id: string, p: Partial<MessageUserState>) =>
    setUserState((s) => ({ ...s, [id]: { ...s[id], ...p } }));

  const store: Store = useMemo(
    () => ({
      userState,
      markRead: (id) => userState[id]?.read !== "read" && patch(id, { read: "read" }),
      markUnread: (id) => patch(id, { read: "unread" }),
      markAllRead: () =>
        setUserState((s) =>
          Object.fromEntries(Object.entries(s).map(([k, v]) => [k, { ...v, read: "read" as const }])),
        ),
      toggleStar: (id) => patch(id, { starred: !userState[id]?.starred }),
      acknowledge: (id) => {
        const m = MESSAGES.find((x) => x.id === id);
        patch(id, { acknowledgedAt: (offline ? MOCK_NOW : new Date()).toISOString(), read: "read" });
        log("Acknowledge", `Message (${m?.reference})`, offline ? "Acknowledged offline; queued for sync." : "Receipt acknowledged.");
        if (offline) queue("Acknowledgement", `Ack: ${m?.reference}`);
        notify(`Acknowledged ${m?.reference}${offline ? " (queued for sync)" : ""}`);
      },

      subscriptions,
      toggleSubscription: (id) => {
        const s = subscriptions.find((x) => x.id === id);
        if (!s || s.mandatory || s.status === "Pending Approval") return;
        const status = s.status === "Active" ? "Paused" : "Active";
        setSubscriptions((all) => all.map((x) => (x.id === id ? { ...x, status } : x)));
        log("Update Subscription", s.name, `Subscription ${status.toLowerCase()}.`);
        if (offline) queue("Subscription", `${s.name}: ${status}`);
      },
      requestSubscription: (s) => {
        const sub: Subscription = {
          ...s,
          id: nextId("sub"),
          status: "Pending Approval",
          mandatory: false,
          subscribedOn: "—",
          lastUpdated: "24 OCT 2026",
          requestedBy: CURRENT_USER.name,
        };
        setSubscriptions((all) => [...all, sub]);
        log("Request Subscription", s.name, "Routed to unit Subscription Approver.");
        if (offline) queue("Subscription", `Request: ${s.name}`);
        notify(`Request for "${s.name}" sent for approval`);
      },
      approvals,
      decideApproval: (id, approve) => {
        const r = approvals.find((a) => a.id === id);
        setApprovals((all) => all.filter((a) => a.id !== id));
        log(approve ? "Approve Subscription" : "Deny Subscription", `${r?.name} for ${r?.requester}`);
        notify(`${approve ? "Approved" : "Denied"} ${r?.requester}'s request`);
      },

      offline,
      setOffline: (v) => {
        setOfflineState(v);
        notify(v ? "EMCON / offline mode: working from local store" : "Connectivity restored");
      },
      syncQueue,
      syncNow: () => {
        if (offline) {
          notify("Cannot sync while offline");
          return;
        }
        const n = syncQueue.length;
        setSyncQueue([]);
        setLastSync(new Date());
        log("Sync", `Offline cache (${n} items)`, "Queued items replicated. Hashes verified.");
        notify(`Synced ${n} items`);
      },
      lastSync,

      audit,
      log,

      watchNotes,
      setWatchNotes: (n) => {
        setWatchNotes(n);
        log("Update Watch Notes", "Watch Turnover");
        if (offline) queue("Watch Notes", "Watch notes");
      },
      checklist,
      toggleChecklist: (item) => setChecklist((c) => ({ ...c, [item]: !c[item] })),

      briefing,
      setBriefing,

      toast,
      notify,
    }),
    [userState, subscriptions, approvals, offline, syncQueue, lastSync, audit, watchNotes, checklist, briefing, toast, log, notify, queue],
  );

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore must be used inside StoreProvider");
  return s;
}
