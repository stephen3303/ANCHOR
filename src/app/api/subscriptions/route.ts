import { connection } from "next/server";
import { requireSessionUser } from "@/lib/server/session";
import { listMessageTopics } from "@/lib/server/message-topics";
import { messageFailure, noStore } from "@/lib/server/message-api";

export async function GET() {
  await connection();
  try {
    return Response.json({ topics: await listMessageTopics(await requireSessionUser()) }, { headers: noStore });
  } catch (error) { return messageFailure(error); }
}
