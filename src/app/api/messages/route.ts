import { connection } from "next/server";
import { requireSessionUser } from "@/lib/server/session";
import { messageSnapshot } from "@/lib/server/messages";
import { createMessage } from "@/lib/server/outgoing-messages";
import { listDrafts } from "@/lib/server/routing-data";
import { apiFailure, assertSameOrigin, readTemplatePayload } from "@/lib/server/template-api";
import { noStore, messageFailure } from "@/lib/server/message-api";

export async function GET(request: Request) {
  await connection();
  try {
    const user = await requireSessionUser();
    if (new URL(request.url).searchParams.get("view") === "drafts") return Response.json(await listDrafts(user), { headers: noStore });
    return Response.json(await messageSnapshot(user), { headers: noStore });
  } catch (error) { return messageFailure(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireSessionUser();
    const result = await createMessage(await readTemplatePayload(request), user);
    return Response.json({ message: result.message, ...(await listDrafts(user, result.message.id)) }, { status: result.replayed ? 200 : 201, headers: noStore });
  } catch (error) { return apiFailure(error); }
}
