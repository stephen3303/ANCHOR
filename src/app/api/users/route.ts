import { connection } from "next/server";
import { database } from "@/lib/server/db";
import { apiFailure } from "@/lib/server/template-api";
import { requireDemoLoginEnabled } from "@/lib/server/session";

export async function GET() {
  await connection();
  try {
    requireDemoLoginEnabled();
    const { rows } = await database().query(`SELECT u.id, u.login, u.name, c.name AS "commandName"
      FROM users u JOIN commands c ON c.id = u.command_id WHERE u.active ORDER BY u.name, u.id`);
    return Response.json({ users: rows }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiFailure(error); }
}
