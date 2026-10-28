import { actorFor, currentUser, fail, getDb, json } from "@/server/index";
import { applyAction, type Action } from "@/server/actions";
import { appendAudit, IngestError } from "@/server/repo";

/**
 * EMCON replay: actions queued while disconnected, applied in the order they
 * were taken. Each one succeeds or fails on its own, so one stale action
 * (say, a request someone else already approved) doesn't block the rest.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { actions?: { qid: string; action: Action }[] } | null;
  if (!body || !Array.isArray(body.actions)) return fail("Expected { actions: [...] }.");
  if (body.actions.length > 500) return fail("Too many queued actions in one sync.");
  const user = await currentUser();
  const actor = await actorFor(user);
  const db = getDb();
  const results = body.actions.map(({ qid, action }) => {
    try {
      applyAction(db, user, actor, action, true);
      return { qid, ok: true };
    } catch (e) {
      if (e instanceof IngestError) return { qid, ok: false, error: e.message };
      throw e;
    }
  });
  const failed = results.filter((r) => !r.ok).length;
  appendAudit(db, actor, "Sync", `Offline queue (${results.length} items)`, `Replicated ${results.length - failed}; ${failed} rejected.`, {
    result: failed ? "Warning" : "Success",
  });
  return json({ results });
}
