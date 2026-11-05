import { handoffFailure,handoffJSON,handoffRequest } from "@/lib/server/handoff-api";
import { configureStation } from "@/lib/server/watch-handoffs";
export async function PATCH(request:Request,context:{params:Promise<{id:string}>}) {try {const {user,payload}=await handoffRequest(request);return handoffJSON(await configureStation(user,payload,(await context.params).id));}catch(error){return handoffFailure(error);} }
