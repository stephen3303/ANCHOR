import { acknowledge } from "@/lib/server/messages";
import { noStore, OWN_SOURCE, writer, messageFailure } from "@/lib/server/message-api";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await writer(request);
    return Response.json(await acknowledge(user, (await params).id, OWN_SOURCE), { headers: noStore });
  } catch (error) { return messageFailure(error); }
}
