import test from 'node:test';
import assert from 'node:assert/strict';
import { MESSAGES } from './data';
import { parseWatchNote, watchSummary, WATCH_TEAMS, type WatchNote } from './watch-summary';
const end=Date.parse('2026-10-24T19:00:00Z'),start=end-24*3_600_000;
test('summary includes older unresolved work and inclusive deadline horizon without inferring responses',()=>{
  const base=MESSAGES[0];
  const older={...base,id:'older',source:'OTHER',received:new Date(start-1).toISOString(),ackRequired:true,ackDue:new Date(end+24*3_600_000).toISOString(),lifecycle:'ACTIVE' as const,actionItem:{text:'Send a report',assignedTo:'Duty officer',suspense:new Date(end-1).toISOString()}};
  const future={...older,id:'future',received:new Date(end+1).toISOString()};
  const expired={...older,id:'expired',lifecycle:'EXPIRED' as const};
  const result=watchSummary([older,future,expired],{},start,end,24,'OWN');
  assert.equal(result.traffic.length,0);assert.equal(result.acknowledgements.length,1);assert.equal(result.overdue.length,1);assert.equal(result.upcoming.length,1);assert(result.work.every(w=>w.carryover));assert(!result.work.some(w=>w.kind==='Response follow-up'));
  assert.equal(watchSummary([older],{older:{read:'read',acknowledgedAt:'2026-10-24T18:00:00Z'}},start,end,24,'OWN').acknowledgements.length,0);
  assert.equal(watchSummary([older],{},start,end,12,'OWN').upcoming.length,0);
});
test('note completion affects watch notes only and undated requirements remain visible',()=>{
  const note={id:'note',text:'Call duty officer',kind:'Response',status:'Open',owner:'',due:null,createdAt:new Date(start-1).toISOString(),updatedAt:new Date(end).toISOString()} as WatchNote;
  const result=watchSummary([],{},start,end,24,'OWN',[note]);assert.equal(result.undated.length,1);assert.equal(result.noteActivity.length,1);assert.equal(result.work[0].kind,'Response follow-up');
  assert.equal(watchSummary([],{},start,end,24,'OWN',[{...note,status:'Complete'}]).work.length,0);
});
test('notes require explicit kind/status and valid Zulu dates; teams are Tang, Wahoo, Bowfin',()=>{
  const content={text:'Follow up',kind:'Response',owner:'',due:'06 NOV 2026 0800Z',status:'Open',sourceMessageId:null};
  assert.equal(parseWatchNote(content).due,'2026-11-06T08:00:00.000Z');
  for(const invalid of [{...content,due:'31 FEB 2026 0800Z'},{...content,kind:'AI'},{...content,status:'Acknowledged'},{...content,actorId:'forged'},{...content,text:' '}])assert.throws(()=>parseWatchNote(invalid));
  assert.deepEqual(WATCH_TEAMS,['Tang','Wahoo','Bowfin']);
});
