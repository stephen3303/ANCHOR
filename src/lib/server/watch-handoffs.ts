import "server-only";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { database } from "./db";
import { ApiError } from "./api-error";
import { hasRole, SYSTEM_ADMIN, REPORT_VIEWER, AUDITOR, RELEASE_AUTHORITY } from "../roles";
import type { AppUser } from "../users";
import { HANDOFF_CHECKS, HandoffInputError, assertTransition, expectedRevision, handoffObject, handoffText, incompleteChecks, isUUID, parseHandoffContent, watchPeriod, type HandoffContent, type HandoffIssue, type HandoffRecord, type WatchStation } from "../watch-handoff";

export const handoffAdmin = (u: AppUser) => hasRole(u, SYSTEM_ADMIN);
const commandReader = (u: AppUser) => handoffAdmin(u) || hasRole(u, REPORT_VIEWER) || hasRole(u, AUDITOR) || hasRole(u, RELEASE_AUTHORITY);
const COLUMNS = `id, station_id AS "stationId", station_name AS "stationName", team, outgoing_id AS "outgoingId", outgoing_name AS "outgoingName", incoming_id AS "incomingId", incoming_name AS "incomingName", watch_start AS "watchStart", watch_end AS "watchEnd", status, revision, previous_id AS "previousId", content, created_at AS "createdAt", updated_at AS "updatedAt", accepted_at AS "acceptedAt", acceptance_exceptions AS "acceptanceExceptions"`;
async function transaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await database().connect();
  try { await client.query("BEGIN"); const result = await run(client); await client.query("COMMIT"); return result; }
  catch (error) { await client.query("ROLLBACK"); if ((error as { code?: string }).code === "23505") throw new ApiError(409, "This station/team or an open handoff already exists. Refresh to see the current record."); throw error; }
  finally { client.release(); }
}
async function station(client: Pick<PoolClient,"query">, user: AppUser, id: string, lock = false) {
  if (!isUUID(id)) throw new ApiError(400, "Invalid station ID.");
  const { rows: [row] } = await client.query<WatchStation>(`SELECT s.id, s.name, s.team, s.active, s.command_visible AS "commandVisible", s.revision,
    EXISTS(SELECT 1 FROM watch_station_officers o WHERE o.station_id=s.id AND o.user_id=$2) AS assigned
    FROM watch_stations s WHERE s.id=$1 AND s.command_id=$3 ${lock ? "FOR UPDATE" : ""}`, [id,user.id,user.commandId]);
  if (!row || !(row.assigned || handoffAdmin(user) || (row.commandVisible && commandReader(user)))) throw new ApiError(404,"Watch station is not available to this account.");
  return row;
}
function assigned(s: WatchStation, active = true) {
  if (!s.assigned) throw new ApiError(403,"An administrator-assigned watch duty at this station is required. Selecting a Home view does not grant it.");
  if (active && !s.active) throw new ApiError(409,"This watch station is inactive.");
}
async function participant(client: PoolClient, stationId: string, commandId: string, id: unknown) {
  if (!isUUID(id)) throw new HandoffInputError("Choose an incoming officer.");
  const { rows: [row] } = await client.query<{id:string;name:string}>(`SELECT u.id,u.name FROM users u JOIN watch_station_officers o ON o.user_id=u.id
    WHERE o.station_id=$1 AND u.id=$2 AND u.command_id=$3 AND u.active FOR SHARE OF u`,[stationId,id,commandId]);
  if (!row) throw new ApiError(409,"The incoming officer must be active and officially assigned to this station.");
  return row;
}
async function event(client: PoolClient, user: AppUser, record: HandoffRecord, kind: string) {
  await client.query("INSERT INTO watch_handoff_events (handoff_id,kind,actor_id,actor_name,revision,snapshot) VALUES ($1,$2,$3,$4,$5,$6::jsonb)",[record.id,kind,user.id,user.name,record.revision,JSON.stringify(record)]);
}

export async function handoffOverview(user: AppUser, stationId?: string, page = 0) {
  const { rows: stations } = await database().query<WatchStation>(`SELECT s.id,s.name,s.team,s.active,s.command_visible AS "commandVisible",s.revision,
    EXISTS(SELECT 1 FROM watch_station_officers x WHERE x.station_id=s.id AND x.user_id=$2) AS assigned,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,'active',u.active) ORDER BY u.name)
      FROM watch_station_officers o JOIN users u ON u.id=o.user_id WHERE o.station_id=s.id AND u.command_id=s.command_id),'[]'::jsonb) AS officers
    FROM watch_stations s WHERE s.command_id=$1 AND ($3 OR EXISTS(SELECT 1 FROM watch_station_officers o WHERE o.station_id=s.id AND o.user_id=$2) OR (s.command_visible AND $4)) ORDER BY s.name,s.team`,[user.commandId,user.id,handoffAdmin(user),commandReader(user)]);
  const roster = handoffAdmin(user) ? (await database().query("SELECT id,name,active FROM users WHERE command_id=$1 AND active ORDER BY name",[user.commandId])).rows : [];
  let records: HandoffRecord[] = []; let total = 0;
  if (stationId) {
    if (!stations.some(s=>s.id===stationId)) throw new ApiError(404,"Watch station is not available to this account.");
    records = (await database().query<HandoffRecord>(`SELECT ${COLUMNS} FROM watch_handoffs WHERE station_id=$1 AND command_id=$2 ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET $3`,[stationId,user.commandId,page*20])).rows;
    total = Number((await database().query("SELECT count(*) FROM watch_handoffs WHERE station_id=$1 AND command_id=$2",[stationId,user.commandId])).rows[0].count);
  }
  return { stations,roster,canManage:handoffAdmin(user),records,total,page };
}
export async function configureStation(user: AppUser, payload: unknown, id?: string) {
  if (!handoffAdmin(user)) throw new ApiError(403,"Only System Admin can configure stations and assign official watch duties.");
  const body = handoffObject(payload,["name","team","active","commandVisible","officerIds","expectedRevision"]);
  const name = handoffText(body.name,"Station name",80,true); const team = handoffText(body.team,"Watch team",80,true);
  if (typeof body.active!=="boolean" || typeof body.commandVisible!=="boolean") throw new HandoffInputError("Supply station activity and command visibility.");
  if (!Array.isArray(body.officerIds) || body.officerIds.length<2 || body.officerIds.length>50 || body.officerIds.some(x=>!isUUID(x)) || new Set(body.officerIds).size!==body.officerIds.length) throw new HandoffInputError("Assign 2–50 distinct active officers from this command.");
  const officerIds=body.officerIds as string[];
  return transaction(async client=>{
    if (id) { const current=await station(client,user,id,true); if (current.revision!==expectedRevision(body.expectedRevision)) throw new ApiError(409,"Station assignments changed. Refresh before saving."); }
    const { rows: officers } = await client.query("SELECT id FROM users WHERE id=ANY($1::uuid[]) AND command_id=$2 AND active FOR SHARE",[officerIds,user.commandId]);
    if (officers.length!==officerIds.length) throw new HandoffInputError("All assigned officers must be active users of this command.");
    if (id && !body.active && (await client.query("SELECT 1 FROM watch_handoffs WHERE station_id=$1 AND status<>'Accepted'",[id])).rowCount) throw new ApiError(409,"Finish the open handoff before deactivating this station.");
    let stationId=id;
    if (id) await client.query("UPDATE watch_stations SET name=$2,team=$3,active=$4,command_visible=$5,revision=revision+1 WHERE id=$1",[id,name,team,body.active,body.commandVisible]);
    else stationId=(await client.query("INSERT INTO watch_stations (command_id,name,team,active,command_visible,created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",[user.commandId,name,team,body.active,body.commandVisible,user.id])).rows[0].id;
    await client.query("DELETE FROM watch_station_officers WHERE station_id=$1",[stationId]);
    await client.query("INSERT INTO watch_station_officers (station_id,user_id) SELECT $1,unnest($2::uuid[])",[stationId,officerIds]);
    await client.query("INSERT INTO watch_station_events (station_id,actor_id,actor_name,snapshot) VALUES ($1,$2,$3,$4::jsonb)",[stationId,user.id,user.name,JSON.stringify({name,team,active:body.active,commandVisible:body.commandVisible,officerIds:officerIds})]);
    return { stationId };
  });
}

export async function createHandoff(user: AppUser, payload: unknown) {
  const body=handoffObject(payload,["stationId","incomingId","watchStart","watchEnd"]);
  const period=watchPeriod(body.watchStart,body.watchEnd);
  return transaction(async client=>{
    const s=await station(client,user,String(body.stationId),true); assigned(s);
    if (body.incomingId===user.id) throw new HandoffInputError("Outgoing and incoming officers must be different people.");
    const incoming=await participant(client,s.id,user.commandId,body.incomingId);
    if ((await client.query("SELECT 1 FROM watch_handoffs WHERE station_id=$1 AND status<>'Accepted'",[s.id])).rowCount) throw new ApiError(409,"This station already has an open handoff. Open that record instead.");
    const previous=(await client.query<HandoffRecord>(`SELECT ${COLUMNS} FROM watch_handoffs WHERE station_id=$1 AND status='Accepted' ORDER BY accepted_at DESC,id DESC LIMIT 1`,[s.id])).rows[0];
    const content: HandoffContent={ narrative:"", checklist:Object.fromEntries(HANDOFF_CHECKS.map(c=>[c.id,false])), issues:(previous?.content.issues||[]).filter(i=>i.status!=="Resolved").map(i=>({...i,id:randomUUID(),carriedFrom:{handoffId:previous.id,issueId:i.id}})) };
    const record=(await client.query<HandoffRecord>(`INSERT INTO watch_handoffs (station_id,command_id,station_name,team,outgoing_id,outgoing_name,incoming_id,incoming_name,watch_start,watch_end,previous_id,content)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb) RETURNING ${COLUMNS}`,[s.id,user.commandId,s.name,s.team,user.id,user.name,incoming.id,incoming.name,period.watchStart,period.watchEnd,previous?.id||null,JSON.stringify(content)])).rows[0];
    await event(client,user,record,"Created"); return record;
  });
}

export async function handoffDetail(user: AppUser,id:string) {
  if (!isUUID(id)) throw new HandoffInputError("Invalid handoff ID.");
  const record=(await database().query<HandoffRecord>(`SELECT ${COLUMNS} FROM watch_handoffs WHERE id=$1 AND command_id=$2`,[id,user.commandId])).rows[0];
  if (!record) throw new ApiError(404,"Handoff not found.");
  const s=await station(database(),user,record.stationId);
  const events=(await database().query(`SELECT id,kind,actor_id AS "actorId",actor_name AS "actorName",at,revision,snapshot FROM watch_handoff_events WHERE handoff_id=$1 ORDER BY revision DESC`,[id])).rows;
  const corrections=(await database().query(`SELECT id,reason,text,author_name AS "authorName",at FROM watch_handoff_corrections WHERE handoff_id=$1 ORDER BY at,id`,[id])).rows;
  return { record,events,corrections,assigned:s.assigned,stationActive:s.active };
}

export async function changeHandoff(user:AppUser,id:string,payload:unknown) {
  if (!isUUID(id)) throw new HandoffInputError("Invalid handoff ID.");
  const body=handoffObject(payload,["action","expectedRevision","incomingId","watchStart","watchEnd","content","exceptions"]);
  const revision=expectedRevision(body.expectedRevision);
  if (!["save","ready","return","accept"].includes(String(body.action))) throw new HandoffInputError("Choose save, ready, return, or accept.");
  return transaction(async client=>{
    const identity=(await client.query("SELECT station_id FROM watch_handoffs WHERE id=$1 AND command_id=$2",[id,user.commandId])).rows[0];
    if (!identity) throw new ApiError(404,"Handoff not found.");
    const s=await station(client,user,identity.station_id,true);assigned(s);
    const current=(await client.query<HandoffRecord>(`SELECT ${COLUMNS} FROM watch_handoffs WHERE id=$1 FOR UPDATE`,[id])).rows[0];
    if (current.revision!==revision) throw new ApiError(409,"This handoff changed in another session. Your unsaved edits are retained; refresh deliberately before retrying.");
    // Authorization errors are not validation failures: an assigned colleague still cannot act for a participant.
    if (body.action==="accept" ? current.incomingId!==user.id : current.outgoingId!==user.id) throw new ApiError(403,"Only the designated outgoing/incoming officer can perform this transition.");
    assertTransition(current.status,String(body.action),user.id,current.outgoingId,current.incomingId);
    let content=current.content;let incomingId=current.incomingId;let incomingName=current.incomingName;let watchStart=current.watchStart;let watchEnd=current.watchEnd;
    let nextStatus=current.status;let exceptions:string|null=null;
    if (body.action==="save") {
      const parsed=parseHandoffContent(body.content);
      for (const old of current.content.issues) if (old.status!=="Resolved" && !parsed.issues.some(i=>i.id===old.id)) throw new HandoffInputError("Resolve recorded issues instead of silently removing them.");
      const issues:HandoffIssue[]=[];
      for (const input of parsed.issues) {
        const old=input.id?current.content.issues.find(i=>i.id===input.id):null;
        if (input.id&&!old) throw new HandoffInputError("Issue ID does not belong to this handoff.");
        let source:HandoffIssue["source"]=null;
        if (input.sourceMessageId) {
          const row=(await client.query("SELECT m.id,m.reference,a.sha256 FROM messages m JOIN message_artifacts a ON a.c2oix_id=m.c2oix_id WHERE m.id=$1",[input.sourceMessageId])).rows[0];
          if (!row) throw new HandoffInputError("Source messages must be saved, published records, not local/private drafts.");
          source=row;
        }
        issues.push({...input,id:old?.id||randomUUID(),lineageId:old?.lineageId||randomUUID(),carriedFrom:old?.carriedFrom||null,source});
      }
      content={...parsed,issues};
      const incoming=await participant(client,s.id,user.commandId,body.incomingId);
      if (incoming.id===user.id) throw new HandoffInputError("Incoming officer must be a different person.");
      incomingId=incoming.id;incomingName=incoming.name;
      ({watchStart,watchEnd}=watchPeriod(body.watchStart,body.watchEnd));
    } else if (body.action==="ready") {
      await participant(client,s.id,user.commandId,current.incomingId);nextStatus="Ready for review";
    } else if (body.action==="return") nextStatus="Draft";
    else {
      const note=handoffText(body.exceptions??"","Acceptance exceptions",2000);
      if (incompleteChecks(content).length&&!note) throw new HandoffInputError("Explain the incomplete checklist items before accepting with exceptions.");
      exceptions=note||null;nextStatus="Accepted";
    }
    const record=(await client.query<HandoffRecord>(`UPDATE watch_handoffs SET content=$2::jsonb,incoming_id=$3,incoming_name=$4,watch_start=$5,watch_end=$6,status=$7,revision=revision+1,
      accepted_at=CASE WHEN $7='Accepted' THEN clock_timestamp() ELSE NULL END,accepted_by=CASE WHEN $7='Accepted' THEN $8::uuid ELSE NULL END,acceptance_exceptions=$9
      WHERE id=$1 RETURNING ${COLUMNS}`,[id,JSON.stringify(content),incomingId,incomingName,watchStart,watchEnd,nextStatus,user.id,exceptions])).rows[0];
    await event(client,user,record,body.action==="save"?"Updated":body.action==="ready"?"Ready for review":body.action==="return"?"Returned to Draft":"Accepted");
    return record;
  });
}

export async function correctHandoff(user:AppUser,id:string,payload:unknown) {
  const body=handoffObject(payload,["reason","text"]);
  const reason=handoffText(body.reason,"Correction reason",500,true);const text=handoffText(body.text,"Correction text",4000,true);
  return transaction(async client=>{
    if (!isUUID(id)) throw new HandoffInputError("Invalid handoff ID.");
    const record=(await client.query<HandoffRecord>(`SELECT ${COLUMNS} FROM watch_handoffs WHERE id=$1 AND command_id=$2`,[id,user.commandId])).rows[0];
    if (!record) throw new ApiError(404,"Handoff not found.");
    const s=await station(client,user,record.stationId,true);assigned(s,false);
    if (record.status!=="Accepted") throw new ApiError(409,"Use the Draft workflow before acceptance; corrections apply to accepted handoffs.");
    if (![record.outgoingId,record.incomingId].includes(user.id)) throw new ApiError(403,"Only assigned participants may append corrections.");
    const correction=(await client.query(`INSERT INTO watch_handoff_corrections (handoff_id,reason,text,author_id,author_name) VALUES ($1,$2,$3,$4,$5) RETURNING id,reason,text,author_name AS "authorName",at`,[id,reason,text,user.id,user.name])).rows[0];
    return correction;
  });
}
