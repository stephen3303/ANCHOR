import { connection } from "next/server";
import { handoffFailure,handoffJSON,handoffRequest,requireSessionUser } from "@/lib/server/handoff-api";
import { handoffDetail,changeHandoff } from "@/lib/server/watch-handoffs";
type Context={params:Promise<{id:string}>};
export async function GET(_request:Request,context:Context) {await connection();try {return handoffJSON(await handoffDetail(await requireSessionUser(),(await context.params).id));}catch(error){return handoffFailure(error);} }
export async function PATCH(request:Request,context:Context) {try {const {user,payload}=await handoffRequest(request);return handoffJSON(await changeHandoff(user,(await context.params).id,payload));}catch(error){return handoffFailure(error);} }
