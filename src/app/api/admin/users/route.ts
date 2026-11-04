import { connection } from "next/server";
import { rolesFor } from "@/lib/demo-users";
import { database } from "@/lib/server/db";
import { ApiError, apiFailure, readTemplatePayload } from "@/lib/server/template-api";
import { parseNewUser, requireUserAdmin, USER_COLUMNS } from "@/lib/server/user-admin";

const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  await connection();
  try {
    await requireUserAdmin();
    const { rows } = await database().query(`SELECT ${USER_COLUMNS}
      FROM users u JOIN commands c ON c.id = u.command_id ORDER BY u.active DESC, u.name, u.id`);
    return Response.json({ users: rows }, { headers: noStore });
  } catch (error) { return apiFailure(error); }
}

export async function POST(request: Request) {
  try {
    const admin = await requireUserAdmin(request);
    const input = parseNewUser(await readTemplatePayload(request));
    // New accounts join the admin's own command and inherit its display profile.
    const profile = {
      rank: input.rank, community: "", billet: input.billet, unit: input.unit,
      command: admin.command, location: admin.location, email: input.email, dsn: "",
      roles: rolesFor(input.roles), groups: [...new Set([admin.groups[0] ?? admin.commandName, input.unit])],
    };
    const pool = database();
    const { rows: [created] } = await pool.query(`INSERT INTO users (login, name, command_id, profile)
      VALUES ($1, $2, $3, $4::jsonb) ON CONFLICT DO NOTHING RETURNING id`,
      [input.login, input.name, admin.commandId, JSON.stringify(profile)]);
    if (!created) throw new ApiError(409, `The login ${input.login} is already taken.`);
    const { rows: [user] } = await pool.query(`SELECT ${USER_COLUMNS}
      FROM users u JOIN commands c ON c.id = u.command_id WHERE u.id = $1`, [created.id]);
    return Response.json({ user }, { status: 201, headers: noStore });
  } catch (error) { return apiFailure(error); }
}
