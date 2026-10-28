import { actorFor, fail, getDb, json, requireUser } from "@/server/index";
import { LINKS, SimError, simDrop, simReset, simSetLink, simState, type LinkKey } from "@/server/sim";
import { hasRole } from "@/lib/users";

/** The topology demonstration as it stands: links, the C2OIX queue, and where each message has got to. */
export async function GET(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  return json({ ...simState(getDb()), canDrive: hasRole(user, "System Admin") });
}

type Op = { op: "drop"; count: number } | { op: "link"; key: LinkKey; up: boolean } | { op: "reset" };

/** Drive the simulated servers. System Admin only, like ingesting real traffic. */
export async function POST(req: Request) {
  const user = await requireUser(req, { json: true });
  if (user instanceof Response) return user;
  if (!hasRole(user, "System Admin")) return fail("Driving the simulated servers needs the System Admin role.", 403);
  const body = (await req.json().catch(() => null)) as Op | null;
  if (!body || typeof body !== "object") return fail("Expected a JSON operation.");
  const db = getDb();
  const actor = await actorFor(user);
  try {
    let result: unknown = null;
    if (body.op === "drop") result = simDrop(db, actor, Number(body.count));
    else if (body.op === "link") {
      if (!LINKS.includes(body.key) || typeof body.up !== "boolean") return fail("Name a link and whether it is up.");
      result = simSetLink(db, actor, body.key, body.up);
    } else if (body.op === "reset") simReset(db, actor);
    else return fail("Unknown operation.");
    return json({ ok: true, result, ...simState(db), canDrive: true });
  } catch (e) {
    if (e instanceof SimError) return fail(e.message, 422);
    throw e;
  }
}
