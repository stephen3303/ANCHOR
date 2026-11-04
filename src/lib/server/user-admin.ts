import "server-only";
import { ROLE_CATALOG, SYSTEM_ADMIN_ROLE } from "@/lib/demo-users";
import type { AppUser } from "@/lib/users";
import { ApiError } from "./api-error";
import { requireDemoLoginEnabled, requireSessionUser } from "./session";
import { assertSameOrigin } from "./template-api";

export interface ManagedUser {
  id: string;
  login: string;
  name: string;
  active: boolean;
  commandName: string;
  rank: string;
  billet: string;
  unit: string;
  roles: string[];
}

export const USER_COLUMNS = `u.id, u.login, u.name, u.active, c.name AS "commandName",
  coalesce(u.profile->>'rank', '') AS rank, coalesce(u.profile->>'billet', '') AS billet,
  coalesce(u.profile->>'unit', '') AS unit,
  coalesce((SELECT jsonb_agg(r->>'name') FROM jsonb_array_elements(
    CASE jsonb_typeof(u.profile->'roles') WHEN 'array' THEN u.profile->'roles' ELSE '[]'::jsonb END
  ) r WHERE (r->>'granted')::boolean), '[]'::jsonb) AS roles`;

export const isAdmin = (user: AppUser) => user.roles.some((r) => r.name === SYSTEM_ADMIN_ROLE && r.granted);

/**
 * The signed-in demo account, when it holds System Admin. Like the rest of the
 * demo sign-in, this is role-based UI gating, not real authorization.
 */
export async function requireUserAdmin(request?: Request): Promise<AppUser> {
  requireDemoLoginEnabled();
  if (request) assertSameOrigin(request);
  const user = await requireSessionUser();
  if (!isAdmin(user)) throw new ApiError(403, "Managing users requires the System Admin role.");
  return user;
}

const object = (payload: unknown): Record<string, unknown> => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new ApiError(400, "Send a JSON object.");
  return payload as Record<string, unknown>;
};

function text(value: unknown, label: string, max = 80): string {
  if (typeof value !== "string" || !value.trim()) throw new ApiError(400, `${label} is required.`);
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length > max) throw new ApiError(400, `${label} must be ${max} characters or fewer.`);
  return trimmed;
}

function roles(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((r) => typeof r !== "string")) throw new ApiError(400, "Roles must be a list of role names.");
  const known = new Set(ROLE_CATALOG.map((r) => r.name));
  const unknown = value.find((r) => !known.has(r));
  if (unknown) throw new ApiError(400, `Unknown role: ${unknown}.`);
  return [...new Set(value as string[])];
}

export function parseNewUser(payload: unknown) {
  const body = object(payload);
  const login = text(body.login, "Login", 32);
  if (!/^[A-Za-z][A-Za-z0-9._-]{1,31}$/.test(login)) throw new ApiError(400, "Login must start with a letter and use only letters, digits, dots, dashes or underscores.");
  const rank = text(body.rank, "Rank", 12).toUpperCase();
  const surname = text(body.surname, "Last name", 40);
  const email = body.email === undefined || body.email === "" ? "" : text(body.email, "Email", 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, "Enter a valid email address.");
  return {
    login, rank, name: `${rank} ${surname}`, email,
    billet: text(body.billet, "Billet"), unit: text(body.unit, "Unit"),
    roles: roles(body.roles ?? []),
  };
}

export function parseUserUpdate(payload: unknown) {
  const body = object(payload);
  const update: { billet?: string; unit?: string; roles?: string[]; active?: boolean } = {};
  if ("billet" in body) update.billet = text(body.billet, "Billet");
  if ("unit" in body) update.unit = text(body.unit, "Unit");
  if ("roles" in body) update.roles = roles(body.roles);
  if ("active" in body) {
    if (typeof body.active !== "boolean") throw new ApiError(400, "Active must be true or false.");
    update.active = body.active;
  }
  if (!Object.keys(update).length) throw new ApiError(400, "Nothing to update.");
  return update;
}
