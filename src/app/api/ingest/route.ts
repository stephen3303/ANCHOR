import { ingest } from "@/lib/server/messages";
import { noStore, requireAdmin, writer, messageFailure } from "@/lib/server/message-api";

// Raw C2OIX text in, a stored artifact and message out. System Admin only.
export async function POST(request: Request) {
  try {
    const { user, body } = await writer(request);
    requireAdmin(user);
    return Response.json(await ingest(user, body.raw), { status: 201, headers: noStore });
  } catch (error) { return messageFailure(error); }
}
