"use client";

import { Fragment, useState, type DragEvent } from "react";
import { Button } from "./ui";
import { fieldCls } from "./routing";
import { useRouting } from "@/lib/routing-store";
import { selectWorkflow } from "@/lib/routing";
import type { ApiDraft } from "@/lib/routing-api";
import type { WorkflowStep } from "@/lib/types";

const DRAG_TYPE = "application/x-anchor-routing-person";
const normalize = (steps: WorkflowStep[]): WorkflowStep[] => steps.map((step, index) => ({ ...step, action: index === steps.length - 1 ? "release" : "review" }));

export function DraftRoutingEditor({ draft, offline, onDone }: { draft: ApiDraft; offline: boolean; onDone: () => void }) {
  const routing = useRouting();
  const planned = selectWorkflow(routing.workflows, draft.type, draft.originator);
  const [steps, setSteps] = useState<WorkflowStep[]>(() => normalize((draft.route.length ? draft.route : planned?.steps ?? []).map(({ title, personId, action }) => ({ title, personId, action }))));
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const disabled = offline || routing.busy;
  const last = steps.at(-1);
  const eligible = !!last && routing.people.some((person) => person.id === last.personId && person.status === "present" && person.canRelease)
    && routing.authorities.some((authority) => authority.personId === last.personId && (!authority.scope.length || authority.scope.includes(draft.type)));
  const valid = steps.length > 0 && steps.length <= 20 && eligible && steps.every((step) => step.title.trim() && routing.personById(step.personId)?.status === "present");
  const addAt = (personId: string, target: number) => {
    const person = routing.personById(personId);
    if (disabled || !person || person.status !== "present") return;
    setSteps((current) => {
      const oldIndex = current.findIndex((step) => step.personId === personId);
      const item = oldIndex < 0 ? { personId, title: (person.position || person.name).slice(0, 200), action: "review" as const } : current[oldIndex];
      const next = current.filter((step) => step.personId !== personId);
      const index = oldIndex >= 0 && oldIndex < target ? target - 1 : target;
      next.splice(index, 0, item);
      return normalize(next);
    });
  };
  const start = (event: DragEvent, personId: string) => {
    event.dataTransfer.setData(DRAG_TYPE, personId);
    event.dataTransfer.effectAllowed = "copyMove";
  };
  const drop = (event: DragEvent, target: number) => {
    event.preventDefault(); event.stopPropagation();
    addAt(event.dataTransfer.getData(DRAG_TYPE), target);
  };
  const move = (index: number, offset: number) => setSteps((current) => {
    const next = [...current];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    return normalize(next);
  });
  const save = async (defaults = false) => {
    const result = await routing.saveDraftRoute(draft, defaults ? null : steps);
    if (result.ok) onDone(); else setError(result.reason);
  };
  return <div className="space-y-3">
    <p className="rounded bg-amber-50 p-3 text-sm text-amber-900">Saving changes stops any current review and clears all approvals. Resubmit afterward. The last person must be a designated release authority for this message type.</p>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <fieldset disabled={disabled} className="grid min-w-0 gap-4 lg:grid-cols-2">
      <legend className="sr-only">Draft routing editor</legend>
      <div className="space-y-2">
        <label className="block text-sm font-semibold">Command people<input aria-label="Find routing people" className={fieldCls} placeholder="Find a name or billet" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <p className="text-xs text-muted">Drag a person into a drop zone, or use Add. Move buttons also work with keyboard and touch.</p>
        <ul className="max-h-96 space-y-2 overflow-auto">{routing.people.filter((person) => person.status === "present" && `${person.name} ${person.position}`.toLowerCase().includes(query.toLowerCase())).map((person) => <li key={person.id} draggable={!disabled} onDragStart={(event) => start(event, person.id)} data-testid={`routing-person-${person.id}`} className="cursor-grab rounded border border-line bg-slate-50 p-2 text-sm">
          <div className="font-semibold">{person.name}</div><div className="text-xs text-muted">{person.position}</div>
          <Button size="sm" disabled={disabled || steps.some((step) => step.personId === person.id) || steps.length >= 20} onClick={() => addAt(person.id, steps.length)}>Add {person.name}</Button>
        </li>)}</ul>
      </div>
      <div>
        <h3 className="font-semibold">Proposed routing chain</h3>
        {Array.from({ length: steps.length + 1 }, (_, index) => <Fragment key={steps[index]?.personId ?? "end"}>
          <div data-testid={`route-drop-${index}`} onDragOver={(event) => { if (!disabled) event.preventDefault(); }} onDrop={(event) => drop(event, index)} className="my-2 min-h-8 rounded border border-dashed border-navy-300 p-1 text-center text-xs text-muted">Drop here · position {index + 1}</div>
          {steps[index] && <div draggable={!disabled} onDragStart={(event) => start(event, steps[index].personId)} className="space-y-2 rounded border border-line p-3 text-sm" data-testid={`route-step-${steps[index].personId}`}>
            <div className="font-semibold">{index + 1}. {routing.personName(steps[index].personId)} · {steps[index].action === "release" ? "Final release" : "Review"}</div>
            {routing.personById(steps[index].personId)?.status !== "present" && <p role="alert" className="text-red-700">This account is inactive or no longer in the command. Remove or replace it before saving.</p>}
            <label className="block">Step title<input aria-label={`Step ${index + 1} title`} className={fieldCls} maxLength={200} value={steps[index].title} onChange={(event) => setSteps((current) => current.map((step, position) => position === index ? { ...step, title: event.target.value } : step))} /></label>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" aria-label={`Move ${routing.personName(steps[index].personId)} up`} disabled={disabled || index === 0} onClick={() => move(index, -1)}>Move up</Button>
              <Button size="sm" aria-label={`Move ${routing.personName(steps[index].personId)} down`} disabled={disabled || index === steps.length - 1} onClick={() => move(index, 1)}>Move down</Button>
              <Button size="sm" aria-label={`Remove ${routing.personName(steps[index].personId)} from route`} onClick={() => setSteps((current) => normalize(current.filter((_, position) => position !== index)))}>Remove</Button>
            </div>
          </div>}
        </Fragment>)}
        {!eligible && <p role="status" className="text-sm text-amber-800">Add or move an eligible designated release authority to the final position.</p>}
        {steps.length > 20 && <p role="alert" className="text-sm text-red-700">A chain can contain at most 20 people.</p>}
      </div>
    </fieldset>
    <div className="flex flex-wrap gap-2">
      <Button variant="primary" disabled={disabled || !valid} onClick={() => void save()}>Save routing chain</Button>
      <Button disabled={disabled || !planned} onClick={() => void save(true)}>Use command default</Button>
      <Button disabled={routing.busy} onClick={onDone}>Cancel routing changes</Button>
    </div>
  </div>;
}
