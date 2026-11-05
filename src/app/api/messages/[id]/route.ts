import { connection } from "next/server";
import { requireSessionUser } from "@/lib/server/session";
import { requireMessage } from "@/lib/server/messages";
import { readMessage } from "@/lib/server/outgoing-messages";
import { ApiError, apiFailure, assertSameOrigin, readTemplatePayload } from "@/lib/server/template-api";
import { updateMessage } from "@/lib/server/message-routing";
import { listDrafts } from "@/lib/server/routing-data";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const message = await readMessage(id, user) ?? await requireMessage(id);
    if (!message) throw new ApiError(404, "Message not found.");
    return Response.json({ message }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiFailure(error); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireSessionUser();
    const { id } = await params;
    const message = await updateMessage(id, await readTemplatePayload(request), user);
    return Response.json({ message, ...(await listDrafts(user, id)) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiFailure(error); }
}
