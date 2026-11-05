import "server-only";
import { MessageInputError } from "@/lib/message-inputs";
import { TemplateValidationError } from "@/lib/message-templates";

import { ApiError } from "./api-error";
import { requireSessionUser } from "./session";
export { ApiError } from "./api-error";
export function apiFailure(error: unknown): Response {
  if (error instanceof MessageInputError) return Response.json({ error: error.message, fields: error.fields }, { status: 400 });
  if (error instanceof TemplateValidationError) return Response.json({ error: error.message }, { status: 400 });
  if (error instanceof ApiError) return Response.json({ error: error.message }, { status: error.status });
  console.error("Template API request failed", error);
  return Response.json({ error: "The database is unavailable or not initialized. Check the server configuration and run npm run db:migrate." }, { status: 503 });
}

// Passwordless demo sessions are not proof of identity or production authorization.
export async function templateAuthor(request: Request): Promise<string> {
  return (await templateAuthorUser(request)).id;
}

export async function templateAuthorUser(request: Request) {
  if (process.env.ENABLE_TEMPLATE_AUTHORING !== "true") throw new ApiError(403, "Template authoring is disabled on this server.");
  assertSameOrigin(request);
  return requireSessionUser();
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (origin) {
    let source: URL;
    try { source = new URL(origin); } catch { throw new ApiError(403, "Invalid request origin."); }
    // Next may normalize request.url's hostname to localhost/0.0.0.0.
    // Compare the browser Origin to the actual HTTP Host instead.
    if (!["http:", "https:"].includes(source.protocol) || source.host !== request.headers.get("host")) {
      throw new ApiError(403, "Cross-origin publishing is not allowed.");
    }
  }
}

export async function readTemplatePayload(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new ApiError(415, "Send an application/json body.");
  // Enforce the limit while reading, even when Content-Length is missing.
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "A JSON body is required.");
  const decoder = new TextDecoder();
  let body = "";
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 300000) {
        await reader.cancel();
        throw new ApiError(413, "Template request exceeds 300 KB.");
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
    body += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  try { return JSON.parse(body); } catch { throw new ApiError(400, "The request body is not valid JSON."); }
}
