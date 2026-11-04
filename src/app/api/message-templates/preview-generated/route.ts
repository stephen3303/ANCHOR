import { validateTemplateDefinition } from "@/lib/message-templates";
import { resolveServerGeneratedInputs } from "@/lib/server/generated-inputs";
import { apiFailure, assertSameOrigin, readTemplatePayload } from "@/lib/server/template-api";

// Stateless authoring preview only: never freezes generated values into a
// published template. Future draft creation must resolve again on the server
// and persist the resolved values/time with that draft's rendered snapshot.
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const definition = validateTemplateDefinition(await readTemplatePayload(request));
    const result = await resolveServerGeneratedInputs(definition.fields);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiFailure(error); }
}
