import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { database } from "@/lib/server/db";
import { ApiError, apiFailure, assertSameOrigin, readTemplatePayload } from "@/lib/server/template-api";
import { currentSessionUser, requireDemoLoginEnabled, SESSION_COOKIE, SESSION_SECONDS, sessionCookieOptions, tokenHash } from "@/lib/server/session";

const noStore = { "Cache-Control": "no-store" };
export async function GET() {
  await connection();
  try { return Response.json({ user: await currentSessionUser() }, { headers: noStore }); }
  catch (error) { return apiFailure(error); }
}

// Explicitly passwordless hackathon impersonation, NOT real authentication.
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    requireDemoLoginEnabled();
    const payload = await readTemplatePayload(request);
    const userId = payload && typeof payload === "object" && "userId" in payload ? payload.userId : null;
    if (typeof userId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) throw new ApiError(400, "Select a valid user account.");
    const cookieStore = await cookies();
    const oldToken = cookieStore.get(SESSION_COOKIE)?.value;
    const token = randomBytes(32).toString("hex");
    const client = await database().connect();
    try {
      await client.query("BEGIN");
      const { rowCount } = await client.query("SELECT id FROM users WHERE id = $1 AND active FOR SHARE", [userId]);
      if (!rowCount) throw new ApiError(404, "Active user account not found.");
      await client.query("DELETE FROM user_sessions WHERE expires_at <= now()");
      if (oldToken) await client.query("DELETE FROM user_sessions WHERE token_hash = $1", [tokenHash(oldToken)]);
      await client.query("INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '8 hours')", [userId, tokenHash(token)]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
    cookieStore.set(SESSION_COOKIE, token, { ...sessionCookieOptions(), maxAge: SESSION_SECONDS });
    return Response.json({ user: await currentSessionUser() }, { headers: noStore });
  } catch (error) { return apiFailure(error); }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (token) await database().query("DELETE FROM user_sessions WHERE token_hash = $1", [tokenHash(token)]);
    cookieStore.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
    return Response.json({ user: null }, { headers: noStore });
  } catch (error) { return apiFailure(error); }
}
