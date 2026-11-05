import { connection } from 'next/server';
import { handoffFailure,handoffJSON,handoffRequest,requireSessionUser } from '@/lib/server/handoff-api';
import { watchActionHistory,saveWatchAction } from '@/lib/server/watch-actions';
type Context={params:Promise<{id:string}>};
export async function GET(_request:Request,context:Context){await connection();try{return handoffJSON(await watchActionHistory(await requireSessionUser(),(await context.params).id));}catch(e){return handoffFailure(e);}}
export async function PATCH(request:Request,context:Context){try{const {user,payload}=await handoffRequest(request);return handoffJSON(await saveWatchAction(user,payload,(await context.params).id));}catch(e){return handoffFailure(e);}}
