"use client";

import { useState } from "react";
import { ArrowRight, CornerUpLeft, FilePenLine, Plus, Send, XCircle } from "lucide-react";
import { ActAs, HolderNote, fieldCls } from "@/components/routing";
import { DraftRoutingEditor } from "@/components/draft-routing-editor";
import { DraftComposer } from "@/components/draft-composer";
import { Button, EmptyState, PageHeader, Panel, Pill, PrecedenceBadge, Tabs, cx } from "@/components/ui";
import { hasOverlongMessageLine } from "@/lib/message-format";
import { fmtDateTime } from "@/lib/format";
import { DRAFT_STATUS, STEP_STATUS, currentStep, selectWorkflow } from "@/lib/routing";
import { useRouting } from "@/lib/routing-store";
import { useStore } from "@/lib/store";
import type { ApiDraft } from "@/lib/routing-api";
import type { RoutingEventType } from "@/lib/types";

type Filter = "all" | "mine" | "waiting" | "released";
const EVENTS: Record<RoutingEventType,string> = {created:"Created",submitted:"Submitted",advanced:"Endorsed",returned:"Returned",revised:"Revised",released:"Released",withdrawn:"Withdrawn"};
export default function DraftingPage() {
  const routing = useRouting();
  const { drafts, actorId } = routing;
  const [filter,setFilter] = useState<Filter>("all");
  const [selected,setSelected] = useState<string|null>(null);
  const [creating,setCreating] = useState(false);
  const waiting = (draft: ApiDraft) => draft.status === "in_routing" && currentStep(draft)?.personId === actorId;
  const rows = drafts.filter((draft) => filter === "all" || (filter === "mine" && draft.drafterId === actorId) || (filter === "waiting" && waiting(draft)) || (filter === "released" && draft.status === "released"));
  const draft = rows.find((item) => item.id === selected) ?? rows[0];
  return <>
    <PageHeader icon={FilePenLine} title="Drafting & Release" subtitle="Template-based drafts and approvals saved to the API. Messages become visible in the message list only after release."
      actions={<><ActAs /><Button variant="primary" icon={Plus} disabled={routing.loading || routing.busy} onClick={() => setCreating(true)}>New Draft</Button></>} />
    {routing.error && <p role="alert" className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-red-800">{routing.error} <Button size="sm" onClick={() => void routing.refresh()}>Refresh routing</Button></p>}
    {routing.loading && <p role="status">Loading persisted drafts and command routing…</p>}
    <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
      <Panel title={`Drafts (${rows.length})`} bodyClassName="p-0">
        <div className="px-3 pt-2"><Tabs tabs={[{id:"all",label:"All"},{id:"waiting",label:`Waiting on me (${drafts.filter(waiting).length})`},{id:"mine",label:"My drafts"},{id:"released",label:"Released"}]} active={filter} onChange={(value) => {setFilter(value);setCreating(false);}} /></div>
        {rows.length ? <ul className="max-h-[720px] divide-y divide-line/70 overflow-y-auto">{rows.map((item) => <li key={item.id}>
          <button type="button" onClick={() => {setSelected(item.id);setCreating(false);}} className={cx("block w-full px-4 py-3 text-left",!creating && draft?.id === item.id ? "bg-navy-100/70":"hover:bg-navy-50")}>
            <div className="flex flex-wrap gap-1.5"><Pill className={DRAFT_STATUS[item.status].className}>{DRAFT_STATUS[item.status].label}</Pill><PrecedenceBadge p={item.precedence} />{waiting(item) && <Pill className="bg-navy-700 text-white">Your action</Pill>}</div>
            <div className="mt-1 text-sm font-semibold">{item.subject}</div>
            <div className="text-xs text-muted">{item.templateName} · {item.drafterName}{currentStep(item) && ` · with ${routing.personName(currentStep(item)?.personId)}`}</div>
          </button>
        </li>)}</ul> : <EmptyState>{routing.loading ? "Loading…" : "No drafts in this view."}</EmptyState>}
      </Panel>
      {creating ? <div><div className="mb-3 flex justify-end"><Button onClick={() => setCreating(false)}>Cancel new draft</Button></div><DraftComposer onSaved={(id) => {setSelected(id);setFilter("all");setCreating(false);}} /></div>
        : draft ? <Workspace key={draft.id} draft={draft} /> : <Panel><EmptyState>Start a new draft from a published template.</EmptyState></Panel>}
    </div>
  </>;
}

function Workspace({draft}: {draft: ApiDraft}) {
  const routing = useRouting();
  const { offline } = useStore();
  const [editing,setEditing] = useState<ApiDraft | null>(null);
  const [comment,setComment] = useState("");
  const [editingRoute,setEditingRoute] = useState<ApiDraft | null>(null);
  const owner = draft.drafterId === routing.actorId;
  const editable = owner && draft.status !== "released";
  const canSubmit = editable && draft.status !== "in_routing" && (draft.route.length > 0 || !!selectWorkflow(routing.workflows,draft.type,draft.originator));
  const step = currentStep(draft);
  const myStep = draft.status === "in_routing" && step?.personId === routing.actorId;
  const planned = selectWorkflow(routing.workflows,draft.type,draft.originator);
  const history = routing.events.filter((event) => event.draftId === draft.id);
  const act = async (action: "submit"|"advance"|"return"|"release"|"withdraw") => {
    if (offline) return;
    const result = await routing.act(draft,action,comment);
    if (result.ok) {setComment("");setEditing(null);}
  };
  if (editing && editable) return <div className="space-y-3"><Button disabled={routing.busy} onClick={() => setEditing(null)}>Cancel edits</Button>{editing.revision !== draft.revision && <p role="alert" className="rounded bg-amber-50 p-3 text-sm">The draft changed while you were editing. Your inputs are preserved, but saving the old revision will be rejected. <Button disabled={routing.busy} onClick={() => setEditing(draft)}>Reload latest version (discard edits)</Button></p>}<DraftComposer key={`${editing.id}:${editing.revision}`} draft={editing} onSaved={() => setEditing(null)} /></div>;
  return <div className="space-y-4">
    <Panel title={draft.subject}>
      <div className="mb-3 flex flex-wrap gap-2"><Pill className={DRAFT_STATUS[draft.status].className}>{DRAFT_STATUS[draft.status].label}</Pill><PrecedenceBadge p={draft.precedence} /><span className="text-sm">{draft.type} · {draft.templateName} version {draft.templateVersion} · Revision {draft.revision}</span></div>
      <p className="text-sm text-muted">Drafted by {draft.drafterName} · Saved {fmtDateTime(draft.updated)} · Sender {draft.originator}</p>
      {draft.status === "released" ? <div className="mt-3 rounded bg-green-50 p-3 text-sm text-green-900"><p>Released in ANCHOR: {draft.localSequence} · {draft.dtg}</p><p>Now visible in Messages. External transmission has not been performed by this workflow.</p><Button className="mt-2" href={`/messages/${draft.id}`}>View released message</Button></div>
        : <p className="mt-3 rounded bg-amber-50 p-3 text-sm text-amber-900">Not released or transmitted. Hidden from the Messages list. The drafter can edit until publication. Saving text or routing changes stops review and clears all approvals; resubmit afterward.</p>}
      <pre className="mt-4 max-h-[640px] overflow-auto whitespace-pre-wrap break-words rounded border border-line bg-slate-50 p-4 font-mono text-sm">{draft.renderedText}</pre>
      {draft.status !== "released" && hasOverlongMessageLine(draft.renderedText ?? "") && <p role="alert" className="mt-3 rounded bg-amber-50 p-3 text-sm text-amber-900">This older draft has lines over 69 characters. The drafter must save edits to apply wrapping and obtain fresh approvals before publication.</p>}
      {offline && <p role="alert" className="mt-3 text-red-700">Reconnect before saving or acting. Approval actions are never queued offline.</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        {editable && <Button disabled={routing.busy || offline || !!editingRoute} onClick={() => setEditing(draft)}>Edit template fields</Button>}
        {canSubmit && <Button variant="primary" icon={ArrowRight} disabled={routing.busy || offline || !!editingRoute} onClick={() => void act("submit")}>Submit for routing</Button>}
        {owner && !["released","withdrawn"].includes(draft.status) && <Button icon={XCircle} disabled={routing.busy || offline || !!editingRoute} onClick={() => void act("withdraw")}>Withdraw</Button>}
      </div>
      {editable && <p className="mt-2 text-sm text-muted">{draft.route.length ? "Resubmission uses this saved chain and requires fresh approval at every step." : planned ? `Submission uses ${planned.name}. Customize the routing chain below if needed.` : "No matching default workflow. Customize a routing chain below; the final holder must be a designated release authority."}</p>}
      {myStep && !editingRoute && <div className="mt-4 space-y-3 border-t border-line pt-4">
        <p className="text-sm font-semibold">Your action: {step.title}</p>
        <label className="block text-sm font-semibold">Review comment (required when returning)<textarea aria-label="Review comment" className={fieldCls} rows={2} maxLength={2000} value={comment} disabled={routing.busy} onChange={(event) => setComment(event.target.value)} /></label>
        <div className="flex gap-2"><Button variant="primary" icon={step.action === "release" ? Send:ArrowRight} disabled={routing.busy || offline} onClick={() => void act(step.action === "release" ? "release":"advance")}>{step.action === "release" ? "Release message":"Endorse and advance"}</Button><Button icon={CornerUpLeft} disabled={routing.busy || offline || !comment.trim()} onClick={() => void act("return")}>Return for correction</Button></div>
      </div>}
    </Panel>
    <Panel title="Routing chain">
      <p className="mb-3 text-sm text-muted">Only the signed-in account holding the current step can act. Admin access does not bypass approvals.</p>
      {editable && !editingRoute && <Button className="mb-3" disabled={routing.busy || offline} onClick={() => setEditingRoute(draft)}>Customize routing</Button>}
      {editingRoute && editable ? <div className="space-y-3">{editingRoute.revision !== draft.revision && <p role="alert" className="rounded bg-amber-50 p-3 text-sm">The draft changed. Your proposed chain is preserved, but saving the old revision will be rejected. <Button disabled={routing.busy} onClick={() => setEditingRoute(draft)}>Reload latest routing (discard changes)</Button></p>}<DraftRoutingEditor key={`${editingRoute.id}:${editingRoute.revision}`} draft={editingRoute} offline={offline} onDone={() => setEditingRoute(null)} /></div> : draft.route.length ? <ol className="space-y-3">{draft.route.map((entry) => <li key={entry.order} className="rounded border border-line p-3 text-sm"><div className="flex gap-2"><span className="font-semibold">{entry.order}. {entry.title}</span><Pill className={STEP_STATUS[entry.status].className}>{STEP_STATUS[entry.status].label}</Pill></div><HolderNote personId={entry.personId} />{entry.actedAt && <p className="text-xs text-muted">{fmtDateTime(entry.actedAt)}{entry.comment && ` · ${entry.comment}`}</p>}</li>)}</ol>
        : planned ? <ol className="space-y-2">{planned.steps.map((entry,index) => <li key={index} className="text-sm">{index+1}. {entry.title} · {routing.personName(entry.personId)} · {entry.action}</li>)}</ol> : <p className="text-sm text-muted">No configured route.</p>}
    </Panel>
    <Panel title="Saved approval history">
      {history.length ? <ol className="space-y-3">{[...history].reverse().map((event) => <li key={event.id} className="border-b border-line pb-2 text-sm"><div className="font-semibold">{EVENTS[event.type]} · {event.actorName}{event.stepTitle && ` · ${event.stepTitle}`}</div><p>{event.comment}</p><p className="text-xs text-muted" title={event.snapshotHash}>{fmtDateTime(event.at)} · Revision {event.revision} · Snapshot {event.snapshotHash.slice(0,12)}</p>{event.routeSnapshot?.length > 0 && <details className="mt-1 text-xs"><summary className="cursor-pointer">Routing snapshot</summary><ol>{event.routeSnapshot.map((step) => <li key={step.order}>{step.order}. {step.title} · {routing.personName(step.personId)} · {step.status}</li>)}</ol></details>}</li>)}</ol> : <p className="text-sm text-muted">No recorded actions yet.</p>}
    </Panel>
  </div>;
}
