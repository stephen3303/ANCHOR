// Example traffic for each message template, written the way each template
// lays a message out (MSGID, SUBJ, REF with AMPN or NARR, POC, RMKS) and read
// back through the live parser. Every unit, person and event here is fictional
// and UNCLASSIFIED; none of it is real traffic.
//
// Most examples are loaded into the message store by `npm run db:seed:messages`.
// Those marked `sim` stay in the simulated C2OIX repository and arrive only when
// the Message Admin releases them on the Comms & Network screen.
import { NavalParseError, parseNavalMessage, type ParsedMessage } from "./naval";
import { formatReferences, normDtg, type MessageReference } from "./references";

type Prosign = "Z" | "O" | "P" | "R";

/** A message the example cites that ANCHOR does not hold: a document, letter or outside message. */
interface ExternalRef {
  kind: string;
  originator: string;
  dtg: string;
  serial?: string;
  amplification: string;
}

export interface ExampleSpec {
  /** Template that drafts this message, as named on the Templates page. */
  template: string;
  /** Kept in the simulated C2OIX repository instead of the message store. */
  sim?: boolean;
  prec: Prosign;
  dtg: string;
  fm: string;
  to: string[];
  info?: string[];
  /** MSGID field 2: TYPE or TYPE:SUBTAG. */
  type: string;
  /** MSGID field 4: the message serial ANCHOR files the message under. */
  serial: string;
  subj: string;
  /** Serial of a message already held (seeded demo traffic or an earlier example), or an outside reference. */
  refs?: (string | ExternalRef)[];
  /** Lifecycle directive on REF A. Used only with a single reference. */
  directive?: "SUPERSEDES" | "CANCELS" | "CORRECTS" | "AMENDS";
  /** ACK set: when addressees must acknowledge. */
  ack?: string;
  poc: string;
  /** RMKS paragraphs: heading, then one paragraph or lettered sub-items. */
  rmks: [string, string | string[]][];
}

/** What an example needs to know about a message it cites. */
export interface HeldMessage {
  reference: string;
  originator: string;
  dtg: string;
  type: string;
  subject: string;
}

export interface BuiltExample {
  spec: ExampleSpec;
  raw: string;
  parsed: ParsedMessage;
}

export const EXAMPLE_SPECS: ExampleSpec[] = [
  /* ---------- PLANORD ---------- */
  {
    template: "PLANORD", prec: "R", dtg: "141600Z OCT 26",
    fm: "COMSUBLANT NORFOLK VA", to: ["ALL COMSUBLANT UNITS"], info: ["COMSUBFOR", "SUBRON COMMANDERS"],
    type: "PLANORD", serial: "COMSUBLANT PLANORD 26-02",
    subj: "PLANORD for Exercise Silent Anvil 26-2",
    refs: [{ kind: "DOC", originator: "COMSUBLANT", dtg: "15JUN26", amplification: "COMSUBLANT exercise planning handbook" }],
    poc: "LCDR R. Alvarez, COMSUBLANT N7 Exercise Branch, DSN 312-555-0171",
    rmks: [
      ["Situation", "Silent Anvil 26-2 is a fictional, unclassified force-level exercise in the Virginia Capes operating area from 02 to 13 NOV 2026. It exercises waterspace management, communications and logistics support for three submarines."],
      ["Mission", "Participating units plan for a two-week at-sea period and report readiness to conduct the exercise."],
      ["Execution", ["USS Stonefish, USS Ironfin and USS Lanternfish are the planned participants.", "Units submit a LOGREQ 72 hours before getting underway.", "An execute order will follow; this message does not authorize execution."]],
      ["Coordinating Instructions", "Planning conference at COMSUBLANT N7 on 21 OCT 2026 at 0900 local. Report attendees by 19 OCT 2026."],
    ],
  },
  {
    template: "PLANORD", prec: "P", dtg: "261400Z OCT 26",
    fm: "COMSUBLANT NORFOLK VA", to: ["ALL COMSUBLANT UNITS"], info: ["COMSUBFOR", "COMUSFLTFORCOM"],
    type: "PLANORD", serial: "COMSUBLANT PLANORD 26-03",
    subj: "PLANORD Heavy Weather Sortie, Tropical Storm Delia",
    refs: [{ kind: "DOC", originator: "COMSUBLANT", dtg: "01MAR25", amplification: "COMSUBLANT heavy weather plan" }],
    poc: "COMSUBLANT Battle Watch Captain, DSN 312-555-0100",
    rmks: [
      ["Situation", "Fictional Tropical Storm Delia may bring sustained winds above 50 knots to the Norfolk area within 72 hours."],
      ["Mission", "Units in port prepare to sortie or to remain in port in heavy weather mooring condition."],
      ["Execution", ["Set Sortie Condition Charlie at 1200Z 27 OCT 2026.", "Units unable to sortie report the reason and planned mooring configuration.", "Execution will be directed by separate EXORD."]],
      ["Coordinating Instructions", "Report sortie readiness to the battle watch by 1800Z 27 OCT 2026."],
    ],
  },
  {
    template: "PLANORD", prec: "R", dtg: "031500Z NOV 26",
    fm: "COMSUBRON SIX", to: ["USS STONEFISH", "USS IRONFIN"], info: ["COMSUBLANT NORFOLK VA"],
    type: "PLANORD", serial: "COMSUBRON SIX PLANORD 26-01",
    subj: "PLANORD Holiday Maintenance and Leave Period",
    poc: "LT M. Chen, COMSUBRON SIX Operations, DSN 312-555-0412",
    rmks: [
      ["Situation", "The squadron enters a holiday upkeep period from 20 NOV 2026 to 05 JAN 2027."],
      ["Mission", "Units plan maintenance and leave so that each boat keeps a qualified duty section and can get underway within 72 hours."],
      ["Execution", ["Submit upkeep work packages by 10 NOV 2026.", "Leave periods split into two halves, with crossover on 21 DEC 2026."]],
      ["Coordinating Instructions", "Report the proposed duty section bill to the squadron by 13 NOV 2026."],
    ],
  },
  {
    template: "PLANORD", sim: true, prec: "R", dtg: "051400Z NOV 26",
    fm: "COMSUBLANT NORFOLK VA", to: ["ALL COMSUBLANT UNITS"], info: ["COMSUBFOR"],
    type: "PLANORD", serial: "COMSUBLANT PLANORD 26-04",
    subj: "PLANORD for Exercise Silent Anvil 27-1",
    refs: ["COMSUBLANT PLANORD 26-02", "COMSUBLANT EXORD 26-05"],
    poc: "LCDR R. Alvarez, COMSUBLANT N7 Exercise Branch, DSN 312-555-0171",
    rmks: [
      ["Situation", "Silent Anvil 27-1 follows Silent Anvil 26-2 and runs from 08 to 19 MAR 2027. Lessons from 26-2 apply."],
      ["Mission", "Units plan for the exercise and nominate participants."],
      ["Coordinating Instructions", "Nominate participating units by 04 DEC 2026."],
    ],
  },

  /* ---------- EXORD ---------- */
  {
    template: "EXORD", prec: "P", dtg: "221000Z OCT 26",
    fm: "COMSUBLANT NORFOLK VA", to: ["USS STONEFISH", "USS IRONFIN", "USS LANTERNFISH"], info: ["COMSUBFOR", "COMSUBRON SIX"],
    type: "EXORD", serial: "COMSUBLANT EXORD 26-03",
    subj: "EXORD for Exercise Silent Anvil 26-2",
    refs: ["COMSUBLANT PLANORD 26-02"],
    ack: "241200Z OCT 26",
    poc: "LCDR R. Alvarez, COMSUBLANT N7 Exercise Branch, DSN 312-555-0171",
    rmks: [
      ["Situation", "Planning for Silent Anvil 26-2 is complete."],
      ["Mission", "Execute Silent Anvil 26-2 in the Virginia Capes operating area from 02 to 13 NOV 2026."],
      ["Execution", ["Get underway as scheduled in the exercise schedule.", "Report readiness for sea 24 hours before getting underway.", "Waterspace assignments are issued separately."]],
      ["Command and Signal", "COMSUBLANT is officer conducting the exercise. Daily OPREP-5 reports continue while underway."],
    ],
  },
  {
    template: "EXORD", prec: "O", dtg: "281800Z OCT 26",
    fm: "COMSUBLANT NORFOLK VA", to: ["ALL COMSUBLANT UNITS"], info: ["COMSUBFOR", "COMUSFLTFORCOM"],
    type: "EXORD", serial: "COMSUBLANT EXORD 26-04",
    subj: "EXORD Heavy Weather Sortie, Tropical Storm Delia",
    refs: ["COMSUBLANT PLANORD 26-03"],
    ack: "282100Z OCT 26",
    poc: "COMSUBLANT Battle Watch Captain, DSN 312-555-0100",
    rmks: [
      ["Situation", "Tropical Storm Delia is forecast to pass east of Norfolk within 36 hours."],
      ["Mission", "Units able to sortie get underway and remain clear of the storm track."],
      ["Execution", ["Sortie no later than 1200Z 29 OCT 2026.", "Units remaining in port set heavy weather mooring and report completion.", "Report position daily until return to port is directed."]],
      ["Command and Signal", "Acknowledge receipt in ANCHOR."],
    ],
  },
  {
    template: "EXORD", prec: "P", dtg: "301200Z OCT 26",
    fm: "COMSUBLANT NORFOLK VA", to: ["USS STONEFISH", "USS IRONFIN", "USS LANTERNFISH"], info: ["COMSUBFOR", "COMSUBRON SIX"],
    type: "EXORD", serial: "COMSUBLANT EXORD 26-05",
    subj: "EXORD Silent Anvil 26-2, Modification 1",
    refs: ["COMSUBLANT EXORD 26-03"], directive: "AMENDS",
    poc: "LCDR R. Alvarez, COMSUBLANT N7 Exercise Branch, DSN 312-555-0171",
    rmks: [
      ["Situation", "The heavy weather sortie delayed exercise start."],
      ["Execution", "Exercise dates change to 04 to 15 NOV 2026. All other instructions in the execute order remain in effect."],
    ],
  },
  {
    template: "EXORD", sim: true, prec: "P", dtg: "051100Z NOV 26",
    fm: "COMSUBLANT NORFOLK VA", to: ["ALL COMSUBLANT UNITS"], info: ["COMSUBFOR"],
    type: "EXORD", serial: "COMSUBLANT EXORD 26-06",
    subj: "EXORD Return to Port Following Heavy Weather Sortie",
    refs: ["COMSUBLANT EXORD 26-04"],
    poc: "COMSUBLANT Battle Watch Captain, DSN 312-555-0100",
    rmks: [
      ["Situation", "Tropical Storm Delia has cleared the Norfolk area."],
      ["Execution", "Units still at sea under the sortie order return to homeport as scheduled by the squadron. Submit a MOVREP before entering port."],
    ],
  },

  /* ---------- CASREP ---------- */
  {
    template: "CASREP", prec: "P", dtg: "171045Z OCT 26",
    fm: "USS IRONFIN", to: ["COMSUBLANT NORFOLK VA"], info: ["COMSUBRON SIX", "NAVSEA"],
    type: "CASREP", serial: "IRONFIN CASREP 26-011",
    subj: "CASREP Initial: No. 2 Ship Service Diesel Generator Governor, CAT 3",
    poc: "USS Ironfin Engineer Officer, via squadron duty officer",
    rmks: [
      ["Casualty", ["Number 2 ship service diesel generator governor hunts under load and will not hold frequency.", "Category 3: degrades a primary mission. Number 1 diesel is available."]],
      ["Parts Required", "Governor actuator assembly. Requisition submitted."],
      ["Assistance", "Technical assistance requested from the regional maintenance center."],
      ["Estimated Correction", "Seven days after receipt of parts."],
    ],
  },
  {
    template: "CASREP", prec: "P", dtg: "271330Z OCT 26",
    fm: "USS STONEFISH", to: ["COMSUBLANT NORFOLK VA"], info: ["COMSUBRON SIX", "NAVSEA"],
    type: "CASREP", serial: "STONEFISH CASREP 26-005",
    subj: "CASREP Update 01: No. 2 Low Pressure Air Compressor, CAT 3",
    refs: ["STONEFISH CASREP 26-004"],
    poc: "USS Stonefish Engineer Officer, via squadron duty officer",
    rmks: [
      ["Status", "Discharge temperature switch received and installed. First-stage valve assembly still on order."],
      ["Estimated Correction", "Changes to 08 NOV 2026."],
    ],
  },
  {
    template: "CASREP", prec: "O", dtg: "021930Z NOV 26",
    fm: "USS IRONFIN", to: ["COMSUBLANT NORFOLK VA"], info: ["COMSUBRON SIX", "NAVSEA", "COMSUBFOR"],
    type: "CASREP", serial: "IRONFIN CASREP 26-012",
    subj: "CASREP Initial: No. 1 Main Seawater Pump Motor, CAT 4",
    poc: "USS Ironfin Engineer Officer, via squadron duty officer",
    rmks: [
      ["Casualty", ["Number 1 main seawater pump motor grounded during a shift of pumps.", "Category 4: prevents performance of a primary mission. The ship is pierside and cannot get underway."]],
      ["Parts Required", "Replacement motor. Priority requisition submitted."],
      ["Assistance", "Regional maintenance center assistance requested on arrival of the motor."],
      ["Estimated Correction", "Fourteen days after receipt of parts."],
    ],
  },
  {
    template: "CASREP", sim: true, prec: "R", dtg: "051230Z NOV 26",
    fm: "USS IRONFIN", to: ["COMSUBLANT NORFOLK VA"], info: ["COMSUBRON SIX", "NAVSEA"],
    type: "CASREP", serial: "IRONFIN CASREP 26-013",
    subj: "CASCOR: No. 2 Ship Service Diesel Generator Governor",
    refs: ["IRONFIN CASREP 26-011"],
    poc: "USS Ironfin Engineer Officer, via squadron duty officer",
    rmks: [
      ["Correction", "Governor actuator replaced and tested satisfactorily under full load. The casualty is corrected."],
    ],
  },

  /* ---------- OPREP ---------- */
  {
    template: "OPREP", prec: "O", dtg: "251140Z OCT 26",
    fm: "USS STONEFISH", to: ["COMSUBLANT NORFOLK VA"], info: ["COMSUBFOR", "COMSUBRON SIX"],
    type: "OPREP", serial: "STONEFISH OPREP 26-007",
    subj: "OPREP-3 Navy Blue: Sailor Injured During Line Handling",
    poc: "USS Stonefish Executive Officer, via squadron duty officer",
    rmks: [
      ["Event", "At 1105Z a line handler suffered a hand injury while doubling up lines pierside, Norfolk."],
      ["Action Taken", "First aid given on scene. The sailor was taken by ambulance to the regional medical center."],
      ["Status", "Sailor is in stable condition. Next of kin notification is pending the member's request."],
    ],
  },
  {
    template: "OPREP", prec: "Z", dtg: "011805Z NOV 26",
    fm: "USS IRONFIN", to: ["COMSUBLANT NORFOLK VA"], info: ["COMSUBFOR", "COMUSFLTFORCOM", "COMSUBRON SIX"],
    type: "OPREP", serial: "IRONFIN OPREP 26-014",
    subj: "OPREP-3 Pinnacle: Contact with Fishing Vessel Gear",
    poc: "USS Ironfin Commanding Officer",
    rmks: [
      ["Event", "At 1748Z, while surfaced in the Virginia Capes operating area, the ship fouled fishing gear from a fictional fishing vessel."],
      ["Damage", "No injuries. No apparent damage to the ship. The fishing vessel reports lost nets only."],
      ["Action Taken", "Ship is stopped and assessing. Coast Guard notified."],
    ],
  },
  {
    template: "OPREP", prec: "O", dtg: "012210Z NOV 26",
    fm: "USS IRONFIN", to: ["COMSUBLANT NORFOLK VA"], info: ["COMSUBFOR", "COMUSFLTFORCOM", "COMSUBRON SIX"],
    type: "OPREP", serial: "IRONFIN OPREP 26-015",
    subj: "OPREP-3 Pinnacle Update 01: Contact with Fishing Vessel Gear",
    refs: ["IRONFIN OPREP 26-014"],
    poc: "USS Ironfin Commanding Officer",
    rmks: [
      ["Status", "Divers cleared the gear from the sail at 2120Z. Inspection found no damage."],
      ["Intentions", "Resume transit. Final report to follow on arrival."],
    ],
  },
  {
    template: "OPREP", sim: true, prec: "P", dtg: "051210Z NOV 26",
    fm: "USS LANTERNFISH", to: ["COMSUBLANT NORFOLK VA"], info: ["COMSUBRON SIX"],
    type: "OPREP", serial: "LANTERNFISH OPREP 26-010",
    subj: "OPREP-3 Navy Unit SITREP: Loss of Shore Power Pierside",
    poc: "USS Lanternfish Engineer Officer, via squadron duty officer",
    rmks: [
      ["Event", "At 1130Z shore power was lost to Pier 3 because of a failed pier transformer."],
      ["Action Taken", "Ship started its diesel generator and is carrying its own electrical load."],
      ["Status", "No impact to mission. Public works estimates repair by 2000Z."],
    ],
  },

  /* ---------- ALNAV ---------- */
  {
    template: "ALNAV", prec: "R", dtg: "201200Z OCT 26",
    fm: "SECNAV WASHINGTON DC", to: ["ALNAV"],
    type: "ALNAV", serial: "ALNAV 080/26",
    subj: "Combined Federal Campaign 2026",
    poc: "Office of the Secretary of the Navy, Administration Division, DSN 312-555-0710",
    rmks: [
      ["Purpose", "To announce the 2026 Combined Federal Campaign, running through 15 JAN 2027."],
      ["Policy", "Participation is voluntary. No member or employee will be pressured to give."],
      ["Action", "Commands designate a campaign coordinator and report the name to their echelon 2 command."],
    ],
  },
  {
    template: "ALNAV", prec: "P", dtg: "281300Z OCT 26",
    fm: "SECNAV WASHINGTON DC", to: ["ALNAV"],
    type: "ALNAV", serial: "ALNAV 081/26",
    subj: "Holiday Season Safety",
    refs: ["ALNAV 079/26"],
    poc: "Naval Safety Command, DSN 312-555-0720",
    rmks: [
      ["Purpose", "To emphasize safety during the holiday leave period announced in the reference."],
      ["Action", ["Leaders brief travel risk management before any leave or liberty over 300 miles.", "Commands review impaired driving prevention and designated driver programs."]],
    ],
  },
  {
    template: "ALNAV", prec: "R", dtg: "041400Z NOV 26",
    fm: "SECNAV WASHINGTON DC", to: ["ALNAV"],
    type: "ALNAV", serial: "ALNAV 082/26",
    subj: "Veterans Day Message",
    poc: "Office of the Secretary of the Navy, Public Affairs, DSN 312-555-0730",
    rmks: [
      ["Message", "On 11 NOV we honor every Sailor and Marine who has served. Thank you for your service and for the service of your families."],
    ],
  },
  {
    template: "ALNAV", sim: true, prec: "R", dtg: "051500Z NOV 26",
    fm: "SECNAV WASHINGTON DC", to: ["ALNAV"],
    type: "ALNAV", serial: "ALNAV 083/26",
    subj: "Annual Ethics Training Reminder",
    poc: "Office of the General Counsel, Ethics Office, DSN 312-555-0740",
    rmks: [
      ["Purpose", "To remind all personnel that annual ethics training is due by 31 DEC 2026."],
      ["Action", "Supervisors confirm completion for personnel on leave or temporary duty."],
    ],
  },

  /* ---------- NAVADMIN ---------- */
  {
    template: "NAVADMIN", prec: "R", dtg: "271615Z OCT 26",
    fm: "CNO WASHINGTON DC", to: ["NAVADMIN"],
    type: "NAVADMIN", serial: "NAVADMIN 238/26",
    subj: "Physical Fitness Assessment Cycle 1 2027 Guidance",
    poc: "OPNAV N17 Physical Readiness Program Office, DSN 312-555-0811",
    rmks: [
      ["Purpose", "To announce the window for the first physical fitness assessment cycle of 2027."],
      ["Policy", "The cycle runs from 01 FEB to 30 JUN 2026."],
      ["Action", "Command fitness leaders schedule assessments and report results within 15 days."],
    ],
  },
  {
    template: "NAVADMIN", prec: "P", dtg: "301410Z OCT 26",
    fm: "CNO WASHINGTON DC", to: ["NAVADMIN"],
    type: "NAVADMIN", serial: "NAVADMIN 241/26",
    subj: "Cyber Awareness Challenge Completion Deadline Extension",
    refs: ["NAVADMIN 236/26"],
    poc: "OPNAV N2N6 Cyber Policy Branch, DSN 312-555-0202",
    rmks: [
      ["Purpose", "To extend the completion date for the annual Cyber Awareness Challenge."],
      ["Policy", "The new completion date is 15 DEC 2026. Network controls in the reference are not changed."],
      ["Action", "Information system security managers report completion rates monthly."],
    ],
  },
  {
    template: "NAVADMIN", prec: "R", dtg: "031900Z NOV 26",
    fm: "CNO WASHINGTON DC", to: ["NAVADMIN"],
    type: "NAVADMIN", serial: "NAVADMIN 244/26",
    subj: "Correction to Physical Fitness Assessment Cycle 1 2027 Guidance",
    refs: ["NAVADMIN 238/26"], directive: "CORRECTS",
    poc: "OPNAV N17 Physical Readiness Program Office, DSN 312-555-0811",
    rmks: [
      ["Purpose", "To correct the assessment window in paragraph 2 of the reference."],
      ["Policy", "The cycle runs from 01 FEB to 30 JUN 2027. All other guidance is unchanged."],
    ],
  },
  {
    template: "NAVADMIN", sim: true, prec: "R", dtg: "051330Z NOV 26",
    fm: "CNO WASHINGTON DC", to: ["NAVADMIN"],
    type: "NAVADMIN", serial: "NAVADMIN 246/26",
    subj: "Seasonal Uniform Change",
    refs: [{ kind: "DOC", originator: "NAVPERS", dtg: "01JAN26", amplification: "U.S. Navy uniform regulations" }],
    poc: "Navy Uniform Matters Office, DSN 312-555-0820",
    rmks: [
      ["Purpose", "To announce the shift to winter uniforms."],
      ["Policy", "Commands in the continental United States shift to winter uniforms on 16 NOV 2026, per the reference."],
    ],
  },

  /* ---------- Standard Message ---------- */
  {
    template: "Standard Message", prec: "R", dtg: "161330Z OCT 26",
    fm: "COMSUBLANT SAFETY", to: ["ALL COMSUBLANT UNITS"], info: ["COMSUBFOR"],
    type: "SAFETY:ELECTRICAL", serial: "COMSUBLANT 082/26",
    subj: "Portable Electrical Equipment Safety Inspections",
    poc: "COMSUBLANT Safety Office, DSN 312-555-0303",
    rmks: [
      ["Purpose", "To remind units that portable electrical equipment needs a current safety check before use."],
      ["Background", "Two recent shock incidents involved personally owned extension cords used without inspection."],
      ["Action", ["Inspect all portable electrical equipment by 15 NOV 2026.", "Remove personally owned equipment that has not passed inspection."]],
    ],
  },
  {
    template: "Standard Message", prec: "R", dtg: "271000Z OCT 26",
    fm: "COMSUBLANT N7", to: ["ALL COMSUBLANT UNITS"], info: ["COMSUBRON SIX"],
    type: "TRAINING:WATCH-QUALS", serial: "COMSUBLANT 083/26",
    subj: "Officer of the Deck Qualification Board Schedule",
    refs: [{ kind: "DOC", originator: "COMSUBFOR", dtg: "22OCT26", serial: "COMSUBFOR INST 3500.1", amplification: "Watch team qualification standards" }],
    poc: "COMSUBLANT N7 Training Division, DSN 312-555-0177",
    rmks: [
      ["Purpose", "To publish the officer of the deck qualification board schedule for November."],
      ["Action", "Units nominate candidates by 06 NOV 2026. Boards convene 17 to 19 NOV 2026."],
    ],
  },
  {
    template: "Standard Message", prec: "R", dtg: "301700Z OCT 26",
    fm: "COMSUBLANT N1", to: ["ALL COMSUBLANT UNITS"], info: ["COMSUBFOR"],
    type: "PERSONNEL:LEAVE", serial: "COMSUBLANT 084/26",
    subj: "Thanksgiving Liberty Guidance",
    refs: ["ALNAV 081/26"],
    poc: "COMSUBLANT N1 Personnel Division, DSN 312-555-0111",
    rmks: [
      ["Purpose", "To set liberty for the Thanksgiving holiday."],
      ["Action", "Commanding officers may grant liberty from 26 to 29 NOV 2026, keeping required duty sections. Brief holiday safety per the reference."],
    ],
  },
  {
    template: "Standard Message", prec: "P", dtg: "021200Z NOV 26",
    fm: "COMSUBLANT N6", to: ["ALL COMSUBLANT UNITS"], info: ["COMSUBFOR", "SUBRON COMMANDERS"],
    type: "GENADMIN", serial: "COMSUBLANT 086/26",
    subj: "ANCHOR Message Handling Pilot",
    refs: ["COMSUBLANT 078/26", "NAVADMIN 236/26"],
    ack: "061200Z NOV 26",
    poc: "LT J. Taylor, COMSUBLANT N6 Communications, DSN 312-555-1234",
    rmks: [
      ["Purpose", "To announce a 90-day pilot of the ANCHOR message handling prototype at COMSUBLANT."],
      ["Background", "The pilot tests subscriptions, acknowledgements and readiness reporting traffic in ANCHOR, alongside existing systems."],
      ["Action", ["Units designate a pilot point of contact by 06 NOV 2026.", "Acknowledge this message in ANCHOR."]],
    ],
  },
  {
    template: "Standard Message", sim: true, prec: "P", dtg: "051615Z NOV 26",
    fm: "COMSUBLANT SAFETY", to: ["ALL COMSUBLANT UNITS"], info: ["COMSUBFOR"],
    type: "SAFETY:HEAVY-WEATHER", serial: "COMSUBLANT 088/26",
    subj: "Heavy Weather Lessons Learned, Tropical Storm Delia",
    refs: ["COMSUBLANT EXORD 26-04"],
    poc: "COMSUBLANT Safety Office, DSN 312-555-0303",
    rmks: [
      ["Purpose", "To share lessons learned from the heavy weather sortie for Tropical Storm Delia."],
      ["Discussion", ["Two units reported chafed mooring lines. Inspect lines and chafing gear before every storm.", "Brow and shore power removal took longer than planned. Rehearse it during the next drill."]],
    ],
  },
];

const up = (s: string) => s.toUpperCase();

/** Wraps to the 69-character line length of record message traffic. */
function wrap(text: string, width = 69, indent = ""): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = indent + word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

/** The references an example cites, resolved by serial to what ANCHOR holds. */
export function exampleReferences(spec: ExampleSpec, held: readonly HeldMessage[]): MessageReference[] {
  return (spec.refs ?? []).map((r, i) => {
    const letter = String.fromCharCode(65 + i);
    if (typeof r !== "string") {
      return { letter, kind: r.kind, originator: up(r.originator), dtg: r.dtg, ...(r.serial ? { serial: up(r.serial) } : {}), notations: [], amplification: up(r.amplification) };
    }
    const target = held.find((h) => h.reference.toUpperCase() === r.toUpperCase());
    if (!target) throw new Error(`${spec.serial} cites ${r}, which is not held before it.`);
    let amplification = up(target.subject);
    if (spec.directive) amplification += `. THIS MSG ${spec.directive} REF ${letter}`;
    return {
      letter,
      // REF field 3 is the cited message's type; a subtag belongs to ANCHOR's MSGID key, not the identifier.
      kind: up(target.type.split(":")[0]),
      originator: up(target.originator),
      dtg: normDtg(target.dtg),
      serial: up(target.reference),
      notations: [],
      amplification,
    };
  });
}

/** The message as it comes off the wire, in the layout the template renders. */
export function exampleRawText(spec: ExampleSpec, refs: MessageReference[], channelSerial: number): string {
  const out = [
    `${spec.prec} ${spec.dtg}`,
    `FM ${up(spec.fm)}`,
    `TO ${up(spec.to.join(", "))}`,
    ...(spec.info?.length ? [`INFO ${up(spec.info.join(", "))}`] : []),
    "BT",
    "UNCLAS",
    `MSGID/${up(spec.type)}/${up(spec.fm)}/${up(spec.serial)}//`,
    ...wrap(`SUBJ/${up(spec.subj)}//`),
    ...formatReferences(refs).flatMap((line) => wrap(line)),
    ...(spec.ack ? [`ACK/${spec.ack}//`] : []),
    ...wrap(`POC/${up(spec.poc)}//`),
  ];
  spec.rmks.forEach(([heading, body], i) => {
    const lead = `${i === 0 ? "RMKS/" : ""}${i + 1}. ${up(heading)}.`;
    if (typeof body === "string") out.push(...wrap(`${lead} ${up(body)}`, 69, "  "));
    else {
      out.push(lead);
      body.forEach((b, j) => out.push(...wrap(`${String.fromCharCode(65 + j)}. ${up(b)}`, 67, "   ").map((l) => `  ${l}`)));
    }
  });
  out[out.length - 1] += "//";
  out.push("BT", `#${String(channelSerial).padStart(4, "0")}`, "NNNN");
  return out.join("\n");
}

/**
 * Builds every example in DTG order, so each can cite the messages before it
 * as well as the `held` demo traffic. Throws if the parser reads any example
 * differently from its spec.
 */
export function buildExamples(held: readonly HeldMessage[]): BuiltExample[] {
  const order = [...EXAMPLE_SPECS].sort((a, b) => (parseDtg(a.dtg) < parseDtg(b.dtg) ? -1 : 1));
  const known: HeldMessage[] = [...held];
  return order.map((spec, i) => {
    const raw = exampleRawText(spec, exampleReferences(spec, known), 2001 + i);
    let parsed: ParsedMessage;
    try {
      parsed = parseNavalMessage(raw);
    } catch (error) {
      throw new Error(`${spec.serial}: ${error instanceof NavalParseError || error instanceof Error ? error.message : String(error)}`);
    }
    const key = parsed.subtag ? `${parsed.type}:${parsed.subtag}` : parsed.type;
    if (key !== up(spec.type)) throw new Error(`${spec.serial}: MSGID type reads ${key}, expected ${up(spec.type)}.`);
    if (parsed.referenceIssues.length) throw new Error(`${spec.serial}: ${parsed.referenceIssues.join(" ")}`);
    if (parsed.sections.length !== spec.rmks.length) throw new Error(`${spec.serial}: RMKS reads ${parsed.sections.length} paragraphs, expected ${spec.rmks.length}.`);
    known.push({ reference: parsed.reference, originator: parsed.originator, dtg: parsed.dtg, type: key, subject: spec.subj });
    return { spec, raw, parsed };
  });
}

function parseDtg(dtg: string) {
  const months = "JANFEBMARAPRMAYJUNJULAUGSEPOCTNOVDEC";
  const m = /^(\d{2})(\d{4})Z ([A-Z]{3}) (\d{2})$/.exec(dtg)!;
  return `${m[4]}${String(months.indexOf(m[3]) / 3).padStart(2, "0")}${m[1]}${m[2]}`;
}
