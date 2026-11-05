import { requireSessionUser } from "@/lib/server/session";
import { setMessageTopicSubscription } from "@/lib/server/message-topics";
import { assertSameOrigin } from "@/lib/server/template-api";
import { messageFailure, noStore } from "@/lib/server/message-api";

async function change(request: Request, params: Promise<{ id: string }>, subscribed: boolean) {
  try {
    assertSameOrigin(request);
    const user = await requireSessionUser();
    const { id } = await params;
    // The acting account always comes from the validated session. No body,
    // client actor ID, role, approval or template-authoring switch is consulted.
    return Response.json(await setMessageTopicSubscription(user, id, subscribed), { headers: noStore });
  } catch (error) { return messageFailure(error); }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return change(request, params, true);
}
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return change(request, params, false);
}
