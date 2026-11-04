import { setUserState } from "@/lib/server/messages";
import { noStore, writer, messageFailure } from "@/lib/server/message-api";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, body } = await writer(request);
    const state = await setUserState(user, (await params).id, { read: body.read });
    return Response.json({ state }, { headers: noStore });
  } catch (error) { return messageFailure(error); }
}
