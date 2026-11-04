// Fictional demo accounts for the passwordless hackathon sign-in. Each one
// matches a person on the routing roster (src/lib/routing.ts), so the people
// who review and release in the routing chains can also sign in.
import { CURRENT_USER } from "./data";

/** Every role an account can hold, in display order. */
export const ROLE_CATALOG = CURRENT_USER.roles.map(({ name, detail }) => ({ name, detail }));
export type RoleName = (typeof ROLE_CATALOG)[number]["name"];
export const SYSTEM_ADMIN_ROLE = "System Admin";

/** Expand a list of granted role names into the full profile role list. */
export const rolesFor = (granted: readonly string[]) =>
  ROLE_CATALOG.map((role) => ({ ...role, granted: granted.includes(role.name) }));

const BASE = ["Message Viewer", "Subscription Requester"];

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
    roles: rolesFor([...BASE, ...roles]),
    groups: ["COMSUBLANT", ...groups],
  },
});

const { login, name, ...taylorProfile } = CURRENT_USER;

export const DEMO_USERS: DemoUser[] = [
  { login, name, commandName: COMMAND_NAME, profile: taylorProfile },
  staff("RWalsh", "RADM", "Walsh", "Commander", "COMSUBLANT", "Submarine Warfare", "walsh.r@example.mil", "312-555-1000",
    ["Briefing Creator", "Report Viewer", "Designated Release Authority"], ["Command Staff"]),
  staff("DOkafor", "CAPT", "Okafor", "Deputy Commander", "COMSUBLANT", "Submarine Warfare", "okafor.d@example.mil", "312-555-1001",
    ["Briefing Creator", "Report Viewer", "Subscription Approver"], ["Command Staff"]),
  staff("AChen", "CAPT", "Chen", "Chief of Staff", "COMSUBLANT", "Submarine Warfare", "chen.a@example.mil", "312-555-1002",
    ["Briefing Creator", "Report Viewer", "Subscription Approver", "Designated Release Authority"], ["Command Staff"]),
  staff("MRamos", "CDR", "Ramos", "Operations Officer (N3)", "COMSUBLANT N3", "Submarine Warfare", "ramos.m@example.mil", "312-555-1030",
    ["Briefing Creator", "Report Viewer", "Subscription Approver"], ["COMSUBLANT N3", "Watch Floor"]),
  staff("KBrooks", "LCDR", "Brooks", "Logistics Officer (N4)", "COMSUBLANT N4", "Supply Corps", "brooks.k@example.mil", "312-555-1040",
    ["Report Viewer", "Subscription Approver", "Designated Release Authority"], ["COMSUBLANT N4"]),
  staff("RPatel", "LT", "Patel", "Supply Officer (N41)", "COMSUBLANT N4", "Supply Corps", "patel.r@example.mil", "312-555-1041",
    ["Report Viewer"], ["COMSUBLANT N4"]),
  staff("SNguyen", "YNC", "Nguyen", "Admin Chief (N1)", "COMSUBLANT N1", "Administration", "nguyen.s@example.mil", "312-555-1010",
    ["Report Viewer", "System Admin"], ["COMSUBLANT N1"]),
  staff("EMorales", "LCDR", "Morales", "Intelligence Officer (N2)", "COMSUBLANT N2", "Information Warfare", "morales.e@example.mil", "312-555-1020",
    ["Briefing Creator", "Report Viewer"], ["COMSUBLANT N2", "Watch Floor"]),
  staff("DHarper", "ITC", "Harper", "Information Systems Security Manager (N6)", "COMSUBLANT N6", "Information Systems", "harper.d@example.mil", "312-555-1261",
    ["Report Viewer", "System Admin"], ["COMSUBLANT N6", "Comms Division"]),
];
