import 'server-only';
import { database } from './db';
import { ApiError } from './api-error';
import type { AppUser } from '../users';
import { assigned, handoffAdmin, handoffOverview, station, transaction } from './watch-handoffs';
import { expectedRevision, handoffObject, handoffText, HandoffInputError, isUUID } from '../watch-handoff';
import { noteScope, parseWatchNote, WATCH_TEAMS, type WatchNote } from '../watch-summary';
const columns = `id, station_id AS "stationId", creator_id AS "creatorId", content, revision, updated_name AS "updatedBy", updated_at AS "updatedAt", created_at AS "createdAt"`;
type Row = Omit<WatchNote,'text'|'kind'|'owner'|'due'|'status'|'sourceMessageId'|'sourceReference'> & {content: WatchNote};
const unpack = ({content,...row}: Row) => ({...content,...row});
async function visible(user:AppUser,id:string,lock=false,client=database() as Pick<ReturnType<typeof database>,'query'>) {
  if(!isUUID(id))throw new HandoffInputError('Invalid action ID.');
  const row=(await client.query<Row>(`SELECT ${columns} FROM watch_actions WHERE id=$1 AND command_id=$2 ${lock?'FOR UPDATE':''}`,[id,user.commandId])).rows[0];
  if(!row)throw new ApiError(404,'Action unavailable.');
  if(row.stationId)await station(client,user,row.stationId,lock);
  else if(row.creatorId!==user.id)throw new ApiError(404,'Action unavailable.');
  return row;
}
export async function listWatchActions(user:AppUser) {
  const {stations}=await handoffOverview(user);
  const result=await database().query<Row>(`SELECT ${columns} FROM watch_actions WHERE command_id=$1 AND ((station_id IS NULL AND creator_id=$2) OR station_id=ANY($3::uuid[])) ORDER BY updated_at DESC,id LIMIT 501`,[user.commandId,user.id,stations.map(s=>s.id)]);
  return {stations,actions:result.rows.slice(0,500).map(unpack),truncated:result.rows.length>500};
}
export async function watchActionHistory(user:AppUser,id:string) {
  await visible(user,id);
  return (await database().query(`SELECT revision,actor_name AS "actorName",at,snapshot FROM watch_action_events WHERE action_id=$1 ORDER BY revision DESC`,[id])).rows;
}
export async function saveWatchAction(user:AppUser,payload:unknown,id?:string) {
  const b=handoffObject(payload,id?['expectedRevision','content']:['stationId','content']);
  const content=parseWatchNote(b.content);
  return transaction(async client=>{
    // Lock station before the action, matching station assignment edits.
    const initial=id?await visible(user,id):null;
    const stationId=initial?initial.stationId:noteScope(b.stationId);
    if(stationId)assigned(await station(client,user,stationId,true));
    const previous=id?await visible(user,id,true,client):null;
    if(previous&&previous.revision!==expectedRevision(b.expectedRevision))throw new ApiError(409,'This action changed. Your text is preserved; cancel and refresh before editing again.');
    let sourceReference:string|null=null;
    if(content.sourceMessageId){
      const source=(await client.query('SELECT reference FROM messages WHERE id=$1',[content.sourceMessageId])).rows[0];
      if(!source)throw new HandoffInputError('Choose a published source message.');
      sourceReference=source.reference;
    }
    const savedContent={...content,sourceReference};
    const row=id?(await client.query<Row>(`UPDATE watch_actions SET content=$2::jsonb,revision=revision+1,updated_by=$3,updated_name=$4,updated_at=clock_timestamp() WHERE id=$1 RETURNING ${columns}`,[id,JSON.stringify(savedContent),user.id,user.name])).rows[0]
      :(await client.query<Row>(`INSERT INTO watch_actions(command_id,station_id,creator_id,content,updated_by,updated_name) VALUES($1,$2,$3,$4::jsonb,$3,$5) RETURNING ${columns}`,[user.commandId,stationId,user.id,JSON.stringify(savedContent),user.name])).rows[0];
    await client.query('INSERT INTO watch_action_events(action_id,revision,actor_id,actor_name,snapshot) VALUES($1,$2,$3,$4,$5::jsonb)',[row.id,row.revision,user.id,user.name,JSON.stringify(savedContent)]);
    return unpack(row);
  });
}
export async function createRotatingTeams(user:AppUser,payload:unknown){
  if(!handoffAdmin(user))throw new ApiError(403,'Only System Admin assigns official watch teams.');
  const b=handoffObject(payload,['name','teams']);const name=handoffText(b.name,'Station name',80,true);
  const teams=handoffObject(b.teams,[...WATCH_TEAMS]);
  for(const team of WATCH_TEAMS){const ids=teams[team];if(!Array.isArray(ids)||ids.length<2||ids.length>50||ids.some(id=>!isUUID(id))||new Set(ids).size!==ids.length)throw new HandoffInputError(`Assign 2–50 distinct active officers to ${team}.`);}
  return transaction(async client=>{
    const stationIds:string[]=[];
    for(const team of WATCH_TEAMS){
      const ids=teams[team] as string[];
      const officers=await client.query('SELECT id FROM users WHERE id=ANY($1::uuid[]) AND command_id=$2 AND active FOR SHARE',[ids,user.commandId]);
      if(officers.rows.length!==ids.length)throw new HandoffInputError('Officers must be active members of this command.');
      const id=(await client.query('INSERT INTO watch_stations(command_id,name,team,created_by) VALUES($1,$2,$3,$4) RETURNING id',[user.commandId,name,team,user.id])).rows[0].id;
      await client.query('INSERT INTO watch_station_officers(station_id,user_id) SELECT $1,unnest($2::uuid[])',[id,ids]);
      await client.query('INSERT INTO watch_station_events(station_id,actor_id,actor_name,snapshot) VALUES($1,$2,$3,$4::jsonb)',[id,user.id,user.name,JSON.stringify({name,team,active:true,commandVisible:true,officerIds:ids})]);stationIds.push(id);
    }
    return {stationIds};
  });
}
