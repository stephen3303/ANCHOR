// Fictional demo accounts for the passwordless hackathon sign-in. Each one
// matches a person on the routing roster (src/lib/routing.ts), so the people
// who review and release in the routing chains can also sign in.
import { CURRENT_USER } from "./data";
import {
  AUDITOR, DESIGNATED_RELEASE_AUTHORITY as DRA, MESSAGE_ADMIN, RELEASE_AUTHORITY, REPORT_VIEWER,
  rolesFor, SUBSCRIPTION_APPROVER, SYSTEM_ADMIN,
} from "./roles";

export { ROLE_CATALOG, rolesFor, type RoleName } from "./roles";
export const SYSTEM_ADMIN_ROLE = SYSTEM_ADMIN;

export interface DemoUser {
  login: string;
  name: string;
  commandName: string;
  profile: {
    rank: string;
    community: string;
    billet: string;
    unit: string;
    command: string;
    commandSource: string;
    location: string;
    email: string;
    dsn: string;
    roles: { name: string; detail: string; granted: boolean }[];
    groups: string[];
  };
}

const COMMAND_NAME = "COMSUBLANT NORFOLK VA";
const staff = (
  login: string, rank: string, surname: string, billet: string, unit: string, community: string,
  email: string, dsn: string, roles: string[], groups: string[],
): DemoUser => ({
  login,
  name: `${rank} ${surname}`,
  commandName: COMMAND_NAME,
  profile: {
    rank, community, billet, unit,
    command: "Commander, Submarine Force Atlantic",
    commandSource: "COMSUBLANT",
    location: "Ashore",
    email, dsn,
    roles: rolesFor(roles),
    groups: ["COMSUBLANT", ...groups],
  },
});

const { login, name, ...taylorProfile } = CURRENT_USER;

export const DEMO_USERS: DemoUser[] = [
  { login, name, commandName: COMMAND_NAME, profile: taylorProfile },
  staff("RWalsh", "RADM", "Walsh", "Commander", "COMSUBLANT", "Submarine Warfare", "walsh.r@example.mil", "312-555-1000",
    [REPORT_VIEWER, RELEASE_AUTHORITY], ["Command Staff"]),
  staff("DOkafor", "CAPT", "Okafor", "Deputy Commander", "COMSUBLANT", "Submarine Warfare", "okafor.d@example.mil", "312-555-1001",
    [REPORT_VIEWER, SUBSCRIPTION_APPROVER], ["Command Staff"]),
  staff("AChen", "CAPT", "Chen", "Chief of Staff", "COMSUBLANT", "Submarine Warfare", "chen.a@example.mil", "312-555-1002",
    [REPORT_VIEWER, SUBSCRIPTION_APPROVER, DRA], ["Command Staff"]),
  staff("MRamos", "CDR", "Ramos", "Operations Officer (N3)", "COMSUBLANT N3", "Submarine Warfare", "ramos.m@example.mil", "312-555-1030",
    [REPORT_VIEWER, SUBSCRIPTION_APPROVER], ["COMSUBLANT N3", "Watch Floor"]),
  staff("KBrooks", "LCDR", "Brooks", "Logistics Officer (N4)", "COMSUBLANT N4", "Supply Corps", "brooks.k@example.mil", "312-555-1040",
    [REPORT_VIEWER, SUBSCRIPTION_APPROVER, DRA], ["COMSUBLANT N4"]),
  staff("RPatel", "LT", "Patel", "Supply Officer (N41)", "COMSUBLANT N4", "Supply Corps", "patel.r@example.mil", "312-555-1041",
    [REPORT_VIEWER], ["COMSUBLANT N4"]),
  staff("SNguyen", "YNC", "Nguyen", "Admin Chief (N1)", "COMSUBLANT N1", "Administration", "nguyen.s@example.mil", "312-555-1010",
    [REPORT_VIEWER, AUDITOR, SYSTEM_ADMIN], ["COMSUBLANT N1"]),
  staff("EMorales", "LCDR", "Morales", "Intelligence Officer (N2)", "COMSUBLANT N2", "Information Warfare", "morales.e@example.mil", "312-555-1020",
    [REPORT_VIEWER], ["COMSUBLANT N2", "Watch Floor"]),
  staff("DHarper", "ITC", "Harper", "Information Systems Security Manager (N6)", "COMSUBLANT N6", "Information Systems", "harper.d@example.mil", "312-555-1261",
    [MESSAGE_ADMIN, REPORT_VIEWER, AUDITOR, SYSTEM_ADMIN], ["COMSUBLANT N6", "Comms Division"]),
];
