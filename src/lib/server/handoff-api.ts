import "server-only";
import { ApiError } from "./api-error";
import { HandoffInputError } from "../watch-handoff";
import { assertSameOrigin, readTemplatePayload } from "./template-api";
import { requireSessionUser } from "./session";
export { requireSessionUser };
export const handoffJSON=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store"}});
export function handoffFailure(error:unknown) {
  if (error instanceof ApiError) return handoffJSON({error:error.message},error.status);
  if (error instanceof HandoffInputError) return handoffJSON({error:error.message},400);
  console.error("Watch handoff storage request failed",(error as {code?:string}).code||"unavailable");
  return handoffJSON({error:"Watch handoff storage is unavailable. Check PostgreSQL and run npm run db:migrate. No changes were confirmed saved."},503);
}
export async function handoffRequest(request:Request) {
  assertSameOrigin(request);
  const user=await requireSessionUser();
  return {user,payload:await readTemplatePayload(request)};
}
