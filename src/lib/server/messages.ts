import "server-only";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { INITIAL_USER_STATE } from "@/lib/data";
import { messageFromParsed } from "@/lib/ingest-record";
import { idFor, NavalParseError, normRef, parseNavalMessage, targetLifecycle } from "@/lib/naval";
import { normDtg, normSender, type MessageReference } from "@/lib/references";
import type { AckReceipt, Lifecycle, Message, MessageUserState, ReadState } from "@/lib/types";
import type { AppUser } from "@/lib/users";
import { ApiError } from "./api-error";
import { database } from "./db";
import { recordAcknowledgement } from "./transmissions";
import { hasRole, MESSAGE_ADMIN } from "@/lib/roles";

export const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const MAX_RAW_BYTES = 64 * 1024;

export interface MessageSnapshot {
  messages: Message[];
  userState: Record<string, MessageUserState>;
  /** Acknowledgements received from other commands for traffic this command sent. */
  ackReceipts: Record<string, AckReceipt[]>;
}

interface MessageRow {
  record: Message;
  lifecycle: Lifecycle;
  replacedBy: string | null;
  c2oixId: string;
  sha256: string;
  sizeBytes: number;
  rawText: string;
  subscriptionTopicId: string | null;
  subscriptionType: string | null;
}

const MESSAGE_SELECT = `
  SELECT m.record, m.lifecycle, m.replaced_by AS "replacedBy", a.c2oix_id AS "c2oixId",
    a.sha256, a.size_bytes AS "sizeBytes", a.raw_text AS "rawText",
    t.id AS "subscriptionTopicId", upper(t.name) AS "subscriptionType"
  FROM messages m JOIN message_artifacts a ON a.c2oix_id = m.c2oix_id
  LEFT JOIN message_topic_messages mt ON mt.message_id=m.id
  LEFT JOIN message_topics t ON t.id=mt.topic_id`;

/** The record as stored, with the columns the server owns written over it. */
function toMessage(row: MessageRow): Message {
  return {
    ...row.record,
    lifecycle: row.lifecycle,
    replacedBy: row.replacedBy ?? undefined,
    c2oixId: row.c2oixId,
    sha256: row.sha256,
    sizeKb: Math.max(1, Math.ceil(row.sizeBytes / 1024)),
    rawText: row.rawText,
    subscriptionTopicId: row.subscriptionTopicId ?? undefined,
    subscriptionType: row.subscriptionType ?? undefined,
  };
}

/** Everything the message screens need for one signed-in user. */
export async function messageSnapshot(user: AppUser, subscriptionsOnly = false): Promise<MessageSnapshot> {
  const db = database();
  const [{ rows: messageRows }, { rows: stateRows }, { rows: localAcks }, { rows: received }] = await Promise.all([
    db.query<MessageRow>(`${MESSAGE_SELECT}
      WHERE (NOT $1::boolean OR EXISTS (SELECT 1 FROM message_topic_subscriptions s JOIN message_topics st ON st.id=s.topic_id
        -- A subscription to a type alone (SAFETY) also catches its subtags (SAFETY:ELECTRICAL).
        -- Types compare in upper case, as MSGID fields are written.
        WHERE s.user_id=$2 AND (upper(st.name)=upper(t.name) OR upper(st.name)=upper(btrim(split_part(t.name, ':', 1))))))
      ORDER BY m.received DESC, m.id`, [subscriptionsOnly, user.id]),
    db.query<{ messageId: string; read: ReadState }>(
      `SELECT message_id AS "messageId", read_state AS read FROM message_user_state WHERE user_id = $1`, [user.id]),
    // Acknowledgement belongs to the command: anyone in it acknowledging counts for everyone in it.
    db.query<{ messageId: string; at: Date }>(
      `SELECT message_id AS "messageId", max(acknowledged_at) AS at FROM message_acknowledgements
       WHERE origin = 'local' AND command_id = $1 GROUP BY message_id`, [user.commandId]),
    db.query<{ messageId: string; command: string; at: Date }>(
      `SELECT message_id AS "messageId", command_name AS command, acknowledged_at AS at FROM message_acknowledgements
       WHERE origin = 'received' ORDER BY acknowledged_at`),
  ]);
  const messages = messageRows.map(toMessage);
  const stored = new Map(stateRows.map((r) => [r.messageId, r]));
  const acked = new Map(localAcks.map((r) => [r.messageId, r.at.toISOString()]));
  const userState = Object.fromEntries(messages.map((m) => {
    const s = stored.get(m.id);
    const state: MessageUserState = { read: s?.read ?? INITIAL_USER_STATE[m.id]?.read ?? "new" };
    const at = acked.get(m.id);
    return [m.id, at ? { ...state, acknowledgedAt: at } : state];
  }));
  const ackReceipts: Record<string, AckReceipt[]> = {};
  for (const r of received) (ackReceipts[r.messageId] ??= []).push({ command: r.command, at: r.at.toISOString() });
  return { messages, userState, ackReceipts };
}

export async function requireMessage(id: string): Promise<Message> {
  if (!/^[a-z0-9-]{1,120}$/.test(id)) throw new ApiError(400, "Invalid message ID.");
  const { rows: [row] } = await database().query<MessageRow>(`${MESSAGE_SELECT} WHERE m.id = $1`, [id]);
  if (!row) throw new ApiError(404, "Message not found.");
  return toMessage(row);
}

/** Per-person read state. */
export async function setUserState(user: AppUser, id: string, change: { read?: unknown }) {
  const m = await requireMessage(id);
  if (!["new", "unread", "read"].includes(change.read as string)) throw new ApiError(400, "Read state must be new, unread or read.");
  const { rows: [row] } = await database().query<{ read: ReadState }>(`
    INSERT INTO message_user_state (user_id, message_id, read_state) VALUES ($1, $2, $3)
    ON CONFLICT (user_id, message_id) DO UPDATE SET read_state = $3
    RETURNING read_state AS read
  `, [user.id, m.id, change.read]);
  return row;
}

/** Mark every message read for this person. */
export async function markAllRead(user: AppUser): Promise<number> {
  const { rowCount } = await database().query(`
    INSERT INTO message_user_state (user_id, message_id, read_state)
    SELECT $1, m.id, 'read'
    FROM messages m
    ON CONFLICT (user_id, message_id) DO UPDATE SET read_state = 'read'
  `, [user.id]);
  return rowCount ?? 0;
}

/**
 * Acknowledge received traffic for the user's whole command. Traffic the
 * command sent is acknowledged by its addressees, not by itself. Only the
 * Message Admin sends acknowledgements; doing so also records the outgoing
 * acknowledgement message.
 */
export async function acknowledge(user: AppUser, id: string, ownSource: string): Promise<{ acknowledgedAt: string; already: boolean }> {
  if (!hasRole(user, MESSAGE_ADMIN)) throw new ApiError(403, "Only the Message Admin sends acknowledgements.");
  const m = await requireMessage(id);
  if (!m.ackRequired) throw new ApiError(409, `${m.reference} does not require acknowledgement.`);
  if (m.source === ownSource) throw new ApiError(409, `${m.reference} was sent by this command; its addressees acknowledge it.`);
  if (m.lifecycle === "SUPERSEDED" || m.lifecycle === "CANCELLED") throw new ApiError(409, `${m.reference} is ${m.lifecycle.toLowerCase()}; acknowledge the current message instead.`);
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    // Serialise acknowledgements of one message by one command, so two people pressing at once record it once.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1 || '|' || $2))", [m.id, user.commandId]);
    const { rows: [prior] } = await client.query<{ at: Date }>(
      `SELECT max(acknowledged_at) AS at FROM message_acknowledgements WHERE origin = 'local' AND message_id = $1 AND command_id = $2`,
      [m.id, user.commandId]);
    if (prior?.at) {
      await client.query("COMMIT");
      return { acknowledgedAt: prior.at.toISOString(), already: true };
    }
    const { rows: [row] } = await client.query<{ at: Date }>(`
      INSERT INTO message_acknowledgements (message_id, origin, command_name, command_id, acknowledged_by, acknowledged_at)
      VALUES ($1, 'local', $2, $3, $4, now()) RETURNING acknowledged_at AS at
    `, [m.id, user.commandName, user.commandId, user.id]);
    await recordAcknowledgement(client, m, user, row.at);
    await client.query("COMMIT");
    return { acknowledgedAt: row.at.toISOString(), already: false };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** The stored raw text, with its hash recomputed now. */
export async function artifact(id: string) {
  const m = await requireMessage(id);
  const recomputed = sha256(m.rawText);
  return { id: m.id, reference: m.reference, c2oixId: m.c2oixId, rawText: m.rawText, storedSha256: m.sha256, recomputedSha256: recomputed, intact: recomputed === m.sha256 };
}

/** Recompute every artifact's hash and compare it with the one recorded at ingestion. */
export async function integrityCheck() {
  const { rows } = await database().query<{ c2oixId: string; reference: string | null; rawText: string; sha256: string }>(`
    SELECT a.c2oix_id AS "c2oixId", m.reference, a.raw_text AS "rawText", a.sha256
    FROM message_artifacts a LEFT JOIN messages m ON m.c2oix_id = a.c2oix_id ORDER BY a.c2oix_id`);
  const failures = rows.filter((r) => sha256(r.rawText) !== r.sha256).map((r) => ({ c2oixId: r.c2oixId, reference: r.reference }));
  return { checked: rows.length, intact: rows.length - failures.length, failures, checkedAt: new Date().toISOString() };
}

export interface IngestResult {
  message: Message;
  /** What the directive did to the message it names, when it names one. */
  applied?: { target: string; lifecycle: Lifecycle } | { target: string; missing: true };
}

/** Insert one artifact and its message inside the caller's transaction. */
export async function storeMessage(client: PoolClient, raw: string, record: Message, ingestedBy: string | null) {
  await client.query(
    `INSERT INTO message_artifacts (c2oix_id, raw_text, sha256, size_bytes, ingested_by) VALUES ($1, $2, $3, $4, $5)`,
    [record.c2oixId, raw, record.sha256, Buffer.byteLength(raw, "utf8"), ingestedBy]);
  // The record keeps display fields only; the server owns the rest.
  const display: Partial<Message> = { ...record };
  for (const key of ["rawText", "sha256", "c2oixId", "lifecycle", "replacedBy"] as const) delete display[key];
  await client.query(
    `INSERT INTO messages (id, reference, c2oix_id, received, lifecycle, replaced_by, record) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [record.id, record.reference, record.c2oixId, record.received, record.lifecycle, record.replacedBy ?? null, display]);
}

/** Parse, hash and store raw C2OIX text, then apply any lifecycle directive it carries. */
/** The stored message a REF set names, locked for update: sender plus DTG first, then serial. */
async function findReferencedMessage(client: PoolClient, ref: MessageReference) {
  const { rows: [row] } = await client.query<{ id: string; reference: string }>(`
    SELECT id, reference FROM messages
    WHERE ($1 <> '' AND upper(regexp_replace(btrim(record->>'originator'), '\\s+', ' ', 'g')) = $1 AND upper(replace(record->>'dtg', ' ', '')) = $2)
       OR reference = $3
    ORDER BY (upper(replace(record->>'dtg', ' ', '')) = $2) DESC
    LIMIT 1 FOR UPDATE`, [ref.originator && ref.dtg ? normSender(ref.originator) : "", normDtg(ref.dtg), ref.serial ? normRef(ref.serial) : ""]);
  return row;
}

export async function ingest(user: AppUser, raw: unknown): Promise<IngestResult> {
  if (typeof raw !== "string" || !raw.trim()) throw new ApiError(400, "Paste the raw message text.");
  if (Buffer.byteLength(raw, "utf8") > MAX_RAW_BYTES) throw new ApiError(413, "Raw message text must be 64 KB or less.");
  let parsed;
  try {
    parsed = parseNavalMessage(raw);
  } catch (error) {
    if (error instanceof NavalParseError) throw new ApiError(422, error.message);
    throw error;
  }
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(1819242083, 4)");
    const { rows: [dup] } = await client.query("SELECT id FROM messages WHERE reference = $1 OR id = $2", [parsed.reference, idFor(parsed.reference)]);
    if (dup) throw new ApiError(409, `${parsed.reference} is already held. Each serial is ingested once; send a correction or amendment as new traffic.`);
    const { rows: [{ serial }] } = await client.query<{ serial: string }>("SELECT nextval('message_artifact_serial')::text AS serial");
    const c2oixId = `C2OIX-${parsed.received.slice(2, 4)}-${serial.padStart(6, "0")}`;
    const message = messageFromParsed(parsed, raw, { c2oixId, sha256: sha256(raw), sizeBytes: Buffer.byteLength(raw, "utf8") });
    // The directive's target is found the way references are: sender plus DTG, then serial.
    const target = parsed.directive ? await findReferencedMessage(client, parsed.refs.find((r) => r.letter === parsed.directive!.letter)!) : undefined;
    if (target) message.relatesTo = target.reference;
    await storeMessage(client, raw, message, user.id);
    let applied: IngestResult["applied"];
    if (parsed.directive) {
      const lifecycle = targetLifecycle(parsed.directive.kind);
      if (!target) applied = { target: parsed.directive.target, missing: true };
      else if (lifecycle) {
        await client.query("UPDATE messages SET lifecycle = $2, replaced_by = $3 WHERE id = $1", [target.id, lifecycle, message.reference]);
        applied = { target: target.reference, lifecycle };
      }
    }
    await client.query("COMMIT");
    return { message, applied };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
