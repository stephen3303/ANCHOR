import { actorFor, getDb, json, requireUser } from "@/server/index";
import { appendAudit, chainCheckFor, verifyAudit, verifyMessages } from "@/server/repo";
import { canReadFullAudit } from "@/lib/users";

/** Recompute every artifact hash and walk the audit chain. */
export async function POST(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const db = getDb();
  const messages = verifyMessages(db);
  const bad = messages.filter((m) => !m.ok);
  const chain = verifyAudit(db);
  // The caller can read this entry, so it describes the whole chain only for someone who may read it all.
  const full = canReadFullAudit(user);
  appendAudit(
    db,
    await actorFor(user),
    "Integrity Check",
    full ? `Message store (${messages.length} records) and audit chain (${chain.checked} events)` : `Message store (${messages.length} records) and audit chain`,
    `${bad.length ? `${bad.length} hash mismatch(es): ${bad.map((b) => b.reference).join(", ")}.` : "All record hashes match ingestion values."} ${!full ? (chain.ok ? "Audit chain intact." : "Audit chain broken.") : chain.ok ? `Audit chain intact; head ${chain.head}.` : `Audit chain broken at ${chain.brokenAt}.`}`,
    { result: bad.length || !chain.ok ? "Failed" : "Success" },
  );
  return json({ messages, chain: chainCheckFor(db, user, chain) });
}
