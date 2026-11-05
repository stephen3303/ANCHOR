import type { Message, MessageUserState } from './types';
import { currentMessage, actionDeadline, changesInWindow } from './watch-workspace';
import { handoffObject, handoffText, HandoffInputError, isUUID, parseWatchTime } from './watch-handoff';

export const WATCH_TEAMS = ['Tang', 'Wahoo', 'Bowfin'] as const;
export type WatchNoteInput = { text: string; kind: 'Task' | 'Response'; owner: string; due: string | null; status: 'Open' | 'In progress' | 'Blocked' | 'Complete'; sourceMessageId: string | null };
export type WatchNote = WatchNoteInput & { id: string; stationId: string | null; creatorId: string; revision: number; updatedBy: string; updatedAt: string; createdAt: string; sourceReference: string | null };
export type WatchNoteEvent = { revision: number; actorName: string; at: string; snapshot: WatchNoteInput };
export function parseWatchNote(value: unknown): WatchNoteInput {
  const b = handoffObject(value, ['text','kind','owner','due','status','sourceMessageId']);
  if (!['Task','Response'].includes(String(b.kind)) || !['Open','In progress','Blocked','Complete'].includes(String(b.status))) throw new HandoffInputError('Choose an action kind and status.');
  if (b.sourceMessageId !== null && (typeof b.sourceMessageId !== 'string' || b.sourceMessageId.length > 150 || !b.sourceMessageId)) throw new HandoffInputError('Choose a published source.');
  return { text: handoffText(b.text,'Action notes',8000,true), kind: b.kind as WatchNoteInput['kind'], owner: handoffText(b.owner,'Owner',200), due: b.due === null || b.due === '' ? null : parseWatchTime(b.due), status: b.status as WatchNoteInput['status'], sourceMessageId: b.sourceMessageId as string|null };
}
export function noteScope(value: unknown): string|null {
  if (value !== null && !isUUID(value)) throw new HandoffInputError('Choose a team or Personal.');
  return value as string|null;
}
export function watchSummary(messages: Message[], states: Record<string, MessageUserState>, start: number, end: number, horizon: number, ownSource: string, notes: WatchNote[] = []) {
  const known = messages.filter(m => Date.parse(m.received) <= end);
  const traffic = known.filter(m => Date.parse(m.received) >= start);
  const counts: Record<string,number> = {};
  for (const m of traffic) counts[m.subscriptionType || m.type] = (counts[m.subscriptionType || m.type] || 0) + 1;
  const active = known.filter(currentMessage);
  const acknowledgements = active.filter(m => m.ackRequired && m.source !== ownSource && !states[m.id]?.acknowledgedAt);
  const requirements = active.filter(m => m.actionItem);
  const work = [
    ...acknowledgements.map(m => ({ id:`${m.id}:ack`, text:`Acknowledge ${m.reference}`, kind:'Acknowledgement', sourceId:m.id, owner:'Message Admin', ...actionDeadline(m.ackDue), carryover:Date.parse(m.received)<start })),
    ...requirements.map(m => ({ id:`${m.id}:task`, text:m.actionItem!.text, kind:'Recorded requirement', sourceId:m.id, owner:m.actionItem!.assignedTo || 'Unassigned', ...actionDeadline(m.actionItem!.suspense), carryover:Date.parse(m.received)<start })),
    ...notes.filter(n => n.status !== 'Complete').map(n => ({ id:n.id,text:n.text,kind:n.kind === 'Response'?'Response follow-up':'Internal task',sourceId:n.sourceMessageId,owner:n.owner||'Unassigned',due:n.due?Date.parse(n.due):null,dateOnly:false,carryover:Date.parse(n.createdAt)<start })),
  ].sort((a,b)=>(a.due??Infinity)-(b.due??Infinity));
  return { traffic, counts, changes:changesInWindow(messages,start,end), acknowledgements, requirements, work,
    overdue:work.filter(a=>a.due!==null&&a.due<end), upcoming:work.filter(a=>a.due!==null&&a.due>=end&&a.due<=end+horizon*3_600_000), undated:work.filter(a=>a.due===null),
    noteActivity:notes.filter(n=>Date.parse(n.updatedAt)>=start&&Date.parse(n.updatedAt)<=end) };
}
