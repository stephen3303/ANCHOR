import "server-only";
import { CURRENT_USER } from "@/lib/data";
import type { AppUser } from "@/lib/users";
import { ApiError } from "./api-error";
import { requireSessionUser } from "./session";
import { assertSameOrigin, readTemplatePayload } from "./template-api";
import { isAdmin } from "./user-admin";

export const noStore = { "Cache-Control": "no-store" };
/** Source code of the command this deployment serves; its own traffic is acknowledged by addressees. */
export const OWN_SOURCE = CURRENT_USER.commandSource;

/** A signed-in user making a same-origin write with a JSON body. */
export async function writer(request: Request): Promise<{ user: AppUser; body: Record<string, unknown> }> {
  assertSameOrigin(request);
  const user = await requireSessionUser();
  const body = await readTemplatePayload(request);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(400, "Send a JSON object.");
  return { user, body: body as Record<string, unknown> };
}

export function requireAdmin(user: AppUser) {
  if (!isAdmin(user)) throw new ApiError(403, "This needs the System Admin role.");
}

/** The error response for a message API call. */
export function messageFailure(error: unknown): Response {
  if (error instanceof ApiError) return Response.json({ error: error.message }, { status: error.status, headers: noStore });
  console.error("Message API request failed", error);
  return Response.json(
    { error: "The message store is unavailable or not set up. Run npm run db:migrate and npm run db:seed:messages." },
    { status: 503, headers: noStore },
  );
}
