import { actorFor, currentUser, fail, getDb, json } from "@/server/index";
import { ingestRaw, IngestError } from "@/server/repo";
import { hasRole } from "@/lib/users";

/**
 * Ingest raw C2OIX text. Production ANCHOR receives this from the C2OIX
 * gateway; the prototype lets a System Admin paste or upload it.
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!hasRole(user, "System Admin")) return fail("Ingesting traffic needs the System Admin role.", 403);
  const raw = await req.text();
  if (!raw.trim()) return fail("Paste the raw message text.");
  if (raw.length > 256_000) return fail("Message is larger than this prototype accepts (256 KB).");
  try {
    const r = ingestRaw(getDb(), raw, { actor: await actorFor(user) });
    return json({ id: r.message.id, reference: r.message.reference, sha256: r.message.sha256, duplicate: r.duplicate, changed: r.changed });
  } catch (e) {
    if (e instanceof IngestError) return fail(e.message, 422);
    throw e;
  }
}
