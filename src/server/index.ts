// Server entry points used by the route handlers: the shared database and the
// signed-in user. Not imported by tests (they open their own database).
import type { DatabaseSync } from "node:sqlite";
import { cookies, headers } from "next/headers";
import { dbPath, openDb } from "./db.ts";
import { seedIfEmpty } from "./seed.ts";
import type { Actor } from "./repo.ts";
import { DEFAULT_LOGIN, userByLogin, type User } from "../lib/users.ts";

const g = globalThis as unknown as { __anchorDb?: DatabaseSync };

/** One connection per server process; created and seeded on first use. */
export function getDb(): DatabaseSync {
  if (!g.__anchorDb) {
    const db = openDb(dbPath());
    seedIfEmpty(db);
    g.__anchorDb = db;
  }
  return g.__anchorDb;
}

export const SESSION_COOKIE = "anchor_user";

/**
 * The signed-in user, or null with no session. Production ANCHOR takes identity
 * from the CAC/PKI client certificate; the prototype reads the demo account
 * picked on the sign-in menu.
 */
export async function currentUser(): Promise<User | null> {
  const c = await cookies();
  return userByLogin(c.get(SESSION_COOKIE)?.value) ?? null;
}

/** First visit: start the demo signed in as the default account. */
export async function startDemoSession(): Promise<User> {
  const u = userByLogin(DEFAULT_LOGIN)!;
  (await cookies()).set(SESSION_COOKIE, u.login, SESSION_COOKIE_OPTS);
  return u;
}

export const SESSION_COOKIE_OPTS = { httpOnly: true, sameSite: "strict", path: "/" } as const;

/** A request sent from another site (a page trying to act with the user's session). */
export function crossSite(req: Request): boolean {
  if (req.headers.get("sec-fetch-site") === "cross-site") return true;
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

/** The signed-in user for an API call, or the error response to send instead. */
export async function requireUser(req: Request, opts: { json?: boolean } = {}): Promise<User | Response> {
  if (crossSite(req)) return fail("Cross-site request refused.", 403);
  if (opts.json && !req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return fail("Expected a JSON body.", 415);
  return (await currentUser()) ?? fail("Not signed in. Reload ANCHOR to start a session.", 401);
}

/**
 * Who did it, for the audit log. The client address comes from X-Forwarded-For
 * only when ANCHOR_TRUST_PROXY=1 says a reverse proxy sets it; otherwise any
 * client could write whatever address it liked into the log.
 */
export async function actorFor(u: User): Promise<Actor & { name: string }> {
  const h = await headers();
  const ip = (process.env.ANCHOR_TRUST_PROXY === "1" && h.get("x-forwarded-for")?.split(",")[0].trim()) || "direct (no proxy)";
  return { login: u.login, name: u.name, ip, device: "ANCHOR-WEB", location: u.unit };
}

export const json = (body: unknown, status = 200) => Response.json(body, { status });
export const fail = (error: string, status = 400) => Response.json({ error }, { status });
