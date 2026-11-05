import { COMMAND_SEARCH_PAGE_SIZE } from "@/lib/command-search";
import { connection } from "next/server";
import { database } from "@/lib/server/db";
import { ApiError, apiFailure } from "@/lib/server/template-api";

export async function GET(request: Request) {
  await connection();
  try {
    const parameters = new URL(request.url).searchParams;
    const query = (parameters.get("q") ?? "").trim();
    const cursor = parameters.get("cursor") ?? "0";
    if (query.length > 100 || !/^\d{1,7}$/.test(cursor)) throw new ApiError(400, "Invalid search or pagination cursor.");
    const pool = database();
    const { rowCount } = await pool.query(`SELECT id FROM reference_sources WHERE key = 'recipient-commands' AND contract_version = 1 AND enabled`);
    if (!rowCount) throw new ApiError(409, "The command directory source is disabled.");
    const offset = Number(cursor);
    const { rows } = await pool.query(`SELECT id, name FROM commands
      WHERE strpos(lower(name), lower($1)) > 0 ORDER BY name, id LIMIT $3 OFFSET $2`, [query, offset, COMMAND_SEARCH_PAGE_SIZE + 1]);
    return Response.json({ commands: rows.slice(0, COMMAND_SEARCH_PAGE_SIZE), nextCursor: rows.length > COMMAND_SEARCH_PAGE_SIZE ? String(offset + COMMAND_SEARCH_PAGE_SIZE) : null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiFailure(error); }
}
