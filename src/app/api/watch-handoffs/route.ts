import { connection } from "next/server";
import { handoffFailure,handoffJSON,handoffRequest,requireSessionUser } from "@/lib/server/handoff-api";
import { handoffOverview,createHandoff } from "@/lib/server/watch-handoffs";
import { ApiError } from "@/lib/server/api-error";
export async function GET(request:Request) {
  await connection();
  try { const user=await requireSessionUser();const query=new URL(request.url).searchParams;const page=Number(query.get("page")||0);if(!Number.isSafeInteger(page)||page<0||page>10000)throw new ApiError(400,"Invalid history page.");return handoffJSON(await handoffOverview(user,query.get("stationId")||undefined,page)); }catch(error){return handoffFailure(error);}
}
export async function POST(request:Request) { try {const {user,payload}=await handoffRequest(request);return handoffJSON(await createHandoff(user,payload),201);}catch(error){return handoffFailure(error);} }
