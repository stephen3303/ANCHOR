"use client";

// Client-side app state for the prototype. Messages, reading state and
// acknowledgements come from the ANCHOR message store (/api/messages) once it
// answers; until then, or if the store is not set up, the bundled demo data is
// used. The rest lives in memory and resets on reload.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ACK_RECEIPTS,
  APPROVAL_QUEUE,
  AUDIT_EVENTS,
  INITIAL_USER_STATE,
  MESSAGES,
  SUBSCRIPTIONS,
  SYNC_QUEUE,
  TURNOVER_CHECKLIST,
  WATCH_NOTES,
} from "./data";
import { MOCK_NOW } from "./format";
import { appendEvent, chainLog, type ChainedAuditEvent } from "./audit";
import { useCurrentUser } from "./current-user";
import { hasRole, MESSAGE_ADMIN } from "./roles";
import type { ActionUpdate, WatchIssue } from "./watch-workspace";
import type { AckReceipt, Community, Message, MessageUserState, Subscription, SyncItem } from "./types";

/** Where the message list came from: still loading, the server's store, or the bundled demo data. */
export type MessageSource = "loading" | "server" | "bundled";

async function messageApi(path: string, method: string, body?: unknown) {
  const response = await fetch(path, {
    method,
    cache: "no-store",
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `The message store answered ${response.status}.`);
  return data;
}

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
  messages: Message[];
  messageSource: MessageSource;
  messageById: (id: string) => Message | undefined;
  messageByRef: (ref: string) => Message | undefined;
  /** Acknowledgements received from other commands for traffic this command sent, by message id. */
  ackReceipts: Record<string, AckReceipt[]>;
  /** Reload messages, reading state and acknowledgements from the server. */
  refreshMessages: () => Promise<void>;
  userState: Record<string, MessageUserState>;
  markRead: (id: string) => void;
  markUnread: (id: string) => void;
  markAllRead: () => void;
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
  queueLocal: (type: SyncItem["type"], description: string) => void;
  lastSync: Date;

  audit: ChainedAuditEvent[];
  log: (action: string, resource: string, details?: string, result?: ChainedAuditEvent["result"]) => void;
  /** Demonstration only: alter a stored event in place, bypassing the append path, so the integrity check has something to catch. */
  tamperAudit: (seq: number) => void;
  undoTamper: () => void;
  tampered: boolean;

  watchIssues: WatchIssue[];
  saveWatchIssue: (issue: Omit<WatchIssue, "by" | "at">) => void;
  watchActionUpdates: Record<string, ActionUpdate[]>;
  updateWatchAction: (id: string, status: ActionUpdate["status"], note: string) => void;
  watchNotesUpdated: { by: string; at: string } | null;
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
  const CURRENT_USER = useCurrentUser();
  const [messages, setMessages] = useState<Message[]>(MESSAGES);
  const [messageSource, setMessageSource] = useState<MessageSource>("loading");
  const [ackReceipts, setAckReceipts] = useState(ACK_RECEIPTS);
  const [userState, setUserState] = useState(INITIAL_USER_STATE);
  // Acknowledgements made offline, sent to the server on the next sync.
  const pendingAcks = useRef(new Set<string>());
  const [subscriptions, setSubscriptions] = useState(SUBSCRIPTIONS);
  const [approvals, setApprovals] = useState(APPROVAL_QUEUE);
  const [offline, setOfflineState] = useState(false);
  const [syncQueue, setSyncQueue] = useState<SyncItem[]>(SYNC_QUEUE);
  const [lastSync, setLastSync] = useState(new Date("2026-10-21T18:00:00Z"));
  const [audit, setAudit] = useState(() => chainLog(AUDIT_EVENTS));
  const [original, setOriginal] = useState<ChainedAuditEvent | null>(null);
  const [watchNotes, setWatchNotes] = useState(WATCH_NOTES);
  const [watchNotesUpdated, setWatchNotesUpdated] = useState<{ by: string; at: string } | null>(null);
  const [watchIssues, setWatchIssues] = useState<WatchIssue[]>([]);
  const [watchActionUpdates, setWatchActionUpdates] = useState<Record<string, ActionUpdate[]>>({});
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
    (action: string, resource: string, details = "", result: ChainedAuditEvent["result"] = "Success") => {
      // The only write path to the audit log: every event is chained to the one before it.
      setAudit((a) =>
        appendEvent(a, {
          id: nextId("evt"),
          timestamp: new Date().toISOString(),
          user: CURRENT_USER.login,
          action,
          resource,
          classification: "UNCLASSIFIED",
          result,
          sourceIp: "10.15.32.18",
          device: "ANCHOR-OPS-01",
          location: CURRENT_USER.unit,
          details: details || (offline ? "Recorded locally; will sync when connectivity returns." : "Recorded."),
        }),
      );
    },
    [offline, CURRENT_USER],
  );

  const queue = useCallback((type: SyncItem["type"], description: string) => {
    setSyncQueue((q) => [{ id: nextId("sync"), type, description, created: "Now", status: "Pending" }, ...q]);
  }, []);

  const patch = (id: string, p: Partial<MessageUserState>) =>
    setUserState((s) => ({ ...s, [id]: { ...s[id], ...p } }));

  const refreshMessages = useCallback(async () => {
    try {
      const data = await messageApi("/api/messages", "GET");
      if (!Array.isArray(data.messages) || !data.messages.length) throw new Error("The message store is empty.");
      setMessages(data.messages);
      // Keep acknowledgements made offline that the server hasn't seen yet.
      setUserState((local) => {
        const next: Record<string, MessageUserState> = data.userState;
        for (const id of pendingAcks.current) if (local[id]?.acknowledgedAt && next[id]) next[id] = { ...next[id], acknowledgedAt: local[id].acknowledgedAt };
        return next;
      });
      setAckReceipts(data.ackReceipts);
      setMessageSource("server");
    } catch {
      // Not migrated or seeded yet, or the database is down: keep the bundled demo data.
      setMessageSource((s) => (s === "server" ? s : "bundled"));
    }
  }, []);

  useEffect(() => {
    // Load once per signed-in account; the effect only starts the request.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshMessages();
  }, [refreshMessages, CURRENT_USER.id]);

  useEffect(() => {
    const refresh = () => { if (!offline && document.visibilityState === "visible") void refreshMessages(); };
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 15000);
    return () => { window.removeEventListener("focus", refresh); window.clearInterval(timer); };
  }, [refreshMessages, offline]);

  const online = messageSource === "server" && !offline;
  /** Write reading state through to the server; a failure only costs the server copy, so say so and carry on. */
  const saveState = useCallback(
    (id: string, change: { read: MessageUserState["read"] }) => {
      if (messageSource !== "server") return;
      messageApi(`/api/messages/${encodeURIComponent(id)}/state`, "PATCH", change).catch((e: Error) => notify(`Not saved to the server: ${e.message}`));
    },
    [messageSource, notify],
  );

  const sendAck = useCallback(
    async (id: string) => {
      const result = await messageApi(`/api/messages/${encodeURIComponent(id)}/ack`, "POST", {});
      patch(id, { acknowledgedAt: result.acknowledgedAt, read: "read" });
      pendingAcks.current.delete(id);
    },
    [],
  );

  const store: Store = useMemo(
    () => ({
      messages,
      messageSource,
      messageById: (id) => messages.find((m) => m.id === id),
      messageByRef: (ref) => messages.find((m) => m.reference === ref),
      ackReceipts,
      refreshMessages,
      userState,
      markRead: (id) => {
        if (userState[id]?.read === "read") return;
        patch(id, { read: "read" });
        saveState(id, { read: "read" });
      },
      markUnread: (id) => {
        patch(id, { read: "unread" });
        saveState(id, { read: "unread" });
      },
      markAllRead: () => {
        setUserState((s) =>
          Object.fromEntries(Object.entries(s).map(([k, v]) => [k, { ...v, read: "read" as const }])),
        );
        if (messageSource === "server") messageApi("/api/messages/read-all", "POST", {}).catch((e: Error) => notify(`Not saved to the server: ${e.message}`));
      },
      acknowledge: (id) => {
        const m = messages.find((x) => x.id === id);
        if (!hasRole(CURRENT_USER, MESSAGE_ADMIN)) return notify("Only the Message Admin sends acknowledgements.");
        if (online) {
          sendAck(id).then(
            () => {
              log("Acknowledge", `Message (${m?.reference})`, "Receipt acknowledged for the command.");
              notify(`Acknowledged ${m?.reference} for ${CURRENT_USER.commandName}`);
            },
            (e: Error) => notify(`Acknowledgement not recorded: ${e.message}`),
          );
          return;
        }
        // Offline, or no server store: record it here. Bundled data uses the mock clock so the
        // time lines up with acknowledgements from other commands.
        patch(id, { acknowledgedAt: (messageSource === "server" ? new Date() : MOCK_NOW).toISOString(), read: "read" });
        if (messageSource === "server") pendingAcks.current.add(id);
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
        // Acknowledgements made offline go to the server now; any that fail stay pending.
        const acks = messageSource === "server" ? [...pendingAcks.current] : [];
        void Promise.allSettled(acks.map(sendAck)).then((results) => {
          const failed = results.filter((r) => r.status === "rejected").length;
          if (failed) notify(`${failed} acknowledgement${failed === 1 ? "" : "s"} could not be sent to the server; try Sync again`);
        });
        const n = syncQueue.length;
        setSyncQueue([]);
        setLastSync(new Date());
        log("Sync", `Offline cache (${n} items)`, "Queued items replicated. Hashes verified.");
        notify(`Synced ${n} items`);
      },
      queueLocal: (type, description) => {
        queue(type, description);
        log("Create", description, "Created in local store; queued for sync.");
      },
      lastSync,

      audit,
      log,
      tampered: original !== null,
      tamperAudit: (seq) => {
        const row = audit.find((e) => e.seq === seq);
        if (!row || original) return;
        setOriginal(row);
        setAudit((a) => a.map((e) => (e.seq === seq ? { ...e, details: `${e.details} [edited outside the append path]` } : e)));
        notify(`Event #${seq} altered in storage (demonstration)`);
      },
      undoTamper: () => {
        if (!original) return;
        setAudit((a) => a.map((e) => (e.seq === original.seq ? original : e)));
        setOriginal(null);
        notify("Demonstration edit reverted");
      },

      watchIssues,
      saveWatchIssue: (issue) => {
        const updated = { ...issue, by: CURRENT_USER.name, at: new Date().toISOString() };
        setWatchIssues((items) => [...items.filter((item) => item.id !== issue.id), updated]);
        log("Update Watch Issue", issue.issue, "Watch-reported note; separate from official traffic.");
        if (offline) queue("Watch Notes", issue.issue);
      },
      watchActionUpdates,
      updateWatchAction: (id, status, note) => {
        const update = { status, note, by: CURRENT_USER.name, at: new Date().toISOString() };
        setWatchActionUpdates((items) => ({ ...items, [id]: [...(items[id] || []), update] }));
        log("Update Watch Action", id, `${status}: ${note}`);
        if (offline) queue("Action Item", id);
      },
      watchNotesUpdated,
      watchNotes,
      setWatchNotes: (n) => {
        setWatchNotes(n);
        setWatchNotesUpdated({ by: CURRENT_USER.name, at: new Date().toISOString() });
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
    [CURRENT_USER, messages, messageSource, ackReceipts, refreshMessages, online, saveState, sendAck, userState, subscriptions, approvals, offline, syncQueue, lastSync, audit, original, watchNotes, watchNotesUpdated, watchIssues, watchActionUpdates, checklist, briefing, toast, log, notify, queue],
  );

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore must be used inside StoreProvider");
  return s;
}
