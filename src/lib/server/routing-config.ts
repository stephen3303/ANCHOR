import "server-only";
import type { PoolClient } from "pg";
import type { AppUser } from "@/lib/users";
import type { CommandSettings, Person, RoutingWorkflow, ReleaseAuthority } from "@/lib/types";
import type { RoutingConfiguration } from "@/lib/routing-api";
import { DRAFT_TYPES } from "@/lib/routing";
import { database } from "./db";
import { ApiError } from "./api-error";
import { isAdmin } from "./user-admin";

export const DEFAULT_SETTINGS: CommandSettings = { textCase: "mixed", sequencePrefix: "#", sequenceDigits: 4, nextSequence: 1 };
export async function commandPeople(commandId: string, client: Pick<PoolClient, "query"> = database()) {
  const { rows } = await client.query(`SELECT id, name, active, login, profile FROM users WHERE command_id = $1 ORDER BY name`, [commandId]);
  return rows.map((row) => ({ id: row.id as string, rank: row.profile.rank ?? "", name: row.name as string,
    position: row.profile.billet ?? "", code: row.login as string, status: row.active ? "present" : "detached",
    canRelease: row.active && Array.isArray(row.profile.roles) && row.profile.roles.some((role: { name: string; granted: boolean }) => role.name === "Designated Release Authority" && role.granted),
  })) as (Person & { canRelease: boolean })[];
}
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
export function validateConfiguration(payload: unknown, people: (Person & { canRelease: boolean })[], previous: CommandSettings) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return bad("Send a configuration object.");
  const body = payload as RoutingConfiguration;
  if (!Array.isArray(body.workflows) || body.workflows.length > 100 || !Array.isArray(body.authorities) || body.authorities.length > 100) return bad("At most 100 workflows and designations are supported.");
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
  const authorities: ReleaseAuthority[] = body.authorities.map((item) => {
    if (!item || !active(item.personId) || !people.find((person) => person.id === item.personId)?.canRelease) return bad("Release designees must be active command users with the Designated Release Authority role.");
    const scope = strings(item.scope, "release scope") as ReleaseAuthority["scope"];
    if (scope.some((type) => !DRAFT_TYPES.includes(type))) return bad("Unsupported release scope.");
    return { id: short(item.id, "authority ID", 100), personId: item.personId, designation: short(item.designation, "designation"), isCommandingOfficer: item.isCommandingOfficer === true, scope };
  });
  if (new Set(workflows.map((item) => item.id)).size !== workflows.length || new Set(authorities.map((item) => item.id)).size !== authorities.length) return bad("Configuration IDs must be unique.");
  const settings = body.settings;
  if (!settings || !Number.isSafeInteger(settings.nextSequence) || settings.nextSequence < previous.nextSequence || !Number.isInteger(settings.sequenceDigits) || settings.sequenceDigits < 1 || settings.sequenceDigits > 8 || typeof settings.sequencePrefix !== "string" || settings.sequencePrefix.length > 4 || /[\r\n\0]/.test(settings.sequencePrefix)) return bad("Invalid sequence settings. The next sequence cannot move backwards.");
  return { workflows, authorities, settings: { ...settings, textCase: "mixed" as const } };
}
export async function saveRoutingConfig(body: unknown, user: AppUser) {
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
    await client.query("UPDATE command_routing SET workflows = $2::jsonb, authorities = $3::jsonb, settings = $4::jsonb, revision = revision + 1, updated_at = now() WHERE command_id = $1", [user.commandId, JSON.stringify(next.workflows), JSON.stringify(next.authorities), JSON.stringify(next.settings)]);
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
