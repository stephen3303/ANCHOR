// Outgoing example traffic at each stage of the drafting lifecycle: drafting,
// routing (in review, or returned to the drafter), released (queued for the
// Message Admin) and transmitted. `npm run db:seed:outgoing` drives each one
// through the same server code the app uses, so every draft, route step,
// release and transmission is the real record, not a hand-written row.
//
// Every unit, person and event here is fictional and UNCLASSIFIED. Addressees
// are command-directory (PLADS) names, because the template's command pickers
// only accept commands from the directory.
import { templateType } from "./message-templates";

export const LIFECYCLE_STAGES = ["drafting", "routing", "returned", "released", "transmitted"] as const;
export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

/** Typed templates the examples draft from. Each template's name is the message type it drafts. */
export const LIFECYCLE_TEMPLATES = ["CASREP", "EXORD", "OPREP", "PLANORD"] as const;
/** The Standard Message template has a free-text Type, so it carries the topic types. */
export const STANDARD_TEMPLATE = "Standard Message";

export interface LifecycleExample {
  /** Stable key. The seed derives the draft's request ID from it, which makes re-runs no-ops. */
  key: string;
  stage: LifecycleStage;
  /** Login of the drafter. Route holders act in turn as the command's routing chain names them. */
  drafter: string;
  template: (typeof LIFECYCLE_TEMPLATES)[number] | typeof STANDARD_TEMPLATE;
  /** MSGID field 2. For a typed template it is the template's name; Standard Message takes it as input. */
  type: string;
  precedence: "FLASH" | "IMMEDIATE" | "PRIORITY" | "ROUTINE";
  subject: string;
  to: string[];
  info: string[];
  poc: string;
  /** RMKS paragraphs, numbered in order. */
  rmks: string[];
  /** For a routing example: how many review steps endorse before it stops. */
  endorsements?: number;
  /** For a returned example: the reviewer's correction. */
  returnComment?: string;
  /** How long ago the drafter started it, and the minutes between each later step. */
  hoursAgo: number;
  stepMinutes: number;
}

const FLEET = "COMUSFLTFORCOM NORFOLK VA";
const SUBRON6 = "COMSUBRON SIX";
const SUBRON2 = "COMSUBRON TWO";
const SUBGRU2 = "COMSUBGRU TWO";
const NAVSEA = "COMNAVSEASYSCOM WASHINGTON DC";
const SHIPYARD = "NAVSHIPYD NORFOLK VA";
const SUBSCOL = "NAVSUBSCOL GROTON CT";
const NLON = "SUBASE NEW LONDON CT";
const KINGS_BAY = "SUBASE KINGS BAY GA";
const SUBPAC = "COMSUBPAC PEARL HARBOR HI";

export const LIFECYCLE_EXAMPLES: LifecycleExample[] = [
  // ---------- Drafting: saved, not yet submitted ----------
  {
    key: "draft-casrep-satcom", stage: "drafting", drafter: "DHarper", template: "CASREP", type: "CASREP", precedence: "PRIORITY",
    subject: "CASREP INITIAL - HQ SATCOM TERMINAL B DEGRADED",
    to: [NAVSEA], info: [FLEET, SUBGRU2], poc: "ITC HARPER/N6/312-555-1261",
    rmks: [
      "CASUALTY: HEADQUARTERS SATCOM TERMINAL B LOST RECEIVE LOCK ON THE PRIMARY CHANNEL. CAT II.",
      "IMPACT: TERMINAL A CARRIES ALL TRAFFIC. NO SINGLE-POINT BACKUP UNTIL REPAIRED.",
      "PARTS: MODEM CARD ON ORDER. ETR 10 NOV 26.",
    ],
    hoursAgo: 3, stepMinutes: 0,
  },
  {
    key: "draft-planord-silent-ram", stage: "drafting", drafter: "MRamos", template: "PLANORD", type: "PLANORD", precedence: "ROUTINE",
    subject: "PLANORD - EXERCISE SILENT RAM 27-1 PLANNING",
    to: [SUBRON6, SUBRON2], info: [FLEET, SUBGRU2], poc: "CDR RAMOS/N3/312-555-1030",
    rmks: [
      "SITUATION: EXERCISE SILENT RAM 27-1 IS A FICTIONAL ASW TRAINING EVENT PLANNED FOR JAN 27.",
      "MISSION: SQUADRONS PLAN TWO-SHIP PARTICIPATION AND REPORT READINESS BY 01 DEC 26.",
      "PLANNING CONFERENCE: 18 NOV 26 AT COMSUBLANT, BUILDING A-3.",
    ],
    hoursAgo: 5, stepMinutes: 0,
  },
  {
    key: "draft-safety-motorcycle", stage: "drafting", drafter: "SNguyen", template: STANDARD_TEMPLATE, type: "SAFETY:MOTORCYCLE", precedence: "ROUTINE",
    subject: "WINTER MOTORCYCLE SAFETY REMINDER",
    to: [SUBRON6, SUBRON2, NLON], info: [SUBGRU2], poc: "YNC NGUYEN/N1/312-555-1010",
    rmks: [
      "COLD WEATHER REDUCES TIRE GRIP AND RIDER REACTION TIME. COMMANDS BRIEF ALL RIDERS BEFORE THANKSGIVING LIBERTY.",
      "VERIFY EVERY RIDER HOLDS CURRENT MSF TRAINING AND PPE BEFORE APPROVING LEAVE CHITS.",
    ],
    hoursAgo: 2, stepMinutes: 0,
  },

  // ---------- Routing: submitted, waiting on a reviewer or the releaser ----------
  {
    key: "route-oprep-sitrep", stage: "routing", drafter: "MRamos", template: "OPREP", type: "OPREP", precedence: "IMMEDIATE",
    subject: "OPREP-3 NAVY BLUE - PIER 3 SHORE POWER OUTAGE",
    to: [FLEET], info: [SUBGRU2, SUBRON6], poc: "CDR RAMOS/N3/312-555-1030",
    rmks: [
      "EVENT: SHORE POWER TO PIER 3 LOST AT 0612L. TWO MOORED UNITS SHIFTED TO SHIP POWER WITHOUT INCIDENT.",
      "ACTIONS: PUBLIC WORKS ON SCENE. ESTIMATED RESTORATION 1400L.",
      "NO INJURIES. NO DAMAGE TO SHIPS. NO MEDIA INTEREST.",
    ],
    endorsements: 0, hoursAgo: 4, stepMinutes: 20,
  },
  {
    key: "route-exord-quals", stage: "routing", drafter: "MRamos", template: "EXORD", type: "EXORD", precedence: "PRIORITY",
    subject: "EXORD - FALL TACTICAL READINESS EVALUATION SERIES",
    to: [SUBRON6, SUBRON2], info: [FLEET, SUBGRU2], poc: "CDR RAMOS/N3/312-555-1030",
    rmks: [
      "EXECUTE THE FALL TACTICAL READINESS EVALUATION SERIES PLANNED IN THE PRIOR PLANORD.",
      "START: 16 NOV 26. EACH SQUADRON SCHEDULES TWO UNITS PER WEEK.",
      "REPORT RESULTS TO COMSUBLANT N3 WITHIN 72 HOURS OF EACH EVALUATION.",
    ],
    endorsements: 1, hoursAgo: 6, stepMinutes: 45,
  },
  {
    key: "route-logistics-parts", stage: "routing", drafter: "RPatel", template: STANDARD_TEMPLATE, type: "LOGISTICS:PARTS", precedence: "ROUTINE",
    subject: "HIGH-USAGE REPAIR PARTS ALLOWANCE REVIEW",
    to: [SUBRON6, SUBRON2], info: [SHIPYARD], poc: "LT PATEL/N41/312-555-1041",
    rmks: [
      "SUPPLY OFFICERS REVIEW HIGH-USAGE REPAIR PARTS AGAINST ALLOWANCE BY 20 NOV 26.",
      "REPORT SHORTFALLS OVER 30 DAYS TO COMSUBLANT N41 FOR CROSS-LEVELING.",
    ],
    endorsements: 0, hoursAgo: 1, stepMinutes: 15,
  },
  {
    key: "return-safety-electrical", stage: "returned", drafter: "SNguyen", template: STANDARD_TEMPLATE, type: "SAFETY:ELECTRICAL", precedence: "PRIORITY",
    subject: "PORTABLE ELECTRICAL EQUIPMENT INSPECTION REMINDER",
    to: [SUBRON6, SUBRON2, KINGS_BAY], info: [SUBGRU2], poc: "YNC NGUYEN/N1/312-555-1010",
    rmks: [
      "COMMANDS COMPLETE THE QUARTERLY PORTABLE ELECTRICAL EQUIPMENT INSPECTION BEFORE 30 NOV 26.",
      "REMOVE FROM SERVICE ANY CORD WITH DAMAGED INSULATION OR MISSING GROUND PIN.",
    ],
    returnComment: "Add the reference to the current electrical safety instruction and the reporting POC at the squadrons.",
    hoursAgo: 8, stepMinutes: 50,
  },

  // ---------- Released: final, queued for the Message Admin ----------
  {
    key: "release-casrep-crane", stage: "released", drafter: "KBrooks", template: "CASREP", type: "CASREP", precedence: "PRIORITY",
    subject: "CASREP INITIAL - PIER 2 PORTAL CRANE OUT OF SERVICE",
    to: [NAVSEA, SHIPYARD], info: [FLEET, SUBGRU2], poc: "LCDR BROOKS/N4/312-555-1040",
    rmks: [
      "CASUALTY: PIER 2 PORTAL CRANE HOIST BRAKE FAILED LOAD TEST. CRANE TAGGED OUT. CAT III.",
      "IMPACT: WEAPONS LOADOUTS SHIFT TO PIER 4 UNTIL REPAIRED.",
      "ASSISTANCE: REQUEST SHIPYARD CRANE TEAM INSPECTION. ETR 14 NOV 26.",
    ],
    hoursAgo: 20, stepMinutes: 90,
  },
  {
    key: "release-planord-holiday", stage: "released", drafter: "MRamos", template: "PLANORD", type: "PLANORD", precedence: "ROUTINE",
    subject: "PLANORD - HOLIDAY IN-PORT SECURITY POSTURE",
    to: [SUBRON6, SUBRON2, NLON, KINGS_BAY], info: [SUBGRU2], poc: "CDR RAMOS/N3/312-555-1030",
    rmks: [
      "PLAN IN-PORT SECURITY MANNING FOR THE 24 DEC 26 TO 02 JAN 27 HOLIDAY PERIOD.",
      "SQUADRONS SUBMIT DUTY SECTION PLANS AND RESPONSE FORCE ROSTERS BY 10 DEC 26.",
    ],
    hoursAgo: 26, stepMinutes: 120,
  },
  {
    key: "release-safety-hearing", stage: "released", drafter: "SNguyen", template: STANDARD_TEMPLATE, type: "SAFETY:HEARING", precedence: "ROUTINE",
    subject: "ANNUAL HEARING CONSERVATION TESTING DUE",
    to: [SUBRON6, SUBRON2], info: [NLON], poc: "YNC NGUYEN/N1/312-555-1010",
    rmks: [
      "SAILORS IN THE HEARING CONSERVATION PROGRAM COMPLETE ANNUAL AUDIOGRAMS BY 31 DEC 26.",
      "COMMANDS REPORT COMPLETION PERCENTAGE IN THE MONTHLY SAFETY REPORT.",
    ],
    hoursAgo: 30, stepMinutes: 75,
  },

  // ---------- Transmitted: sent by the Message Admin, now in the message store ----------
  {
    key: "transmit-oprep-medevac", stage: "transmitted", drafter: "MRamos", template: "OPREP", type: "OPREP", precedence: "IMMEDIATE",
    subject: "OPREP-3 NAVY BLUE - SAILOR MEDEVAC FROM PIER 1",
    to: [FLEET], info: [SUBGRU2, SUBRON6], poc: "CDR RAMOS/N3/312-555-1030",
    rmks: [
      "EVENT: A FICTIONAL SAILOR WAS INJURED IN A FALL ON PIER 1 AT 0915L AND TRANSPORTED TO THE REGIONAL MEDICAL CENTER.",
      "STATUS: STABLE. NEXT OF KIN NOTIFIED.",
      "INVESTIGATION: COMMAND SAFETY INVESTIGATION OPENED.",
    ],
    hoursAgo: 46, stepMinutes: 25,
  },
  {
    key: "transmit-exord-drill", stage: "transmitted", drafter: "MRamos", template: "EXORD", type: "EXORD", precedence: "PRIORITY",
    subject: "EXORD - WATERFRONT FORCE PROTECTION DRILL",
    to: [SUBRON6, SUBRON2, NLON], info: [FLEET, SUBGRU2], poc: "CDR RAMOS/N3/312-555-1030",
    rmks: [
      "EXECUTE THE WATERFRONT FORCE PROTECTION DRILL ON 12 NOV 26 FROM 0800L TO 1200L.",
      "ALL MOORED UNITS MAN THE TOPSIDE SECURITY WATCH AND RESPONSE FORCE.",
      "REPORT LESSONS LEARNED TO COMSUBLANT N3 BY 19 NOV 26.",
    ],
    hoursAgo: 52, stepMinutes: 60,
  },
  {
    key: "transmit-logistics-fuel", stage: "transmitted", drafter: "RPatel", template: STANDARD_TEMPLATE, type: "LOGISTICS:FUEL-PROVISIONS", precedence: "ROUTINE",
    subject: "DECEMBER FUEL AND PROVISIONS ORDER WINDOWS",
    to: [SUBRON6, SUBRON2], info: [KINGS_BAY, NLON], poc: "LT PATEL/N41/312-555-1041",
    rmks: [
      "DECEMBER FUEL AND PROVISIONS ORDERS ARE DUE BY 25 NOV 26 FOR DELIVERY BEFORE THE HOLIDAY STAND-DOWN.",
      "LATE ORDERS WILL BE FILLED AFTER 05 JAN 27.",
    ],
    hoursAgo: 60, stepMinutes: 40,
  },
  {
    key: "transmit-training-watchquals", stage: "transmitted", drafter: "LTaylor", template: STANDARD_TEMPLATE, type: "TRAINING:WATCH-QUALS", precedence: "ROUTINE",
    subject: "COMMUNICATIONS WATCH QUALIFICATION BOARDS",
    to: [SUBSCOL, SUBRON6], info: [SUBPAC], poc: "LT TAYLOR/N6/312-555-1234",
    rmks: [
      "COMMUNICATIONS WATCH QUALIFICATION BOARDS CONVENE THE FIRST TUESDAY OF EACH MONTH AT COMSUBLANT N6.",
      "CANDIDATES BRING A SIGNED QUAL CARD AND ONE PRACTICE MESSAGE DRAFTED IN ANCHOR.",
    ],
    hoursAgo: 72, stepMinutes: 55,
  },
];

/** The message type a lifecycle example drafts, as its template would write it. */
export const exampleType = (example: LifecycleExample) =>
  example.template === STANDARD_TEMPLATE ? example.type : templateType(example.template);
