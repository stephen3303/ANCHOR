// The command's role model. One ANCHOR instance serves one command, and a user
// can hold any combination of these roles. Message Viewer is the baseline every
// account holds. System Admin assigns every role except Designated Release
// Authority, which the command's single Release Authority grants by designation.

export const MESSAGE_VIEWER = "Message Viewer";
export const SUBSCRIPTION_APPROVER = "Subscription Approver";
export const REPORT_VIEWER = "Report Viewer";
export const AUDITOR = "Auditor";
export const MESSAGE_ADMIN = "Message Admin";
export const DESIGNATED_RELEASE_AUTHORITY = "Designated Release Authority";
export const RELEASE_AUTHORITY = "Release Authority";
export const SYSTEM_ADMIN = "System Admin";

export const ROLE_CATALOG = [
  { name: MESSAGE_VIEWER, detail: "View messages, subscribe to available types and build briefings" },
  { name: SUBSCRIPTION_APPROVER, detail: "Assign feeds to users and review subscription requests" },
  { name: REPORT_VIEWER, detail: "View the Reports page" },
  { name: AUDITOR, detail: "View audit logs and integrity checks" },
  { name: MESSAGE_ADMIN, detail: "Transmit released traffic, manage comm links, send acknowledgements" },
  { name: DESIGNATED_RELEASE_AUTHORITY, detail: "Release outgoing traffic for designated message types" },
  { name: RELEASE_AUTHORITY, detail: "Commanding officer: release any traffic and designate release authorities" },
  { name: SYSTEM_ADMIN, detail: "Manage users, roles and command settings" },
] as const;

export type RoleName = (typeof ROLE_CATALOG)[number]["name"];
export interface RoleGrant { name: string; detail: string; granted: boolean }

/** Granted by the Release Authority through a designation, never by System Admin. */
export const DESIGNATED_ROLES: readonly string[] = [DESIGNATED_RELEASE_AUTHORITY];
/** Held by exactly one account in a command. */
export const SINGLE_HOLDER_ROLES: readonly string[] = [RELEASE_AUTHORITY];

export const hasRole = (user: { roles: readonly { name: string; granted: boolean }[] } | null | undefined, role: RoleName) =>
  !!user?.roles.some((r) => r.name === role && r.granted);

/** May release at least some outgoing traffic. */
export const canReleaseAny = (user: Parameters<typeof hasRole>[0]) =>
  hasRole(user, RELEASE_AUTHORITY) || hasRole(user, DESIGNATED_RELEASE_AUTHORITY);

/** Expand granted role names into the full profile role list; Message Viewer is always granted. */
export const rolesFor = (granted: readonly string[]): RoleGrant[] =>
  ROLE_CATALOG.map((role) => ({ ...role, granted: role.name === MESSAGE_VIEWER || granted.includes(role.name) }));
