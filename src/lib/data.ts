// Mock data for the prototype. Every message, person, unit and address here is
// fictional and exists only to exercise the UI. None of it is real traffic.
import { formatForType } from "./message-types";
import type {
  AckReceipt,
  ActionItem,
  Addressee,
  AddressGroup,
  AuditEvent,
  Message,
  MessageSection,
  MessageUserState,
  Subscription,
  SyncItem,
} from "./types";

export const CURRENT_USER = {
  name: "LT Taylor",
  login: "LTaylor",
  rank: "LT",
  community: "Submarine Warfare",
  billet: "Communications Officer",
  unit: "COMSUBLANT N6",
  command: "Commander, Submarine Force Atlantic",
  /** Message source code for the user's command; traffic with this source was sent by it. */
  commandSource: "COMSUBLANT",
  location: "Ashore",
  email: "taylor.j@example.mil",
  dsn: "312-555-1234",
  roles: [
    { name: "Message Viewer", detail: "View messages and attachments", granted: true },
    { name: "Briefing Creator", detail: "Create and customize briefings", granted: true },
    { name: "Subscription Requester", detail: "Request subscriptions for approval", granted: true },
    { name: "Report Viewer", detail: "Acknowledgement and traffic reports", granted: true },
    { name: "Subscription Approver", detail: "Approve unit subscription requests", granted: true },
    { name: "Designated Release Authority", detail: "Release outgoing command traffic", granted: false },
    { name: "System Admin", detail: "Manage unit users and settings", granted: true },
  ],
  groups: ["COMSUBLANT", "COMSUBLANT N6", "Comms Division"],
};

// Small deterministic hash so mock SHA-256 values are stable between renders.
function mockSha(seed: string): string {
  let out = "";
  let h = 2166136261;
  for (let round = 0; out.length < 64; round++) {
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i) + round;
      h = Math.imul(h, 16777619) >>> 0;
    }
    out += h.toString(16).padStart(8, "0");
  }
  return out.slice(0, 64);
}

function sections(
  purpose: string,
  background: string,
  action: string,
  poc: string,
  enclosures?: string[],
): MessageSection[] {
  const s: MessageSection[] = [
    { heading: "Purpose", body: [purpose] },
    { heading: "Background", body: [background] },
    { heading: "Action", body: [action] },
    { heading: "Point of Contact", body: [poc] },
  ];
  if (enclosures) s.push({ heading: "Enclosures", body: enclosures });
  return s;
}

type Seed = Omit<Message, "sha256" | "c2oixId" | "distribution" | "retention" | "addressees" | "rawText"> &
  Partial<Pick<Message, "distribution" | "retention" | "addressees" | "rawText">>;

const PROSIGN: Record<Message["precedence"], string> = { FLASH: "Z", IMMEDIATE: "O", PRIORITY: "P", ROUTINE: "R" };
const CLASS_LINE: Record<Message["classification"], string> = {
  UNCLASSIFIED: "UNCLAS",
  CUI: "UNCLAS//CUI",
  CONFIDENTIAL: "C O N F I D E N T I A L",
  SECRET: "S E C R E T",
};

/** Wraps to the 69-character line length used by record message traffic. */
function wrap(text: string, width = 69, indent = ""): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = indent + word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Builds the mock message as it would arrive off the wire: a plain-text record
 * message with prosigns, uppercase sets and fixed-width lines. Seeds can supply
 * their own rawText instead. Real ingest would store the received bytes here.
 */
function rawMessage(s: Seed, serial: number): string {
  const up = (t: string) => t.toUpperCase();
  const out: string[] = [
    `${PROSIGN[s.precedence]} ${s.dtg}`,
    `FM ${up(s.originator)}`,
    `TO ${up(s.to)}`,
    `INFO ${up(s.info)}`,
    "BT",
    CLASS_LINE[s.classification],
    ...wrap(`SUBJ/${up(s.subject)}//`),
    `MSGID/${formatForType(s.type)}/${up(s.originator)}/${up(s.reference)}//`,
  ];
  if (s.relatesTo) out.push(`REF/A/MSG/${up(s.relatesTo)}//`);
  const poc = s.sections.find((x) => x.heading === "Point of Contact");
  if (poc) out.push(...wrap(`POC/${up(poc.body.join(" "))}//`));
  s.sections
    .filter((x) => x !== poc)
    .forEach((x, i) => {
      const para = `${i + 1}.`;
      const lead = i === 0 ? `RMKS/${para}` : para;
      if (x.body.length === 1) {
        out.push(...wrap(`${lead} ${up(x.heading)}. ${up(x.body[0])}`, 69, "  "));
      } else {
        out.push(`${lead} ${up(x.heading)}.`);
        x.body.forEach((b, j) => out.push(...wrap(`${String.fromCharCode(65 + j)}. ${up(b)}`, 67, "   ").map((l) => `  ${l}`)));
      }
    });
  out[out.length - 1] += "//";
  out.push("BT", `#${String(serial).padStart(4, "0")}`, "NNNN");
  return out.join("\n");
}

const seeds: Seed[] = [
  {
    id: "comsublant-078-26",
    dtg: "241830Z OCT 26",
    received: "2026-10-24T18:30:00Z",
    subject: "Submarine Deployment Readiness Reporting Requirements",
    reference: "COMSUBLANT 078/26",
    type: "GENADMIN",
    originator: "COMSUBLANT N3",
    source: "COMSUBLANT",
    to: "All COMSUBLANT Units",
    info: "COMSUBFOR, SUBRON Commanders",
    precedence: "IMMEDIATE",
    classification: "UNCLASSIFIED",
    importance: "High",
    lifecycle: "ACTIVE",
    relatesTo: "COMSUBLANT 061/26",
    topics: ["submarine.deployments", "readiness.reporting"],
    attachments: [
      { name: "COMSUBLANT_078_26.pdf", size: "1.2 MB", kind: "pdf" },
      { name: "Readiness_Template.xlsx", size: "450 KB", kind: "xlsx" },
    ],
    sections: sections(
      "To establish standardized deployment readiness reporting for all COMSUBLANT units. This message supersedes COMSUBLANT 061/26 and provides updated timelines, a reporting template, and validation procedures.",
      "Recent assessments identified inconsistent readiness reporting across squadrons. The updated procedure improves data accuracy and aligns reporting with the force readiness tracking cycle.",
      "Commanding Officers shall submit the enclosed reporting template NLT 07 NOV 2026 via prescribed channels. Units shall complete data validation and squadron review before submission. Acknowledge receipt of this message in ANCHOR.",
      "COMSUBLANT N3 Readiness Division, DSN 312-555-0101, n3readiness@example.mil",
      ["Deployment Readiness Reporting Template (Excel)", "Reporting Procedures Guide", "Frequently Asked Questions"],
    ),
    ackRequired: true,
    ackDue: "2026-10-26T18:30:00Z",
    addressees: [
      { name: "All COMSUBLANT Units", role: "TO", kind: "group" },
      { name: "COMSUBFOR", role: "INFO", kind: "command" },
      { name: "SUBRON Commanders", role: "INFO", kind: "group" },
    ],
    actionItem: { text: "Track unit readiness report submissions", suspense: "07 NOV 2026", assignedTo: "LT Taylor" },
    sizeKb: 1228,
    related: ["comsublant-061-26", "comsubfor-3500-1", "navadmin-236-26"],
    aiSummary:
      "Units must use the new readiness template and submit it by 07 NOV 2026 after squadron review. Replaces COMSUBLANT 061/26. Receipt must be acknowledged.",
  },
  {
    id: "navadmin-236-26",
    dtg: "241207Z OCT 26",
    received: "2026-10-24T12:07:00Z",
    subject: "Cybersecurity Controls Update (Corrected Copy)",
    reference: "NAVADMIN 236/26",
    type: "NAVADMIN",
    originator: "OPNAV N2N6",
    source: "OPNAV",
    to: "NAVADMIN",
    info: "All Navy Activities",
    precedence: "PRIORITY",
    classification: "UNCLASSIFIED",
    importance: "High",
    lifecycle: "CORRECTED",
    relatesTo: "NAVADMIN 235/26",
    topics: ["cyber.controls", "policy.admin", "readiness.inspections"],
    attachments: [{ name: "NAVADMIN_236_26.pdf", size: "820 KB", kind: "pdf" }],
    sections: sections(
      "To issue updated cybersecurity controls and monitoring requirements for operational networks. This corrected copy fixes the implementation date in paragraph 3 of NAVADMIN 235/26.",
      "Updated threat assessments require tighter configuration baselines and continuous monitoring on afloat and ashore networks.",
      "Information System Security Managers shall implement the enclosed controls NLT 13 NOV 2026 and report completion through the chain of command.",
      "OPNAV N2N6 Cyber Policy Branch, DSN 312-555-0202",
    ),
    ackRequired: true,
    ackDue: "2026-10-27T12:00:00Z",
    addressees: [{ name: "ALSUBS", role: "TO", kind: "group" }],
    actionItem: { text: "Implement cybersecurity controls", suspense: "13 NOV 2026", assignedTo: "IT Chief" },
    sizeKb: 820,
    related: ["navadmin-235-26", "comsublant-078-26"],
    aiSummary:
      "New network configuration and monitoring controls are due by 13 NOV 2026. This copy corrects the date given in NAVADMIN 235/26.",
  },
  {
    id: "navadmin-235-26",
    dtg: "231530Z OCT 26",
    received: "2026-10-23T15:30:00Z",
    subject: "Cybersecurity Controls Update",
    reference: "NAVADMIN 235/26",
    type: "NAVADMIN",
    originator: "OPNAV N2N6",
    source: "OPNAV",
    to: "NAVADMIN",
    info: "All Navy Activities",
    precedence: "PRIORITY",
    classification: "UNCLASSIFIED",
    importance: "Medium",
    lifecycle: "SUPERSEDED",
    replacedBy: "NAVADMIN 236/26",
    topics: ["cyber.controls", "policy.admin"],
    attachments: [],
    sections: sections(
      "To issue updated cybersecurity controls for operational networks.",
      "Updated threat assessments require tighter configuration baselines.",
      "Implement the enclosed controls NLT 30 OCT 2026.",
      "OPNAV N2N6 Cyber Policy Branch, DSN 312-555-0202",
    ),
    ackRequired: false,
    sizeKb: 640,
    related: ["navadmin-236-26"],
  },
  {
    id: "comsublant-080-26",
    dtg: "240515Z OCT 26",
    received: "2026-10-24T05:15:00Z",
    subject: "Submarine Safety Stand-Down Guidance",
    reference: "COMSUBLANT 080/26",
    type: "GENADMIN",
    originator: "COMSUBLANT Safety",
    source: "COMSUBLANT",
    to: "All COMSUBLANT Units",
    info: "COMSUBFOR",
    precedence: "IMMEDIATE",
    classification: "UNCLASSIFIED",
    importance: "High",
    lifecycle: "ACTIVE",
    topics: ["safety.stand-downs", "safety.orm", "submarine"],
    attachments: [{ name: "Safety_Standdown_Agenda.docx", size: "210 KB", kind: "docx" }],
    sections: sections(
      "To direct a one-day safety stand-down for all COMSUBLANT units.",
      "A review of recent mishap reports identified common contributing factors in maintenance and watchstanding practices.",
      "Commanding Officers shall conduct the stand-down using the enclosed agenda NLT 31 OCT 2026 and report completion to the squadron.",
      "COMSUBLANT Safety Office, DSN 312-555-0303",
      ["Stand-Down Agenda"],
    ),
    ackRequired: true,
    ackDue: "2026-10-25T05:15:00Z",
    addressees: [
      { name: "All COMSUBLANT Units", role: "TO", kind: "group" },
      { name: "COMSUBFOR", role: "INFO", kind: "command" },
    ],
    actionItem: { text: "Collect safety stand-down completion reports", suspense: "31 OCT 2026", assignedTo: "Safety Officer" },
    sizeKb: 210,
    related: ["comsublant-078-26"],
    aiSummary: "Each unit holds a one-day safety stand-down by 31 OCT 2026 using the enclosed agenda, then reports completion.",
  },
  {
    id: "navadmin-234-26",
    dtg: "240523Z OCT 26",
    received: "2026-10-24T05:23:00Z",
    subject: "Force Health Protection Guidance",
    reference: "NAVADMIN 234/26",
    type: "NAVADMIN",
    originator: "OPNAV N1",
    source: "OPNAV",
    to: "NAVADMIN",
    info: "All Navy Activities",
    precedence: "PRIORITY",
    classification: "UNCLASSIFIED",
    importance: "Medium",
    lifecycle: "ACTIVE",
    topics: ["readiness.force-health", "personnel.family"],
    attachments: [
      { name: "NAVADMIN_234_26.pdf", size: "1.2 MB", kind: "pdf" },
      { name: "Health_Protection_Annex.docx", size: "450 KB", kind: "docx" },
    ],
    sections: sections(
      "To provide updated force health protection guidance for all fleet units in support of operational readiness.",
      "Recent developments require updated procedures to ensure continued compliance with Department of the Navy health protection standards.",
      "Commanding Officers shall review the enclosed guidance and implement applicable measures IAW references (a) through (c).",
      "OPNAV N1 Force Health Protection Division, DSN 312-555-0404",
    ),
    ackRequired: false,
    sizeKb: 1650,
    related: ["navadmin-228-26"],
    aiSummary: "Updated health protection measures. Commands should review the annex and apply what fits their unit.",
  },
  {
    id: "comsublant-061-26",
    dtg: "021430Z OCT 26",
    received: "2026-10-02T14:30:00Z",
    subject: "Deployment Readiness Reporting (Interim)",
    reference: "COMSUBLANT 061/26",
    type: "GENADMIN",
    originator: "COMSUBLANT N3",
    source: "COMSUBLANT",
    to: "All COMSUBLANT Units",
    info: "SUBRON Commanders",
    precedence: "ROUTINE",
    classification: "UNCLASSIFIED",
    importance: "Medium",
    lifecycle: "SUPERSEDED",
    replacedBy: "COMSUBLANT 078/26",
    topics: ["submarine.deployments", "readiness.reporting"],
    attachments: [],
    sections: sections(
      "To provide interim readiness reporting guidance pending a standardized template.",
      "Squadrons requested interim direction while the standardized template is developed.",
      "Continue using squadron formats until further notice.",
      "COMSUBLANT N3 Readiness Division, DSN 312-555-0101",
    ),
    ackRequired: false,
    sizeKb: 96,
    related: ["comsublant-078-26"],
  },
  {
    id: "navadmin-228-26",
    dtg: "230942Z OCT 26",
    received: "2026-10-23T09:42:00Z",
    subject: "Personnel Policy Update",
    reference: "NAVADMIN 228/26",
    type: "NAVADMIN",
    originator: "OPNAV N1",
    source: "OPNAV",
    to: "NAVADMIN",
    info: "All Navy Activities",
    precedence: "ROUTINE",
    classification: "UNCLASSIFIED",
    importance: "Medium",
    lifecycle: "ACTIVE",
    topics: ["personnel.assignments", "policy.admin"],
    attachments: [],
    sections: sections(
      "To announce changes to assignment timelines and detailer guidance.",
      "Rotation cycle feedback identified a need for earlier notice of assignment changes.",
      "Commands shall brief affected personnel and update rotation plans before the next detailing window.",
      "OPNAV N1 Assignment Policy, DSN 312-555-0505",
    ),
    ackRequired: false,
    actionItem: { text: "Review personnel policy changes", suspense: "06 NOV 2026", assignedTo: "Admin Chief" },
    sizeKb: 140,
    related: ["navadmin-231-26"],
    aiSummary: "Assignment timelines and detailer guidance are changing. Brief affected Sailors before the next detailing window.",
  },
  {
    id: "navadmin-231-26",
    dtg: "221645Z OCT 26",
    received: "2026-10-22T16:45:00Z",
    subject: "Training Pipeline Adjustments",
    reference: "NAVADMIN 231/26",
    type: "NAVADMIN",
    originator: "OPNAV N1",
    source: "OPNAV",
    to: "NAVADMIN",
    info: "NETC, COMSUBFOR",
    precedence: "ROUTINE",
    classification: "UNCLASSIFIED",
    importance: "Medium",
    lifecycle: "ACTIVE",
    topics: ["training.pipeline", "training.schools"],
    attachments: [{ name: "Pipeline_Schedule.xlsx", size: "310 KB", kind: "xlsx" }],
    sections: sections(
      "To publish revised training schedules for submarine and cybersecurity courses.",
      "Instructor availability and course capacity changed for the next two quarters.",
      "Training Officers shall update unit training schedules and confirm seats with the schoolhouse.",
      "NETC Pipeline Management, DSN 312-555-0606",
    ),
    ackRequired: false,
    actionItem: { text: "Update unit training schedules", suspense: "04 NOV 2026", assignedTo: "Training PO" },
    sizeKb: 310,
    related: ["comsubfor-3500-1"],
  },
  {
    id: "comsubfor-3500-1",
    dtg: "221103Z OCT 26",
    received: "2026-10-22T11:03:00Z",
    subject: "Watch Team Qualification Standards",
    reference: "COMSUBFOR INST 3500.1",
    type: "COMSUBFOR INST",
    originator: "COMSUBFOR N7",
    source: "COMSUBFOR",
    to: "All Submarine Force Units",
    info: "COMSUBLANT, COMSUBPAC",
    precedence: "ROUTINE",
    classification: "UNCLASSIFIED",
    importance: "Medium",
    lifecycle: "ACTIVE",
    topics: ["training.watch-quals", "submarine.tactics"],
    attachments: [{ name: "Qualification_Standards.pdf", size: "2.1 MB", kind: "pdf" }],
    sections: sections(
      "To establish standard qualification requirements for submarine watch teams.",
      "Qualification practices varied between squadrons, complicating crew swaps.",
      "Units shall align watch team qualification programs to the enclosed standards within 90 days.",
      "COMSUBFOR N7 Training, DSN 312-555-0707",
    ),
    ackRequired: false,
    sizeKb: 2150,
    related: ["navadmin-231-26"],
  },
  {
    id: "navseainst-4790-8",
    dtg: "210931Z OCT 26",
    received: "2026-10-21T09:31:00Z",
    subject: "Maintenance Availability Reporting",
    reference: "NAVSEAINST 4790.8",
    type: "NAVSEAINST",
    originator: "NAVSEA",
    source: "NAVSEA",
    to: "Fleet Maintenance Activities",
    info: "COMSUBLANT",
    precedence: "ROUTINE",
    classification: "UNCLASSIFIED",
    importance: "Low",
    lifecycle: "ACTIVE",
    topics: ["maintenance.availabilities", "maintenance.reporting"],
    attachments: [],
    sections: sections(
      "To update maintenance availability reporting procedures.",
      "Availability status reporting needs a common format across activities.",
      "Maintenance activities shall adopt the updated format at the start of the next availability.",
      "NAVSEA Fleet Maintenance, DSN 312-555-0808",
    ),
    ackRequired: false,
    sizeKb: 180,
    related: [],
  },
  {
    id: "comsublant-074-26",
    dtg: "201905Z OCT 26",
    received: "2026-10-20T19:05:00Z",
    subject: "Port Visit Coordination (Amendment 1)",
    reference: "COMSUBLANT 074/26",
    type: "GENADMIN",
    originator: "COMSUBLANT N3",
    source: "COMSUBLANT",
    to: "Pilot Unit (SSN)",
    info: "SUBRON Commander",
    precedence: "PRIORITY",
    classification: "UNCLASSIFIED",
    importance: "High",
    lifecycle: "AMENDED",
    relatesTo: "COMSUBLANT 070/26",
    topics: ["submarine.port-visits", "logistics.port-services"],
    attachments: [],
    sections: sections(
      "To amend force protection measures for the upcoming port visit.",
      "Updated host-nation guidance changes liberty boundaries and reporting times.",
      "Commanding Officer shall brief the crew on revised measures before arrival.",
      "COMSUBLANT N3 Current Operations, DSN 312-555-0909",
    ),
    ackRequired: true,
    ackDue: "2026-10-25T19:00:00Z",
    addressees: [
      { name: "Pilot Unit (SSN)", role: "TO", kind: "command" },
      { name: "SUBRON 4", role: "INFO", kind: "command" },
    ],
    sizeKb: 75,
    related: [],
  },
  // Operational reports from the force's own units (NTP 3(J) para 303). Each
  // travels in its own message format, named in the MSGID set.
  {
    id: "stonefish-sitrep-003-26",
    dtg: "231915Z OCT 26",
    received: "2026-10-23T19:15:00Z",
    subject: "OPREP-3 Navy Unit SITREP: Man Overboard, Recovered",
    reference: "STONEFISH SITREP 003/26",
    type: "OPREP-3",
    originator: "USS Stonefish",
    source: "USS STONEFISH",
    to: "COMSUBLANT",
    info: "COMSUBRON SIX, COMSUBFOR",
    precedence: "IMMEDIATE",
    classification: "UNCLASSIFIED",
    importance: "High",
    lifecycle: "ACTIVE",
    topics: ["operations.incidents", "safety.mishaps"],
    attachments: [],
    sections: [
      { heading: "Situation", body: ["At 231842Z OCT 26, while surfaced in the Virginia Capes operating area, one crew member went over the side during topside line handling."] },
      { heading: "Actions Taken", body: ["Man overboard recovered at 231851Z OCT 26 by the ship's rescue swimmer.", "Member evaluated by the independent duty corpsman. Mild hypothermia, condition stable.", "Topside evolutions suspended pending safety review."] },
      { heading: "Impact", body: ["No impact on scheduled operations. Next report on completion of the safety review."] },
      { heading: "Point of Contact", body: ["USS Stonefish Executive Officer, via squadron duty officer"] },
    ],
    ackRequired: false,
    sizeKb: 6,
    related: [],
    aiSummary: "A crew member went overboard during topside line handling and was recovered within 9 minutes in stable condition. Topside evolutions are suspended pending a safety review; operations are unaffected.",
  },
  {
    id: "lanternfish-oprep5-296-26",
    dtg: "230001Z OCT 26",
    received: "2026-10-23T00:01:00Z",
    subject: "OPREP-5 Daily Unit Status",
    reference: "LANTERNFISH STATUS 296/26",
    type: "OPREP-5",
    originator: "USS Lanternfish",
    source: "USS LANTERNFISH",
    to: "COMSUBLANT",
    info: "COMSUBRON EIGHT",
    precedence: "ROUTINE",
    classification: "UNCLASSIFIED",
    importance: "Low",
    lifecycle: "ACTIVE",
    topics: ["operations.status", "logistics.fuel-provisions"],
    attachments: [],
    sections: [
      { heading: "Equipment Status", body: ["All mission-essential equipment fully mission capable. No outstanding CASREPs."] },
      { heading: "Personnel", body: ["Persons on board 141. No medical evacuations."] },
      { heading: "Consumables", body: ["Fuel and lube oil above minimum levels.", "Provisions 38 days. Potable water 92 percent."] },
      { heading: "Significant Events", body: ["Completed planned training evolutions. Nothing significant to report."] },
    ],
    ackRequired: false,
    sizeKb: 4,
    related: ["lanternfish-movrep-012-26"],
  },
  {
    id: "stonefish-casrep-26-004",
    dtg: "221620Z OCT 26",
    received: "2026-10-22T16:20:00Z",
    subject: "CASREP Initial: No. 2 Low Pressure Air Compressor, CAT 3",
    reference: "STONEFISH CASREP 26-004",
    type: "CASREP",
    originator: "USS Stonefish",
    source: "USS STONEFISH",
    to: "COMSUBLANT",
    info: "COMSUBRON SIX, NAVSEA",
    precedence: "PRIORITY",
    classification: "UNCLASSIFIED",
    importance: "Medium",
    lifecycle: "ACTIVE",
    topics: ["maintenance.casualties", "logistics.parts", "readiness.reporting"],
    attachments: [],
    sections: [
      { heading: "Casualty", body: ["Number 2 low pressure air compressor tripped on high discharge temperature and will not restart.", "Category 3: degrades a primary mission. Number 1 compressor carries the load with no redundancy."] },
      { heading: "Parts Required", body: ["Discharge temperature switch and first-stage valve assembly. Requisitions submitted."] },
      { heading: "Assistance", body: ["Ship's force troubleshooting. Technical assistance requested on arrival in port."] },
      { heading: "Estimated Correction", body: ["Ten days after receipt of parts. Updates will follow per CASREP procedures."] },
      { heading: "Point of Contact", body: ["USS Stonefish Engineer Officer, via squadron duty officer"] },
    ],
    ackRequired: false,
    actionItem: { text: "Track Stonefish LP air compressor parts and correction date", suspense: "01 NOV 2026", assignedTo: "Maintenance" },
    sizeKb: 7,
    related: [],
  },
  {
    id: "lanternfish-movrep-012-26",
    dtg: "211400Z OCT 26",
    received: "2026-10-21T14:00:00Z",
    subject: "MOVREP: Departure Norfolk for Virginia Capes Operating Area",
    reference: "LANTERNFISH MOVREP 012/26",
    type: "MOVREP",
    originator: "USS Lanternfish",
    source: "USS LANTERNFISH",
    to: "COMSUBLANT",
    info: "COMSUBRON EIGHT, FLTCYBERCOM",
    precedence: "ROUTINE",
    classification: "UNCLASSIFIED",
    importance: "Low",
    lifecycle: "ACTIVE",
    topics: ["operations.movement", "submarine.deployments"],
    attachments: [],
    sections: [
      { heading: "Departure", body: ["Estimated time of departure Norfolk 221200Z OCT 26."] },
      { heading: "Route", body: ["Transit via the Thimble Shoal channel to the Virginia Capes operating area. Intended movement in force submarine areas."] },
      { heading: "Arrival", body: ["Estimated time of arrival on station 221800Z OCT 26. Return to Norfolk to follow by separate MOVREP."] },
    ],
    ackRequired: false,
    sizeKb: 3,
    related: ["lanternfish-oprep5-296-26"],
  },
  {
    id: "ironfin-logreq-007-26",
    dtg: "211030Z OCT 26",
    received: "2026-10-21T10:30:00Z",
    subject: "LOGREQ: Port Visit Port Canaveral",
    reference: "IRONFIN LOGREQ 007/26",
    type: "LOGREQ",
    originator: "USS Ironfin",
    source: "USS IRONFIN",
    to: "COMSUBLANT",
    info: "COMSUBRON SIX, NAVSTA MAYPORT",
    precedence: "ROUTINE",
    classification: "UNCLASSIFIED",
    importance: "Low",
    lifecycle: "ACTIVE",
    topics: ["logistics.fuel-provisions", "logistics.port-services", "submarine.port-visits"],
    attachments: [],
    sections: [
      { heading: "Arrival", body: ["Estimated time of arrival Port Canaveral 240800Z OCT 26, departure 270800Z OCT 26."] },
      { heading: "Requirements", body: ["Diesel fuel 6,000 gallons.", "Potable water and shore power on arrival.", "Fresh provisions per attached list.", "Line handlers and one tug for berthing."] },
      { heading: "Point of Contact", body: ["USS Ironfin Supply Officer, via squadron duty officer"] },
    ],
    ackRequired: false,
    sizeKb: 4,
    related: ["comsublant-074-26"],
  },
  {
    id: "usff-2026-11",
    dtg: "191436Z OCT 26",
    received: "2026-10-19T14:36:00Z",
    subject: "Undersea Warfare Exercise Planning Conference",
    reference: "USFF 2026-11",
    type: "GENADMIN",
    originator: "USFF N7",
    source: "USFF",
    to: "Participating Units",
    info: "COMSUBLANT",
    precedence: "ROUTINE",
    classification: "UNCLASSIFIED",
    importance: "Low",
    lifecycle: "ACTIVE",
    topics: ["operations.exercises", "submarine.tactics"],
    attachments: [],
    sections: sections(
      "To announce the initial planning conference for the next undersea warfare exercise series.",
      "Exercise objectives were approved by the Fleet Commander.",
      "Participating units shall nominate planners and coordinate with Operations.",
      "USFF N7 Exercises, DSN 312-555-1010",
    ),
    ackRequired: false,
    actionItem: { text: "Coordinate undersea warfare exercise planners", suspense: "14 NOV 2026", assignedTo: "Operations" },
    sizeKb: 60,
    related: [],
  },
  {
    id: "alnav-079-26",
    dtg: "181200Z OCT 26",
    received: "2026-10-18T12:00:00Z",
    subject: "Holiday Leave Policy",
    reference: "ALNAV 079/26",
    type: "ALNAV",
    originator: "SECNAV",
    source: "SECNAV",
    to: "ALNAV",
    info: "All Navy and Marine Corps Activities",
    precedence: "ROUTINE",
    classification: "UNCLASSIFIED",
    importance: "Low",
    lifecycle: "ACTIVE",
    relatesTo: "ALNAV 071/26",
    topics: ["personnel.leave"],
    attachments: [],
    sections: sections(
      "To publish holiday leave policy and cancel ALNAV 071/26.",
      "Leave dates were adjusted to align with the published holiday schedule.",
      "Commands shall plan holiday leave periods IAW this message.",
      "SECNAV Personnel Policy, DSN 312-555-1111",
    ),
    ackRequired: false,
    sizeKb: 40,
    related: ["alnav-071-26"],
  },
  {
    id: "alnav-071-26",
    dtg: "011200Z OCT 26",
    received: "2026-10-01T12:00:00Z",
    subject: "Holiday Leave Policy (Initial)",
    reference: "ALNAV 071/26",
    type: "ALNAV",
    originator: "SECNAV",
    source: "SECNAV",
    to: "ALNAV",
    info: "All Navy and Marine Corps Activities",
    precedence: "ROUTINE",
    classification: "UNCLASSIFIED",
    importance: "Low",
    lifecycle: "CANCELLED",
    replacedBy: "ALNAV 079/26",
    topics: ["personnel.leave"],
    attachments: [],
    sections: sections(
      "To publish holiday leave policy.",
      "Annual holiday leave guidance.",
      "Commands shall plan holiday leave periods IAW this message.",
      "SECNAV Personnel Policy, DSN 312-555-1111",
    ),
    ackRequired: false,
    sizeKb: 38,
    related: ["alnav-079-26"],
  },
  {
    id: "navadmin-223-26",
    dtg: "090841Z OCT 26",
    received: "2026-10-09T08:41:00Z",
    subject: "Environmental Compliance Data Call",
    reference: "NAVADMIN 223/26",
    type: "NAVADMIN",
    originator: "OPNAV N45",
    source: "OPNAV",
    to: "NAVADMIN",
    info: "All Navy Activities",
    precedence: "ROUTINE",
    classification: "UNCLASSIFIED",
    importance: "Low",
    lifecycle: "EXPIRED",
    topics: ["policy.environmental"],
    attachments: [],
    sections: sections(
      "To request environmental compliance data from all activities.",
      "Annual compliance reporting.",
      "Submit data NLT 20 OCT 2026. This message expires after that date.",
      "OPNAV N45, DSN 312-555-1212",
    ),
    ackRequired: false,
    sizeKb: 52,
    related: [],
  },
  {
    id: "alnav-076-26",
    dtg: "120900Z OCT 26",
    received: "2026-10-12T09:00:00Z",
    subject: "Official Records Management Reminder",
    reference: "ALNAV 076/26",
    type: "ALNAV",
    originator: "SECNAV",
    source: "SECNAV",
    to: "ALNAV",
    info: "All Navy and Marine Corps Activities",
    precedence: "ROUTINE",
    classification: "UNCLASSIFIED",
    importance: "Low",
    lifecycle: "ACTIVE",
    topics: ["policy.records"],
    attachments: [],
    sections: sections(
      "To remind commands of official records retention responsibilities.",
      "Local copies of official messages are not a substitute for the official record.",
      "Commands shall review local records practices and train personnel on retention requirements.",
      "DON Records Management, DSN 312-555-1313",
    ),
    ackRequired: false,
    sizeKb: 44,
    related: [],
  },
];

export const MESSAGES: Message[] = seeds
  .map((s, i) => ({
    distribution: [
      "COMSUBLANT N3",
      "COMSUBLANT N6",
      "SUBRON Staff",
      "COMSUBLANT Staff",
      "Comms Division",
    ],
    retention: s.lifecycle === "EXPIRED" ? "Permanent (expired)" : "Permanent",
    addressees: [],
    ...s,
    rawText: s.rawText ?? rawMessage(s, 1001 + i),
    c2oixId: `C2OIX-26-${String(48210 + i * 37).padStart(6, "0")}`,
    sha256: mockSha(s.id + s.dtg),
  }))
  .sort((a, b) => b.received.localeCompare(a.received));

export const messageById = (id: string) => MESSAGES.find((m) => m.id === id);
export const messageByRef = (ref: string) => MESSAGES.find((m) => m.reference === ref);

/** Initial per-user state: what LT Taylor has read and acknowledged. */
export const INITIAL_USER_STATE: Record<string, MessageUserState> = Object.fromEntries(
  MESSAGES.map((m, i) => [
    m.id,
    {
      read: i < 2 ? "new" : i < 5 ? "unread" : "read",
    } satisfies MessageUserState,
  ]),
);

export const SUBSCRIPTIONS: Subscription[] = [
  {
    id: "sub-comsublant-cmd",
    name: "COMSUBLANT Command Traffic",
    description: "All traffic from COMSUBLANT to assigned units. Assigned by command.",
    criteria: { messageTypes: ["GENADMIN"], originators: ["COMSUBLANT"] },
    frequency: "Real-time",
    status: "Active",
    mandatory: true,
    channels: { inApp: true, email: true, teams: true },
    subscribedOn: "01 OCT 2026",
    lastUpdated: "01 OCT 2026",
    requestedBy: "Command assignment",
    approver: "COMSUBLANT N6",
  },
  {
    id: "sub-flash-immediate",
    name: "FLASH and IMMEDIATE Precedence",
    description: "Any FLASH or IMMEDIATE traffic addressed to the unit. Mandatory by precedence rule.",
    criteria: { messageTypes: [], precedence: ["FLASH", "IMMEDIATE"] },
    frequency: "Real-time",
    status: "Active",
    mandatory: true,
    channels: { inApp: true, email: true, teams: true },
    subscribedOn: "01 OCT 2026",
    lastUpdated: "01 OCT 2026",
    requestedBy: "Precedence rule",
    approver: "COMSUBLANT N6",
  },
  {
    id: "sub-deploy-readiness",
    name: "Deployment Readiness",
    description: "Deployment timelines, readiness reporting, checklists and validation procedures.",
    criteria: { messageTypes: [], topics: ["submarine.deployments", "readiness.reporting"] },
    frequency: "Real-time",
    status: "Active",
    mandatory: false,
    channels: { inApp: true, email: true, teams: false },
    subscribedOn: "03 OCT 2026",
    lastUpdated: "15 OCT 2026",
    requestedBy: "LT Taylor",
    approver: "LCDR Morgan (N6)",
    justification: "Comms Officer tracks readiness reporting for the CO.",
  },
  {
    id: "sub-cyber",
    name: "Cybersecurity Controls",
    description: "Cyber policy, alerts, and implementation guidance.",
    criteria: { messageTypes: [], topics: ["cyber"] },
    frequency: "Daily Digest",
    status: "Active",
    mandatory: false,
    channels: { inApp: true, email: true, teams: false },
    subscribedOn: "03 OCT 2026",
    lastUpdated: "03 OCT 2026",
    requestedBy: "LT Taylor",
    approver: "LCDR Morgan (N6)",
  },
  {
    id: "sub-personnel",
    name: "Personnel Policy Updates",
    description: "Personnel policies, assignments and leave.",
    criteria: { messageTypes: [], topics: ["personnel"] },
    frequency: "Daily Digest",
    status: "Active",
    mandatory: false,
    channels: { inApp: true, email: false, teams: false },
    subscribedOn: "05 OCT 2026",
    lastUpdated: "05 OCT 2026",
    requestedBy: "LT Taylor",
    approver: "LCDR Morgan (N6)",
  },
  {
    id: "sub-training",
    name: "Training Pipeline",
    description: "Training pipeline schedules and qualification standards.",
    criteria: { messageTypes: [], topics: ["training.pipeline", "training.watch-quals"] },
    frequency: "Weekly",
    status: "Active",
    mandatory: false,
    channels: { inApp: true, email: true, teams: false },
    subscribedOn: "05 OCT 2026",
    lastUpdated: "12 OCT 2026",
    requestedBy: "LT Taylor",
    approver: "LCDR Morgan (N6)",
  },
  {
    id: "sub-maintenance",
    name: "Maintenance Policy",
    description: "Maintenance policy and availability reporting.",
    criteria: { messageTypes: [], topics: ["maintenance"] },
    frequency: "Weekly",
    status: "Paused",
    mandatory: false,
    channels: { inApp: true, email: false, teams: false },
    subscribedOn: "06 OCT 2026",
    lastUpdated: "18 OCT 2026",
    requestedBy: "LT Taylor",
    approver: "LCDR Morgan (N6)",
  },
  {
    id: "sub-usw-exercise",
    name: "Undersea Warfare Exercises",
    description: "Exercise planning conferences and CONPLANs.",
    criteria: { messageTypes: [], topics: ["operations.exercises"] },
    frequency: "Daily Digest",
    status: "Pending Approval",
    mandatory: false,
    channels: { inApp: true, email: true, teams: false },
    subscribedOn: "—",
    lastUpdated: "23 OCT 2026",
    requestedBy: "LT Taylor",
    justification: "Unit is a likely participant in the next exercise series.",
  },
];

/** Requests from other users that LT Taylor, as Subscription Approver, can act on. */
export const APPROVAL_QUEUE: (Subscription & { requester: string; requestedOn: string })[] = [
  {
    ...SUBSCRIPTIONS[3],
    id: "req-1",
    name: "Cybersecurity Controls",
    requester: "ITC Ramirez",
    requestedOn: "23 OCT 2026",
    status: "Pending Approval",
    justification: "Division ISSM duties.",
  },
  {
    ...SUBSCRIPTIONS[5],
    id: "req-2",
    name: "Training Pipeline",
    requester: "ETC Nguyen",
    requestedOn: "22 OCT 2026",
    status: "Pending Approval",
    justification: "Training Petty Officer.",
  },
  {
    ...SUBSCRIPTIONS[4],
    id: "req-3",
    name: "Personnel Policy Updates",
    requester: "YN1 Brooks",
    requestedOn: "21 OCT 2026",
    status: "Pending Approval",
    justification: "Ship's office admin.",
  },
];

export const AUDIT_EVENTS: AuditEvent[] = [
  ["2026-10-24T18:58:00Z", "LTaylor", "Download", "Message (COMSUBLANT 078/26)", "Success", "Message downloaded to local cache for offline access. File hash verified."],
  ["2026-10-24T18:45:00Z", "ITChief", "Create Briefing", "Watch Turnover Briefing", "Success", "Briefing created from 8 messages."],
  ["2026-10-24T18:32:00Z", "JSmith", "View", "Message (NAVADMIN 236/26)", "Success", "Message opened in reader."],
  ["2026-10-24T18:15:00Z", "MKelly", "Request Subscription", "Cybersecurity Controls", "Success", "Subscription request routed to approver."],
  ["2026-10-24T17:40:00Z", "ASanchez", "Generate Report", "Acknowledgement Report", "Success", "Report generated for COMSUBLANT 080/26."],
  ["2026-10-24T17:20:00Z", "System", "Ack Received", "Message (COMSUBLANT 080/26)", "Success", "Acknowledgement received from USS Ironfin (SSN-903)."],
  ["2026-10-24T17:12:00Z", "RWalker", "Search", "Keyword: “readiness”", "Success", "Search returned 45 results."],
  ["2026-10-24T16:50:00Z", "JSmith", "Export", "Messages (Filtered Set)", "Warning", "Export included 2 superseded messages; user warned."],
  ["2026-10-24T16:21:00Z", "System", "Ingest", "C2OIX feed (14 messages)", "Success", "Source artifacts stored immutably. Hashes recorded."],
  ["2026-10-24T15:15:00Z", "TNguyen", "Login", "User Authentication (CAC)", "Success", "CAC/PKI certificate validated."],
  ["2026-10-24T14:02:00Z", "Unknown", "Login", "User Authentication (CAC)", "Failed", "Certificate revoked. Access denied."],
  ["2026-10-24T13:10:00Z", "System", "Integrity Check", "Message store (1,842 records)", "Success", "All record hashes match ingestion values."],
].map(([timestamp, user, action, resource, result, details], i) => ({
  id: `evt-${i}`,
  timestamp,
  user,
  action,
  resource,
  classification: "UNCLASSIFIED" as const,
  result: result as AuditEvent["result"],
  sourceIp: `10.15.32.${18 + i}`,
  device: i % 3 === 0 ? "ANCHOR-OPS-01" : "ANCHOR-WS-0" + ((i % 4) + 2),
  location: "COMSUBLANT N6",
  details,
  hash: mockSha(timestamp + action),
}));

export const AUDIT_BY_ACTION = [
  { label: "View", pct: 35 },
  { label: "Download", pct: 22 },
  { label: "Search", pct: 15 },
  { label: "Create/Update", pct: 12 },
  { label: "Login/Logout", pct: 8 },
  { label: "Acknowledge", pct: 5 },
  { label: "Other", pct: 3 },
];

export const AUDIT_BY_CLASSIFICATION = [
  { label: "UNCLASSIFIED", value: 10842 },
  { label: "CUI", value: 1201 },
  { label: "CONFIDENTIAL", value: 344 },
  { label: "SECRET", value: 100 },
];

export const SYNC_QUEUE: SyncItem[] = [
  { id: "s1", type: "Acknowledgement", description: "Ack received: COMSUBLANT 080/26 (USS Ironfin)", created: "24 OCT 0630Z", status: "Pending" },
  { id: "s2", type: "Message Record", description: "New message record (local)", created: "24 OCT 0615Z", status: "Pending" },
  { id: "s3", type: "Briefing", description: "Watch Turnover Briefing", created: "24 OCT 0600Z", status: "Pending" },
  { id: "s4", type: "Action Item", description: "Action item update", created: "24 OCT 0555Z", status: "Pending" },
  { id: "s5", type: "Subscription", description: "Subscription change request", created: "24 OCT 0540Z", status: "Pending" },
  { id: "s6", type: "Watch Notes", description: "Watch notes", created: "24 OCT 0520Z", status: "Pending" },
  { id: "s7", type: "Report", description: "Report generation", created: "24 OCT 0510Z", status: "Pending" },
  { id: "s8", type: "Annotation", description: "Message annotation", created: "24 OCT 0505Z", status: "Pending" },
];

export const WATCH_NOTES = [
  "Monitor submissions for COMSUBLANT 078/26 readiness reporting.",
  "Coordinate with IT Chief on cybersecurity controls timeline (NAVADMIN 236/26).",
  "Collect safety stand-down completion reports for COMSUBLANT 080/26 (due 31 OCT).",
  "Follow up with Training PO on course seat availability.",
  "No outstanding critical issues.",
];

export const ONGOING_TOPICS = [
  { topic: "Deployment Readiness", lastUpdate: "24 OCT 2026", status: "Active" },
  { topic: "Cybersecurity Controls", lastUpdate: "24 OCT 2026", status: "Active" },
  { topic: "Training Pipeline", lastUpdate: "22 OCT 2026", status: "Monitoring" },
  { topic: "Port Visit Planning", lastUpdate: "20 OCT 2026", status: "Monitoring" },
];

export const TURNOVER_CHECKLIST = [
  "Review new messages",
  "Review open action items",
  "Check pending acknowledgements",
  "Check ongoing topics",
  "Update watch notes",
  "Review system alerts",
  "Validate subscriptions",
  "Confirm handover with outgoing watch",
  "Finalize turnover package",
];

export function actionItems(messages: Message[] = MESSAGES): ActionItem[] {
  const live = (m: Message) => m.lifecycle !== "SUPERSEDED" && m.lifecycle !== "CANCELLED" && m.lifecycle !== "EXPIRED";
  return messages.filter((m) => m.actionItem && live(m)).map((m, i) => ({
    id: `ai-${m.id}`,
    importance: m.importance,
    text: m.actionItem!.text,
    source: m.reference,
    assignedTo: m.actionItem!.assignedTo,
    suspense: m.actionItem!.suspense,
    status: (["Open", "Open", "In Progress", "In Progress", "Not Started", "Not Started"] as const)[i % 6],
  }));
}

// Command-level pub/sub: which commands are subscribed to each address group.
// A message addressed to a group is tracked for acknowledgement from every
// member command. Hull names and numbers are fictional.
const SSNS_LANT = ["Pilot Unit (SSN)", "USS Stonefish (SSN-901)", "USS Ironfin (SSN-903)", "USS Lanternfish (SSN-905)"];
const SSNS_PAC = ["USS Thornback (SSN-907)", "USS Ghostfin (SSN-909)"];

export const COMMAND_GROUPS: AddressGroup[] = [
  { id: "grp-alsubs", name: "ALSUBS", members: [...SSNS_LANT, ...SSNS_PAC] },
  { id: "grp-comsublant-units", name: "All COMSUBLANT Units", members: [...SSNS_LANT, "SUBRON 4", "SUBRON 6"] },
  { id: "grp-subron-cdrs", name: "SUBRON Commanders", members: ["SUBRON 4", "SUBRON 6"] },
  { id: "grp-subfor-units", name: "All Submarine Force Units", members: [...SSNS_LANT, ...SSNS_PAC, "SUBRON 4", "SUBRON 6", "COMSUBLANT", "COMSUBPAC"] },
];

/** True when this command originated the message (it tracks acknowledgements rather than giving one). */
export const sentByOwnCommand = (m: Message) => m.source === CURRENT_USER.commandSource;

/** Received, live traffic this command must acknowledge to the originator. */
export const needsOwnAck = (m: Message) =>
  m.ackRequired && !sentByOwnCommand(m) && m.lifecycle !== "SUPERSEDED" && m.lifecycle !== "CANCELLED";

/**
 * Acknowledgements received from addressees of traffic this command sent, by
 * message id. A command can acknowledge more than once (e.g. again after an
 * amendment). Every time falls between the message's receipt and MOCK_NOW.
 */
export const ACK_RECEIPTS: Record<string, AckReceipt[]> = {
  "comsublant-078-26": [
    { command: "USS Stonefish (SSN-901)", at: "2026-10-24T18:41:00Z" },
    { command: "SUBRON 4", at: "2026-10-24T18:47:00Z" },
    { command: "COMSUBFOR", at: "2026-10-24T18:55:00Z" },
  ],
  "comsublant-080-26": [
    { command: "SUBRON 4", at: "2026-10-24T05:40:00Z" },
    { command: "USS Stonefish (SSN-901)", at: "2026-10-24T05:52:00Z" },
    { command: "USS Ironfin (SSN-903)", at: "2026-10-24T06:30:00Z" },
    { command: "SUBRON 6", at: "2026-10-24T07:05:00Z" },
    { command: "COMSUBFOR", at: "2026-10-24T09:20:00Z" },
    { command: "USS Ironfin (SSN-903)", at: "2026-10-24T17:20:00Z" },
  ],
  "comsublant-074-26": [
    { command: "SUBRON 4", at: "2026-10-20T21:30:00Z" },
    { command: "Pilot Unit (SSN)", at: "2026-10-21T08:12:00Z" },
    { command: "SUBRON 4", at: "2026-10-23T09:00:00Z" },
  ],
};

export interface CommandAckStatus {
  command: string;
  /** Strongest role the command was addressed in (TO beats INFO). */
  role: Addressee["role"];
  /** Address groups the command was reached through; empty when addressed directly. */
  via: string[];
  /** Acknowledgement times received from this command, earliest first. */
  receipts: string[];
}

export interface AddresseeRollup {
  addressee: Addressee;
  acked: number;
  total: number;
}

const groupMembers = (a: Addressee) =>
  a.kind === "group" ? (COMMAND_GROUPS.find((g) => g.name === a.name)?.members ?? []) : [a.name];

/** Expands a sent message's addressees to commands and merges acknowledgements received. */
export function resolveAckStatus(m: Message, receipts: AckReceipt[] = ACK_RECEIPTS[m.id] ?? []): { commands: CommandAckStatus[]; rollup: AddresseeRollup[] } {
  const byCommand = new Map<string, CommandAckStatus>();
  for (const a of m.addressees) {
    for (const command of groupMembers(a)) {
      const c = byCommand.get(command) ?? { command, role: a.role, via: [], receipts: [] };
      if (a.role === "TO") c.role = "TO";
      if (a.kind === "group") c.via.push(a.name);
      byCommand.set(command, c);
    }
  }
  for (const r of receipts) byCommand.get(r.command)?.receipts.push(r.at);
  for (const c of byCommand.values()) c.receipts.sort();

  const commands = [...byCommand.values()];
  const rollup = m.addressees.map((addressee) => {
    const members = groupMembers(addressee);
    return { addressee, total: members.length, acked: members.filter((c) => byCommand.get(c)!.receipts.length > 0).length };
  });
  return { commands, rollup };
}
