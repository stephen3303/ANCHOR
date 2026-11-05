import { ApiError } from "@/lib/server/api-error";
import { messageFailure, noStore, writer } from "@/lib/server/message-api";
import { revokeRelease, transmit } from "@/lib/server/transmissions";

/** Transmit a queued release (Message Admin), or withdraw it before transmission (releaser or Release Authority). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, body } = await writer(request);
    const { id } = await params;
    const comment = typeof body.comment === "string" ? body.comment.trim().slice(0, 2000) : "";
    if (body.action === "transmit") return Response.json({ message: await transmit(user, id) }, { headers: noStore });
    if (body.action === "revoke") return Response.json({ message: await revokeRelease(user, id, comment) }, { headers: noStore });
    throw new ApiError(400, "Action must be transmit or revoke.");
  } catch (error) { return messageFailure(error); }
}
