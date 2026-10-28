import { actorFor, fail, getDb, json, requireUser } from "@/server/index";
import { applyAction, type Action } from "@/server/actions";
import { IngestError } from "@/server/repo";

export async function POST(req: Request) {
  const user = await requireUser(req, { json: true });
  if (user instanceof Response) return user;
  const a = (await req.json().catch(() => null)) as Action | null;
  if (!a || typeof a !== "object") return fail("Expected a JSON action.");
  try {
    return json({ ok: true, result: applyAction(getDb(), user, await actorFor(user), a) ?? null });
  } catch (e) {
    if (e instanceof IngestError) return fail(e.message, 422);
    throw e;
  }
}
