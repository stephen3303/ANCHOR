import { rolesFor, SYSTEM_ADMIN_ROLE } from "@/lib/demo-users";
import { database } from "@/lib/server/db";
import { ApiError, apiFailure, readTemplatePayload } from "@/lib/server/template-api";
import { parseUserUpdate, requireUserAdmin, USER_COLUMNS } from "@/lib/server/user-admin";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireUserAdmin(request);
    const { id } = await params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new ApiError(400, "Invalid user ID.");
    const update = parseUserUpdate(await readTemplatePayload(request));
    // Guard against an admin locking themselves out of this screen.
    if (id === admin.id && update.active === false) throw new ApiError(400, "You cannot deactivate your own account.");
    if (id === admin.id && update.roles && !update.roles.includes(SYSTEM_ADMIN_ROLE)) throw new ApiError(400, "You cannot remove your own System Admin role.");

    const client = await database().connect();
    try {
      await client.query("BEGIN");
      const { rows: [current] } = await client.query("SELECT profile FROM users WHERE id = $1 FOR UPDATE", [id]);
      if (!current) throw new ApiError(404, "User not found.");
      const profile = { ...current.profile };
      if (update.billet !== undefined) profile.billet = update.billet;
      if (update.unit !== undefined) profile.unit = update.unit;
      if (update.roles !== undefined) profile.roles = rolesFor(update.roles);
      await client.query("UPDATE users SET profile = $2::jsonb, active = coalesce($3, active) WHERE id = $1",
        [id, JSON.stringify(profile), update.active ?? null]);
      // A deactivated account is signed out everywhere immediately.
      if (update.active === false) await client.query("DELETE FROM user_sessions WHERE user_id = $1", [id]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }

    const { rows: [user] } = await database().query(`SELECT ${USER_COLUMNS}
      FROM users u JOIN commands c ON c.id = u.command_id WHERE u.id = $1`, [id]);
    return Response.json({ user }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiFailure(error); }
}
