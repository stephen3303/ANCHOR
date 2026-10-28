import { actorFor, crossSite, currentUser, fail, getDb, json, SESSION_COOKIE, SESSION_COOKIE_OPTS } from "@/server/index";
import { appendAudit } from "@/server/repo";
import { userByLogin } from "@/lib/users";
import { cookies } from "next/headers";

/** Demo sign-in: switch to another demo account. Stands in for CAC/PKI login. */
export async function POST(req: Request) {
  if (crossSite(req)) return fail("Cross-site request refused.", 403);
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return fail("Expected a JSON body.", 415);
  const { login } = (await req.json().catch(() => ({}))) as { login?: string };
  const u = userByLogin(login);
  if (!u) return fail("No such demo account.", 404);
  const before = await currentUser();
  const db = getDb();
  if (before && before.login !== u.login) appendAudit(db, await actorFor(before), "Logout", "User Authentication (demo)", "Signed out.");
  (await cookies()).set(SESSION_COOKIE, u.login, SESSION_COOKIE_OPTS);
  appendAudit(db, await actorFor(u), "Login", "User Authentication (demo)", "Demo sign-in. Production uses CAC/PKI certificate validation.");
  return json({ ok: true });
}
