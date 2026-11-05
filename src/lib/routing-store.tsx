"use client";

// Draft content, approvals and routing configuration are server-backed. No fake
// actors or in-memory draft/release transitions are accepted as authority.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useStore } from "./store";
import { useCurrentUser } from "./current-user";
import type { ApiDraft, ApiRoutingEvent, DraftAction, RoutingConfiguration, RoutingPerson } from "./routing-api";
import type { CommandSettings, Person, ReleaseAuthority, RoutingWorkflow, WorkflowStep } from "./types";
import type { TemplateValues } from "./message-templates";

type Result = { ok: true } | { ok: false; reason: string; fields?: Record<string,string> };
interface RoutingStore {
  actorId: string;
  revision: number;
  drafts: ApiDraft[];
  events: ApiRoutingEvent[];
  workflows: RoutingWorkflow[];
  authorities: ReleaseAuthority[];
  settings: CommandSettings;
  people: RoutingPerson[];
  personById: (id?: string) => Person | undefined;
  personName: (id?: string) => string;
  loading: boolean;
  busy: boolean;
  error: string;
  refresh: () => Promise<void>;
  act: (draft: ApiDraft, action: DraftAction, comment?: string) => Promise<Result>;
  editDraft: (draft: ApiDraft, input: { subject: string; precedence: string; messageType: string; values: TemplateValues }) => Promise<Result>;
  saveDraftRoute: (draft: ApiDraft, steps: WorkflowStep[] | null) => Promise<Result>;
  saveWorkflow: (workflow: RoutingWorkflow, expectedRevision?: number) => Promise<Result>;
  toggleWorkflow: (id: string) => Promise<Result>;
  addAuthority: (authority: Omit<ReleaseAuthority,"id">) => Promise<Result>;
  removeAuthority: (id: string) => Promise<Result>;
  saveSettings: (settings: CommandSettings) => Promise<Result>;
}
const Context=createContext<RoutingStore|null>(null);
const EMPTY: RoutingConfiguration={revision:0,workflows:[],authorities:[],people:[],settings:{textCase:"mixed",sequencePrefix:"#",sequenceDigits:4,nextSequence:1}};
async function getSnapshot(signal?: AbortSignal) {
  const responses=await Promise.all([fetch("/api/routing",{cache:"no-store",signal}),fetch("/api/messages?view=drafts",{cache:"no-store",signal})]);
  const [config,desk]=await Promise.all(responses.map(async(response)=>{const data=await response.json();if(!response.ok)throw new Error(data.error||"Could not load routing data.");return data;}));
  return {config:config as RoutingConfiguration,drafts:desk.drafts as ApiDraft[],events:desk.events as ApiRoutingEvent[]};
}
export function RoutingProvider({children}:{children:ReactNode}) {
  const user=useCurrentUser();
  const {log,notify,refreshMessages}=useStore();
  const [config,setConfig]=useState(EMPTY);
  const [drafts,setDrafts]=useState<ApiDraft[]>([]);
  const [events,setEvents]=useState<ApiRoutingEvent[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const version=useRef(0);
  const pending=useRef(false);
  const apply=useCallback((data:Awaited<ReturnType<typeof getSnapshot>>)=>{setConfig(data.config);setDrafts(data.drafts);setEvents(data.events);setError("");setLoading(false);},[]);
  const refresh=useCallback(async()=>{
    const serial=++version.current;
    try { const data=await getSnapshot(); if(serial===version.current)apply(data); }
    catch(reason){if(serial===version.current){setError(reason instanceof Error?reason.message:"Could not refresh routing.");setLoading(false);}}
  },[apply]);
  useEffect(()=>{
    const controller=new AbortController(); const serial=++version.current;
    getSnapshot(controller.signal).then((data)=>{if(!controller.signal.aborted&&serial===version.current)apply(data);})
      .catch((reason)=>{if(!controller.signal.aborted&&serial===version.current){setError(reason instanceof Error?reason.message:"Could not load routing.");setLoading(false);}});
    const reload=()=>{if(!pending.current&&document.visibilityState==="visible")void refresh();};
    window.addEventListener("focus",reload); const timer=setInterval(reload,15000);
    return()=>{controller.abort();clearInterval(timer);window.removeEventListener("focus",reload);};
  },[apply,refresh]);
  const mutate=useCallback(async(url:string,body:unknown):Promise<Result>=>{
    if(pending.current)return{ok:false,reason:"An action is already being saved."};
    pending.current=true;setBusy(true);setError("");++version.current;
    try {
      const response=await fetch(url,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const data=await response.json();
      if(!response.ok){setError(data.error||"Action failed.");return{ok:false,reason:data.error||"Action failed.",fields:data.fields};}
      if(data.drafts){
        setDrafts((current)=>[...data.drafts,...current.filter((draft)=>!data.drafts.some((item:ApiDraft)=>item.id===draft.id))]);
        const ids=new Set(data.drafts.map((draft:ApiDraft)=>draft.id));
        setEvents((current)=>[...current.filter((event)=>!ids.has(event.draftId)),...data.events]);
      }else setConfig(data);
      notify("Saved to the API");
      log("Routing update",url,`Persisted ${String((body as {action?:string}).action??"configuration")}.`);
      await refresh(); void refreshMessages();
      return{ok:true};
    }catch(reason){const message=reason instanceof Error?reason.message:"Action failed.";setError(message);return{ok:false,reason:message};}
    finally{pending.current=false;setBusy(false);}
  },[log,notify,refresh,refreshMessages]);
  const store=useMemo<RoutingStore>(()=>{
    const save=(next:Partial<RoutingConfiguration>)=>mutate("/api/routing",{...config,...next});
    return{
      actorId:user.id,drafts,events,...config,loading,busy,error,refresh,
      personById:(id)=>config.people.find((person)=>person.id===id),
      personName:(id)=>config.people.find((person)=>person.id===id)?.name??"Unassigned",
      act:(draft,action,comment)=>mutate(`/api/messages/${draft.id}`,{action,revision:draft.revision,...(comment?{comment}:{})}),
      editDraft:(draft,input)=>mutate(`/api/messages/${draft.id}`,{action:"edit",revision:draft.revision,...input}),
      saveDraftRoute:(draft,steps)=>mutate(`/api/messages/${draft.id}`,{action:"route",revision:draft.revision,steps}),
      saveWorkflow:(workflow,expectedRevision)=>save({...(expectedRevision===undefined?{}:{revision:expectedRevision}),workflows:config.workflows.some((item)=>item.id===workflow.id)?config.workflows.map((item)=>item.id===workflow.id?workflow:item):[...config.workflows,workflow]}),
      toggleWorkflow:(id)=>save({workflows:config.workflows.map((item)=>item.id===id?{...item,active:!item.active}:item)}),
      addAuthority:(authority)=>mutate("/api/routing/designations",{revision:config.revision,authorities:[...config.authorities,{...authority,id:crypto.randomUUID()}]}),
      removeAuthority:(id)=>mutate("/api/routing/designations",{revision:config.revision,authorities:config.authorities.filter((item)=>item.id!==id)}),
      saveSettings:(settings)=>save({settings}),
    };
  },[user.id,drafts,events,config,loading,busy,error,refresh,mutate]);
  return<Context.Provider value={store}>{children}</Context.Provider>;
}
export function useRouting(){const value=useContext(Context);if(!value)throw new Error("useRouting must be used inside RoutingProvider");return value;}
