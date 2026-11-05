import { connection } from "next/server";
import { requireSessionUser } from "@/lib/server/session";
import { apiFailure, assertSameOrigin, readTemplatePayload } from "@/lib/server/template-api";
import { readRoutingConfig, saveRoutingConfig } from "@/lib/server/routing-config";

export async function GET() {
  await connection();
  try { return Response.json(await readRoutingConfig(await requireSessionUser()), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return apiFailure(error); }
}
export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireSessionUser();
    return Response.json(await saveRoutingConfig(await readTemplatePayload(request), user), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiFailure(error); }
}
