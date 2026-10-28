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
  related: string[];
  /** AI-generated summary, always shown apart from the official text */
  aiSummary?: string;
}

export interface MessageUserState {
  read: ReadState;
  starred: boolean;
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
  /** Hash of the event before this one in the audit chain */
  prevHash?: string;
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
