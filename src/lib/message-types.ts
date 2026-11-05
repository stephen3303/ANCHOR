// The message types ANCHOR knows: the value in field 2 of the MSGID set. The
// type is also the subscription key and names the template that drafts it.
// Topic types carry subtags, written in MSGID field 3:
//
//   MSGID/SAFETY/ELECTRICAL/COMSUBLANT N3/...    type SAFETY, subtag ELECTRICAL
//   MSGID/CASREP/USS STONEFISH/...               type CASREP, no subtag
//
// A subscription to SAFETY catches every SAFETY message, any subtag; one to
// SAFETY/ELECTRICAL catches only that subtag. Category (Operational or
// Administrative) follows NTP 3(J) paras 303 and 304. General messages
// (NAVADMIN, ALNAV...) are typed by their title, per para 306d.
import type { MessageCategory, Precedence } from "./types";

export const MESSAGE_CATEGORIES: MessageCategory[] = ["Operational", "Administrative"];

export const MESSAGE_CATEGORY_DESCRIPTIONS: Record<MessageCategory, string> = {
  Operational: "Unit movements, logistics, status, incident reporting and strike tasking.",
  Administrative: "Policy, organization and general traffic across commands.",
};

export interface Subtag {
  /** Written in MSGID field 3, e.g. ELECTRICAL. */
  code: string;
  name: string;
}

interface TypeInfo {
  category: MessageCategory;
  name: string;
  description: string;
  /** Template used to draft this type. */
  template: string;
  /** Subtags for a topic type; absent for report formats and general messages. */
  subtags?: Subtag[];
  /** Known by its general-message title rather than MSGID field 2 (NAVADMIN, ALNAV...). */
  byTitle?: boolean;
  /** Received only; this command does not draft it. */
  receiveOnly?: boolean;
}

const STANDARD = "Standard Message";
const tags = (list: [string, string][]): Subtag[] => list.map(([code, name]) => ({ code, name }));
const topic = (category: MessageCategory, name: string, description: string, subtags: [string, string][]): TypeInfo =>
  ({ category, name, description, template: STANDARD, subtags: tags(subtags) });

const CATALOG = {
  // Report formats (NTP 3(J) special-purpose formats).
  MOVREP: { category: "Operational", name: "Movement Report", template: STANDARD, description: "Sent 24 to 48 hours before getting underway, and for arrivals, positions and cancellations. Tracks ship locations and supports search and rescue." },
  LOGREQ: { category: "Operational", name: "Logistic Requirement", template: STANDARD, description: "Submitted at least 48 hours before port entry to request fuel, food, water and arrival support." },
  "OPREP-3": { category: "Operational", name: "Operational Report 3", template: STANDARD, description: "Special incident reporting (PINNACLE, NAVY BLUE, unit SITREP), sent at high precedence." },
  "OPREP-5": { category: "Operational", name: "Operational Report 5", template: STANDARD, description: "Daily report while underway: equipment status, headcount, food and fuel levels, significant events." },
  CASREP: { category: "Operational", name: "Casualty Report", template: STANDARD, description: "Reports technical equipment failures by severity (CAT II, III, IV), with required periodic updates." },
  INDIGO: { category: "Operational", name: "INDIGO", template: STANDARD, description: "Plans and authorizes Tomahawk Land-Attack Missile (TLAM) missions." },

  // Topic types: subscribe to the topic, or to one of its subtags.
  OPERATIONS: topic("Operational", "Operations", "Unit movements, status and incident traffic.", [["MOVEMENT", "Unit Movements"], ["STATUS", "Unit Status Reporting"], ["INCIDENTS", "Incident Reporting"], ["EXERCISES", "Exercises"]]),
  SUBMARINE: topic("Operational", "Submarine Warfare", "Submarine force operations.", [["DEPLOYMENTS", "Deployments & Patrols"], ["PORT-VISITS", "Port Visits"], ["TACTICS", "Tactics & Doctrine"], ["STRATEGIC", "Strategic Forces"]]),
  SURFACE: topic("Operational", "Surface Warfare", "Surface force operations.", [["FLEET-OPS", "Fleet Operations"], ["TACTICS", "Tactics & Doctrine"], ["AMPHIBIOUS", "Amphibious Operations"]]),
  AVIATION: topic("Operational", "Aviation", "Aviation operations and standardization.", [["FLIGHT-OPS", "Flight Operations"], ["AIRCRAFT-MAINT", "Aircraft Maintenance"], ["NATOPS", "NATOPS & Standardization"]]),
  EXPEDITIONARY: topic("Operational", "Expeditionary Forces", "Expeditionary combat forces.", [["EOD", "Explosive Ordnance Disposal"], ["DIVING", "Diving & Salvage"], ["CONSTRUCTION", "Naval Construction"]]),
  LOGISTICS: topic("Operational", "Logistics", "Combat logistics and port support.", [["FUEL-PROVISIONS", "Fuel & Provisions"], ["PORT-SERVICES", "Port Services"], ["PARTS", "Parts & Supply"]]),
  CYBER: topic("Administrative", "Cybersecurity", "Cyber controls, incidents and awareness.", [["CONTROLS", "Cyber Controls & Compliance"], ["INCIDENTS", "Cyber Incident Reporting"], ["TRAINING", "Cyber Awareness Training"], ["NETWORKS", "Network Operations"]]),
  READINESS: topic("Administrative", "Readiness", "Readiness reporting and inspections.", [["REPORTING", "Readiness Reporting"], ["INSPECTIONS", "Inspections & Certifications"], ["FORCE-HEALTH", "Force Health Protection"], ["MOBILIZATION", "Mobilization"]]),
  PERSONNEL: topic("Administrative", "Personnel", "Personnel policy and support.", [["LEAVE", "Leave & Liberty"], ["ASSIGNMENTS", "Assignments & Detailing"], ["PAY", "Pay & Allowances"], ["ADVANCEMENT", "Advancement & Promotion"], ["AWARDS", "Awards & Recognition"], ["FAMILY", "Family Support"]]),
  TRAINING: topic("Administrative", "Training & Education", "Qualifications, schools and education.", [["WATCH-QUALS", "Watch Qualifications"], ["PIPELINE", "Training Pipeline"], ["PME", "Professional Military Education"], ["SCHOOLS", "Schools & Courses"]]),
  MAINTENANCE: topic("Administrative", "Maintenance", "Availabilities and maintenance reporting.", [["AVAILABILITIES", "Availabilities"], ["CASUALTIES", "Equipment Casualties"], ["REPORTING", "Maintenance Reporting"]]),
  SAFETY: topic("Administrative", "Safety", "Safety programs and guidance.", [["ELECTRICAL", "Electrical Safety"], ["MOTORCYCLE", "Motorcycle Safety"], ["HEARING", "Hearing Conservation"], ["TRAFFIC", "Traffic Safety"], ["HEAT-STRESS", "Heat Stress"], ["HEAVY-WEATHER", "Heavy Weather"], ["MISHAPS", "Afloat Mishaps"], ["ORM", "Operational Risk Management"], ["STAND-DOWNS", "Safety Stand-Downs"]]),
  POLICY: topic("Administrative", "Policy", "Administrative policy and compliance.", [["RECORDS", "Records Management"], ["ENVIRONMENTAL", "Environmental Compliance"], ["ADMIN", "Administrative Policy"], ["LEGAL", "Legal & Ethics"]]),

  // General administration and service-wide general messages.
  GENADMIN: { category: "Administrative", name: "General Administration", template: STANDARD, description: "Narrative administrative traffic not covered by a topic type." },
  NAVADMIN: { category: "Administrative", name: "NAVADMIN", template: STANDARD, byTitle: true, receiveOnly: true, description: "Policy or informational messages originating from the Chief of Naval Operations." },
  ALNAV: { category: "Administrative", name: "ALNAV", template: STANDARD, byTitle: true, receiveOnly: true, description: "General message distributed to all Navy personnel." },
  ALMAR: { category: "Administrative", name: "ALMAR", template: STANDARD, byTitle: true, receiveOnly: true, description: "General message distributed to all Marine Corps personnel." },
  MARADMIN: { category: "Administrative", name: "MARADMIN", template: STANDARD, byTitle: true, receiveOnly: true, description: "General message distributed service-wide within the Marine Corps." },
  OPNAVINST: { category: "Administrative", name: "OPNAV Instruction", template: STANDARD, byTitle: true, receiveOnly: true, description: "Directive issued by the Office of the Chief of Naval Operations." },
  NAVSEAINST: { category: "Administrative", name: "NAVSEA Instruction", template: STANDARD, byTitle: true, receiveOnly: true, description: "Directive issued by Naval Sea Systems Command." },
  "COMSUBFOR INST": { category: "Administrative", name: "COMSUBFOR Instruction", template: STANDARD, byTitle: true, receiveOnly: true, description: "Directive issued by Commander, Submarine Forces." },
} satisfies Record<string, TypeInfo>;

export type MessageType = keyof typeof CATALOG;
export const MESSAGE_TYPE_INFO: Record<MessageType, TypeInfo> = CATALOG;

/** Every type, grouped by category in MESSAGE_CATEGORIES order. */
export const MESSAGE_TYPES = MESSAGE_CATEGORIES.flatMap((c) =>
  (Object.keys(MESSAGE_TYPE_INFO) as MessageType[]).filter((t) => MESSAGE_TYPE_INFO[t].category === c),
);

/** Types this command can draft, in catalog order. */
export const DRAFT_TYPES = (Object.keys(MESSAGE_TYPE_INFO) as MessageType[]).filter((t) => !MESSAGE_TYPE_INFO[t].receiveOnly);

export const isMessageType = (value: string): value is MessageType => Object.hasOwn(MESSAGE_TYPE_INFO, value);

export const categoryOf = (type: MessageType): MessageCategory => MESSAGE_TYPE_INFO[type]?.category ?? "Administrative";

export const subtagsOf = (type: MessageType): Subtag[] => MESSAGE_TYPE_INFO[type]?.subtags ?? [];

/** A subtag the type defines, matched by code without regard to case. */
export const findSubtag = (type: MessageType, code: string) => subtagsOf(type).find((s) => s.code === code.trim().toUpperCase());

/* ---------- subscription keys ---------- */

/**
 * A message's subscription key: its MSGID fields 2 and 3, "SAFETY/ELECTRICAL",
 * or just the type, "CASREP". Subscriptions list keys; a type alone covers
 * every subtag under it.
 */
export const messageKey = (type: MessageType, subtag?: string) => (subtag ? `${type}/${subtag}` : type);

export const splitKey = (key: string): [string, string | undefined] => {
  const i = key.indexOf("/");
  return i < 0 ? [key, undefined] : [key.slice(0, i), key.slice(i + 1)];
};

/** Whether a selected key catches a message key. A type catches all its subtags. */
export const keyCovers = (selected: string, key: string) => selected === key || selected === splitKey(key)[0];

/** Whether a message key falls under any selected key. No selection catches everything. */
export const matchesKeys = (key: string, selection: readonly string[]) => !selection.length || selection.some((s) => keyCovers(s, key));

export const isKnownKey = (key: string) => {
  const [type, sub] = splitKey(key);
  return isMessageType(type) && (sub === undefined || !!findSubtag(type, sub));
};

/** "Electrical Safety" for SAFETY/ELECTRICAL, "Casualty Report" for CASREP. */
export function keyName(key: string) {
  const [type, sub] = splitKey(key);
  if (!isMessageType(type)) return key;
  return sub ? findSubtag(type, sub)?.name ?? sub : MESSAGE_TYPE_INFO[type].name;
}

/** "Safety › Electrical Safety", or the type's name. */
export function keyPath(key: string) {
  const [type, sub] = splitKey(key);
  if (!isMessageType(type)) return key;
  return sub ? `${MESSAGE_TYPE_INFO[type].name} › ${keyName(key)}` : MESSAGE_TYPE_INFO[type].name;
}

/** Every draftable key, as the MSGID type picker offers them: each type, then each of its subtags. */
export const DRAFT_KEYS = DRAFT_TYPES.flatMap((t) => [t as string, ...subtagsOf(t).map((s) => messageKey(t, s.code))]);

/** Option label in the template picker: "SAFETY/ELECTRICAL - Electrical Safety". Its output is the key. */
export const keyOption = (key: string) => `${key} - ${keyName(key)}`;

/**
 * Speed-of-service objectives (NTP 3(J) para 302): total communications
 * handling time, from time of file at the originator's communications center
 * to receipt at the addressee's. `use` paraphrases para 503.
 */
export const PRECEDENCE_OBJECTIVE: Record<Precedence, { prosign: string; minutes: number; label: string; use: string }> = {
  FLASH: { prosign: "Z", minutes: 10, label: "As fast as possible, under 10 minutes", use: "Initial enemy contact and operational combat messages of extreme urgency. Brevity is mandatory." },
  IMMEDIATE: { prosign: "O", minutes: 30, label: "30 minutes", use: "Situations that gravely affect the security of forces or populace, and reports of death, serious illness or injury." },
  PRIORITY: { prosign: "P", minutes: 180, label: "3 hours", use: "Quick action needed, or essential information for operations in progress. Highest normally allowed for administrative traffic." },
  ROUTINE: { prosign: "R", minutes: 360, label: "6 hours", use: "Normal operations, movements, supply and administrative matters." },
};

/**
 * A note when the precedence is unusual for the category. NTP 3(J) para 304:
 * administrative messages are normally no higher than PRIORITY, except reports
 * of death, serious illness or serious injury, which go IMMEDIATE.
 */
export function precedenceAdvisory(type: MessageType, precedence: Precedence): string | null {
  if (categoryOf(type) !== "Administrative") return null;
  if (precedence === "FLASH") return "FLASH is not used for administrative traffic (NTP 3(J) para 304).";
  if (precedence === "IMMEDIATE") return "Administrative traffic is normally no higher than PRIORITY. IMMEDIATE is reserved for reports of death, serious illness or serious injury (NTP 3(J) para 304).";
  return null;
}

/**
 * The draftable key a "Msg Type" template value names, from either its option
 * label ("SAFETY/ELECTRICAL - Electrical Safety") or the bare key.
 */
export function draftKeyFrom(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const key = value.split(" - ")[0].trim().toUpperCase();
  return DRAFT_KEYS.includes(key) ? key : undefined;
}

/** A key's type and subtag, for writing onto a message record. */
export function keyParts(key: string): { type: MessageType; subtag?: string } {
  const [type, subtag] = splitKey(key);
  return { type: isMessageType(type) ? type : "GENADMIN", ...(subtag ? { subtag } : {}) };
}

/** A message's own subscription key, from its type and subtag. */
export const keyOf = (m: { type: MessageType; subtag?: string }) => messageKey(m.type, m.subtag);

/** How many messages fall under a selected key. */
export const countUnder = (key: string, messages: { type: MessageType; subtag?: string }[]) =>
  messages.filter((m) => keyCovers(key, keyOf(m))).length;
