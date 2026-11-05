import { connection } from "next/server";
import { AUDITOR, hasRole } from "@/lib/roles";
import { ApiError } from "@/lib/server/api-error";
import { requireSessionUser } from "@/lib/server/session";
import { integrityCheck } from "@/lib/server/messages";
import { noStore, messageFailure } from "@/lib/server/message-api";

export async function GET() {
  await connection();
  try {
    if (!hasRole(await requireSessionUser(), AUDITOR)) throw new ApiError(403, "Integrity checks need the Auditor role.");
    return Response.json(await integrityCheck(), { headers: noStore });
  } catch (error) { return messageFailure(error); }
}
