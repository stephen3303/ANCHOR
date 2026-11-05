import "server-only";
import { compileTemplate, isCommandChoice, validateTemplateForPublication } from "@/lib/message-templates";
import { MESSAGE_FORMATTING_PROFILE } from "@/lib/message-format";
import { UUID_PATTERN } from "@/lib/message-inputs";
import type { AppUser } from "@/lib/users";
import { database } from "./db";
import { ApiError } from "./api-error";
import { isAdmin } from "./user-admin";

/** Remove from future authoring without destroying immutable versions or pins. */
export async function deleteTemplate(id: string, user: AppUser) {
  if (!UUID_PATTERN.test(id)) throw new ApiError(400, "Invalid template ID.");
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    const { rows: [parent] } = await client.query(`SELECT t.id,t.created_by,u.command_id FROM message_templates t
      LEFT JOIN users u ON u.id::text=t.created_by WHERE t.id=$1 AND t.active FOR UPDATE OF t`, [id]);
    if (!parent) throw new ApiError(404, "Template not found.");
    if (parent.created_by !== user.id && !(isAdmin(user) && parent.command_id === user.commandId)) throw new ApiError(403, "Only the template creator or an admin in their command may delete this template.");
    await client.query("UPDATE message_templates SET active=false WHERE id=$1", [id]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

export async function reviseTemplate(id: string, payload: unknown, user: AppUser) {
  if (!UUID_PATTERN.test(id)) throw new ApiError(400, "Invalid template ID.");
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new ApiError(400, "Send a template revision object.");
  const body = payload as Record<string, unknown>;
  if (Object.keys(body).some((key) => !["expectedVersionId", "definition"].includes(key)) || typeof body.expectedVersionId !== "string" || !UUID_PATTERN.test(body.expectedVersionId)) throw new ApiError(400, "The version being edited must be identified by expectedVersionId.");
  const definition = validateTemplateForPublication(body.definition);
  const compiled = compileTemplate(definition);
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    const { rows: [parent] } = await client.query(`SELECT t.id,t.created_by,u.command_id FROM message_templates t
      LEFT JOIN users u ON u.id::text=t.created_by WHERE t.id=$1 AND t.active FOR UPDATE OF t`, [id]);
    if (!parent) throw new ApiError(404, "Template not found.");
    if (parent.created_by !== user.id && !(isAdmin(user) && parent.command_id === user.commandId)) throw new ApiError(403, "Only the template creator or an admin in their command may edit this template.");
    const { rows: [latest] } = await client.query("SELECT id FROM message_template_versions WHERE template_id=$1 AND published_at IS NOT NULL ORDER BY version DESC LIMIT 1", [id]);
    if (!latest || latest.id !== body.expectedVersionId.toLowerCase()) throw new ApiError(409, "This template has a newer version. Your edits are preserved; reopen the latest version before publishing.");
    if (definition.fields.some((field) => isCommandChoice(field.control))) {
      const { rowCount } = await client.query("SELECT id FROM reference_sources WHERE key='recipient-commands' AND contract_version=1 AND enabled FOR SHARE");
      if (!rowCount) throw new ApiError(409, "The command directory source is disabled or unavailable.");
    }
    const { rows: [next] } = await client.query("SELECT coalesce(max(version),0)+1 AS number FROM message_template_versions WHERE template_id=$1", [id]);
    const { rows: [version] } = await client.query(`INSERT INTO message_template_versions
      (template_id,version,input_schema,ui_schema,output_definition,formatting_profile,renderer_version,created_by,published_at)
      VALUES ($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb,'named-v1',$7,now())
      RETURNING id AS "versionId",version,published_at AS "publishedAt"`,
    [id,next.number,JSON.stringify(compiled.inputSchema),JSON.stringify(compiled.uiSchema),JSON.stringify(compiled.outputDefinition),JSON.stringify(MESSAGE_FORMATTING_PROFILE),user.id]);
    await client.query("UPDATE message_templates SET name=$2,description=$3 WHERE id=$1", [id,definition.name,definition.description]);
    await client.query("COMMIT");
    return { id: parent.id, name: definition.name, description: definition.description, ...version, variableCount: definition.fields.length, canEdit: true };
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
