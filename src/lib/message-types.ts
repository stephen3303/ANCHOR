// The message types ANCHOR knows, the category each belongs to, and the
// handling objective for each precedence. One table, so the parser, the
// filters, the badges and the admin rules all agree.
//
// Authority: NTP 3(J), Telecommunications Users Manual. It defines two
// categories, operational (para 303) and administrative (para 304). The type
// is the message identifier in field 2 of the MSGID set (Annex A), or, for a
// general message, its title (para 306d), such as NAVADMIN or ALNAV.
import type { MessageCategory, MessageType, Precedence } from "./types";

export const MESSAGE_CATEGORIES: MessageCategory[] = ["Operational", "Administrative"];

export const MESSAGE_CATEGORY_DESCRIPTIONS: Record<MessageCategory, string> = {
  Operational: "Unit movements, logistics, status, incident reporting and strike tasking.",
  Administrative: "Policy, organization and general traffic across commands.",
};

interface TypeInfo {
  category: MessageCategory;
  name: string;
  description: string;
  /** The MSGID message-format name that identifies this type on the wire, when it has its own. */
  format?: string;
}

export const MESSAGE_TYPE_INFO: Record<MessageType, TypeInfo> = {
  MOVREP: {
    category: "Operational",
    name: "Movement Report",
    format: "MOVREP",
    description: "Sent 24 to 48 hours before getting underway, and for arrivals, positions and cancellations. Tracks ship locations and supports search and rescue.",
  },
  LOGREQ: {
    category: "Operational",
    name: "Logistic Requirement",
    format: "LOGREQ",
    description: "Submitted at least 48 hours before port entry to request fuel, food, water and arrival support.",
  },
  "OPREP-3": {
    category: "Operational",
    name: "Operational Report 3",
    format: "OPREP-3",
    description: "Special incident reporting (PINNACLE, NAVY BLUE, unit SITREP), sent at high precedence.",
  },
  "OPREP-5": {
    category: "Operational",
    name: "Operational Report 5",
    format: "OPREP-5",
    description: "Daily report while underway: equipment status, headcount, food and fuel levels, significant events.",
  },
  CASREP: {
    category: "Operational",
    name: "Casualty Report",
    format: "CASREP",
    description: "Reports technical equipment failures by severity (CAT II, III, IV), with required periodic updates.",
  },
  INDIGO: {
    category: "Operational",
    name: "INDIGO",
    format: "INDIGO",
    description: "Plans and authorizes Tomahawk Land-Attack Missile (TLAM) missions.",
  },
  GENADMIN: {
    category: "Administrative",
    name: "General Administration",
    format: "GENADMIN",
    description: "Routine administrative and organizational traffic sent across commands.",
  },
  NAVADMIN: {
    category: "Administrative",
    name: "NAVADMIN",
    description: "Policy or informational messages originating from the Chief of Naval Operations.",
  },
  ALNAV: {
    category: "Administrative",
    name: "ALNAV",
    description: "General message distributed to all Navy personnel.",
  },
  ALMAR: {
    category: "Administrative",
    name: "ALMAR",
    description: "General message distributed to all Marine Corps personnel.",
  },
  MARADMIN: {
    category: "Administrative",
    name: "MARADMIN",
    description: "General message distributed service-wide within the Marine Corps.",
  },
  OPNAVINST: { category: "Administrative", name: "OPNAV Instruction", description: "Directive issued by the Office of the Chief of Naval Operations." },
  NAVSEAINST: { category: "Administrative", name: "NAVSEA Instruction", description: "Directive issued by Naval Sea Systems Command." },
  "COMSUBFOR INST": { category: "Administrative", name: "COMSUBFOR Instruction", description: "Directive issued by Commander, Submarine Forces." },
};

/** Every type, grouped by category in MESSAGE_CATEGORIES order. */
export const MESSAGE_TYPES = MESSAGE_CATEGORIES.flatMap((c) =>
  (Object.keys(MESSAGE_TYPE_INFO) as MessageType[]).filter((t) => MESSAGE_TYPE_INFO[t].category === c),
);

export const categoryOf = (type: MessageType): MessageCategory => MESSAGE_TYPE_INFO[type].category;

const BY_FORMAT = new Map(
  (Object.entries(MESSAGE_TYPE_INFO) as [MessageType, TypeInfo][]).filter(([, i]) => i.format).map(([t, i]) => [i.format!, t]),
);

/** The type a MSGID message-format name identifies, e.g. "CASREP", or undefined for one ANCHOR doesn't type by format. */
export const typeForFormat = (format: string) => BY_FORMAT.get(format.trim().toUpperCase());

/** The MSGID message-format name to write for a type. Types without their own format travel as GENADMIN. */
export const formatForType = (type: MessageType) => MESSAGE_TYPE_INFO[type].format ?? "GENADMIN";

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
