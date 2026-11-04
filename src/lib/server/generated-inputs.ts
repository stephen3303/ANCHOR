import "server-only";
import { resolveGeneratedInputs } from "@/lib/generated-inputs";
import type { TemplateField } from "@/lib/message-templates";
import { requireSessionUser } from "./session";

// One authoritative user/command lookup per generation. Never accept a sender,
// user ID, clock, or resolved automatic value from the draft payload.
export async function resolveServerGeneratedInputs(fields: TemplateField[]) {
  const user = await requireSessionUser();
  return resolveGeneratedInputs(fields, {
    now: new Date(),
    sendingCommand: { id: user.commandId, name: user.commandName },
  });
}
