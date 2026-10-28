// Demo accounts. In production ANCHOR identifies people by CAC/PKI certificate;
// the prototype lets you pick one of these to show what each role sees.
// Everyone here is fictional.

export interface Role {
  name: string;
  detail: string;
  granted: boolean;
}

export interface User {
  name: string;
  login: string;
  rank: string;
  community: string;
  billet: string;
  unit: string;
  command: string;
  location: string;
  email: string;
  dsn: string;
  roles: Role[];
  groups: string[];
}

const roles = (approver: boolean, admin: boolean): Role[] => [
  { name: "Message Viewer", detail: "View messages and attachments", granted: true },
  { name: "Briefing Creator", detail: "Create and customize briefings", granted: true },
  { name: "Subscription Requester", detail: "Request subscriptions for approval", granted: true },
  { name: "Report Viewer", detail: "Acknowledgement and traffic reports", granted: true },
  { name: "Subscription Approver", detail: "Approve unit subscription requests", granted: approver },
  { name: "Designated Release Authority", detail: "Release outgoing command traffic", granted: false },
  { name: "System Admin", detail: "Ingest traffic, manage unit users and settings", granted: admin },
];

const UNIT = "COMSUBLANT Pilot Unit (SSN)";
const COMMAND = "Commander, Submarine Force Atlantic";

export const USERS: User[] = [
  {
    name: "LT Taylor",
    login: "LTaylor",
    rank: "LT",
    community: "Submarine Warfare",
    billet: "Communications Officer",
    unit: UNIT,
    command: COMMAND,
    location: "Afloat",
    email: "taylor.j@example.mil",
    dsn: "312-555-1234",
    roles: roles(true, true),
    groups: ["COMSUBLANT", "SUBRON Staff", "Pilot Unit Wardroom", "Comms Division"],
  },
  {
    name: "ITC Ramirez",
    login: "ITCRamirez",
    rank: "ITC",
    community: "Cybersecurity",
    billet: "Leading Chief, Comms",
    unit: UNIT,
    command: COMMAND,
    location: "Afloat",
    email: "ramirez.a@example.mil",
    dsn: "312-555-1240",
    roles: roles(false, false),
    groups: ["COMSUBLANT", "Pilot Unit Chiefs Mess", "Comms Division"],
  },
  {
    name: "CDR Hale",
    login: "CDRHale",
    rank: "CDR",
    community: "Submarine Warfare",
    billet: "Commanding Officer",
    unit: UNIT,
    command: COMMAND,
    location: "Afloat",
    email: "hale.r@example.mil",
    dsn: "312-555-1200",
    roles: roles(true, false),
    groups: ["COMSUBLANT", "SUBRON Staff", "Pilot Unit Wardroom"],
  },
];

export const DEFAULT_LOGIN = "LTaylor";

export const userByLogin = (login: string | undefined) => USERS.find((u) => u.login === login);

export const hasRole = (u: User, role: string) => u.roles.some((r) => r.name === role && r.granted);
