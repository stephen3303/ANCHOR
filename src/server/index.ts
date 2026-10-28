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
 * The signed-in user. Production ANCHOR takes identity from the CAC/PKI client
 * certificate; the prototype reads the demo account picked on the sign-in menu.
 */
export async function currentUser(): Promise<User> {
  const c = await cookies();
  return userByLogin(c.get(SESSION_COOKIE)?.value) ?? userByLogin(DEFAULT_LOGIN)!;
}

export async function actorFor(u: User): Promise<Actor & { name: string }> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "127.0.0.1";
  return { login: u.login, name: u.name, ip, device: "ANCHOR-WEB", location: u.unit };
}

export const json = (body: unknown, status = 200) => Response.json(body, { status });
export const fail = (error: string, status = 400) => Response.json({ error }, { status });
