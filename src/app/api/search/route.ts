import { getDb, json, requireUser } from "@/server/index";
import { searchMessages } from "@/server/repo";

/** Full-text search over every ingested message. Returns ids, best first. */
export async function GET(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return json({ ids: searchMessages(getDb(), q.slice(0, 200)) });
}
