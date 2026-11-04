"use client";

// The Admin page's Routing & Release tab: routing workflows, release
// authority designations, and command transmission settings.
import { useState } from "react";
import { ArrowRight, GitBranch, Pencil, Plus, Save, Settings2, ShieldCheck, Trash2 } from "lucide-react";
import { HolderNote, PersonSelect, fieldCls } from "./routing";
import { Button, EmptyState, Panel, Pill, TextInput, Toggle, cx, tableWrap, td, th, theadRow, tbodyRow } from "./ui";
import { DRAFT_TYPES, OFFICES, OWN_ORIGINATOR, ROSTER_STATE, authorityScope, nextAssignment, personById, personName } from "@/lib/routing";
import { useRouting } from "@/lib/routing-store";
import type { CommandSettings, MessageType, RoutingWorkflow, WorkflowStep } from "@/lib/types";

const blankWorkflow = (): RoutingWorkflow => ({
  id: `wf-${Date.now().toString(36)}`,
  name: "",
  description: "",
  active: true,
  matchTypes: [],
  matchOriginators: [],
  matchOffices: [],
  steps: [
    { title: "", personId: "", action: "review" },
    { title: "", personId: "", action: "release" },
  ],
});

export function RoutingAdminPanel() {
  const { workflows, toggleWorkflow } = useRouting();
  const [editing, setEditing] = useState<RoutingWorkflow | null>(null);

  return (
    <>
      <div className="mb-4 grid gap-4 xl:grid-cols-2">
        <AuthorityPanel />
        <SettingsPanel />
      </div>

      <Panel
        title={`Routing Workflows (${workflows.length})`}
        icon={GitBranch}
        action={<Button size="sm" variant="primary" icon={Plus} disabled={!!editing} onClick={() => setEditing(blankWorkflow())}>New workflow</Button>}
      >
        <p className="mb-3 text-sm text-muted">
          A draft takes the most specific active chain that matches its drafting office, message type and originator. Every step is held by a person on the roster, and the chain must end at a release step.
        </p>
        {editing ? (
          <WorkflowEditor initial={editing} onDone={() => setEditing(null)} />
        ) : (
          <div className={tableWrap}>
            <table className="w-full min-w-[760px]">
              <thead>
                <tr className={theadRow}>
                  <th className={th}>Workflow</th>
                  <th className={th}>Matches</th>
                  <th className={th}>Chain</th>
                  <th className={th}>Active</th>
                  <th className={th}><span className="sr-only">Edit</span></th>
                </tr>
              </thead>
              <tbody>
                {workflows.map((w) => (
                  <tr key={w.id} className={cx(tbodyRow, !w.active && "opacity-60")}>
                    <td className={td}>
                      <div className="font-semibold">{w.name}</div>
                      <div className="text-xs text-muted">{w.description}</div>
                    </td>
                    <td className={td}>
                      <div>{w.matchTypes.length ? w.matchTypes.join(", ") : "Any type"}</div>
                      <div className="text-xs text-muted">{w.matchOriginators.length ? w.matchOriginators.join(", ") : "Any originator"}</div>
                      <div className="text-xs text-muted">{w.matchOffices.length ? `Office ${w.matchOffices.join(", ")}` : "Any office"}</div>
                    </td>
                    <td className={td}>
                      <div className="flex flex-wrap items-center gap-1 text-xs">
                        {w.steps.map((s, i) => {
                          const gone = personById(s.personId)?.status === "detached";
                          return (
                            <span key={i} className="inline-flex items-center gap-1">
                              {i > 0 && <ArrowRight className="size-3 text-muted" aria-hidden />}
                              <span className={cx("rounded px-1.5 py-0.5", s.action === "release" ? "bg-green-100 text-green-800" : "bg-navy-100 text-navy-800", gone && "ring-2 ring-red-400")}>
                                {s.title} · {personName(s.personId)}
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className={td}><Toggle label={`${w.name} active`} checked={w.active} onChange={() => toggleWorkflow(w.id)} /></td>
                    <td className={td}><Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(w)}>Edit</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

function WorkflowEditor({ initial, onDone }: { initial: RoutingWorkflow; onDone: () => void }) {
  const { saveWorkflow } = useRouting();
  const [w, setW] = useState(initial);
  const [originators, setOriginators] = useState(initial.matchOriginators.join(", "));
  const toggleOffice = (o: string) => set({ matchOffices: w.matchOffices.includes(o) ? w.matchOffices.filter((x) => x !== o) : [...w.matchOffices, o] });
  const set = (p: Partial<RoutingWorkflow>) => setW((x) => ({ ...x, ...p }));
  const setStep = (i: number, p: Partial<WorkflowStep>) => set({ steps: w.steps.map((s, j) => (j === i ? { ...s, ...p } : s)) });
  const toggleType = (t: MessageType) => set({ matchTypes: w.matchTypes.includes(t) ? w.matchTypes.filter((x) => x !== t) : [...w.matchTypes, t] });
  const hasRelease = w.steps.some((s) => s.action === "release");
  const canSave = w.name.trim() && w.steps.length > 0 && w.steps.every((s) => s.personId && s.title.trim()) && hasRelease;

  return (
    <div className="space-y-4 rounded-md border border-navy-600/40 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput label="Workflow name" value={w.name} onChange={(e) => set({ name: e.target.value })} placeholder="Force message release" />
        <TextInput label="Originators (blank = any)" value={originators} onChange={(e) => setOriginators(e.target.value)} placeholder={OWN_ORIGINATOR} />
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block font-semibold">Description</span>
          <textarea rows={2} className={fieldCls} value={w.description} onChange={(e) => set({ description: e.target.value })} placeholder="What this chain is for" />
        </label>
      </div>

      <fieldset>
        <legend className="mb-1 text-sm font-semibold">Message types (none selected = any type)</legend>
        <div className="flex flex-wrap gap-1.5">
          {DRAFT_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={w.matchTypes.includes(t)}
              onClick={() => toggleType(t)}
              className={cx("rounded border px-2 py-1 text-xs font-semibold", w.matchTypes.includes(t) ? "border-navy-600 bg-navy-600 text-white" : "border-line bg-white text-muted hover:border-navy-600/50")}
            >
              {t}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1 text-sm font-semibold">Drafting offices (none selected = any office)</legend>
        <div className="flex flex-wrap gap-1.5">
          {OFFICES.map((o) => (
            <button
              key={o.code}
              type="button"
              aria-pressed={w.matchOffices.includes(o.code)}
              onClick={() => toggleOffice(o.code)}
              className={cx("rounded border px-2 py-1 text-xs font-semibold", w.matchOffices.includes(o.code) ? "border-navy-600 bg-navy-600 text-white" : "border-line bg-white text-muted hover:border-navy-600/50")}
            >
              {o.code} · {o.name}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-semibold">Routing chain</legend>
        {w.steps.map((s, i) => (
          <div key={i} className="rounded-md border border-line bg-navy-50/60 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm">
              <span className="flex size-6 items-center justify-center rounded-full bg-navy-800 text-xs font-bold text-white">{i + 1}</span>
              <span className="text-muted">{s.action === "release" ? "Release step" : "Review step"}</span>
              {w.steps.length > 1 && (
                <button type="button" className="ml-auto rounded p-1 text-red-600 hover:bg-red-50" aria-label={`Remove step ${i + 1}`} onClick={() => set({ steps: w.steps.filter((_, j) => j !== i) })}>
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_180px]">
              <TextInput value={s.title} onChange={(e) => setStep(i, { title: e.target.value })} placeholder="Step name, e.g. N3 review" aria-label={`Step ${i + 1} name`} />
              <select className={fieldCls} value={s.action} onChange={(e) => setStep(i, { action: e.target.value as WorkflowStep["action"] })} aria-label={`Step ${i + 1} action`}>
                <option value="review">Review and endorse</option>
                <option value="release">Release authority</option>
              </select>
              <PersonSelect className="sm:col-span-2" value={s.personId} onChange={(personId) => setStep(i, { personId })} placeholder="Who holds this step" />
            </div>
            <p className="mt-1.5 text-xs text-muted">{s.personId ? <HolderNote personId={s.personId} /> : "Nobody holds this step yet. Pick the person from the roster."}</p>
          </div>
        ))}
        <Button size="sm" icon={Plus} onClick={() => set({ steps: [...w.steps, { title: "", personId: "", action: "review" }] })}>Add step</Button>
      </fieldset>

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <Button
          variant="primary"
          icon={Save}
          disabled={!canSave}
          onClick={() => {
            saveWorkflow({ ...w, name: w.name.trim(), matchOriginators: originators.split(",").map((o) => o.trim().toUpperCase()).filter(Boolean) });
            onDone();
          }}
        >
          Save workflow
        </Button>
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        {!hasRelease && <span className="text-sm font-semibold text-orange-700">This chain has no release step, so nothing would reach a release authority.</span>}
      </div>
    </div>
  );
}

function AuthorityPanel() {
  const { authorities, addAuthority, removeAuthority } = useRouting();
  const [personId, setPersonId] = useState("");
  const [scope, setScope] = useState<"all" | MessageType>("all");
  const [office, setOffice] = useState("all");
  const [error, setError] = useState("");

  const add = () => {
    const p = personById(personId);
    if (!p) return setError("Pick a person from the roster.");
    if (p.status === "detached") return setError(`${p.rank} ${p.name} is detached from the command. Designate their relief.`);
    if (authorities.some((a) => a.personId === p.id && (scope === "all" ? !a.scope.length : a.scope.includes(scope)) && (office === "all" ? !a.offices.length : a.offices.includes(office))))
      return setError(`${p.rank} ${p.name} already holds that designation.`);
    setError("");
    addAuthority({ personId: p.id, designation: p.position, isCommandingOfficer: /^commander$/i.test(p.position), scope: scope === "all" ? [] : [scope], offices: office === "all" ? [] : [office] });
    setPersonId("");
    setScope("all");
    setOffice("all");
  };

  return (
    <Panel title="Release Authority" icon={ShieldCheck} bodyClassName="p-0">
      <ul className="divide-y divide-line/70">
        {authorities.map((a) => {
          const p = personById(a.personId);
          return (
            <li key={a.id} className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1 text-sm">
                <div className="font-semibold">
                  {personName(a.personId)}
                  {a.isCommandingOfficer && <Pill className="ml-2 bg-navy-100 text-navy-800">Commander</Pill>}
                </div>
                <div className="text-xs text-muted">{a.designation} · {authorityScope(a)}</div>
                {p && p.status !== "present" && (
                  <div className={cx("text-xs font-semibold", ROSTER_STATE[p.status].className)}>
                    {p.status === "detached" ? "Detached from the command. Nothing can be released under this designation until it is re-held." : "On leave. Confirm the covering watchstander before a release."}
                  </div>
                )}
              </div>
              <Button size="sm" variant="ghost" aria-label={`Remove ${personName(a.personId)}`} onClick={() => removeAuthority(a.id)}><Trash2 className="size-4 text-red-600" /></Button>
            </li>
          );
        })}
        {!authorities.length && <li><EmptyState>No release authority designated. Nothing can be released until one is set.</EmptyState></li>}
      </ul>
      <div className="space-y-3 border-t border-line bg-navy-50/60 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <PersonSelect label="Person on the roster" value={personId} onChange={setPersonId} />
          <label className="block text-sm">
            <span className="mb-1 block font-semibold">May release</span>
            <select className={fieldCls} value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
              <option value="all">All message types</option>
              {DRAFT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-semibold">From office</span>
            <select className={fieldCls} value={office} onChange={(e) => setOffice(e.target.value)}>
              <option value="all">Any office</option>
              {OFFICES.map((o) => <option key={o.code} value={o.code}>{o.code} · {o.name}</option>)}
            </select>
          </label>
        </div>
        {error && <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>}
        <Button variant="primary" icon={Plus} onClick={add}>Designate release authority</Button>
      </div>
    </Panel>
  );
}

function SettingsPanel() {
  const { settings, saveSettings } = useRouting();
  const [s, setS] = useState<CommandSettings>(settings);
  const next = nextAssignment(s);
  return (
    <Panel title="Command Transmission Settings" icon={Settings2}>
      <p className="mb-3 text-sm text-muted">One record governs every message the command transmits. The sequence is assigned once, at release, in release order.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-semibold">Text case</span>
          <select className={fieldCls} value={s.textCase} onChange={(e) => setS({ ...s, textCase: e.target.value as CommandSettings["textCase"] })}>
            <option value="upper">Capitals: every message set in capitals</option>
            <option value="mixed">As typed: capitalisation transmits unchanged</option>
          </select>
        </label>
        <TextInput label="Sequence prefix" value={s.sequencePrefix} maxLength={4} onChange={(e) => setS({ ...s, sequencePrefix: e.target.value })} />
        <TextInput label="Sequence digits" type="number" min={1} max={8} value={s.sequenceDigits} onChange={(e) => setS({ ...s, sequenceDigits: Number(e.target.value) })} />
        <TextInput label="Next sequence number" type="number" min={1} value={s.nextSequence} onChange={(e) => setS({ ...s, nextSequence: Number(e.target.value) })} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button variant="primary" icon={Save} onClick={() => saveSettings({ ...s, sequenceDigits: Math.min(8, Math.max(1, Math.trunc(s.sequenceDigits) || 4)), nextSequence: Math.max(1, Math.trunc(s.nextSequence) || 1) })}>Save settings</Button>
        <span className="text-sm text-muted">Next release takes <span className="font-mono font-semibold text-ink">{next.localSequence}</span></span>
      </div>
    </Panel>
  );
}
