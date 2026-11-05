import "server-only";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { database } from "./db";
import { ApiError } from "./api-error";
import { validateTemplateDefinition, renderGeneratedMessage, isCommandChoice, type TemplateValues } from "@/lib/message-templates";
import { validateMessageInputs, UUID_PATTERN, PRECEDENCES, MessageInputError } from "@/lib/message-inputs";
import { resolveGeneratedInputs } from "@/lib/generated-inputs";
import { MESSAGE_FORMATTING_PROFILE } from "@/lib/message-format";
import { DRAFT_KEYS, keyParts } from "@/lib/message-types";
import { msgidKey } from "@/lib/naval";
import { accessArgs, appendRoutingEvent, MESSAGE_ACCESS } from "./routing-data";
import type { AppUser } from "@/lib/users";
import type { Message, Precedence } from "@/lib/types";

export async function readMessage(id: string, user: AppUser): Promise<Message | null> {
  if (!id || id.length > 100) return null;
  const { rows: [row] } = await database().query<{ record: Message }>(`SELECT m.record FROM outgoing_messages m WHERE ${MESSAGE_ACCESS} AND m.id = $4`, [...accessArgs(user), id]);
  return row?.record ?? null;
}
export interface MessageInputs { templateVersionId: string; subject: string; precedence: Precedence; /** Subscription key, MSGID field 2: "SAFETY:ELECTRICAL" or "GENADMIN". */ messageType: string; values: TemplateValues }
interface CreateRequest extends MessageInputs { requestId: string }
export function parseMessageInputs(body: unknown): MessageInputs {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(400, "Expected a message object.");
  const input = body as Record<string, unknown>;
  if (typeof input.templateVersionId !== "string" || !UUID_PATTERN.test(input.templateVersionId)) throw new ApiError(400, "A valid template-version UUID is required.");
  if (typeof input.subject !== "string" || !input.subject.trim() || input.subject.trim().length > 200 || /[\r\n\0]/.test(input.subject)) throw new MessageInputError({ _subject: "Enter a subject of 1–200 characters without line breaks." });
  if (!PRECEDENCES.includes(input.precedence as Precedence)) throw new ApiError(400, "Choose a supported precedence.");
  if (input.messageType !== undefined && (typeof input.messageType !== "string" || !DRAFT_KEYS.includes(input.messageType))) throw new ApiError(400, "Choose a supported outgoing message type.");
  if (!input.values || typeof input.values !== "object" || Array.isArray(input.values) || Object.keys(input.values).length > 100) throw new ApiError(400, "Submit at most 100 fields.");
  const values = Object.fromEntries(Object.entries(input.values).sort(([a], [b]) => a.localeCompare(b)));
  if (Object.values(values).some((value) => typeof value !== "string" && typeof value !== "boolean" && !(Array.isArray(value) && value.length <= 100 && value.every((item) => typeof item === "string")))) throw new ApiError(400, "Inputs must be text, booleans, or lists of option/command IDs.");
  const messageType = (input.messageType as string | undefined) ?? "GENADMIN";
  return { templateVersionId: input.templateVersionId.toLowerCase(), subject: input.subject.trim(), precedence: input.precedence as Precedence, messageType, values };
}
function parseRequest(body: unknown): CreateRequest {
  const input = parseMessageInputs(body);
  const raw = body as Record<string, unknown>;
  if (Object.keys(raw).some((key) => !["requestId", "templateVersionId", "subject", "precedence", "messageType", "values"].includes(key))) throw new ApiError(400, "Submit template inputs, not generated text, routing state or actor context.");
  if (typeof raw.requestId !== "string" || !UUID_PATTERN.test(raw.requestId)) throw new ApiError(400, "A valid request UUID is required.");
  return { ...input, requestId: raw.requestId.toLowerCase() };
}

export async function renderSnapshot(client: PoolClient, input: MessageInputs, user: AppUser, allowArchived = false) {
  const { rows: [version] } = await client.query(`SELECT v.id, v.version, v.renderer_version, v.ui_schema, v.output_definition, t.name, t.description
    FROM message_template_versions v JOIN message_templates t ON t.id = v.template_id
    WHERE v.id = $1 AND v.published_at IS NOT NULL AND (t.active OR $2) FOR SHARE OF v,t`, [input.templateVersionId, allowArchived]);
  if (!version) throw new ApiError(404, "Published template version is not available.");
  const definition = validateTemplateDefinition({ name: version.name, description: version.description, text: version.output_definition.body,
    fields: version.ui_schema.fields.map((field: Record<string, unknown>) => field.control === "number" ? { ...field, control: "text" } : field) });
  const values = validateMessageInputs(definition.fields, input.values);
  const commandFields = definition.fields.filter((field) => isCommandChoice(field.control));
  const selections = (name: string) => Array.isArray(values[name]) ? values[name] as string[] : values[name] ? [values[name] as string] : [];
  const ids = [...new Set(commandFields.flatMap((field) => selections(field.name)))];
  let sourceId: string | undefined;
  const commands = new Map<string, { id: string; name: string }>();
  if (commandFields.length) {
    const { rows: [source] } = await client.query("SELECT id FROM reference_sources WHERE key = 'recipient-commands' AND contract_version = 1 AND enabled FOR SHARE");
    if (!source) throw new ApiError(409, "The command directory is disabled.");
    sourceId = source.id;
    if (ids.length) {
      const { rows } = await client.query<{ id: string; name: string }>("SELECT id,name FROM commands WHERE id = ANY($1::uuid[]) FOR SHARE", [ids]);
      rows.forEach((command) => commands.set(command.id, command));
    }
  }
  const missing = commandFields.filter((field) => selections(field.name).some((id) => !commands.has(id)));
  if (missing.length) throw new MessageInputError(Object.fromEntries(missing.map((field) => [field.name, "A selected command is no longer available."])));
  const now = new Date();
  const generated = resolveGeneratedInputs(definition.fields, { now, sendingCommand: { id: user.commandId, name: user.commandName } });
  if (Object.keys(generated.errors).length) throw new MessageInputError(generated.errors);
  const resolved: TemplateValues = { ...values, ...generated.values };
  commandFields.forEach((field) => { const names = selections(field.name).map((id) => commands.get(id)!.name); resolved[field.name] = field.control === "command-multiple" ? names : names[0] ?? ""; });
  const text = renderGeneratedMessage(definition.text, resolved, definition.fields, 1000000);
  if (Buffer.byteLength(text, "utf8") > 1000000) throw new ApiError(400, "Generated message exceeds 1 MB.");
  // The template's Type writes MSGID field 2, so the rendered line decides the
  // message type when it names one; the chosen type is only a fallback.
  return { version, values, text, now, messageKey: msgidKey(text) ?? input.messageType, sections: [{ heading: "Template text", body: [text] }],
    metadata: { formatting: MESSAGE_FORMATTING_PROFILE, rendererVersion: version.renderer_version, templateVersion: version.version, resolvedAt: generated.resolvedAt, generatedValues: generated.values,
      generators: definition.fields.filter((field) => field.generator).map((field) => ({ name: field.name, ...field.generator })), sender: { userId: user.id, commandId: user.commandId, commandName: user.commandName } },
    references: commandFields.flatMap((field) => selections(field.name).map((commandId, position) => ({ field: field.name, position, sourceId, commandId, snapshot: commands.get(commandId) }))),
  };
}
export async function saveReferences(client: PoolClient, draftId: string, snapshot: Awaited<ReturnType<typeof renderSnapshot>>) {
  await client.query("DELETE FROM message_draft_references WHERE draft_id = $1", [draftId]);
  for (const reference of snapshot.references) await client.query(`INSERT INTO message_draft_references (draft_id, field_key, position, source_id, command_id, snapshot, resolved_at)
    VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)`, [draftId, reference.field, reference.position, reference.sourceId, reference.commandId, JSON.stringify(reference.snapshot), snapshot.now]);
}
export async function createMessage(body: unknown, user: AppUser): Promise<{ message: Message; replayed: boolean }> {
  const input = parseRequest(body);
  const fingerprint = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`${user.id}:${input.requestId}`]);
    const { rows: [existing] } = await client.query("SELECT record,request_hash FROM outgoing_messages WHERE created_by = $1 AND request_id = $2", [user.id, input.requestId]);
    if (existing) {
      if (existing.request_hash !== fingerprint) throw new ApiError(409, "Request ID already used for different inputs.");
      await client.query("COMMIT"); return { message: existing.record, replayed: true };
    }
    const snapshot = await renderSnapshot(client, input, user);
    const { rows: [draft] } = await client.query(`INSERT INTO message_drafts
      (template_version_id,created_by,subject,message_type,originator,precedence,classification,input_values,rendered_document,rendered_text,render_metadata)
      VALUES ($1,$2,$3,$4,$5,$6,'UNCLASSIFIED',$7::jsonb,$8::jsonb,$9,$10::jsonb) RETURNING id`,
    [input.templateVersionId, user.id, input.subject, snapshot.messageKey, user.commandName, input.precedence, JSON.stringify(snapshot.values), JSON.stringify({ sections: snapshot.sections, body: snapshot.text }), snapshot.text, JSON.stringify(snapshot.metadata)]);
    await saveReferences(client, draft.id, snapshot);
    const message: Message = { id: draft.id, kind: "draft", draftId: draft.id, renderedText: snapshot.text, rawText: snapshot.text, templateName: snapshot.version.name,
      subject: input.subject, reference: `DRAFT ${draft.id.slice(0,8).toUpperCase()}`, dtg: "", received: snapshot.now.toISOString(), ...keyParts(snapshot.messageKey),
      source: "Unreleased draft", originator: user.commandName, to: "", info: "", precedence: input.precedence, classification: "UNCLASSIFIED", importance: "Medium", lifecycle: "ACTIVE",
      attachments: [], sections: snapshot.sections, ackRequired: false, c2oixId: "", sha256: "", sizeKb: Buffer.byteLength(snapshot.text)/1024,
      retention: "Local prototype", distribution: [], addressees: [], related: [] };
    await client.query(`INSERT INTO outgoing_messages (id,draft_id,created_by,request_id,request_hash,received_at,record,command_id,workflow_status)
      VALUES ($1::text,$1::uuid,$2,$3,$4,$5,$6::jsonb,$7,'drafting')`, [message.id,user.id,input.requestId,fingerprint,snapshot.now,JSON.stringify(message),user.commandId]);
    await appendRoutingEvent(client,message,user,1,"created","Template draft created.",undefined,snapshot.now);
    await client.query("COMMIT"); return { message, replayed: false };
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
