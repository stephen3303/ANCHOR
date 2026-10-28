import { currentUser, getDb, json } from "@/server/index";
import { searchMessages } from "@/server/repo";

/** Full-text search over every ingested message. Returns ids, best first. */
export async function GET(req: Request) {
  await currentUser();
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return json({ ids: searchMessages(getDb(), q.slice(0, 200)) });
}
