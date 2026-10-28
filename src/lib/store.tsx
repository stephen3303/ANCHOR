"use client";

// Client-side app state. The ANCHOR server is the source of truth: this loads
// the signed-in user's view from /api/state and sends every action to
// /api/actions. In EMCON / offline mode actions are applied locally, kept in a
// queue that survives a reload (localStorage), and replayed through /api/sync
// when connectivity returns.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { User } from "./users";
import type { AuditEvent, Community, Message, MessageUserState, Subscription, SyncItem } from "./types";
import type { Action } from "@/server/actions";

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

export type ApprovalRequest = Subscription & { requester: string; requestedOn: string };
type NewSubscription = Omit<Subscription, "id" | "status" | "subscribedOn" | "lastUpdated" | "requestedBy" | "mandatory">;

/** A queued offline action, the account that took it, and how to show it in the sync queue. */
export type QueuedItem = SyncItem & { action: Action; login: string };

interface ServerState {
  user: User;
  users: { login: string; name: string; billet: string }[];
  messages: Message[];
  userState: Record<string, MessageUserState>;
  subscriptions: Subscription[];
  approvals: ApprovalRequest[];
  audit: AuditEvent[];
  auditStats: { events: number; users: number };
  watch: { notes: string[]; checklist: Record<string, boolean> };
  acknowledgements: { login: string; messageId: string; at: string }[];
}

interface Store {
  /** False until the first load from the server finishes */
  loaded: boolean;
  loadError: string | null;
  refresh: () => Promise<void>;

  user: User | null;
  users: ServerState["users"];
  switchUser: (login: string) => Promise<void>;

  messages: Message[];
  messageById: (id: string) => Message | undefined;
  messageByRef: (ref: string) => Message | undefined;

  userState: Record<string, MessageUserState>;
  markRead: (id: string) => void;
  markUnread: (id: string) => void;
  markAllRead: () => void;
  toggleStar: (id: string) => void;
  acknowledge: (id: string) => void;
  acknowledgements: ServerState["acknowledgements"];

  subscriptions: Subscription[];
  toggleSubscription: (id: string) => void;
  requestSubscription: (s: NewSubscription) => void;
  approvals: ApprovalRequest[];
  decideApproval: (id: string, approve: boolean) => void;

  offline: boolean;
  setOffline: (v: boolean) => void;
  syncQueue: QueuedItem[];
  syncNow: () => void;
  syncing: boolean;
  queueLocal: (type: SyncItem["type"], description: string) => void;
  lastSync: Date;

  audit: AuditEvent[];
  /** Totals over the whole audit log; `audit` holds only the newest events */
  auditStats: ServerState["auditStats"];
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

const QUEUE_KEY = "anchor.syncQueue";
const OFFLINE_KEY = "anchor.offline";
const LASTSYNC_KEY = "anchor.lastSync";

// Browser storage can be missing or throw (private windows, blocked storage).
function readLocal<T>(key: string, fallback: T): T {
  try {
    const v = window.localStorage.getItem(key);
    return v == null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
function writeLocal(key: string, v: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(v));
  } catch {
    // Not fatal: the queue still lives in memory for this session.
  }
}

let seq = 0;
const nextId = (p: string) => `${p}-${Date.now()}-${seq++}`;

const fmtCreated = (d: Date) =>
  `${String(d.getUTCDate()).padStart(2, "0")} ${["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][d.getUTCMonth()]} ${String(d.getUTCHours()).padStart(2, "0")}${String(d.getUTCMinutes()).padStart(2, "0")}Z`;

/** Overlay this account's queued offline actions on a server state (oldest first). */
function applyQueued(state: ServerState, queue: QueuedItem[]): ServerState {
  const userState = { ...state.userState };
  let { subscriptions, approvals, watch } = state;
  const at = (id: string) => userState[id] ?? { read: "new" as const, starred: false };
  for (const { action: a, login } of [...queue].reverse()) {
    if (login !== state.user.login) continue;
    if (a.type === "ack") userState[a.id] = { ...at(a.id), acknowledgedAt: a.at, read: "read" };
    else if (a.type === "read") userState[a.id] = { ...at(a.id), read: a.read };
    else if (a.type === "star") userState[a.id] = { ...at(a.id), starred: a.starred };
    else if (a.type === "markAllRead") for (const k of Object.keys(userState)) userState[k] = { ...at(k), read: "read" };
    else if (a.type === "setSubscription") subscriptions = subscriptions.map((x) => (x.id === a.id ? { ...x, status: a.status } : x));
    else if (a.type === "decideApproval") approvals = approvals.filter((x) => x.id !== a.id);
    else if (a.type === "watchNotes") watch = { ...watch, notes: a.notes };
    else if (a.type === "checklist") watch = { ...watch, checklist: a.checklist };
  }
  return { ...state, userState, subscriptions, approvals, watch };
}

async function post(url: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, data };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [server, setServer] = useState<ServerState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [offline, setOfflineState] = useState(false);
  const [syncQueue, setSyncQueue] = useState<QueuedItem[]>([]);
  const [lastSync, setLastSync] = useState(new Date("2026-10-21T18:00:00Z"));
  const [briefing, setBriefing] = useState(DEFAULT_BRIEFING);
  const [toast, setToast] = useState<string | null>(null);
  const offlineRef = useRef(false);
  const loginRef = useRef<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 3500);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (!res.ok) throw new Error(`Server answered ${res.status}`);
      const state = (await res.json()) as ServerState;
      loginRef.current = state.user.login;
      // While disconnected, show queued actions on top of the last server copy.
      setServer(offlineRef.current ? applyQueued(state, readLocal<QueuedItem[]>(QUEUE_KEY, [])) : state);
      setLoadError(null);
    } catch (e) {
      // Can't reach the server: keep what we have and work from it.
      setLoadError(e instanceof Error ? e.message : "Server unreachable");
    }
  }, []);

  // Restore EMCON state and the offline queue, then load from the server.
  useEffect(() => {
    const off = readLocal(OFFLINE_KEY, false);
    offlineRef.current = off;
    /* eslint-disable react-hooks/set-state-in-effect -- one-time restore from browser storage */
    setOfflineState(off);
    setSyncQueue(readLocal<QueuedItem[]>(QUEUE_KEY, []));
    const ls = readLocal<string | null>(LASTSYNC_KEY, null);
    if (ls) setLastSync(new Date(ls));
    /* eslint-enable react-hooks/set-state-in-effect */
    void refresh();
  }, [refresh]);

  /** Apply a change to the local copy right away, so the screen responds at once. */
  const patchLocal = useCallback((fn: (s: ServerState) => ServerState) => setServer((s) => (s ? fn(s) : s)), []);

  const enqueue = useCallback((type: SyncItem["type"], description: string, action: Action) => {
    setSyncQueue((q) => {
      const login = loginRef.current ?? "";
      const next = [{ id: nextId("sync"), type, description, created: fmtCreated(new Date()), status: "Pending" as const, action, login }, ...q];
      writeLocal(QUEUE_KEY, next);
      return next;
    });
  }, []);

  /**
   * Send one action. Online: to the server, then reload so every screen shows
   * the server's answer. Offline: queue it for sync.
   */
  const send = useCallback(
    async (action: Action, queueAs?: { type: SyncItem["type"]; description: string }) => {
      if (offlineRef.current) {
        if (queueAs) enqueue(queueAs.type, queueAs.description, action);
        return true;
      }
      const r = await post("/api/actions", action).catch(() => ({ ok: false, data: { error: "Server unreachable" } }));
      if (!r.ok) notify(String(r.data.error ?? "That didn't go through"));
      await refresh();
      return r.ok;
    },
    [enqueue, notify, refresh],
  );

  const patchState = useCallback(
    (id: string, p: Partial<MessageUserState>) =>
      patchLocal((s) => ({ ...s, userState: { ...s.userState, [id]: { ...(s.userState[id] ?? { read: "new", starred: false }), ...p } } })),
    [patchLocal],
  );

  const store: Store = useMemo(() => {
    const messages = server?.messages ?? [];
    const byId = new Map(messages.map((m) => [m.id, m]));
    const byRef = new Map(messages.map((m) => [m.reference, m]));
    const userState = server?.userState ?? {};
    const ref = (id: string) => byId.get(id)?.reference ?? id;

    return {
      loaded: !!server,
      loadError,
      refresh,

      user: server?.user ?? null,
      users: server?.users ?? [],
      switchUser: async (login) => {
        if (offlineRef.current) return notify("Can't change user during EMCON");
        if (syncQueue.length) return notify("Sync the offline queue before changing user");
        const r = await post("/api/session", { login });
        if (!r.ok) return notify(String(r.data.error ?? "Sign-in failed"));
        await refresh();
        notify(`Signed in as ${server?.users.find((u) => u.login === login)?.name ?? login}`);
      },

      messages,
      messageById: (id) => byId.get(id),
      messageByRef: (r) => byRef.get(r),

      userState,
      markRead: (id) => {
        if (!userState[id] || userState[id].read === "read") return;
        patchState(id, { read: "read" });
        void send({ type: "read", id, read: "read" }, { type: "Annotation", description: `Read: ${ref(id)}` });
      },
      markUnread: (id) => {
        patchState(id, { read: "unread" });
        void send({ type: "read", id, read: "unread" }, { type: "Annotation", description: `Unread: ${ref(id)}` });
      },
      markAllRead: () => {
        patchLocal((s) => ({
          ...s,
          userState: Object.fromEntries(Object.entries(s.userState).map(([k, v]) => [k, { ...v, read: "read" as const }])),
        }));
        void send({ type: "markAllRead" }, { type: "Annotation", description: "Mark all read" });
      },
      toggleStar: (id) => {
        const starred = !userState[id]?.starred;
        patchState(id, { starred });
        void send({ type: "star", id, starred }, { type: "Annotation", description: `${starred ? "Star" : "Unstar"}: ${ref(id)}` });
      },
      acknowledge: (id) => {
        const at = new Date().toISOString();
        patchState(id, { acknowledgedAt: at, read: "read" });
        void send({ type: "ack", id, at }, { type: "Acknowledgement", description: `Ack: ${ref(id)}` }).then(
          (ok) => ok && notify(`Acknowledged ${ref(id)}${offlineRef.current ? " (queued for sync)" : ""}`),
        );
      },
      acknowledgements: server?.acknowledgements ?? [],

      subscriptions: server?.subscriptions ?? [],
      toggleSubscription: (id) => {
        const s = server?.subscriptions.find((x) => x.id === id);
        if (!s || s.mandatory || (s.status !== "Active" && s.status !== "Paused")) return;
        const status = s.status === "Active" ? "Paused" : "Active";
        patchLocal((st) => ({ ...st, subscriptions: st.subscriptions.map((x) => (x.id === id ? { ...x, status } : x)) }));
        void send({ type: "setSubscription", id, status }, { type: "Subscription", description: `${s.name}: ${status}` });
      },
      requestSubscription: (sub) => {
        void send({ type: "requestSubscription", sub }, { type: "Subscription", description: `Request: ${sub.name}` }).then(
          (ok) => ok && notify(`Request for "${sub.name}" ${offlineRef.current ? "queued; it goes to the approver on sync" : "sent for approval"}`),
        );
        if (offlineRef.current)
          patchLocal((st) => ({
            ...st,
            subscriptions: [
              ...st.subscriptions,
              { ...sub, id: nextId("local-sub"), status: "Pending Approval", mandatory: false, subscribedOn: "—", lastUpdated: "Queued", requestedBy: st.user.name },
            ],
          }));
      },
      approvals: server?.approvals ?? [],
      decideApproval: (id, approve) => {
        const r = server?.approvals.find((a) => a.id === id);
        patchLocal((st) => ({ ...st, approvals: st.approvals.filter((a) => a.id !== id) }));
        void send({ type: "decideApproval", id, approve }, { type: "Subscription", description: `${approve ? "Approve" : "Deny"}: ${r?.name} for ${r?.requester}` }).then(
          (ok) => ok && notify(`${approve ? "Approved" : "Denied"} ${r?.requester}'s request${offlineRef.current ? " (queued)" : ""}`),
        );
      },

      offline,
      setOffline: (v) => {
        offlineRef.current = v;
        setOfflineState(v);
        writeLocal(OFFLINE_KEY, v);
        notify(v ? "EMCON / offline mode: working from local store" : "Connectivity restored");
        if (!v) void refresh();
      },
      syncQueue,
      syncNow: () => {
        if (offlineRef.current) return notify("Cannot sync while offline");
        if (syncingRef.current) return;
        const items = [...syncQueue].reverse(); // oldest first, the order they were taken
        syncingRef.current = true;
        setSyncing(true);
        void (async () => {
          const r = await post("/api/sync", { actions: items.map((q) => ({ qid: q.id, login: q.login, action: q.action })) })
            .catch(() => null)
            .finally(() => {
              syncingRef.current = false;
              setSyncing(false);
            });
          // The server records each item it applies, so sending the queue again after a failure is safe.
          if (!r?.ok) return notify(String(r?.data.error ?? "Sync failed; the queue is kept"));
          const results = r.data.results as { qid: string; ok: boolean; error?: string }[];
          const done = new Set(results.filter((x) => x.ok).map((x) => x.qid));
          const rejected = results.filter((x) => !x.ok);
          // Rejected items are dropped too: the server has said why, and
          // retrying them would fail the same way.
          setSyncQueue((q) => {
            const next = q.filter((x) => !done.has(x.id) && !rejected.some((j) => j.qid === x.id));
            writeLocal(QUEUE_KEY, next);
            return next;
          });
          const now = new Date();
          setLastSync(now);
          writeLocal(LASTSYNC_KEY, now.toISOString());
          await refresh();
          notify(
            rejected.length
              ? `Synced ${done.size}; ${rejected.length} rejected: ${rejected[0].error}`
              : `Synced ${done.size} item${done.size === 1 ? "" : "s"}. Hashes verified.`,
          );
        })();
      },
      queueLocal: (type, description) => {
        void send({ type: "log", action: "Create", resource: description, details: "Created in local store." }, { type, description });
      },
      lastSync,

      syncing,
      audit: server?.audit ?? [],
      auditStats: server?.auditStats ?? { events: 0, users: 0 },
      log: (action, resource, details = "") => {
        const type: SyncItem["type"] = action === "Create Briefing" ? "Briefing" : action === "Generate Report" ? "Report" : "Annotation";
        void send({ type: "log", action, resource, details }, { type, description: `${action}: ${resource}` });
      },

      watchNotes: server?.watch.notes ?? [],
      setWatchNotes: (notes) => {
        patchLocal((st) => ({ ...st, watch: { ...st.watch, notes } }));
        void send({ type: "watchNotes", notes }, { type: "Watch Notes", description: "Watch notes" });
      },
      checklist: server?.watch.checklist ?? {},
      toggleChecklist: (item) => {
        const checklist = { ...(server?.watch.checklist ?? {}), [item]: !server?.watch.checklist[item] };
        patchLocal((st) => ({ ...st, watch: { ...st.watch, checklist } }));
        void send({ type: "checklist", checklist }, { type: "Watch Notes", description: `Checklist: ${item}` });
      },

      briefing,
      setBriefing,

      toast,
      notify,
    };
  }, [server, loadError, refresh, notify, patchLocal, patchState, send, offline, syncQueue, syncing, lastSync, briefing, toast]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore must be used inside StoreProvider");
  return s;
}

/** The signed-in user. Screens render only after the first load, so it's set. */
export function useUser(): User {
  const { user } = useStore();
  if (!user) throw new Error("useUser called before the first load");
  return user;
}
