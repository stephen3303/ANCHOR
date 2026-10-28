import { actorFor, currentUser, fail, getDb, json, SESSION_COOKIE } from "@/server/index";
import { appendAudit } from "@/server/repo";
import { userByLogin } from "@/lib/users";
import { cookies } from "next/headers";

/** Demo sign-in: switch to another demo account. Stands in for CAC/PKI login. */
export async function POST(req: Request) {
  const { login } = (await req.json().catch(() => ({}))) as { login?: string };
  const u = userByLogin(login);
  if (!u) return fail("No such demo account.", 404);
  const before = await currentUser();
  const db = getDb();
  if (before.login !== u.login) appendAudit(db, await actorFor(before), "Logout", "User Authentication (demo)", "Signed out.");
  (await cookies()).set(SESSION_COOKIE, u.login, { httpOnly: true, sameSite: "strict", path: "/" });
  appendAudit(db, await actorFor(u), "Login", "User Authentication (demo)", "Demo sign-in. Production uses CAC/PKI certificate validation.");
  return json({ ok: true });
}
