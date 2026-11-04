import { markAllRead } from "@/lib/server/messages";
import { noStore, writer, messageFailure } from "@/lib/server/message-api";

export async function POST(request: Request) {
  try {
    const { user } = await writer(request);
    return Response.json({ updated: await markAllRead(user) }, { headers: noStore });
  } catch (error) { return messageFailure(error); }
}
