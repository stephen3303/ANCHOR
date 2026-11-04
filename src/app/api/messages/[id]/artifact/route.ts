import { connection } from "next/server";
import { requireSessionUser } from "@/lib/server/session";
import { artifact } from "@/lib/server/messages";
import { noStore, messageFailure } from "@/lib/server/message-api";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    await requireSessionUser();
    return Response.json(await artifact((await params).id), { headers: noStore });
  } catch (error) { return messageFailure(error); }
}
