import { requireSessionUser } from "@/lib/server/session";
import { apiFailure, assertSameOrigin, readTemplatePayload } from "@/lib/server/template-api";
import { saveDesignations } from "@/lib/server/routing-config";

/** The Release Authority replaces the command's release designations. */
export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireSessionUser();
    return Response.json(await saveDesignations(await readTemplatePayload(request), user), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiFailure(error); }
}
