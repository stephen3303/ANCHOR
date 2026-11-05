import { connection } from 'next/server';
import { handoffFailure,handoffJSON,handoffRequest,requireSessionUser } from '@/lib/server/handoff-api';
import { listWatchActions,saveWatchAction } from '@/lib/server/watch-actions';
export async function GET(){await connection();try{return handoffJSON(await listWatchActions(await requireSessionUser()));}catch(e){return handoffFailure(e);}}
export async function POST(request:Request){try{const {user,payload}=await handoffRequest(request);return handoffJSON(await saveWatchAction(user,payload),201);}catch(e){return handoffFailure(e);}}
