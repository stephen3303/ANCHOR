// Routing and release: the roster, the admin-defined chains, who may release,
// and the rules a draft follows from drafting to release. Ported from the Base44
// build. Everything here is fictional mock data.
import type {
  CommandSettings,
  Draft,
  MessageType,
  Person,
  ReleaseAuthority,
  RouteStep,
  RoutingEvent,
  RoutingWorkflow,
} from "./types";

/** The originator line this command transmits under. */
export const OWN_ORIGINATOR = "COMSUBLANT NORFOLK VA";

export const ROSTER: Person[] = [
  { id: "p-walsh", rank: "RADM", name: "R. Walsh", position: "Commander", code: "CSL-00", status: "present" },
  { id: "p-okafor", rank: "CAPT", name: "D. Okafor", position: "Deputy Commander", code: "CSL-01", status: "leave" },
  { id: "p-chen", rank: "CAPT", name: "A. Chen", position: "Chief of Staff", code: "CSL-02", status: "present" },
  { id: "p-ramos", rank: "CDR", name: "M. Ramos", position: "Operations Officer (N3)", code: "N3", status: "present" },
  { id: "p-brooks", rank: "LCDR", name: "K. Brooks", position: "Logistics Officer (N4)", code: "N4", status: "detached" },
  { id: "p-patel", rank: "LT", name: "R. Patel", position: "Supply Officer (N41)", code: "N41", status: "present" },
  { id: "p-taylor", rank: "LT", name: "J. Taylor", position: "Communications Officer (N6)", code: "N6", status: "present" },
  { id: "p-nguyen", rank: "YNC", name: "S. Nguyen", position: "Admin Chief (N1)", code: "N1", status: "present" },
  { id: "p-morales", rank: "LCDR", name: "E. Morales", position: "Intelligence Officer (N2)", code: "N2", status: "present" },
  { id: "p-harper", rank: "ITC", name: "D. Harper", position: "Information Systems Security Manager (N6)", code: "N61", status: "present" },
];

/** The roster record of the signed-in user (LT Taylor). */
export const SELF_PERSON_ID = "p-taylor";

export const personById = (id?: string) => ROSTER.find((p) => p.id === id);
export const personName = (id?: string) => {
  const p = personById(id);
  return p ? `${p.rank} ${p.name}` : "Unassigned";
};

export const ROSTER_STATE: Record<Person["status"], { label: string; className: string }> = {
  present: { label: "Present", className: "text-green-700" },
  leave: { label: "On leave", className: "text-amber-700" },
  detached: { label: "Detached", className: "text-red-700" },
};

export const DRAFT_STATUS: Record<Draft["status"], { label: string; hint: string; className: string }> = {
  drafting: { label: "Drafting", hint: "Not yet submitted. Editable by the drafter only.", className: "bg-slate-100 text-slate-700" },
  in_routing: { label: "In Routing", hint: "Held by a reviewer. The drafter cannot change the text.", className: "bg-amber-100 text-amber-900" },
  returned: { label: "Returned", hint: "Kicked back for correction with a reviewer comment.", className: "bg-orange-100 text-orange-800" },
  released: { label: "Released", hint: "Released by the release authority. The record is frozen.", className: "bg-green-100 text-green-800" },
  withdrawn: { label: "Withdrawn", hint: "Withdrawn before release and kept for the record.", className: "bg-zinc-200 text-zinc-700" },
};

export const STEP_STATUS: Record<RouteStep["status"], { label: string; className: string }> = {
  pending: { label: "Pending", className: "text-muted" },
  current: { label: "Awaiting action", className: "font-semibold text-navy-600" },
  endorsed: { label: "Endorsed", className: "font-semibold text-green-700" },
  returned: { label: "Returned", className: "font-semibold text-orange-700" },
  released: { label: "Released", className: "font-semibold text-green-700" },
};

export const DRAFT_TYPES: MessageType[] = ["COMSUBLANT MSG", "FLEET MSG", "SAFETY MSG", "COMSUBFOR INST"];

export const INITIAL_WORKFLOWS: RoutingWorkflow[] = [
  {
    id: "wf-general",
    name: "COMSUBLANT general message",
    description: "Force-wide general traffic. Operations reviews, the Chief of Staff endorses, the Commander releases.",
    active: true,
    matchTypes: ["COMSUBLANT MSG"],
    matchOriginators: [],
    steps: [
      { title: "N3 review", personId: "p-ramos", action: "review" },
      { title: "Chief of Staff review", personId: "p-chen", action: "review" },
      { title: "Commander release", personId: "p-walsh", action: "release" },
    ],
  },
  {
    id: "wf-safety",
    name: "Safety message",
    description: "Time-critical safety traffic. Operations reviews and the Chief of Staff releases under delegated authority.",
    active: true,
    matchTypes: ["SAFETY MSG"],
    matchOriginators: [OWN_ORIGINATOR],
    steps: [
      { title: "N3 review", personId: "p-ramos", action: "review" },
      { title: "Chief of Staff release", personId: "p-chen", action: "release" },
    ],
  },
  {
    id: "wf-logistics",
    name: "Logistics fleet message",
    description: "Supply and logistics traffic to the fleet. The N4 releases.",
    active: true,
    matchTypes: ["FLEET MSG"],
    matchOriginators: [],
    steps: [
      { title: "Supply review", personId: "p-patel", action: "review" },
      { title: "N4 release", personId: "p-brooks", action: "release" },
    ],
  },
  {
    id: "wf-default",
    name: "Default chain",
    description: "Anything no other chain matches. Chief of Staff review, Commander release.",
    active: true,
    matchTypes: [],
    matchOriginators: [],
    steps: [
      { title: "Chief of Staff review", personId: "p-chen", action: "review" },
      { title: "Commander release", personId: "p-walsh", action: "release" },
    ],
  },
];

/** Designated release authorities. The Commander releases as the Release Authority role, without a designation. */
export const INITIAL_AUTHORITIES: ReleaseAuthority[] = [
  { id: "ra-chen", personId: "p-chen", designation: "Chief of Staff", isCommandingOfficer: false, scope: ["SAFETY MSG"] },
  { id: "ra-brooks", personId: "p-brooks", designation: "Logistics Officer (N4)", isCommandingOfficer: false, scope: ["FLEET MSG"] },
];

export const INITIAL_COMMAND_SETTINGS: CommandSettings = {
  textCase: "upper",
  sequencePrefix: "#",
  sequenceDigits: 4,
  nextSequence: 42,
};

/* ---------- rules ---------- */

const specificity = (w: RoutingWorkflow, type: MessageType, originator: string) => {
  let score = 0;
  if (w.matchTypes.length) {
    if (!w.matchTypes.includes(type)) return -1;
    score += 2;
  }
  if (w.matchOriginators.length) {
    if (!w.matchOriginators.includes(originator)) return -1;
    score += 1;
  }
  return score;
};

/** The most specific active workflow matching this message type and originator. */
export function selectWorkflow(workflows: RoutingWorkflow[], type: MessageType, originator: string) {
  return (
    workflows
      .filter((w) => w.active)
      .map((w) => ({ w, score: specificity(w, type, originator) }))
      .filter((e) => e.score >= 0)
      .sort((a, b) => b.score - a.score)[0]?.w ?? null
  );
}

/** Materialise a workflow into the route a draft carries. */
export const buildRoute = (w: RoutingWorkflow): RouteStep[] =>
  w.steps.map((s, i) => ({ ...s, order: i + 1, status: i === 0 ? "current" : "pending" }));

/** Steps held by someone detached from the command: the chain cannot move past them. */
export const strandedSteps = (steps: { personId: string; title: string }[]) =>
  steps.filter((s) => personById(s.personId)?.status === "detached" || !personById(s.personId));

export const currentStep = (d: Draft) => d.route.find((s) => s.status === "current") ?? null;

export const isEditable = (d: Draft) => d.status === "drafting" || d.status === "returned";

const covers = (a: ReleaseAuthority, type: MessageType) => !a.scope.length || a.scope.includes(type);

/** Whether this person may release this draft, and if not, why. */
export function releaseGate(authorities: ReleaseAuthority[], personId: string, d: Draft) {
  const authority = authorities.find((a) => a.personId === personId && covers(a, d.type)) ?? null;
  if (!authority)
    return {
      ok: false,
      authority,
      reason: `Only the Commander, or a release authority designated for ${d.type}, may release it.`,
    };
  if (personById(personId)?.status === "detached")
    return {
      ok: false,
      authority,
      reason: `${personName(personId)} is detached from the command. Designate the relief before releasing.`,
    };
  return { ok: true, authority, reason: "" };
}

/* ---------- release ---------- */

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** "041830Z NOV 26" */
export function dtgOf(d: Date) {
  return `${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}Z ${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`;
}

/** The serial and local sequence the next release takes. */
export function nextAssignment(s: CommandSettings) {
  const digits = Math.min(8, Math.max(1, Math.trunc(s.sequenceDigits) || 4));
  const n = Math.max(1, Math.trunc(s.nextSequence) || 1);
  const msn = pad(n, digits);
  return { msn, localSequence: `${s.sequencePrefix}${msn}`, nextSequence: n + 1 };
}

export const nullSequence = (s: CommandSettings) => `${s.sequencePrefix}${"-".repeat(Math.max(1, s.sequenceDigits))}`;

const CLASS_LINE: Record<Draft["classification"], string> = {
  UNCLASSIFIED: "UNCLAS",
  CUI: "UNCLAS//CUI",
  CONFIDENTIAL: "C O N F I D E N T I A L",
  SECRET: "S E C R E T",
};

/** The message as it transmits. Unreleased drafts show null placeholders for the DTG and serial. */
export function renderMessage(d: Draft, s: CommandSettings) {
  const caseOf = (t: string) => (s.textCase === "upper" ? t.toUpperCase() : t);
  const month = d.dtg ? d.dtg.split(" ")[1] : "---";
  const lines = [
    `${d.precedence.charAt(0)}${d.precedence.charAt(0)} ${d.dtg ?? "------Z --- --"}`,
    `FM ${d.originator}`,
    `TO ${d.to.join("\n   ") || "(no action addressee)"}`,
    ...(d.info.length ? [`INFO ${d.info.join("\n     ")}`] : []),
    "BT",
    CLASS_LINE[d.classification],
    `MSGID/GENADMIN/COMSUBLANT/${d.msn ?? "-".repeat(s.sequenceDigits)}/${month}//`,
    `SUBJ/${caseOf(d.subject || "UNTITLED")}//`,
    ...d.paragraphs.filter((p) => p.trim()).map((p, i) => `${i + 1}. ${caseOf(p.trim())}`),
    "BT",
    d.localSequence ?? nullSequence(s),
    "NNNN",
  ];
  return lines.join("\n");
}

/* ---------- seed drafts ---------- */

export const INITIAL_DRAFTS: Draft[] = [
  {
    id: "dr-1",
    subject: "Quarterly communications security inspection schedule",
    type: "COMSUBLANT MSG",
    originator: OWN_ORIGINATOR,
    precedence: "ROUTINE",
    classification: "UNCLASSIFIED",
    to: ["ALSUBLANT"],
    info: ["COMSUBFOR NORFOLK VA"],
    paragraphs: [
      "Communications security inspections for the first quarter will be conducted per the enclosed schedule.",
      "Units will confirm their inspection date to N6 within ten days.",
    ],
    drafterId: "p-taylor",
    status: "drafting",
    route: [],
    created: "2026-11-03T14:10:00Z",
    updated: "2026-11-03T14:10:00Z",
  },
  {
    id: "dr-2",
    subject: "Holiday leave period watch manning",
    type: "COMSUBLANT MSG",
    originator: OWN_ORIGINATOR,
    precedence: "PRIORITY",
    classification: "UNCLASSIFIED",
    to: ["ALSUBLANT"],
    info: [],
    paragraphs: [
      "Units in port during the holiday leave period will maintain a minimum duty section as directed by the squadron.",
      "Watchbills are due to the squadron not later than 15 DEC 26.",
    ],
    drafterId: "p-nguyen",
    status: "in_routing",
    workflowId: "wf-general",
    route: [
      { order: 1, title: "N3 review", personId: "p-ramos", action: "review", status: "endorsed", actedAt: "2026-11-04T13:05:00Z", comment: "Concur." },
      { order: 2, title: "Chief of Staff review", personId: "p-chen", action: "review", status: "current" },
      { order: 3, title: "Commander release", personId: "p-walsh", action: "release", status: "pending" },
    ],
    created: "2026-11-04T11:40:00Z",
    updated: "2026-11-04T13:05:00Z",
  },
  {
    id: "dr-3",
    subject: "Heavy weather mooring check",
    type: "SAFETY MSG",
    originator: OWN_ORIGINATOR,
    precedence: "IMMEDIATE",
    classification: "UNCLASSIFIED",
    to: ["COMSUBRON SIX", "COMSUBRON EIGHT"],
    info: ["COMSUBFOR NORFOLK VA"],
    paragraphs: ["Units in port will complete heavy weather mooring checks before 1200Z 26 OCT 26.", "Report completion to the squadron duty officer."],
    drafterId: "p-taylor",
    status: "released",
    workflowId: "wf-safety",
    route: [
      { order: 1, title: "N3 review", personId: "p-ramos", action: "review", status: "endorsed", actedAt: "2026-10-25T15:20:00Z" },
      { order: 2, title: "Chief of Staff release", personId: "p-chen", action: "release", status: "released", actedAt: "2026-10-25T15:42:00Z" },
    ],
    created: "2026-10-25T14:55:00Z",
    updated: "2026-10-25T15:42:00Z",
    dtg: "251542Z OCT 26",
    msn: "0041",
    localSequence: "#0041",
    releasedAt: "2026-10-25T15:42:00Z",
    releasedBy: "p-chen",
    releaseDesignation: "Chief of Staff",
  },
  {
    id: "dr-4",
    subject: "Spare parts validation reminder",
    type: "FLEET MSG",
    originator: OWN_ORIGINATOR,
    precedence: "ROUTINE",
    classification: "UNCLASSIFIED",
    to: ["COMSUBRON TWO"],
    info: [],
    paragraphs: ["Units will validate the fourth quarter spare parts requirement and return corrections."],
    drafterId: "p-taylor",
    status: "returned",
    workflowId: "wf-logistics",
    route: [
      { order: 1, title: "Supply review", personId: "p-patel", action: "review", status: "returned", actedAt: "2026-11-04T09:30:00Z", comment: "Add the suspense date: 05 NOV 26." },
      { order: 2, title: "N4 release", personId: "p-brooks", action: "release", status: "pending" },
    ],
    created: "2026-11-03T16:00:00Z",
    updated: "2026-11-04T09:30:00Z",
  },
];

export const INITIAL_ROUTING_EVENTS: RoutingEvent[] = [
  { id: "re-1", draftId: "dr-1", type: "created", at: "2026-11-03T14:10:00Z", actorId: "p-taylor", comment: "Draft opened." },
  { id: "re-2", draftId: "dr-2", type: "created", at: "2026-11-04T11:40:00Z", actorId: "p-nguyen", comment: "Draft opened." },
  { id: "re-3", draftId: "dr-2", type: "submitted", at: "2026-11-04T12:15:00Z", actorId: "p-nguyen", comment: "Submitted on COMSUBLANT general message." },
  { id: "re-4", draftId: "dr-2", type: "advanced", at: "2026-11-04T13:05:00Z", actorId: "p-ramos", stepTitle: "N3 review", comment: "Concur." },
  { id: "re-5", draftId: "dr-3", type: "submitted", at: "2026-10-25T15:00:00Z", actorId: "p-taylor", comment: "Submitted on Safety message." },
  { id: "re-6", draftId: "dr-3", type: "advanced", at: "2026-10-25T15:20:00Z", actorId: "p-ramos", stepTitle: "N3 review", comment: "Endorsed." },
  { id: "re-7", draftId: "dr-3", type: "released", at: "2026-10-25T15:42:00Z", actorId: "p-chen", stepTitle: "Chief of Staff release", comment: "Released as Chief of Staff · #0041 · 251542Z OCT 26. The transmitted text is frozen." },
  { id: "re-8", draftId: "dr-4", type: "submitted", at: "2026-11-04T08:50:00Z", actorId: "p-taylor", comment: "Submitted on Logistics fleet message." },
  { id: "re-9", draftId: "dr-4", type: "returned", at: "2026-11-04T09:30:00Z", actorId: "p-patel", stepTitle: "Supply review", comment: "Add the suspense date: 05 NOV 26." },
];
