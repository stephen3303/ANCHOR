import "server-only";
import type { PoolClient } from "pg";
import type { Message, RouteStep } from "@/lib/types";
import type { AppUser } from "@/lib/users";
import type { Transmission } from "@/lib/transmissions";
import { hasRole, MESSAGE_ADMIN, RELEASE_AUTHORITY } from "@/lib/roles";
import { ApiError } from "./api-error";
import { database } from "./db";
import { appendRoutingEvent } from "./routing-data";
import { sha256, storeMessage } from "./messages";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Put a just-released message in the command's transmission queue, inside the release transaction. */
export async function queueRelease(client: PoolClient, message: Message, user: AppUser, at: Date) {
  await client.query(`INSERT INTO transmissions (command_id, kind, outgoing_message_id, reference, subject, precedence, body, status, queued_at, queued_by)
    VALUES ($1, 'release', $2, $3, $4, $5, $6, 'queued', $7, $8)`,
    [user.commandId, message.id, message.reference, message.subject, message.precedence, message.rawText || message.renderedText || "", at, user.id]);
}

/** Text of the acknowledgement this command sends back to a message's originator. */
export function acknowledgementText(m: Message, commandName: string) {
  return [
    `FM ${commandName}`,
    `TO ${m.originator}`,
    m.classification,
    "SUBJ/ACKNOWLEDGEMENT//",
    `REF/A/MSG/${m.originator}/${m.dtg}//`,
    `RMKS/1. REF A (${m.reference}) RECEIVED AND ACKNOWLEDGED.//`,
  ].join("\n");
}

/** Record the acknowledgement the Message Admin just sent, inside the acknowledgement transaction. */
export async function recordAcknowledgement(client: PoolClient, m: Message, user: AppUser, at: Date) {
  await client.query(`INSERT INTO transmissions (command_id, kind, acknowledged_message_id, reference, subject, precedence, body, status, queued_at, queued_by, closed_at, closed_by)
    VALUES ($1, 'acknowledgement', $2, $3, $4, $5, $6, 'transmitted', $7, $8, $7, $8)`,
    [user.commandId, m.id, `ACK ${m.reference}`, `Acknowledgement of ${m.reference}`, m.precedence, acknowledgementText(m, user.commandName), at, user.id]);
}

/** The command's queue and recent transmissions. Everyone in the command can see them. */
export async function listTransmissions(user: AppUser): Promise<Transmission[]> {
  const { rows } = await database().query(`
    SELECT t.id, t.kind, coalesce(t.outgoing_message_id, t.acknowledged_message_id) AS "messageId", t.reference, t.subject,
      t.precedence, t.body, t.status, t.queued_at AS "queuedAt", q.name AS "queuedByName", t.queued_by AS "queuedBy",
      t.closed_at AS "closedAt", c.name AS "closedByName", t.note, o.released_by AS "releasedBy"
    FROM transmissions t JOIN users q ON q.id = t.queued_by LEFT JOIN users c ON c.id = t.closed_by
    LEFT JOIN outgoing_messages o ON o.id = t.outgoing_message_id
    WHERE t.command_id = $1
    ORDER BY (t.status = 'queued') DESC, coalesce(t.closed_at, t.queued_at) DESC LIMIT 200`, [user.commandId]);
  return rows.map((row) => ({ ...row, queuedAt: row.queuedAt.toISOString(), closedAt: row.closedAt?.toISOString(), releasedBy: row.releasedBy ?? undefined, closedByName: row.closedByName ?? undefined }));
}

async function lockQueued(client: PoolClient, user: AppUser, id: string) {
  if (!UUID.test(id)) throw new ApiError(400, "Invalid transmission ID.");
  const { rows: [tx] } = await client.query("SELECT * FROM transmissions WHERE id = $1 AND command_id = $2 FOR UPDATE", [id, user.commandId]);
  if (!tx) throw new ApiError(404, "Transmission not found.");
  if (tx.kind !== "release") throw new ApiError(409, "Acknowledgements are sent when they are made.");
  if (tx.status !== "queued") throw new ApiError(409, `${tx.reference} was already ${tx.status === "transmitted" ? "transmitted" : "taken out of the queue"}.`);
  const { rows: [row] } = await client.query("SELECT * FROM outgoing_messages WHERE id = $1 FOR UPDATE", [tx.outgoing_message_id]);
  return { tx, row, message: row.record as Message };
}

/** The Message Admin transmits a queued release: it becomes part of the official message store. */
export async function transmit(user: AppUser, id: string) {
  if (!hasRole(user, MESSAGE_ADMIN)) throw new ApiError(403, "Only the Message Admin transmits released traffic.");
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    const { tx, row, message: released } = await lockQueued(client, user, id);
    const at = new Date();
    const raw = released.rawText || released.renderedText || "";
    const message: Message = { ...released, c2oixId: `ANCHOR-${released.id}`, sha256: sha256(raw), sizeKb: Math.max(1, Math.ceil(Buffer.byteLength(raw) / 1024)),
      transmittedAt: at.toISOString(), transmittedBy: user.id };
    await storeMessage(client, raw, message, user.id);
    const revision = row.routing_revision + 1;
    await client.query("UPDATE outgoing_messages SET record = $2::jsonb, routing_revision = $3, updated_at = $4 WHERE id = $1", [row.id, JSON.stringify(message), revision, at]);
    await appendRoutingEvent(client, message, user, revision, "transmitted", `Transmitted by ${user.name}, Message Admin.`, undefined, at);
    await client.query("UPDATE transmissions SET status = 'transmitted', closed_at = $2, closed_by = $3 WHERE id = $1", [tx.id, at, user.id]);
    await client.query("COMMIT");
    return message;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

/**
 * Withdraw a release that has not been transmitted. Only the person who
 * released it, or the Release Authority, can. The draft returns to its drafter.
 */
export async function revokeRelease(user: AppUser, id: string, comment: string) {
  if (!comment) throw new ApiError(400, "Say why the release is being withdrawn.");
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    const { tx, row, message: released } = await lockQueued(client, user, id);
    if (row.released_by !== user.id && !hasRole(user, RELEASE_AUTHORITY)) throw new ApiError(403, "Only the person who released this message, or the Release Authority, can withdraw the release.");
    const at = new Date();
    const message: Message = { ...released, kind: "draft", reference: `DRAFT ${row.id.slice(0, 8).toUpperCase()}`, dtg: "", source: "Unreleased draft" };
    for (const key of ["localSequence", "msn", "releasedAt", "releasedBy", "releaseDesignation", "c2oixId", "sha256"] as const) delete message[key];
    const route = (row.routing_route as RouteStep[]).map((step) => step.action === "release" ? { ...step, status: "returned" as const, actedAt: at.toISOString(), comment } : step);
    const releaseStep = route.find((step) => step.action === "release");
    const revision = row.routing_revision + 1;
    await client.query(`UPDATE outgoing_messages SET record = $2::jsonb, workflow_status = 'returned', routing_route = $3::jsonb, routing_revision = $4, updated_at = $5,
      released_at = NULL, released_by = NULL, release_sequence = NULL WHERE id = $1`, [row.id, JSON.stringify(message), JSON.stringify(route), revision, at]);
    await appendRoutingEvent(client, message, user, revision, "release_revoked", `Release of ${tx.reference} withdrawn before transmission: ${comment}`, releaseStep?.title, at);
    await client.query("UPDATE transmissions SET status = 'cancelled', closed_at = $2, closed_by = $3, note = $4 WHERE id = $1", [tx.id, at, user.id, comment]);
    await client.query("COMMIT");
    return message;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
