import { handoffFailure,handoffJSON,handoffRequest } from "@/lib/server/handoff-api";
import { configureStation } from "@/lib/server/watch-handoffs";
export async function POST(request:Request) {try {const {user,payload}=await handoffRequest(request);return handoffJSON(await configureStation(user,payload),201);}catch(error){return handoffFailure(error);} }
