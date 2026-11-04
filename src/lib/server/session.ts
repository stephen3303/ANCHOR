import "server-only";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import type { AppUser } from "@/lib/users";
import { database } from "./db";
import { ApiError } from "./api-error";

export const SESSION_COOKIE = "anchor_session";
export const SESSION_SECONDS = 8 * 60 * 60;
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
export const sessionCookieOptions = () => ({ httpOnly: true, sameSite: "strict" as const, path: "/", secure: process.env.SESSION_COOKIE_SECURE === "true" });
export function requireDemoLoginEnabled() {
  if (process.env.ENABLE_DEMO_LOGIN !== "true") throw new ApiError(403, "Hackathon account selection is disabled on this server.");
}

export async function currentSessionUser(): Promise<AppUser | null> {
  return sessionUserFromToken((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function sessionUserFromToken(token: string | undefined): Promise<AppUser | null> {
  if (process.env.ENABLE_DEMO_LOGIN !== "true" || !token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const { rows: [row] } = await database().query(`
    SELECT u.id, u.login, u.name, u.profile, u.command_id AS "commandId", c.name AS "commandName"
    FROM user_sessions s JOIN users u ON u.id = s.user_id JOIN commands c ON c.id = u.command_id
    WHERE s.token_hash = $1 AND s.expires_at > now() AND u.active
  `, [tokenHash(token)]);
  if (!row) return null;
  const profile = row.profile;
  return {
    id: row.id, login: row.login, name: row.name, commandId: row.commandId, commandName: row.commandName,
    rank: profile.rank ?? "", community: profile.community ?? "", billet: profile.billet ?? "", unit: profile.unit ?? "",
    command: profile.command ?? row.commandName, location: profile.location ?? "", email: profile.email ?? "", dsn: profile.dsn ?? "",
    roles: Array.isArray(profile.roles) ? profile.roles : [], groups: Array.isArray(profile.groups) ? profile.groups : [],
  };
}
export async function requireSessionUser(): Promise<AppUser> {
  const user = await currentSessionUser();
  if (!user) throw new ApiError(401, "Sign in with a demo account to continue.");
  return user;
}
