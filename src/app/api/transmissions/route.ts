import { connection } from "next/server";
import { requireSessionUser } from "@/lib/server/session";
import { listTransmissions } from "@/lib/server/transmissions";
import { messageFailure, noStore } from "@/lib/server/message-api";

/** The command's transmission queue and log; visible to everyone in the command. */
export async function GET() {
  await connection();
  try { return Response.json({ transmissions: await listTransmissions(await requireSessionUser()) }, { headers: noStore }); }
  catch (error) { return messageFailure(error); }
}
