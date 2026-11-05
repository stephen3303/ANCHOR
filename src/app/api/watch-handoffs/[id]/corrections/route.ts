import { handoffFailure,handoffJSON,handoffRequest } from "@/lib/server/handoff-api";
import { correctHandoff } from "@/lib/server/watch-handoffs";
export async function POST(request:Request,context:{params:Promise<{id:string}>}) {try {const {user,payload}=await handoffRequest(request);return handoffJSON(await correctHandoff(user,(await context.params).id,payload),201);}catch(error){return handoffFailure(error);} }
