// The simulated C2OIX circuit and the command's links (Comms & Network screen).
//
//   C2OIX server  - outside the command. Holds a repository of example traffic and
//                   hands the next message over only when the Message Admin releases it.
//   ANCHOR server - at this command. Beats the circuit, ingests what is handed over,
//                   passes it on to every workstation it can reach, and holds every
//                   release for transmit until the circuit takes it.
//
// Traffic moves one hop at a time and waits at the last node it could reach.
// Everything here is fictional example traffic.
import { EXAMPLE_SIM_TRAFFIC } from "./data";
import { idFor, parseNavalMessage } from "./naval";
import type { Classification, Message, MessageType, Precedence } from "./types";

export type Station = "ws1" | "ws2" | "ws3";
export const STATIONS: Station[] = ["ws1", "ws2", "ws3"];

export const NODES = {
  c2oix: { code: "C2OIX", name: "External C2OIX server", detail: "Outside the command. Holds the repository of traffic and releases it over the circuit when an operator sends it." },
  anchor: { code: "ANCHOR", name: "Local ANCHOR server", detail: "At this command. Serves every workstation with the message database and the audit chain." },
  ws1: { code: "WS-01", name: "Watch Officer workstation", detail: "Watch floor." },
  ws2: { code: "WS-02", name: "Commanding Officer workstation", detail: "Commander's office." },
  ws3: { code: "WS-03", name: "Radio workstation", detail: "Radio room." },
} as const;
export type NodeKey = keyof typeof NODES;

export interface SimMessage {
  seq: number;
  reference: string;
  dtg: string;
  precedence: Precedence;
  classification: Classification;
  originator: string;
  to: string;
  info: string;
  subject: string;
  body: string;
  sizeKb: number;
  /** Full text as it comes off the circuit, for example traffic written in a template's format. */
  rawText?: string;
  /** queued and deferred are still at C2OIX; ingested is on the ANCHOR server. */
  status: "queued" | "deferred" | "ingested";
  attempts: number;
  lastError?: string;
  ingestedAt?: string;
  /** When each workstation was handed it. Missing means that workstation is still owed it. */
  deliveries: Partial<Record<Station, string>>;
}

export interface SimTransmission {
  id: string;
  draftId: string;
  reference: string;
  subject: string;
  precedence: Precedence;
  releasedAt: string;
  status: "held" | "transmitted";
  attempts: number;
  transmittedAt?: string;
  receipt?: string;
}

export interface LinkState {
  state: "up" | "down";
  reportedAt?: string;
}

export const SIM_TRAFFIC: Omit<SimMessage, "seq" | "status" | "attempts" | "deliveries">[] = [
  {
    reference: "CSF-2614-0092",
    dtg: "260915Z OCT 26",
    precedence: "IMMEDIATE",
    classification: "UNCLASSIFIED",
    originator: "COMSUBFOR NORFOLK VA",
    to: "COMSUBLANT NORFOLK VA, COMSUBPAC PEARL HARBOR HI",
    info: "COMUSFLTFORCOM",
    sizeKb: 3.1,
    subject: "EXERCISE TASKING SERIAL TWO FOUR SEVEN",
    body: "1. Units named in REF A will report material readiness for the serial not later than 48 hours before the underway date.\n2. Any unit unable to meet the serial is to advise this headquarters by the fastest means available.",
  },
  {
    reference: "NVA-2614-0455",
    dtg: "261330Z OCT 26",
    precedence: "ROUTINE",
    classification: "UNCLASSIFIED",
    originator: "NAVIFOR NORFOLK VA",
    to: "ALL NAVY INSTALLATIONS",
    info: "OPNAV",
    sizeKb: 5.6,
    subject: "ANNUAL INFORMATION ASSURANCE TRAINING REQUIREMENT",
    body: "1. All hands are to complete the annual information assurance training before 31 DEC 26.\n2. Supervisors will confirm completion for personnel on leave or temporary duty.",
  },
  {
    reference: "CSF-2614-0098",
    dtg: "261545Z OCT 26",
    precedence: "FLASH",
    classification: "UNCLASSIFIED",
    originator: "COMSUBFOR NORFOLK VA",
    to: "COMSUBLANT NORFOLK VA, COMSUBPAC PEARL HARBOR HI",
    info: "COMUSFLTFORCOM, OPNAV",
    sizeKb: 1.9,
    subject: "SEVERE WEATHER ADVISORY FOR NORFOLK OPERATING AREA",
    body: "1. A tropical system is forecast to affect the Norfolk operating area within 72 hours.\n2. Units in port will complete heavy weather mooring before 1200Z 27 OCT 26.",
  },
  {
    reference: "CSP-2614-0311",
    dtg: "262040Z OCT 26",
    precedence: "PRIORITY",
    classification: "UNCLASSIFIED",
    originator: "COMSUBPAC PEARL HARBOR HI",
    to: "ALL SUBMARINE UNITS",
    info: "COMSUBFOR, COMSUBLANT NORFOLK VA",
    sizeKb: 4.4,
    subject: "SUPPLY ROUTING CHANGE FOR PACIFIC UNITS",
    body: "1. Effective 01 NOV 26, routine supply requisitions for Pacific units route through the Pearl Harbor supply center.\n2. Requisitions already in the system are not affected.",
  },
  {
    reference: "NVA-2614-0461",
    dtg: "262210Z OCT 26",
    precedence: "ROUTINE",
    classification: "UNCLASSIFIED",
    originator: "NAVIFOR NORFOLK VA",
    to: "ALL NAVY INSTALLATIONS",
    info: "OPNAV",
    sizeKb: 2.9,
    subject: "PERSONNEL TRANSFER CYCLE GUIDANCE",
    body: "1. Transfer orders for the summer cycle will be issued beginning 01 FEB 27.\n2. Commands will review the projected rotation list and report discrepancies to the detailer.",
  },
  {
    reference: "CSF-2614-0104",
    dtg: "262355Z OCT 26",
    precedence: "IMMEDIATE",
    classification: "UNCLASSIFIED",
    originator: "COMSUBFOR NORFOLK VA",
    to: "COMSUBLANT NORFOLK VA",
    info: "COMSUBPAC PEARL HARBOR HI",
    sizeKb: 2.1,
    subject: "ARRIVAL REPORT REQUIRED FOR RETURNING UNITS",
    body: "1. Units returning from tasking will submit an arrival report within four hours of mooring.\n2. The report will state material condition, personnel status and any outstanding maintenance.",
  },
  {
    reference: "OPN-2614-0027",
    dtg: "270130Z OCT 26",
    precedence: "ROUTINE",
    classification: "UNCLASSIFIED",
    originator: "CNO WASHINGTON DC",
    to: "ALNAV",
    info: "",
    sizeKb: 3.3,
    subject: "NAVY BIRTHDAY OBSERVANCE AFTER ACTION",
    body: "1. Commands will forward after-action notes on Navy birthday observances to the fleet public affairs office.\n2. Submissions are due by 15 NOV 26.",
  },
];

// Example traffic for each template (example-traffic.ts), held at C2OIX until released.
SIM_TRAFFIC.push(...EXAMPLE_SIM_TRAFFIC.map(({ spec, raw, parsed: p }) => ({
  reference: p.reference,
  dtg: p.dtg,
  precedence: p.precedence,
  classification: p.classification,
  originator: p.originator,
  to: p.to,
  info: p.info,
  sizeKb: Math.round((raw.length / 1024) * 10) / 10,
  subject: spec.subj.toUpperCase(),
  body: p.sections.map((x, i) => `${i + 1}. ${x.heading.toUpperCase()}. ${x.body.join(" ")}`).join("\n"),
  rawText: raw,
})));

export const seedRepository = (): SimMessage[] =>
  SIM_TRAFFIC.map((m, i) => ({ ...m, seq: i + 1, status: "queued", attempts: 0, deliveries: {} }));

export const owedTo = (m: SimMessage, s: Station) => m.status === "ingested" && !m.deliveries[s];
export const fullyDelivered = (m: SimMessage) => m.status === "ingested" && STATIONS.every((s) => m.deliveries[s]);

/** "C2OIX-0003-LXYZ" */
export const receiptFor = (serial: number) => `C2OIX-${String(serial).padStart(4, "0")}-${Date.now().toString(36).toUpperCase().slice(-4)}`;

/** Inbox ids for simulated traffic, so the store never sends their state to the server. */
const SIM_ID_PREFIX = "sim-";
export const isSimMessageId = (id: string) => id.startsWith(SIM_ID_PREFIX);
export const simMessageId = (m: Pick<SimMessage, "seq">) => `${SIM_ID_PREFIX}${m.seq}`;

const TYPE_BY_ORIGINATOR: [string, MessageType][] = [["CNO", "ALNAV"], ["COMSUBLANT", "GENADMIN"]];
const IMPORTANCE: Record<Precedence, Message["importance"]> = { FLASH: "High", IMMEDIATE: "High", PRIORITY: "Medium", ROUTINE: "Low" };

/** The inbox copy of a simulated message once a workstation has been handed it. */
export function toInboxMessage(m: SimMessage, at: string): Message {
  if (m.rawText) return fromRawText(m, m.rawText, at);
  const paragraphs = m.body.split("\n").filter(Boolean);
  const raw = [`${m.precedence} ${m.dtg}`, `FM ${m.originator}`, `TO ${m.to}`, ...(m.info ? [`INFO ${m.info}`] : []), "BT", m.classification, `SUBJ/${m.subject}//`, ...paragraphs, "BT"].join("\n");
  return {
    id: simMessageId(m),
    dtg: m.dtg,
    received: at,
    subject: m.subject,
    reference: m.reference,
    type: TYPE_BY_ORIGINATOR.find(([k]) => m.originator.startsWith(k))?.[1] ?? "GENADMIN",
    originator: m.originator,
    source: m.originator.split(" ")[0],
    to: m.to,
    info: m.info,
    precedence: m.precedence,
    classification: m.classification,
    importance: IMPORTANCE[m.precedence],
    lifecycle: "ACTIVE",
    attachments: [],
    sections: [{ heading: "Text", body: paragraphs }],
    rawText: raw,
    ackRequired: false,
    c2oixId: `C2OIX-SIM-${String(m.seq).padStart(4, "0")}`,
    sha256: Array.from({ length: 64 }, (_, i) => ((m.seq * 2654435761 + i * 40503) >>> (i % 24)) % 16).map((n) => n.toString(16)).join(""),
    sizeKb: m.sizeKb,
    retention: "Simulated traffic: cleared by Reset messages",
    distribution: [],
    addressees: [],
    related: [],
  };
}

/** Inbox copy of example traffic: everything the screens show is read from its text. */
function fromRawText(m: SimMessage, raw: string, at: string): Message {
  const p = parseNavalMessage(raw);
  return {
    ...toInboxMessage({ ...m, rawText: undefined }, at),
    type: p.type,
    ...(p.subtag ? { subtag: p.subtag } : {}),
    sections: p.poc ? [...p.sections, { heading: "Point of Contact", body: [p.poc] }] : p.sections,
    rawText: raw,
    ackRequired: !!p.ackDue,
    ...(p.ackDue ? { ackDue: p.ackDue } : {}),
    related: p.references.map(idFor),
    refs: p.refs,
  };
}
