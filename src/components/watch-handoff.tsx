"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ClipboardCheck, RefreshCw, Settings2 } from "lucide-react";
import { useCurrentUser } from "@/lib/current-user";
import { useStore } from "@/lib/store";
import { fmtDateTime, ZULU_DATETIME_PATTERN } from "@/lib/format";
import { Button, Check, Panel } from "@/components/ui";
import { HANDOFF_CHECKS, incompleteChecks, type HandoffRecord, type HandoffIssue, type IssueInput, type Officer, type WatchStation, type HandoffEvent, type HandoffCorrection } from "@/lib/watch-handoff";

type Overview={stations:WatchStation[];roster:Officer[];canManage:boolean;records:HandoffRecord[];total:number;page:number};
type Detail={record:HandoffRecord;events:HandoffEvent[];corrections:HandoffCorrection[];assigned:boolean;stationActive:boolean};
type Editor={incomingId:string;watchStart:string;watchEnd:string;content:{narrative:string;issues:IssueInput[];checklist:Record<string,boolean>}};
const input="mt-1 block w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink";
const link="text-left text-link hover:underline";
const messageOf=(e:unknown)=>e instanceof Error?e.message:"The request failed. No save was confirmed.";
async function api<T>(path:string,method="GET",body?:unknown):Promise<T> {
  const response=await fetch(path,{method,cache:"no-store",...(body===undefined?{}:{headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})});
  const data=await response.json();if(!response.ok)throw new Error(data.error||"Watch handoff request failed.");return data;
}
function issueInput(i:HandoffIssue):IssueInput {
  return {id:i.id,title:i.title,status:i.status,owner:i.owner,actionsTaken:i.actionsTaken,awaiting:i.awaiting,nextStep:i.nextStep,upcoming:i.upcoming,escalation:i.escalation,contacts:i.contacts,sourceMessageId:i.sourceMessageId};
}
function editRecord(record:HandoffRecord):Editor {
  return {incomingId:record.incomingId,watchStart:fmtDateTime(record.watchStart),watchEnd:fmtDateTime(record.watchEnd),content:{narrative:record.content.narrative,issues:record.content.issues.map(issueInput),checklist:{...record.content.checklist}}};
}
const newIssue=():IssueInput=>({id:null,title:"",status:"Open",owner:"",actionsTaken:"",awaiting:"",nextStep:"",upcoming:"",escalation:"",contacts:"",sourceMessageId:null});

export function WatchHandoff({active,openOnLoad,onOpenMessage}:{active:boolean;openOnLoad:boolean;onOpenMessage:(id:string)=>void}) {
  const user=useCurrentUser();const {messages,offline,watchNotes}=useStore();
  const [expanded,setExpanded]=useState(false);const [loaded,setLoaded]=useState(false);
  const [overview,setOverview]=useState<Overview|null>(null);const [stationId,setStationId]=useState("");
  const [detail,setDetail]=useState<Detail|null>(null);const [editor,setEditor]=useState<Editor|null>(null);
  const [dirty,setDirty]=useState(false);const [loading,setLoading]=useState(false);const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");const [notice,setNotice]=useState("");const [setup,setSetup]=useState(false);
  const [incoming,setIncoming]=useState("");const [watchStart,setWatchStart]=useState("");const [watchEnd,setWatchEnd]=useState("");
  const [exceptions,setExceptions]=useState("");const [correctionReason,setCorrectionReason]=useState("");const [correctionText,setCorrectionText]=useState("");
  const requestVersion=useRef(0);
  const selectedStation=overview?.stations.find(s=>s.id===stationId);const record=detail?.record;
  const canEdit=!!record&&record.status==="Draft"&&record.outgoingId===user.id&&!!selectedStation?.assigned&&!!selectedStation.active;
  const canAccept=!!record&&record.status==="Ready for review"&&record.incomingId===user.id&&!!selectedStation?.assigned&&!!selectedStation.active;
  const incomplete=record?incompleteChecks(record.content):[];
  const disabled=busy||loading||offline;
  const discard=()=>!dirty||window.confirm("Discard your unsaved handoff edits? The saved record will remain unchanged.");
  const apply=(next:Detail|null)=>{setDetail(next);setEditor(next?editRecord(next.record):null);setDirty(false);setExceptions("");setCorrectionReason("");setCorrectionText("");};
  const load=async(target=stationId,recordId?:string)=>{
    const version=++requestVersion.current;setLoading(true);setError("");
    try {
      let data=await api<Overview>(`/api/watch-handoffs${target?`?stationId=${target}`:""}`);
      const chosen=data.stations.some(s=>s.id===target)?target:(data.stations.find(s=>s.assigned&&s.active)||data.stations.find(s=>s.assigned)||data.stations[0])?.id||"";
      if(chosen&&chosen!==target)data=await api<Overview>(`/api/watch-handoffs?stationId=${chosen}`);
      const id=recordId||data.records[0]?.id;
      const next=id?await api<Detail>(`/api/watch-handoffs/${id}`):null;
      if(version!==requestVersion.current)return;
      setOverview(data);setStationId(chosen);apply(next);setLoaded(true);
    }catch(e){if(version===requestVersion.current)setError(messageOf(e));}
    finally{if(version===requestVersion.current)setLoading(false);}
  };
  useEffect(()=>{
    if(!active||loaded)return;
    const timer=setTimeout(()=>{void load();},0);return()=>clearTimeout(timer);
    // Initial load only. Explicit refresh is used afterwards to preserve unsaved edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[active,loaded]);
  useEffect(()=>{if(!openOnLoad)return;const timer=setTimeout(()=>setExpanded(true),0);return()=>clearTimeout(timer);},[openOnLoad]);
  const update=(next:Editor)=>{setEditor(next);setDirty(true);setNotice("");};
  const selectRecord=async(id:string)=>{if(!discard())return;setLoading(true);setError("");try{const next=await api<Detail>(`/api/watch-handoffs/${id}`);apply(next);setOverview(prev=>prev&&!prev.records.some(r=>r.id===next.record.id)?{...prev,records:[...prev.records,next.record]}:prev);}catch(e){setError(messageOf(e));}finally{setLoading(false);}};
  const mutate=async(action:string)=>{
    if(!record||!editor)return;setBusy(true);setError("");setNotice("");
    try{
      const next=await api<HandoffRecord>(`/api/watch-handoffs/${record.id}`,"PATCH",{action,expectedRevision:record.revision,...(action==="save"?editor:{}),...(action==="accept"?{exceptions}:{})});
      apply({...detail!,record:next});setNotice(action==="accept"?"Watch accepted. The original record is locked; corrections remain separate.":"Handoff saved on the server.");
      await load(stationId,next.id);
    }catch(e){setError(messageOf(e));}finally{setBusy(false);}
  };
  const create=async()=>{setBusy(true);setError("");setNotice("");try{const next=await api<HandoffRecord>("/api/watch-handoffs","POST",{stationId,incomingId:incoming,watchStart,watchEnd});setNotice("Draft created. Unresolved issues from this station’s latest accepted handoff were carried forward.");await load(stationId,next.id);setExpanded(true);}catch(e){setError(messageOf(e));}finally{setBusy(false);}};
  const appendCorrection=async()=>{if(!record)return;setBusy(true);setError("");try{await api(`/api/watch-handoffs/${record.id}/corrections`,"POST",{reason:correctionReason,text:correctionText});setNotice("Correction appended; the accepted record was not changed.");setCorrectionReason("");setCorrectionText("");await load(stationId,record.id);}catch(e){setError(messageOf(e));}finally{setBusy(false);}};
  const older=async()=>{if(!overview)return;setBusy(true);try{const next=await api<Overview>(`/api/watch-handoffs?stationId=${stationId}&page=${overview.page+1}`);setOverview({...next,records:[...overview.records,...next.records.filter(n=>!overview.records.some(p=>p.id===n.id))]});}catch(e){setError(messageOf(e));}finally{setBusy(false);}};
  const inProgress=overview?.records.some(r=>r.status!=="Accepted");

  return <section id="watch-handoff" hidden={!active} className="scroll-mt-4 rounded-xl border border-line bg-white shadow-sm" aria-label="Watch Handoff">
    <button className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left" aria-expanded={expanded} aria-controls="handoff-workspace" onClick={()=>setExpanded(!expanded)}>
      <span className="flex items-center gap-3"><span className="rounded-lg bg-navy-50 p-2 text-navy-800"><ClipboardCheck className="size-5" aria-hidden/></span><span><strong className="block text-base">Watch Handoff</strong><span className="block text-xs text-muted">{loading?"Loading saved handoff…":error&&!overview?"Storage unavailable · expand for details":record?`${record.stationName} · ${record.team} · ${record.status}`:"Notes, carryover, and acceptance for your watch team"}</span></span></span>
      <span className="flex items-center gap-3 text-xs">{record&&<span>{record.status==="Accepted"?`Accepted ${fmtDateTime(record.acceptedAt!)}`:`${incomplete.length} checklist items incomplete`}</span>}<ChevronDown className={`size-4 transition-transform ${expanded?"rotate-180":""}`} aria-hidden/></span>
    </button>
    <div id="handoff-workspace" hidden={!expanded} className="space-y-4 border-t border-line p-4">
      <p className="text-xs text-muted">Official station assignments control editing and acceptance. The Home view selector does not grant permission. Watch dates and saved timestamps use actual UTC/Zulu, independently of the message-demo clock.</p>
      {offline&&<p role="status" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">Offline mode: shown records may be stale. Reconnect before editing or accepting; formal acceptance is never queued locally.</p>}
      {error&&<p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {notice&&<p role="status" className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-900">{notice}</p>}
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1 text-sm font-semibold">Watch station / team<select aria-label="Watch station / team" className={input} value={stationId} disabled={busy||loading} onChange={e=>{if(discard())void load(e.target.value);}}><option value="">Select a station</option>{overview?.stations.map(s=><option key={s.id} value={s.id}>{s.name} · {s.team}{!s.active?" (inactive)":""}{!s.assigned?" · read only":""}</option>)}</select></label>
        <Button size="sm" icon={RefreshCw} disabled={busy||loading} onClick={()=>{if(discard())void load(stationId,record?.id);}}>Refresh handoff</Button>
        {overview?.canManage&&<Button size="sm" icon={Settings2} disabled={busy||loading} onClick={()=>{if(discard())setSetup(!setup);}}>Station setup</Button>}
      </div>
      {overview&&!overview.stations.length&&<p className="text-sm">No watch station is available to your account. {overview.canManage?"Use Station setup to create a station/team and explicitly assign at least two officers.":"Ask a System Admin to assign your watch station. Choosing Watch Officer on Home is not an official duty assignment."}</p>}
      {setup&&overview?.canManage&&<StationSetup stations={overview.stations} roster={overview.roster} disabled={disabled} onSaved={async(id)=>{setSetup(false);setNotice("Station assignments saved. This does not change message or release permissions.");await load(id);}}/>}

      {selectedStation&&<>
        <div className="flex flex-wrap gap-2 text-xs text-muted"><span>{selectedStation.assigned?"Official station duty assigned":"Read-only command visibility"}</span><span>· {selectedStation.officers.filter(o=>o.active).length} active assigned officers</span><span>· {selectedStation.commandVisible?"Authorized command readers may view":"Station members and System Admin only"}</span></div>
        {selectedStation.assigned&&selectedStation.active&&!inProgress&&<details className="rounded-lg border border-line p-3"><summary className="cursor-pointer text-sm font-semibold text-link">Start next handoff</summary><form className="mt-3 space-y-3" onSubmit={e=>{e.preventDefault();void create();}}><p className="text-xs text-muted">Outgoing officer: {user.name}. Unresolved issues inherit from this station’s latest accepted record; no message actions are duplicated here.</p><div className="grid gap-3 md:grid-cols-3"><label className="text-sm">Incoming officer<select required className={input} value={incoming} onChange={e=>setIncoming(e.target.value)}><option value="">Choose a different officer</option>{selectedStation.officers.filter(o=>o.active&&o.id!==user.id).map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label><ZuluInput label="Incoming watch starts (UTC)" value={watchStart} set={setWatchStart}/><ZuluInput label="Incoming watch ends (UTC)" value={watchEnd} set={setWatchEnd}/></div><Button type="submit" variant="primary" size="sm" disabled={disabled}>Create handoff draft</Button></form></details>}
        <label className="block text-sm">Saved handoff / history<select aria-label="Saved handoff / history" className={input} disabled={busy||loading} value={record?.id||""} onChange={e=>void selectRecord(e.target.value)}><option value="">No saved handoff</option>{overview?.records.map(r=><option key={r.id} value={r.id}>{fmtDateTime(r.watchStart)} · {r.outgoingName} → {r.incomingName} · {r.status}</option>)}</select></label>
        {overview&&overview.records.length<overview.total&&<button className={`${link} text-xs`} disabled={busy||loading} onClick={()=>void older()}>Load older handoffs ({overview.records.length} of {overview.total} shown)</button>}
      </>}

      {record&&editor&&<article className="space-y-4 rounded-lg border border-line p-3 sm:p-4" aria-label="Saved watch handoff">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{record.stationName} · {record.team}</h3><p className="mt-1 text-sm">{record.outgoingName} → {record.incomingName}</p><p className="mt-1 text-xs text-muted">Incoming watch: {fmtDateTime(record.watchStart)} → {fmtDateTime(record.watchEnd)}</p></div><span className="rounded bg-navy-50 px-2 py-1 text-xs font-semibold">{record.status} · revision {record.revision}</span></div>
        <p className="text-xs text-muted">Saved {fmtDateTime(record.updatedAt)}{dirty?" · UNSAVED changes — refresh/history selection will ask before discarding":" · Server record"}</p>
        {record.previousId&&<p className="text-xs">Inherited from <button className={link} disabled={disabled} onClick={()=>void selectRecord(record.previousId!)}>the previous accepted handoff (including its corrections/history)</button>.</p>}
        {canEdit?<div className="grid gap-3 md:grid-cols-3"><label className="text-sm">Designated incoming officer<select className={input} value={editor.incomingId} onChange={e=>update({...editor,incomingId:e.target.value})} disabled={disabled}>{selectedStation?.officers.filter(o=>o.active&&o.id!==user.id).map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label><ZuluInput label="Edit watch starts (UTC)" value={editor.watchStart} set={watchStart=>update({...editor,watchStart})} disabled={disabled}/><ZuluInput label="Edit watch ends (UTC)" value={editor.watchEnd} set={watchEnd=>update({...editor,watchEnd})} disabled={disabled}/></div>:null}
        <div><h4 className="mb-2 text-sm font-semibold">Outgoing-watch narrative</h4>{canEdit?<textarea aria-label="Outgoing-watch narrative" maxLength={8000} rows={3} disabled={disabled} className={input} value={editor.content.narrative} onChange={e=>update({...editor,content:{...editor.content,narrative:e.target.value}})}/>:<p className="whitespace-pre-wrap text-sm">{record.content.narrative||"No narrative recorded."}</p>}</div>
        <div><div className="mb-2 flex items-center justify-between gap-2"><h4 className="text-sm font-semibold">Issues &amp; next steps</h4>{canEdit&&<Button size="sm" disabled={disabled||editor.content.issues.length>=30} onClick={()=>update({...editor,content:{...editor.content,issues:[...editor.content.issues,newIssue()]}})}>Add handoff issue</Button>}</div>
          {(canEdit?editor.content.issues:record.content.issues).map((issue,index)=>{
            const saved=record.content.issues.find(i=>i.id===issue.id);
            const setIssue=(next:IssueInput)=>update({...editor,content:{...editor.content,issues:editor.content.issues.map((i,n)=>n===index?next:i)}});
            return <IssueCard key={issue.id||`new-${index}`} issue={issue} saved={saved} editable={canEdit} disabled={disabled} messages={messages} onChange={setIssue} onOpenMessage={onOpenMessage} onOpenHandoff={id=>void selectRecord(id)} onRemove={!issue.id?()=>update({...editor,content:{...editor.content,issues:editor.content.issues.filter((_,n)=>n!==index)}}):undefined}/>;
          })}
          {!editor.content.issues.length&&<p className="text-sm text-muted">No structured issues recorded. Confirm unresolved matters with the outgoing watch.</p>}
        </div>
        <div><h4 className="mb-2 text-sm font-semibold">Turnover checklist · {HANDOFF_CHECKS.filter(c=>!(canEdit?editor.content.checklist:record.content.checklist)[c.id]).length} incomplete</h4><fieldset disabled={!canEdit||disabled} aria-label="Turnover checklist" className="grid gap-x-4 sm:grid-cols-2">{[...HANDOFF_CHECKS].sort((a,b)=>Number((canEdit?editor.content.checklist:record.content.checklist)[a.id])-Number((canEdit?editor.content.checklist:record.content.checklist)[b.id])).map(c=><Check key={c.id} label={c.label} checked={!!(canEdit?editor.content.checklist:record.content.checklist)[c.id]} onChange={canEdit&&!disabled?checked=>update({...editor,content:{...editor.content,checklist:{...editor.content.checklist,[c.id]:checked}}}):undefined}/>)}</fieldset></div>
        {canEdit&&<div className="flex flex-wrap items-center gap-3"><Button variant="primary" size="sm" disabled={disabled||!dirty} onClick={()=>void mutate("save")}>Save handoff</Button><Button size="sm" disabled={disabled||dirty} onClick={()=>void mutate("ready")}>Mark ready for review</Button><span className="text-xs text-muted">Save edits before marking Ready. Incomplete checks require an acceptance explanation.</span></div>}
        {record.status==="Ready for review"&&record.outgoingId===user.id&&selectedStation?.assigned&&<Button size="sm" disabled={disabled} onClick={()=>void mutate("return")}>Return to Draft for edits</Button>}
        {canAccept&&<form className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3" onSubmit={e=>{e.preventDefault();void mutate("accept");}}><p className="text-sm font-semibold">Incoming officer: {user.name}</p><p className="text-xs">Acceptance records your review of this handoff, not message acknowledgement or completion of its tasks.</p><label className="block text-sm">Acceptance exceptions{incomplete.length?" (required)":" (optional)"}<textarea aria-label="Acceptance exceptions" required={incomplete.length>0} maxLength={2000} rows={3} className={input} value={exceptions} onChange={e=>setExceptions(e.target.value)} disabled={disabled}/></label>{incomplete.length>0&&<ul className="list-disc pl-5 text-xs">{incomplete.map(c=><li key={c.id}>{c.label}</li>)}</ul>}<Button type="submit" variant="primary" size="sm" disabled={disabled||!!incomplete.length&&!exceptions.trim()}>Accept watch{incomplete.length?" with exceptions":""}</Button></form>}
        {record.status==="Accepted"&&<div className="rounded border border-green-200 bg-green-50 p-3 text-sm"><p className="font-semibold">Accepted by {record.incomingName} · {fmtDateTime(record.acceptedAt!)}</p><p className="mt-1 whitespace-pre-wrap">Exceptions: {record.acceptanceExceptions||"None — all checklist items complete."}</p><p className="mt-1 text-xs">This record is locked. Later corrections are attributed entries below.</p></div>}
        {record.status==="Accepted"&&detail.assigned&&[record.incomingId,record.outgoingId].includes(user.id)&&<details><summary className="cursor-pointer text-sm text-link">Append a correction</summary><form className="mt-2 space-y-2" onSubmit={e=>{e.preventDefault();void appendCorrection();}}><label className="block text-sm">Correction reason<input required maxLength={500} className={input} value={correctionReason} onChange={e=>setCorrectionReason(e.target.value)} disabled={disabled}/></label><label className="block text-sm">Correction text<textarea required maxLength={4000} rows={3} className={input} value={correctionText} onChange={e=>setCorrectionText(e.target.value)} disabled={disabled}/></label><Button type="submit" size="sm" disabled={disabled||!correctionReason.trim()||!correctionText.trim()}>Save correction</Button></form></details>}
        <details><summary className="cursor-pointer text-sm text-link">Saved history &amp; corrections</summary><div className="mt-3 space-y-3">{detail.corrections.map(c=><div key={c.id} className="border-l-2 border-amber-300 pl-3 text-sm"><strong>Correction · {c.authorName} · {fmtDateTime(c.at)}</strong><p>Reason: {c.reason}</p><p className="whitespace-pre-wrap">{c.text}</p></div>)}{detail.events.map(e=><details key={e.id} className="text-sm"><summary className="cursor-pointer">{e.kind} · revision {e.revision} · {e.actorName} · {fmtDateTime(e.at)}</summary><div className="mt-2 rounded bg-slate-50 p-3"><p className="whitespace-pre-wrap">{e.snapshot.content.narrative||"No narrative."}</p><ul className="mt-2 space-y-2">{e.snapshot.content.issues.map(i=><li key={i.id}><strong>{i.title}</strong> · {i.status} · {i.owner||"Unassigned"}<p>Next: {i.nextStep||"Not recorded"}</p><p>Actions taken: {i.actionsTaken||"Not recorded"} · Awaiting: {i.awaiting||"Not recorded"}</p></li>)}</ul></div></details>)}</div></details>
      </article>}
      {watchNotes.length>0&&<details><summary className="cursor-pointer text-xs text-muted">Legacy in-memory watch notes (not formal station records)</summary><p className="mt-2 text-xs text-muted">Unassigned legacy/demo context only; author and time are unavailable. It is not silently copied into an accepted handoff.</p><ul className="mt-2 list-disc pl-5 text-xs">{watchNotes.map((n,i)=><li key={i}>{n}</li>)}</ul></details>}
    </div>
  </section>;
}

function ZuluInput({label,value,set,disabled=false}:{label:string;value:string;set:(value:string)=>void;disabled?:boolean}) {
  return <label className="text-sm">{label}<input required type="text" maxLength={30} pattern={ZULU_DATETIME_PATTERN} placeholder="05 NOV 2026 1900Z" title="DD MMM YYYY HHMMZ — 24-hour UTC/Zulu" className={input} value={value} disabled={disabled} onChange={e=>set(e.target.value.toUpperCase())}/></label>;
}
function IssueCard({issue,saved,editable,disabled,messages,onChange,onOpenMessage,onOpenHandoff,onRemove}:{issue:IssueInput;saved?:HandoffIssue;editable:boolean;disabled:boolean;messages:ReturnType<typeof useStore>["messages"];onChange:(issue:IssueInput)=>void;onOpenMessage:(id:string)=>void;onOpenHandoff:(id:string)=>void;onRemove?:()=>void}) {
  const fields=[{key:"owner",label:"Responsible owner"},{key:"nextStep",label:"Next required step"},{key:"actionsTaken",label:"Actions taken"},{key:"awaiting",label:"Response awaited"},{key:"upcoming",label:"Upcoming events / reports"},{key:"escalation",label:"Escalation guidance"},{key:"contacts",label:"Relevant contacts"}] as const;
  return <div className="mb-3 rounded-md border border-line p-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><strong>{issue.title||"New handoff issue"}</strong><span className="text-xs">{issue.status}{saved?.carriedFrom?" · CARRYOVER":""}</span></div>
    {editable?<label className="mt-2 block text-xs">Issue title<input required aria-label="Issue title" maxLength={250} className={input} disabled={disabled} value={issue.title} onChange={e=>onChange({...issue,title:e.target.value})}/></label>:<p className="mt-1">Next: {issue.nextStep||"Not recorded"} · {issue.owner||"Unassigned"}</p>}
    {saved?.carriedFrom&&<button className={`${link} mt-2 text-xs`} disabled={disabled} onClick={()=>onOpenHandoff(saved.carriedFrom!.handoffId)}>Open predecessor and issue history</button>}
    <details open={editable&&!issue.id?true:undefined} className="mt-2"><summary className="cursor-pointer text-xs text-link">Issue context &amp; source</summary>
      {editable?<><label className="mt-2 block text-xs">Issue status<select className={input} disabled={disabled} value={issue.status} onChange={e=>onChange({...issue,status:e.target.value as IssueInput["status"]})}>{["Open","Monitoring","Resolved"].map(s=><option key={s}>{s}</option>)}</select></label><div className="mt-2 grid gap-2 sm:grid-cols-2">{fields.map(({key,label})=><label key={key} className="text-xs">{label}<textarea rows={2} maxLength={key==="owner"?200:key==="contacts"?500:2000} className={input} disabled={disabled} value={issue[key]} onChange={e=>onChange({...issue,[key]:e.target.value})}/></label>)}</div><label className="mt-2 block text-xs">Source message<select className={input} disabled={disabled} value={issue.sourceMessageId||""} onChange={e=>onChange({...issue,sourceMessageId:e.target.value||null})}><option value="">No source linked</option>{messages.map(m=><option key={m.id} value={m.id}>{m.reference} · {m.subject}</option>)}</select></label></>:<dl className="mt-2 space-y-1">{fields.map(({key,label})=><div key={key}><dt className="inline font-semibold">{label}: </dt><dd className="inline whitespace-pre-wrap">{issue[key]||"Not recorded"}</dd></div>)}</dl>}
      {saved?.source&&<div className="mt-2 text-xs"><button className={link} onClick={()=>onOpenMessage(saved.source!.id)}>Open source · {saved.source.reference}</button><p className="mt-1 break-all text-muted">Saved artifact SHA-256: {saved.source.sha256}</p></div>}
      {onRemove&&<button className="mt-2 text-xs text-link underline" onClick={onRemove} disabled={disabled}>Remove unsaved issue</button>}
    </details>
  </div>;
}
function StationSetup({stations,roster,disabled,onSaved}:{stations:WatchStation[];roster:Officer[];disabled:boolean;onSaved:(id:string)=>Promise<void>}) {
  const [id,setId]=useState("");const [name,setName]=useState("");const [team,setTeam]=useState("");const [officers,setOfficers]=useState<string[]>([]);const [visible,setVisible]=useState(true);const [active,setActive]=useState(true);const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  const select=(id:string)=>{setId(id);const s=stations.find(s=>s.id===id);setName(s?.name||"");setTeam(s?.team||"");setOfficers(s?.officers.filter(o=>o.active).map(o=>o.id)||[]);setVisible(s?.commandVisible??true);setActive(s?.active??true);setError("");};
  return <Panel title="Station setup · System Admin"><form className="space-y-3" onSubmit={async e=>{e.preventDefault();setBusy(true);setError("");try{const result=await api<{stationId:string}>(`/api/watch-stations${id?`/${id}`:""}`,id?"PATCH":"POST",{name,team,officerIds:officers,active,commandVisible:visible,...(id?{expectedRevision:stations.find(s=>s.id===id)!.revision}:{})});await onSaved(result.stationId);}catch(e){setError(messageOf(e));}finally{setBusy(false);}}}>
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
    <label className="block text-sm">Configure station<select className={input} value={id} onChange={e=>select(e.target.value)} disabled={disabled||busy}><option value="">Create a new station / team</option>{stations.map(s=><option key={s.id} value={s.id}>{s.name} · {s.team}</option>)}</select></label>
    <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Station name<input required maxLength={80} className={input} value={name} onChange={e=>setName(e.target.value)} disabled={disabled||busy}/></label><label className="text-sm">Watch team<input required maxLength={80} className={input} value={team} onChange={e=>setTeam(e.target.value)} disabled={disabled||busy}/></label></div>
    <fieldset disabled={disabled||busy}><legend className="text-sm font-semibold">Official watch officers · select at least two</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{roster.map(o=><label key={o.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={officers.includes(o.id)} onChange={e=>setOfficers(e.target.checked?[...officers,o.id]:officers.filter(x=>x!==o.id))}/>{o.name}</label>)}</div></fieldset>
    <p className="text-xs text-muted">Assignments allow handoff participation only. They do not grant message administration, transmission, or release authority. Removing an outgoing officer from an open handoff may require restoring their duty before it can be edited.</p>
    <fieldset disabled={disabled||busy}><Check label="Allow authorized command readers (Report Viewer, Auditor, Release Authority)" checked={visible} onChange={disabled||busy?undefined:setVisible}/><Check label="Station active" checked={active} onChange={disabled||busy?undefined:setActive}/></fieldset>
    <Button type="submit" size="sm" variant="primary" disabled={disabled||busy||officers.length<2}>Save station assignments</Button>
  </form></Panel>;
}
