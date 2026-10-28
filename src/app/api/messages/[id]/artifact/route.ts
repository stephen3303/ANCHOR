import { actorFor, fail, getDb, json, requireUser } from "@/server/index";
import { appendAudit, getArtifact, getMessage, verifyMessages } from "@/server/repo";

/** The stored source artifact for one message, with a fresh hash check. */
export async function GET(req: Request, ctx: RouteContext<"/api/messages/[id]/artifact">) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  const db = getDb();
  const a = getArtifact(db, id);
  if (!a) return fail("No such message.", 404);
  const [check] = verifyMessages(db, id);
  appendAudit(db, await actorFor(user), "Integrity Check", `Message (${getMessage(db, id)?.reference})`, check.ok ? "Hash matches ingestion value." : "HASH MISMATCH.", {
    result: check.ok ? "Success" : "Failed",
  });
  return json({ ...a, check });
}
