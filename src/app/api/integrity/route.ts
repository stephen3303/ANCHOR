import { connection } from "next/server";
import { requireSessionUser } from "@/lib/server/session";
import { integrityCheck } from "@/lib/server/messages";
import { noStore, messageFailure } from "@/lib/server/message-api";

export async function GET() {
  await connection();
  try {
    await requireSessionUser();
    return Response.json(await integrityCheck(), { headers: noStore });
  } catch (error) { return messageFailure(error); }
}
