import { MESSAGE_FORMATTING_PROFILE } from "@/lib/message-format";
import { randomUUID } from "node:crypto";
import { connection } from "next/server";
import { compileTemplate, isCommandChoice, validateTemplateForPublication } from "@/lib/message-templates";
import { currentSessionUser } from "@/lib/server/session";
import { isAdmin } from "@/lib/server/user-admin";
import { database } from "@/lib/server/db";
import { ApiError, apiFailure, readTemplatePayload, templateAuthor } from "@/lib/server/template-api";

export async function GET() {
  await connection();
  try {
    const user = await currentSessionUser();
    const { rows } = await database().query(`
      SELECT t.id, t.name, t.description, t.created_by AS "createdBy", u.command_id AS "creatorCommandId", u.name AS "createdByName", v.version, v.published_at AS "publishedAt",
        jsonb_array_length(v.ui_schema->'fields') AS "variableCount"
      FROM message_templates t LEFT JOIN users u ON u.id::text=t.created_by
      JOIN LATERAL (
        SELECT * FROM message_template_versions WHERE template_id = t.id AND published_at IS NOT NULL
        ORDER BY version DESC LIMIT 1
      ) v ON true
      WHERE t.active ORDER BY v.published_at DESC LIMIT 100
    `);
    const authoring = process.env.ENABLE_TEMPLATE_AUTHORING === "true";
    // canEdit mirrors reviseTemplate's check; it is a UI hint, not the authorization.
    const templates = rows.map(({ createdBy, creatorCommandId, createdByName, ...template }) => {
      const canEdit = authoring && !!user && (createdBy === user.id || (isAdmin(user) && creatorCommandId === user.commandId));
      const editNote = canEdit ? undefined : !authoring ? "Template authoring is disabled on this server."
        : `Only ${createdByName ? `the creator (${createdByName})` : "the creator"} or a System Admin can edit this template.`;
      return { ...template, createdByName: createdByName ?? null, canEdit, ...(editNote ? { editNote } : {}) };
    });
    return Response.json({ templates }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiFailure(error); }
}

export async function POST(request: Request) {
  try {
    const author = await templateAuthor(request);
    const definition = validateTemplateForPublication(await readTemplatePayload(request));
    const compiled = compileTemplate(definition);
    const client = await database().connect();
    try {
      await client.query("BEGIN");
      if (definition.fields.some((field) => isCommandChoice(field.control))) {
        const { rowCount } = await client.query(`SELECT id FROM reference_sources
          WHERE key = 'recipient-commands' AND contract_version = 1 AND enabled FOR SHARE`);
        if (!rowCount) throw new ApiError(409, "The command directory source is disabled or unavailable.");
      }
      const { rows: [template] } = await client.query(`
        INSERT INTO message_templates (key, name, description, created_by)
        VALUES ($1, $2, $3, $4) RETURNING id, name, description
      `, [`template-${randomUUID()}`, definition.name, definition.description, author]);
      const { rows: [version] } = await client.query(`
        INSERT INTO message_template_versions
          (template_id, version, input_schema, ui_schema, output_definition, formatting_profile, renderer_version, created_by, published_at)
        VALUES ($1, 1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, 'named-v1', $6, now())
        RETURNING id AS "versionId", version, published_at AS "publishedAt"
      `, [template.id, JSON.stringify(compiled.inputSchema), JSON.stringify(compiled.uiSchema), JSON.stringify(compiled.outputDefinition), JSON.stringify(MESSAGE_FORMATTING_PROFILE), author]);
      await client.query("COMMIT");
      return Response.json({ template: { ...template, ...version, variableCount: definition.fields.length } }, { status: 201 });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  } catch (error) { return apiFailure(error); }
}
