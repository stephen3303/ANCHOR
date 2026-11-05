import { connection } from "next/server";
import { database } from "@/lib/server/db";
import { requireSessionUser } from "@/lib/server/session";
import { apiFailure, assertSameOrigin, readTemplatePayload } from "@/lib/server/template-api";
import { createMessage } from "@/lib/server/messages";
import { listDrafts } from "@/lib/server/routing-data";

export async function GET(request: Request) {
  await connection();
  try {
    const user = await requireSessionUser();
    const view = new URL(request.url).searchParams.get("view");
    if (view === "drafts") return Response.json(await listDrafts(user), { headers: { "Cache-Control": "no-store" } });
    const { rows } = await database().query(`SELECT record FROM messages WHERE workflow_status = 'released' AND (draft_id IS NULL OR command_id = $1)
      ORDER BY received_at DESC,id`, [user.commandId]);
    return Response.json({ messages: rows.map((row) => row.record) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiFailure(error); }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireSessionUser();
    const result = await createMessage(await readTemplatePayload(request), user);
    return Response.json({ message: result.message, ...(await listDrafts(user, result.message.id)) }, { status: result.replayed ? 200 : 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiFailure(error); }
}
