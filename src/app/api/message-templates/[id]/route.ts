import { connection } from "next/server";
import { database } from "@/lib/server/db";
import { reviseTemplate } from "@/lib/server/template-versions";
import { ApiError, apiFailure, templateAuthorUser, readTemplatePayload } from "@/lib/server/template-api";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new ApiError(400, "Invalid template ID.");
    const { rows: [template] } = await database().query(`
      SELECT t.id, t.name, t.description, v.id AS "versionId", v.version,
        v.published_at AS "publishedAt", v.output_definition->>'body' AS text,
        v.ui_schema->'fields' AS fields
      FROM message_templates t JOIN message_template_versions v ON v.template_id = t.id
      WHERE t.id = $1 AND t.active AND v.published_at IS NOT NULL
      ORDER BY v.version DESC LIMIT 1
    `, [id]);
    if (!template) throw new ApiError(404, "Template not found.");
    return Response.json({ template }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiFailure(error); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await templateAuthorUser(request);
    const { id } = await params;
    const template = await reviseTemplate(id, await readTemplatePayload(request), user);
    return Response.json({ template }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiFailure(error); }
}
