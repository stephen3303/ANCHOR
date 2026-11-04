import { connection } from "next/server";
import { requireSessionUser } from "@/lib/server/session";
import { messageSnapshot } from "@/lib/server/messages";
import { noStore, messageFailure } from "@/lib/server/message-api";

export async function GET() {
  await connection();
  try {
    return Response.json(await messageSnapshot(await requireSessionUser()), { headers: noStore });
  } catch (error) { return messageFailure(error); }
}
