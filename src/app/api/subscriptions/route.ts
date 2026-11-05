import { connection } from "next/server";
import { requireSessionUser } from "@/lib/server/session";
import { listMessageTopics, subscribeToTopicName } from "@/lib/server/message-topics";
import { assertSameOrigin } from "@/lib/server/template-api";
import { messageFailure, noStore } from "@/lib/server/message-api";

export async function GET() {
  await connection();
  try {
    return Response.json({ topics: await listMessageTopics(await requireSessionUser()) }, { headers: noStore });
  } catch (error) { return messageFailure(error); }
}

/** Subscribe to a template's Type before any message of it has been published. Body: { name }. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireSessionUser();
    const body = await request.json().catch(() => null);
    return Response.json(await subscribeToTopicName(user, body && typeof body === "object" ? (body as { name?: unknown }).name : undefined), { headers: noStore });
  } catch (error) { return messageFailure(error); }
}
