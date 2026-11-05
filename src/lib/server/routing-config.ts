import "server-only";
import type { PoolClient } from "pg";
import type { AppUser } from "@/lib/users";
import type { CommandSettings, RoutingWorkflow, ReleaseAuthority } from "@/lib/types";
import type { RoutingConfiguration, RoutingPerson } from "@/lib/routing-api";
import { canReleaseAny, DESIGNATED_RELEASE_AUTHORITY, hasRole, RELEASE_AUTHORITY } from "@/lib/roles";
import { DRAFT_TYPES } from "@/lib/routing";
import { database } from "./db";
import { ApiError } from "./api-error";
import { isAdmin } from "./user-admin";

export const DEFAULT_SETTINGS: CommandSettings = { textCase: "mixed", sequencePrefix: "#", sequenceDigits: 4, nextSequence: 1 };
export async function commandPeople(commandId: string, client: Pick<PoolClient, "query"> = database()) {
  const { rows } = await client.query(`SELECT id, name, active, login, profile FROM users WHERE command_id = $1 ORDER BY name`, [commandId]);
  return rows.map((row) => ({ id: row.id as string, rank: row.profile.rank ?? "", name: row.name as string,
    position: row.profile.billet ?? "", code: row.login as string, status: row.active ? "present" : "detached",
    releaseAuthority: row.active && hasRole({ roles: profileRoles(row.profile) }, RELEASE_AUTHORITY),
    canRelease: row.active && canReleaseAny({ roles: profileRoles(row.profile) }),
  })) as RoutingPerson[];
}
const profileRoles = (profile: { roles?: unknown }) => (Array.isArray(profile.roles) ? profile.roles : []) as { name: string; granted: boolean }[];

/** The designation a person releases this message type under, or null when they may not release it. */
export function releaseDesignation(person: Pick<RoutingPerson, "id" | "releaseAuthority" | "canRelease"> | undefined, authorities: ReleaseAuthority[], type: string): string | null {
  if (!person?.canRelease) return null;
  if (person.releaseAuthority) return COMMANDING_OFFICER;
  return authorities.find((entry) => entry.personId === person.id && (!entry.scope.length || entry.scope.includes(type as ReleaseAuthority["scope"][number])))?.designation ?? null;
}
export const COMMANDING_OFFICER = "Commanding Officer";
export async function readRoutingConfig(user: AppUser): Promise<RoutingConfiguration> {
  const { rows: [row] } = await database().query("SELECT * FROM command_routing WHERE command_id = $1", [user.commandId]);
  return { revision: row?.revision ?? 0, workflows: row?.workflows ?? [], authorities: row?.authorities ?? [], settings: row?.settings ?? DEFAULT_SETTINGS, people: await commandPeople(user.commandId) };
}
function bad(message: string): never { throw new ApiError(400, message); }
function short(value: unknown, name: string, max = 200): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || value.includes("\0")) return bad(`Invalid ${name}.`);
  return value.trim();
}
function strings(value: unknown, label: string, max = 100): string[] {
  if (!Array.isArray(value) || value.length > max || value.some((item) => typeof item !== "string" || item.length > 200 || item.includes("\0"))) return bad(`Invalid ${label}.`);
  return [...new Set(value as string[])];
}
export function validateConfiguration(payload: unknown, people: RoutingPerson[], previous: CommandSettings) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return bad("Send a configuration object.");
  const body = payload as RoutingConfiguration;
  if (!Array.isArray(body.workflows) || body.workflows.length > 100) return bad("At most 100 workflows are supported.");
  const active = (id: string) => people.some((person) => person.id === id && person.status === "present");
  const workflows: RoutingWorkflow[] = body.workflows.map((item) => {
    if (!item || typeof item !== "object" || typeof item.active !== "boolean" || !Array.isArray(item.steps) || !item.steps.length || item.steps.length > 20) return bad("Workflows need 1–20 steps.");
    const matchTypes = strings(item.matchTypes, "message types") as RoutingWorkflow["matchTypes"];
    if (matchTypes.some((type) => !DRAFT_TYPES.includes(type))) return bad("Unsupported workflow message type.");
    const steps = item.steps.map((step, index) => {
      if (!step || !active(step.personId)) return bad("Every routing holder must be an active account in this command.");
      if (step.action !== (index === item.steps.length - 1 ? "release" : "review")) return bad("The chain must end in exactly one release step; earlier steps must be reviews.");
      return { title: short(step.title, "step title"), personId: step.personId, action: step.action };
    });
    return { id: short(item.id, "workflow ID", 100), name: short(item.name, "workflow name"), description: typeof item.description === "string" ? item.description.slice(0, 2000) : "", active: item.active, matchTypes, matchOriginators: strings(item.matchOriginators, "originators"), steps };
  });
  if (new Set(workflows.map((item) => item.id)).size !== workflows.length) return bad("Configuration IDs must be unique.");
  const settings = body.settings;
  if (!settings || !Number.isSafeInteger(settings.nextSequence) || settings.nextSequence < previous.nextSequence || !Number.isInteger(settings.sequenceDigits) || settings.sequenceDigits < 1 || settings.sequenceDigits > 8 || typeof settings.sequencePrefix !== "string" || settings.sequencePrefix.length > 4 || /[\r\n\0]/.test(settings.sequencePrefix)) return bad("Invalid sequence settings. The next sequence cannot move backwards.");
  return { workflows, settings: { ...settings, textCase: "mixed" as const } };
}
export async function saveRoutingConfig(body: unknown, user: AppUser) {
  // Release designations are the Release Authority's; System Admin saves keep them as they are.
  if (!isAdmin(user)) throw new ApiError(403, "Routing configuration requires System Admin.");
  const revision = (body as RoutingConfiguration)?.revision;
  if (!Number.isSafeInteger(revision) || revision < 0) return bad("An expected configuration revision is required.");
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    await client.query("INSERT INTO command_routing (command_id) VALUES ($1) ON CONFLICT DO NOTHING", [user.commandId]);
    const { rows: [current] } = await client.query("SELECT * FROM command_routing WHERE command_id = $1 FOR UPDATE", [user.commandId]);
    // Revision zero is only accepted when creating the first empty configuration.
    if (current.revision !== revision && !(revision === 0 && current.revision === 1 && !current.workflows.length && !current.authorities.length)) throw new ApiError(409, "Routing configuration changed. Refresh before saving.");
    const next = validateConfiguration(body, await commandPeople(user.commandId, client), current.settings);
    await client.query("UPDATE command_routing SET workflows = $2::jsonb, settings = $3::jsonb, revision = revision + 1, updated_at = now() WHERE command_id = $1", [user.commandId, JSON.stringify(next.workflows), JSON.stringify(next.settings)]);
    await client.query("COMMIT");
    return readRoutingConfig(user);
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
/**
 * The Release Authority's designations. Holding a designation is what grants
 * Designated Release Authority: the role is set on every command account to
 * match the saved list.
 */
export async function saveDesignations(payload: unknown, user: AppUser) {
  if (!hasRole(user, RELEASE_AUTHORITY)) throw new ApiError(403, "Only the Release Authority designates release authorities.");
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return bad("Send a designation object.");
  const body = payload as { revision?: unknown; authorities?: unknown };
  if (!Number.isSafeInteger(body.revision) || Number(body.revision) < 0) return bad("An expected configuration revision is required.");
  if (!Array.isArray(body.authorities) || body.authorities.length > 100) return bad("At most 100 designations are supported.");
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('roles|' || $1))", [user.commandId]);
    await client.query("INSERT INTO command_routing (command_id) VALUES ($1) ON CONFLICT DO NOTHING", [user.commandId]);
    const { rows: [current] } = await client.query("SELECT revision FROM command_routing WHERE command_id = $1 FOR UPDATE", [user.commandId]);
    if (current.revision !== body.revision && !(body.revision === 0 && current.revision === 1)) throw new ApiError(409, "Routing configuration changed. Refresh before saving.");
    const people = await commandPeople(user.commandId, client);
    const authorities: ReleaseAuthority[] = (body.authorities as ReleaseAuthority[]).map((item) => {
      const person = item && people.find((entry) => entry.id === item.personId);
      if (!person || person.status !== "present") return bad("Designees must be active accounts in this command.");
      if (person.releaseAuthority) return bad("The Release Authority releases all traffic and needs no designation.");
      const scope = strings(item.scope, "release scope") as ReleaseAuthority["scope"];
      if (scope.some((type) => !DRAFT_TYPES.includes(type))) return bad("Unsupported release scope.");
      return { id: short(item.id, "designation ID", 100), personId: item.personId, designation: short(item.designation, "designation"), isCommandingOfficer: false, scope };
    });
    if (new Set(authorities.map((item) => item.id)).size !== authorities.length) return bad("Designation IDs must be unique.");
    if (new Set(authorities.map((item) => item.personId)).size !== authorities.length) return bad("Give each designee one designation; widen its scope instead of adding another.");
    await client.query("UPDATE command_routing SET authorities = $2::jsonb, revision = revision + 1, updated_at = now() WHERE command_id = $1", [user.commandId, JSON.stringify(authorities)]);
    const designated = authorities.map((item) => item.personId);
    await client.query(`UPDATE users SET profile = jsonb_set(profile, '{roles}', (
        SELECT coalesce(jsonb_agg(CASE WHEN r->>'name' = $3 THEN jsonb_set(r, '{granted}', to_jsonb(id::text = ANY($2::text[]))) ELSE r END), '[]'::jsonb)
        FROM jsonb_array_elements(CASE jsonb_typeof(profile->'roles') WHEN 'array' THEN profile->'roles' ELSE '[]'::jsonb END) r))
      WHERE command_id = $1`, [user.commandId, designated, DESIGNATED_RELEASE_AUTHORITY]);
    await client.query("COMMIT");
    return readRoutingConfig(user);
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
export async function lockedRoutingConfig(client: PoolClient, commandId: string) {
  const { rows: [config] } = await client.query("SELECT * FROM command_routing WHERE command_id = $1 FOR UPDATE", [commandId]);
  if (!config) throw new ApiError(409, "This command has no routing configuration. An administrator must configure it first.");
  return config as { workflows: RoutingWorkflow[]; authorities: ReleaseAuthority[]; settings: CommandSettings; revision: number };
}
