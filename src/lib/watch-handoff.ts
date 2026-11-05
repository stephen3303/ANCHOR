export const HANDOFF_CHECKS = [
  { id: "traffic", label: "Review new and changed traffic" },
  { id: "requirements", label: "Review open requirements and deadlines" },
  { id: "acknowledgements", label: "Check receipt acknowledgements with Message Admin" },
  { id: "issues", label: "Review unresolved issues, owners, and contacts" },
  { id: "communications", label: "Verify communications and system status" },
  { id: "incoming-review", label: "Confirm incoming officer has reviewed the handoff" },
] as const;
export type HandoffStatus = "Draft" | "Ready for review" | "Accepted";
export type IssueState = "Open" | "Monitoring" | "Resolved";
export type IssueInput = { id: string | null; title: string; status: IssueState; owner: string; actionsTaken: string; awaiting: string; nextStep: string; upcoming: string; escalation: string; contacts: string; sourceMessageId: string | null };
export type HandoffIssue = IssueInput & { id: string; lineageId: string; carriedFrom: { handoffId: string; issueId: string } | null; source: { id: string; reference: string; sha256: string } | null };
export type HandoffContent = { narrative: string; issues: HandoffIssue[]; checklist: Record<string, boolean> };
export type Officer = { id: string; name: string; active: boolean };
export type WatchStation = { id: string; name: string; team: string; active: boolean; commandVisible: boolean; revision: number; assigned: boolean; officers: Officer[] };
export type HandoffRecord = {
  id: string; stationId: string; stationName: string; team: string; outgoingId: string; outgoingName: string; incomingId: string; incomingName: string;
  watchStart: string; watchEnd: string; status: HandoffStatus; revision: number; previousId: string | null; content: HandoffContent;
  createdAt: string; updatedAt: string; acceptedAt: string | null; acceptanceExceptions: string | null;
};
export type HandoffEvent = { id: string; kind: string; actorId: string; actorName: string; at: string; revision: number; snapshot: HandoffRecord };
export type HandoffCorrection = { id: string; reason: string; text: string; authorName: string; at: string };
export class HandoffInputError extends Error {}
export const isUUID = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export function handoffObject(value: unknown, allowed: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HandoffInputError("Send a JSON object.");
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new HandoffInputError("Unexpected handoff fields.");
  return value as Record<string, unknown>;
}
export function handoffText(value: unknown, label: string, max = 2000, required = false) {
  if (typeof value !== "string" || value.length > max || (required && !value.trim())) throw new HandoffInputError(`${label}${required ? " is required and" : ""} must be text of at most ${max} characters.`);
  return value.trim();
}
/** New manual inputs are explicitly Zulu, never browser-local datetime values. */
export function parseWatchTime(value: unknown) {
  if (typeof value !== "string") throw new HandoffInputError("Use DD MMM YYYY HHMMZ for watch times.");
  const m = /^(\d{2}) (JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC) (\d{4}) (\d{2})(\d{2})Z$/.exec(value);
  if (!m) throw new HandoffInputError("Use DD MMM YYYY HHMMZ for watch times.");
  const month = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"].indexOf(m[2]);
  const d = new Date(Date.UTC(+m[3], month, +m[1], +m[4], +m[5]));
  if (+m[3] < 2000 || +m[3] > 2200 || d.getUTCMonth() !== month || d.getUTCDate() !== +m[1] || +m[4] > 23 || +m[5] > 59) throw new HandoffInputError("Enter a valid UTC/Zulu date and time.");
  return d.toISOString();
}
export function watchPeriod(start: unknown, end: unknown) {
  const watchStart = parseWatchTime(start); const watchEnd = parseWatchTime(end);
  if (watchEnd <= watchStart) throw new HandoffInputError("Incoming watch end must be after its start.");
  return { watchStart, watchEnd };
}
export function expectedRevision(value: unknown) {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new HandoffInputError("Supply the current revision.");
  return value as number;
}
export function parseHandoffContent(value: unknown): { narrative: string; issues: IssueInput[]; checklist: Record<string, boolean> } {
  const body = handoffObject(value, ["narrative", "issues", "checklist"]);
  const narrative = handoffText(body.narrative, "Narrative notes", 8000);
  if (!Array.isArray(body.issues) || body.issues.length > 30) throw new HandoffInputError("Use at most 30 issues per handoff.");
  const ids = new Set<string>();
  const issues = body.issues.map((value): IssueInput => {
    const issue = handoffObject(value, ["id","title","status","owner","actionsTaken","awaiting","nextStep","upcoming","escalation","contacts","sourceMessageId"]);
    if (issue.id !== null && !isUUID(issue.id)) throw new HandoffInputError("Invalid issue ID.");
    if (issue.id && ids.has(issue.id as string)) throw new HandoffInputError("Duplicate issue IDs.");
    if (issue.id) ids.add(issue.id as string);
    if (!["Open","Monitoring","Resolved"].includes(String(issue.status))) throw new HandoffInputError("Choose a valid issue status.");
    if (issue.sourceMessageId !== null && (typeof issue.sourceMessageId !== "string" || !/^[a-z0-9-]{1,150}$/.test(issue.sourceMessageId))) throw new HandoffInputError("Choose a saved published source message.");
    return { id: issue.id as string | null, title: handoffText(issue.title,"Issue title",250,true), status: issue.status as IssueState,
      owner: handoffText(issue.owner,"Owner",200), actionsTaken: handoffText(issue.actionsTaken,"Actions taken"), awaiting: handoffText(issue.awaiting,"Responses awaited"), nextStep: handoffText(issue.nextStep,"Next step"), upcoming: handoffText(issue.upcoming,"Upcoming events/reports"), escalation: handoffText(issue.escalation,"Escalation guidance"), contacts: handoffText(issue.contacts,"Contacts",500), sourceMessageId: issue.sourceMessageId as string | null };
  });
  const values = handoffObject(body.checklist, HANDOFF_CHECKS.map((c) => c.id));
  const checklist: Record<string, boolean> = {};
  for (const item of HANDOFF_CHECKS) { if (typeof values[item.id] !== "boolean") throw new HandoffInputError("Every checklist item needs a true/false value."); checklist[item.id] = values[item.id] as boolean; }
  return { narrative, issues, checklist };
}
export const incompleteChecks = (content: HandoffContent) => HANDOFF_CHECKS.filter((c) => !content.checklist[c.id]);
export function assertTransition(status: HandoffStatus, action: string, actorId: string, outgoingId: string, incomingId: string) {
  if (status === "Accepted") throw new HandoffInputError("Accepted records are locked. Append a correction instead.");
  if (action === "accept") {
    if (status !== "Ready for review" || actorId !== incomingId) throw new HandoffInputError("Only the designated incoming officer can accept a Ready handoff.");
  } else if (actorId !== outgoingId || (action === "return" ? status !== "Ready for review" : status !== "Draft")) {
    throw new HandoffInputError("Only the outgoing officer can edit/mark a Draft ready or return a Ready handoff to Draft.");
  }
}
