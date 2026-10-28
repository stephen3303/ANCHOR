// User actions, shared by the live API and by EMCON sync replay, so an action
// taken offline is applied by exactly the same code when it replicates.
import type { DatabaseSync } from "node:sqlite";
import {
  acknowledge,
  appendAudit,
  decideApproval,
  IngestError,
  ingestedAt,
  markAllRead,
  requestSubscription,
  saveWatch,
  setRead,
  setStar,
  setSubscription,
  toggleSubscription,
  type Actor,
} from "./repo.ts";
import { hasRole, type User } from "../lib/users.ts";
import type { MessageUserState, Subscription } from "../lib/types";

export type Action =
  | { type: "read"; id: string; read: MessageUserState["read"] }
  | { type: "markAllRead" }
  | { type: "star"; id: string; starred: boolean }
  | { type: "ack"; id: string; at?: string }
  | { type: "toggleSubscription"; id: string }
  | { type: "setSubscription"; id: string; status: "Active" | "Paused" }
  | { type: "requestSubscription"; sub: Omit<Subscription, "id" | "status" | "subscribedOn" | "lastUpdated" | "requestedBy" | "mandatory"> }
  | { type: "decideApproval"; id: string; approve: boolean }
  | { type: "watchNotes"; notes: string[] }
  | { type: "checklist"; checklist: Record<string, boolean> }
  | { type: "log"; action: string; resource: string; details?: string };

type NewSubscription = Extract<Action, { type: "requestSubscription" }>["sub"];

/** Actions a page may record in the audit log for things that happen only in the browser. */
const LOGGABLE = new Set(["View", "Search", "Save Search", "Export", "Print", "Share Link", "Create Briefing", "Generate Report", "Download", "Create"]);

const str = (v: unknown, max = 500) => (typeof v === "string" ? v.slice(0, max) : "");
const strs = (v: unknown, n = 20, max = 120) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, n).map((x) => x.slice(0, max)) : []);

/**
 * Apply one action as the given user. `offline` marks an action replayed from
 * the EMCON queue: its own timestamp is kept (within limits) and the audit
 * entry says it was taken offline.
 */
export function applyAction(db: DatabaseSync, user: User, actor: Actor & { name: string }, a: Action, offline = false): unknown {
  if (!a || typeof a !== "object" || typeof a.type !== "string") throw new IngestError("Not an action.");
  switch (a.type) {
    case "read":
      if (!["new", "unread", "read"].includes(a.read)) throw new IngestError("Bad read state.");
      return setRead(db, user.login, str(a.id), a.read);
    case "markAllRead":
      return markAllRead(db, user.login);
    case "star":
      return setStar(db, user.login, str(a.id), !!a.starred);
    case "ack": {
      // An offline acknowledgement keeps the time it was made, but never a
      // time in the future, more than a week back, or before ANCHOR had the message.
      const now = Date.now();
      const floor = Math.max(now - 7 * 86_400_000, Date.parse(ingestedAt(db, str(a.id)) ?? "") || 0);
      const t = offline && a.at ? Date.parse(str(a.at, 40)) : NaN;
      const at = Number.isFinite(t) && t <= now && t >= floor ? new Date(t).toISOString() : new Date(now).toISOString();
      return acknowledge(db, actor, str(a.id), at, offline);
    }
    case "toggleSubscription":
      return toggleSubscription(db, actor, str(a.id));
    case "setSubscription":
      if (a.status !== "Active" && a.status !== "Paused") throw new IngestError("A subscription can only be set Active or Paused.");
      return setSubscription(db, actor, str(a.id), a.status);
    case "requestSubscription": {
      const s = (a.sub ?? {}) as Partial<NewSubscription>;
      const c = (s.criteria ?? {}) as Partial<NewSubscription["criteria"]>;
      return requestSubscription(db, actor, {
        name: str(s.name, 120),
        category: str(s.category, 60) as NewSubscription["category"],
        description: str(s.description, 1000),
        criteria: {
          messageTypes: strs(c.messageTypes) as NewSubscription["criteria"]["messageTypes"],
          originators: strs(c.originators),
          keywords: strs(c.keywords),
          precedence: strs(c.precedence) as NewSubscription["criteria"]["precedence"],
        },
        frequency: (["Real-time", "Daily Digest", "Weekly"].includes(str(s.frequency)) ? s.frequency : "Real-time") as NewSubscription["frequency"],
        channels: { inApp: true, email: !!s.channels?.email, teams: !!s.channels?.teams },
        justification: str(s.justification, 1000),
      });
    }
    case "decideApproval":
      if (!hasRole(user, "Subscription Approver")) throw new IngestError("You don't hold the Subscription Approver role.");
      return decideApproval(db, actor, str(a.id), !!a.approve);
    case "watchNotes":
      return saveWatch(db, actor, user.unit, { notes: (Array.isArray(a.notes) ? a.notes : []).map((n) => str(n, 1000)).filter(Boolean) });
    case "checklist":
      return saveWatch(db, actor, user.unit, {
        checklist: Object.fromEntries(Object.entries(a.checklist ?? {}).map(([k, v]) => [str(k, 200), !!v])),
      });
    case "log":
      if (!LOGGABLE.has(a.action)) throw new IngestError(`"${str(a.action, 40)}" can't be logged from the browser.`);
      return appendAudit(db, actor, a.action, str(a.resource, 200), (offline ? "Taken offline; replicated on sync. " : "") + str(a.details, 500));
    default:
      throw new IngestError("Unknown action.");
  }
}
