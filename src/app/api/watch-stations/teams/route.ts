import { handoffFailure,handoffJSON,handoffRequest } from '@/lib/server/handoff-api';
import { createRotatingTeams } from '@/lib/server/watch-actions';
export async function POST(request:Request){try{const {user,payload}=await handoffRequest(request);return handoffJSON(await createRotatingTeams(user,payload),201);}catch(e){return handoffFailure(e);}}
