// Domain model for the prototype. Field names follow ANCHOR.txt where it names
// a concept (precedence, lifecycle status, acknowledgement, source artifact).

export type Classification = "UNCLASSIFIED" | "CUI" | "CONFIDENTIAL" | "SECRET";

/** Naval message precedence, highest first. Drives mandatory alerts. */
export type Precedence = "FLASH" | "IMMEDIATE" | "PRIORITY" | "ROUTINE";

/** Lifecycle status annotations required by the requirements document. */
export type Lifecycle =
  | "ACTIVE"
  | "AMENDED"
  | "CORRECTED"
  | "CANCELLED"
  | "SUPERSEDED"
  | "EXPIRED";

export type ReadState = "new" | "unread" | "read";

export type Importance = "High" | "Medium" | "Low";

export type MessageType =
  | "NAVADMIN"
  | "ALNAV"
  | "OPNAVINST"
  | "MARADMIN"
  | "NAVSEAINST"
  | "COMSUBLANT MSG"
  | "COMSUBFOR INST"
  | "FLEET MSG"
  | "SAFETY MSG";

export type Community =
  | "Submarine Warfare"
  | "Surface Warfare"
  | "Aviation"
  | "Cybersecurity"
  | "Readiness"
  | "Personnel"
  | "Training & Education"
  | "Maintenance"
  | "Safety"
  | "Policy"
  | "Expeditionary Forces";

export interface Attachment {
  name: string;
  size: string;
  kind: "pdf" | "docx" | "xlsx";
}

export interface MessageSection {
  heading: string;
  body: string[];
}

export interface Message {
  id: string;
  /** Date-time group, e.g. 151830Z OCT 26 */
  dtg: string;
  /** ISO timestamp for sorting and relative display */
  received: string;
  subject: string;
  reference: string;
  type: MessageType;
  originator: string;
  source: string;
  to: string;
  info: string;
  precedence: Precedence;
  classification: Classification;
  importance: Importance;
  lifecycle: Lifecycle;
  /** Reference of the message this one supersedes/amends/corrects/cancels */
  relatesTo?: string;
  /** Reference that superseded or cancelled this one */
  replacedBy?: string;
  communities: Community[];
  attachments: Attachment[];
  sections: MessageSection[];
  /**
   * The message text exactly as it arrived from C2OIX, before ANCHOR parsed it
   * into sections. Shown verbatim (monospace, whitespace preserved) so readers
   * can check the formatted view against the original.
   */
  rawText: string;
  /** Designated traffic that recipients must acknowledge */
  ackRequired: boolean;
  ackDue?: string;
  actionItem?: { text: string; suspense: string; assignedTo: string };
  /** Integrity data recorded at C2OIX ingestion */
  c2oixId: string;
  sha256: string;
  sizeKb: number;
  retention: string;
  distribution: string[];
  /** Structured addressees (TO/INFO). Groups expand to member commands for acknowledgement tracking. */
  addressees: Addressee[];
  related: string[];
  /** AI-generated summary, always shown apart from the official text */
  aiSummary?: string;
}

/** An address group in the command-level pub/sub system, e.g. ALSUBS. */
export interface AddressGroup {
  id: string;
  name: string;
  members: string[];
}

export interface Addressee {
  name: string;
  role: "TO" | "INFO";
  kind: "command" | "group";
}

/** One acknowledgement received by the originator from an addressee command. */
export interface AckReceipt {
  command: string;
  at: string;
}

export interface MessageUserState {
  read: ReadState;
  acknowledgedAt?: string;
}

export type SubscriptionStatus = "Active" | "Paused" | "Pending Approval" | "Denied";

export type Frequency = "Real-time" | "Daily Digest" | "Weekly";

export interface Subscription {
  id: string;
  name: string;
  category: Community;
  description: string;
  criteria: {
    messageTypes: MessageType[];
    originators?: string[];
    keywords?: string[];
    precedence?: Precedence[];
  };
  frequency: Frequency;
  status: SubscriptionStatus;
  /** Mandatory subscriptions are assigned by role/command and can't be paused */
  mandatory: boolean;
  channels: { inApp: boolean; email: boolean; teams: boolean };
  subscribedOn: string;
  lastUpdated: string;
  requestedBy: string;
  approver?: string;
  justification?: string;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  resource: string;
  classification: Classification;
  result: "Success" | "Failed" | "Warning";
  sourceIp: string;
  device: string;
  location: string;
  details: string;
  hash?: string;
}

export interface SyncItem {
  id: string;
  type: "Message Record" | "Briefing" | "Action Item" | "Subscription" | "Watch Notes" | "Acknowledgement" | "Report" | "Annotation";
  description: string;
  created: string;
  status: "Pending" | "Synced";
}

export interface ActionItem {
  id: string;
  importance: Importance;
  text: string;
  source: string;
  assignedTo: string;
  suspense: string;
  status: "Open" | "In Progress" | "Not Started" | "Done";
}

/* ---------- routing and release ---------- */

/** A person on the command roster. Routing steps and release authority are held by people, not logins. */
export interface Person {
  id: string;
  rank: string;
  name: string;
  position: string;
  code: string;
  status: "present" | "leave" | "detached";
}

export type StepAction = "review" | "release";

export interface WorkflowStep {
  title: string;
  personId: string;
  action: StepAction;
}

/** An admin-defined chain a draft follows, matched by message type and originator. */
export interface RoutingWorkflow {
  id: string;
  name: string;
  description: string;
  active: boolean;
  matchTypes: MessageType[];
  matchOriginators: string[];
  steps: WorkflowStep[];
}

export interface ReleaseAuthority {
  id: string;
  personId: string;
  /** The position the roster record held when designated. */
  designation: string;
  isCommandingOfficer: boolean;
  /** Message types this designation covers; empty means all. */
  scope: MessageType[];
}

export interface CommandSettings {
  textCase: "upper" | "mixed";
  sequencePrefix: string;
  sequenceDigits: number;
  nextSequence: number;
}

export type DraftStatus = "drafting" | "in_routing" | "returned" | "released" | "withdrawn";
export type StepStatus = "pending" | "current" | "endorsed" | "returned" | "released";

export interface RouteStep extends WorkflowStep {
  order: number;
  status: StepStatus;
  actedAt?: string;
  comment?: string;
}

export interface Draft {
  id: string;
  subject: string;
  type: MessageType;
  originator: string;
  precedence: Precedence;
  classification: Classification;
  to: string[];
  info: string[];
  paragraphs: string[];
  drafterId: string;
  status: DraftStatus;
  workflowId?: string;
  route: RouteStep[];
  created: string;
  updated: string;
  /** Assigned only at release, in release order. */
  dtg?: string;
  msn?: string;
  localSequence?: string;
  releasedAt?: string;
  releasedBy?: string;
  releaseDesignation?: string;
  /** The transmitted text, frozen at release. */
  renderedText?: string;
}

export type RoutingEventType = "created" | "submitted" | "advanced" | "returned" | "revised" | "released" | "withdrawn";

/** Append-only route log entry. */
export interface RoutingEvent {
  id: string;
  draftId: string;
  type: RoutingEventType;
  at: string;
  actorId: string;
  stepTitle?: string;
  comment: string;
}
