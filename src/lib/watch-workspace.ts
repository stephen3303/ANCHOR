import type { Message, MessageUserState } from "./types";

const HOUR = 3_600_000;
export type ActionUpdate = { status: "Open" | "In progress" | "Blocked" | "Complete"; note: string; by: string; at: string };
export type WatchIssue = {
  id: string; issue: string; status: "Open" | "Monitoring" | "Resolved";
  actionsTaken: string; awaiting: string; nextStep: string; owner: string;
  upcoming: string; escalation: string; contacts: string; review: boolean;
  sourceId: string; by: string; at: string;
};
export type WatchAction = {
  id: string; message: Message; kind: "Acknowledgement" | "Task";
  text: string; owner: string; due: number | null; dateOnly: boolean;
  status: ActionUpdate["status"]; history: ActionUpdate[]; passage: string; carryover: boolean;
};
export const currentMessage = (m: Message) => !["SUPERSEDED", "CANCELLED", "EXPIRED"].includes(m.lifecycle);

export function actionDeadline(value?: string): { due: number | null; dateOnly: boolean } {
  if (!value) return { due: null, dateOnly: false };
  const match = /^(\d{2}) ([A-Z]{3}) (\d{4})$/.exec(value);
  if (match) {
    const month = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"].indexOf(match[2]);
    const due = Date.UTC(+match[3], month, +match[1], 23, 59, 59);
    if (month < 0 || new Date(due).getUTCDate() !== +match[1]) return { due: null, dateOnly: true };
    return { due, dateOnly: true };
  }
  // Only accept explicit, timezone-qualified timestamps, never ambiguous local dates.
  const due = /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN;
  return { due: Number.isFinite(due) ? due : null, dateOnly: false };
}

export function watchActions(messages: Message[], states: Record<string, MessageUserState>, updates: Record<string, ActionUpdate[]>, start: number, end: number, ownSource: string): WatchAction[] {
  const result: WatchAction[] = [];
  for (const m of messages) {
    if (!currentMessage(m) || Date.parse(m.received) > end) continue;
    const passage = m.sections.find((s) => s.heading === "Action")?.body.join("\n") || "No supporting action passage recorded. Review the official message.";
    if (m.actionItem) {
      const id = `${m.id}:task`;
      const history = updates[id] || [];
      result.push({ id, message: m, kind: "Task", text: m.actionItem.text, owner: m.actionItem.assignedTo?.trim() || "Unassigned", ...actionDeadline(m.actionItem.suspense), status: history.at(-1)?.status || "Open", history, passage, carryover: Date.parse(m.received) < start });
    }
    if (m.ackRequired && m.source !== ownSource && !states[m.id]?.acknowledgedAt) {
      result.push({ id: `${m.id}:ack`, message: m, kind: "Acknowledgement", text: `Acknowledge ${m.reference}`, owner: "Receiving command", ...actionDeadline(m.ackDue), status: "Open", history: [], passage, carryover: Date.parse(m.received) < start });
    }
  }
  return result.sort((a, b) => Number(a.status === "Complete") - Number(b.status === "Complete") || (a.due ?? Infinity) - (b.due ?? Infinity) || a.id.localeCompare(b.id));
}

export function changesInWindow(messages: Message[], start: number, end: number) {
  const known = messages.filter((m) => Date.parse(m.received) <= end);
  return known.filter((m) => Date.parse(m.received) >= start && (m.lifecycle !== "ACTIVE" || m.relatesTo || m.replacedBy)).map((message) => {
    const previous = known.find((m) => m.reference === message.relatesTo);
    const replacement = known.find((m) => m.reference === message.replacedBy);
    const oldPassage = previous?.sections.find((s) => s.heading === "Action")?.body.join("\n");
    const newPassage = message.sections.find((s) => s.heading === "Action")?.body.join("\n");
    const explanation = previous ? oldPassage === newPassage ? "Linked version recorded; action passage is unchanged. Review other sections for changes." : "Action passage differs from the linked earlier version. Compare both versions before acting."
      : replacement ? `Marked ${message.lifecycle.toLowerCase()}; replacement ${replacement.reference} is available.`
      : "Version relationship or earlier text is unavailable. Review required; specific changes are not verified.";
    return { message, previous, replacement, explanation, deadlineChanged: !!previous && previous.actionItem?.suspense !== message.actionItem?.suspense, oldPassage, newPassage };
  });
}

export function deadlineState(actions: WatchAction[], end: number) {
  const open = actions.filter((a) => a.status !== "Complete");
  const timed = open.filter((a) => a.due !== null);
  return {
    overdue: timed.filter((a) => a.due! < end),
    next24: timed.filter((a) => a.due! >= end && a.due! <= end + 24 * HOUR),
    unknown: open.filter((a) => a.due === null),
    message: !open.length ? "No open tracked actions. Official text may contain untracked requirements."
      : !timed.length ? "No deadlines recorded for open actions. Review required."
      : !timed.some((a) => a.due! <= end + 24 * HOUR) ? "No recorded deadlines due in the next 24 hours."
      : "Recorded deadlines shown below.",
  };
}

/** Connect only explicit IDs or version references; never infer an issue from keywords. */
export function issueThreads(messages: Message[]) {
  const remaining = new Set(messages.map((m) => m.id));
  const threads: Message[][] = [];
  const linked = (a: Message, b: Message) => a.related?.includes(b.id) || b.related?.includes(a.id) ||
    a.relatesTo === b.reference || b.relatesTo === a.reference || a.replacedBy === b.reference || b.replacedBy === a.reference;
  for (const seed of messages) {
    if (!remaining.delete(seed.id)) continue;
    const group = [seed];
    for (let i = 0; i < group.length; i++) {
      for (const candidate of messages) if (remaining.has(candidate.id) && linked(group[i], candidate)) {
        remaining.delete(candidate.id); group.push(candidate);
      }
    }
    if (group.length > 1) threads.push(group.sort((a, b) => Date.parse(b.received) - Date.parse(a.received)));
  }
  return threads;
}

export function remaining(due: number | null, asOf: number) {
  if (due === null) return "No deadline recorded";
  const minutes = Math.ceil(Math.abs(due - asOf) / 60_000);
  if (!minutes) return "Due now";
  const text = minutes < 60 ? `${minutes}m` : minutes < 1440 ? `${Math.ceil(minutes / 60)}h` : `${Math.ceil(minutes / 1440)}d`;
  return due < asOf ? `${text} overdue` : `${text} remaining`;
}

export function turnoverPackage(input: {
  start: number; end: number; generatedAt: string; refreshedAt: string | null; offline: boolean;
  lastSync: string; pendingSync: number; messages: Message[]; actions: WatchAction[];
  issues: WatchIssue[]; notes: string[]; checklist: Record<string, boolean>;
  userState?: Record<string, MessageUserState>; notesUpdated?: { by: string; at: string } | null;
}) {
  return {
    title: "ANCHOR Watch Turnover · DEMONSTRATION DATA", version: 1,
    reportingWindow: { start: new Date(input.start).toISOString(), end: new Date(input.end).toISOString(), basis: "Traffic received; inclusive endpoints; UTC" },
    generatedAt: input.generatedAt,
    freshness: { refreshedAt: input.refreshedAt, lastSuccessfulIngest: null, connection: input.offline ? "Offline / cached demo" : "Online mode / live feed unverified", lastSync: input.lastSync, pendingSync: input.pendingSync },
    deadlineHorizon: { start: new Date(input.end).toISOString(), end: new Date(input.end + 24 * HOUR).toISOString() },
    traffic: input.messages,
    actions: input.actions,
    acknowledgementState: input.userState || {},
    carryover: input.actions.filter((a) => a.carryover && a.status !== "Complete"),
    outgoingWatchIssues: input.issues, narrativeNotes: input.notes, narrativeLastUpdate: input.notesUpdated || null, checklist: input.checklist,
    limitations: ["Demo data; watch updates are held in memory and reset on reload.", "User state and watch notes are current session state, not a historical snapshot of the selected period.", "Action updates are watch-reported and not verified completion.", "Date-only task suspenses use end of UTC day; verify exact time in source.", "No recorded turnover acceptance or successful ingest timestamp available."],
  };
}
