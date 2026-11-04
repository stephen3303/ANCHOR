// The two server simulators and the command's links, ported from the Base44 build.
//
//   C2OIX server  - outside the command. Holds a repository of example traffic and
//                   hands the next message over only when an operator releases it.
//   ANCHOR server - at this command. Beats the circuit, ingests what is handed over,
//                   passes it on to every workstation it can reach, and holds every
//                   release for transmit until the circuit takes it.
//
// Traffic moves one hop at a time and waits at the last node it could reach.
// Everything here is fictional example traffic.
import type { Classification, Precedence } from "./types";

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

export interface ExternalServer {
  feedActive: boolean;
  beats: number;
  received: number;
  lastBeatAt?: string;
  note: string;
}

export interface LocalServer {
  beats: number;
  received: number;
  lastBeatAt?: string;
  peerState: "up" | "down" | "unknown";
  latencyMs?: number;
  note: string;
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

export const seedRepository = (): SimMessage[] =>
  SIM_TRAFFIC.map((m, i) => ({ ...m, seq: i + 1, status: "queued", attempts: 0, deliveries: {} }));

export const owedTo = (m: SimMessage, s: Station) => m.status === "ingested" && !m.deliveries[s];
export const fullyDelivered = (m: SimMessage) => m.status === "ingested" && STATIONS.every((s) => m.deliveries[s]);

/** "C2OIX-0003-LXYZ" */
export const receiptFor = (serial: number) => `C2OIX-${String(serial).padStart(4, "0")}-${Date.now().toString(36).toUpperCase().slice(-4)}`;
