import "server-only";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import type { AppUser } from "@/lib/users";
import type { ApiDraft, ApiRoutingEvent } from "@/lib/routing-api";
import type { Message, RoutingEventType } from "@/lib/types";
import { database } from "./db";
import { isAdmin } from "./user-admin";

export const DRAFT_ACCESS = `(m.command_id = $2::uuid AND (m.created_by = $1::uuid OR $3::boolean
  OR m.routing_route @> jsonb_build_array(jsonb_build_object('personId', $1::text))))`;
export const MESSAGE_ACCESS = `(m.draft_id IS NULL OR (m.command_id = $2::uuid AND (m.workflow_status = 'released'
  OR m.created_by = $1::uuid OR $3::boolean OR m.routing_route @> jsonb_build_array(jsonb_build_object('personId', $1::text)))))`;
export const accessArgs = (user: AppUser) => [user.id, user.commandId, isAdmin(user)];

export async function listDrafts(user: AppUser, id?: string): Promise<{ drafts: ApiDraft[]; events: ApiRoutingEvent[] }> {
  const { rows } = await database().query(`SELECT m.*, d.input_values, d.template_version_id, d.rendered_text,
      v.ui_schema, v.output_definition, v.version AS template_version_number, t.name AS template_name, t.description, owner.name AS drafter_name
    FROM outgoing_messages m JOIN message_drafts d ON d.id = m.draft_id
    JOIN message_template_versions v ON v.id = d.template_version_id JOIN message_templates t ON t.id = v.template_id
    JOIN users owner ON owner.id = m.created_by
    WHERE ${DRAFT_ACCESS} AND ($4::text IS NULL OR m.id = $4::text) ORDER BY m.updated_at DESC, m.id`, [...accessArgs(user), id ?? null]);
  const { rows: references } = await database().query(`SELECT draft_id, field_key, command_id, snapshot FROM message_draft_references WHERE draft_id = ANY($1::uuid[]) ORDER BY position`, [rows.map((row) => row.draft_id)]);
  const drafts: ApiDraft[] = rows.map((row) => ({
    id: row.id, subject: row.record.subject, type: row.record.type, originator: row.record.originator, precedence: row.record.precedence,
    classification: row.record.classification, to: [], info: [], paragraphs: [row.rendered_text], drafterId: row.created_by,
    drafterName: row.drafter_name, status: row.workflow_status, route: row.routing_route, workflowId: row.workflow_id ?? undefined,
    created: row.created_at.toISOString(), updated: row.updated_at.toISOString(), revision: row.routing_revision,
    dtg: row.released_at ? row.record.dtg : undefined, localSequence: row.record.localSequence, msn: row.record.msn,
    releasedAt: row.released_at?.toISOString(), releasedBy: row.released_by ?? undefined, releaseDesignation: row.record.releaseDesignation,
    renderedText: row.rendered_text, templateVersionId: row.template_version_id, templateName: row.template_name, templateVersion: row.template_version_number, inputValues: row.input_values,
    commandSelections: Object.fromEntries([...new Set(references.filter((ref) => ref.draft_id === row.draft_id).map((ref) => ref.field_key))].map((field) => [field, references.filter((ref) => ref.draft_id === row.draft_id && ref.field_key === field).map((ref) => ({ id: ref.command_id, name: ref.snapshot.name }))])),
    definition: { name: row.template_name, description: row.description, text: row.output_definition.body,
      fields: row.ui_schema.fields.map((field: { control: string }) => field.control === "number" ? { ...field, control: "text" } : field) },
  }));
  const { rows: events } = await database().query(`SELECT e.id, e.message_id AS "draftId", e.actor_id AS "actorId", e.actor_name AS "actorName",
      e.event_type AS type, e.step_title AS "stepTitle", e.comment, e.revision, e.snapshot_hash AS "snapshotHash", e.at
    FROM outgoing_message_events e JOIN outgoing_messages m ON m.id = e.message_id
    WHERE ${DRAFT_ACCESS} AND ($4::text IS NULL OR m.id = $4::text) ORDER BY e.sequence`, [...accessArgs(user), id ?? null]);
  return { drafts, events: events.map((event) => ({ ...event, at: event.at.toISOString() })) as ApiRoutingEvent[] };
}
export async function appendRoutingEvent(client: PoolClient, message: Message, user: AppUser, revision: number, type: RoutingEventType, comment: string, stepTitle?: string, at = new Date()) {
  const snapshotHash = createHash("sha256").update(JSON.stringify({ subject: message.subject, type: message.type, originator: message.originator, precedence: message.precedence, classification: message.classification, text: message.rawText || message.renderedText || "" })).digest("hex");
  await client.query(`INSERT INTO outgoing_message_events (message_id, actor_id, actor_name, event_type, step_title, comment, revision, snapshot_hash, at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [message.id, user.id, user.name, type, stepTitle ?? null, comment, revision, snapshotHash, at]);
}
