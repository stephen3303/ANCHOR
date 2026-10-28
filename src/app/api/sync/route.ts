import { actorFor, fail, getDb, json, requireUser } from "@/server/index";
import { applyAction, type Action } from "@/server/actions";
import { tx } from "@/server/db";
import { appendAudit, IngestError, priorSync, recordSync, type SyncResult } from "@/server/repo";

/**
 * EMCON replay: actions queued while disconnected, applied in the order they
 * were taken. Each one succeeds or fails on its own, so one stale action
 * (say, a request someone else already approved) doesn't block the rest.
 *
 * Each item carries its queue id (qid) and the account that queued it. An item
 * already applied is answered from the record and not applied again, so a
 * retry after a lost response is safe; an item queued by another account is
 * refused rather than recorded under whoever happens to be signed in now.
 */
export async function POST(req: Request) {
  const user = await requireUser(req, { json: true });
  if (user instanceof Response) return user;
  const body = (await req.json().catch(() => null)) as { actions?: unknown } | null;
  if (!body || !Array.isArray(body.actions)) return fail("Expected { actions: [...] }.");
  if (body.actions.length > 500) return fail("Too many queued actions in one sync.");
  const actor = await actorFor(user);
  const db = getDb();

  const results: SyncResult[] = body.actions.map((item: unknown, n: number) => {
    const { qid, login, action } = (item ?? {}) as { qid?: unknown; login?: unknown; action?: Action };
    if (typeof qid !== "string" || !qid || qid.length > 100) return { qid: `#${n}`, ok: false, error: "Queue item has no id." };
    if (login !== user.login) return { qid, ok: false, keep: true, error: `Queued by ${typeof login === "string" ? login : "another account"}; sign in as them to sync it.` };
    const prior = priorSync(db, user.login, qid);
    if (prior) return prior;
    try {
      return tx(db, () => {
        applyAction(db, user, actor, action as Action, true);
        const r = { qid, ok: true };
        recordSync(db, user.login, r);
        return r;
      });
    } catch (e) {
      if (e instanceof IngestError) {
        const r = { qid, ok: false, error: e.message };
        recordSync(db, user.login, r);
        return r;
      }
      // Anything else (a busy database, a bad item) isn't recorded, so the item can be tried again.
      console.error("sync item failed", e);
      return { qid, ok: false, keep: true, error: "Couldn't apply this item now; it stays queued." };
    }
  });

  const fresh = results.filter((r) => !r.replay && !r.keep);
  const failed = fresh.filter((r) => !r.ok).length;
  const kept = results.filter((r) => r.keep).length;
  const replays = results.filter((r) => r.replay).length;
  appendAudit(
    db,
    actor,
    "Sync",
    `Offline queue (${results.length} items)`,
    `Replicated ${fresh.length - failed}; ${failed} rejected.${replays ? ` ${replays} already applied by an earlier sync, skipped.` : ""}${kept ? ` ${kept} left queued.` : ""}`,
    { result: failed ? "Warning" : "Success" },
  );
  return json({ results });
}
