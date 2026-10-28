import { actorFor, getDb, json, requireUser } from "@/server/index";
import { appendAudit, verifyAudit, verifyMessages } from "@/server/repo";

/** Recompute every artifact hash and walk the audit chain. */
export async function POST(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const db = getDb();
  const messages = verifyMessages(db);
  const bad = messages.filter((m) => !m.ok);
  const chain = verifyAudit(db);
  appendAudit(
    db,
    await actorFor(user),
    "Integrity Check",
    `Message store (${messages.length} records) and audit chain (${chain.checked} events)`,
    `${bad.length ? `${bad.length} hash mismatch(es): ${bad.map((b) => b.reference).join(", ")}.` : "All record hashes match ingestion values."} ${chain.ok ? `Audit chain intact; head ${chain.head}.` : `Audit chain broken at ${chain.brokenAt}.`}`,
    { result: bad.length || !chain.ok ? "Failed" : "Success" },
  );
  return json({ messages, chain });
}
