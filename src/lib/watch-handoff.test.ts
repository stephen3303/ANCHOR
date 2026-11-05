import assert from "node:assert/strict";
import test from "node:test";
import { HANDOFF_CHECKS, assertTransition, expectedRevision, handoffObject, incompleteChecks, parseHandoffContent, parseWatchTime, watchPeriod, type HandoffContent } from "./watch-handoff";
const checklist=Object.fromEntries(HANDOFF_CHECKS.map(c=>[c.id,false]));

test('watch times are valid, explicit UTC/Zulu and ordered',()=>{
  assert.equal(parseWatchTime('29 FEB 2028 2359Z'),'2028-02-29T23:59:00.000Z');
  for(const value of ['31 FEB 2026 1200Z','01 JAN 2026 2460Z','2026-11-05T19:00','05 NOV 2026 1900','00 NOV 2026 1900Z'])assert.throws(()=>parseWatchTime(value));
  assert.throws(()=>watchPeriod('05 NOV 2026 1900Z','05 NOV 2026 1900Z'));
  assert.throws(()=>watchPeriod('06 NOV 2026 1900Z','05 NOV 2026 1900Z'));
});
test('server inputs reject forged fields, invalid revisions and missing checklist values',()=>{
  assert.throws(()=>handoffObject({actorId:'forged'},['content']));
  for(const revision of [0,-1,1.5,'1',null])assert.throws(()=>expectedRevision(revision));
  assert.equal(expectedRevision(2),2);
  assert.throws(()=>parseHandoffContent({narrative:'',issues:[],checklist:{}}));
  assert.equal(parseHandoffContent({narrative:'  Watch notes  ',issues:[],checklist}).narrative,'Watch notes');
});
test('unassigned owners and missing optional context stay explicit and incomplete checks stay enumerable',()=>{
  const issue={id:null,title:'Follow up',status:'Open',owner:'',actionsTaken:'',awaiting:'',nextStep:'',upcoming:'',escalation:'',contacts:'',sourceMessageId:null};
  const result=parseHandoffContent({narrative:'',issues:[issue],checklist});
  assert.equal(result.issues[0].owner,'');
  assert.equal(result.issues[0].sourceMessageId,null);
  assert.throws(()=>parseHandoffContent({narrative:'',issues:[{...issue,lineageId:'forged'}],checklist}));
  assert.equal(incompleteChecks({...result,issues:[]} as HandoffContent).length,HANDOFF_CHECKS.length);
});
test('only the appropriate participant may move the record through the lifecycle',()=>{
  assert.doesNotThrow(()=>assertTransition('Draft','save','out','out','in'));
  assert.doesNotThrow(()=>assertTransition('Draft','ready','out','out','in'));
  assert.doesNotThrow(()=>assertTransition('Ready for review','accept','in','out','in'));
  assert.doesNotThrow(()=>assertTransition('Ready for review','return','out','out','in'));
  assert.throws(()=>assertTransition('Draft','accept','in','out','in'));
  assert.throws(()=>assertTransition('Ready for review','save','out','out','in'));
  assert.throws(()=>assertTransition('Ready for review','accept','out','out','in'));
  for(const action of ['save','ready','return','accept'])assert.throws(()=>assertTransition('Accepted',action,'in','out','in'));
});
