"use client";

import { useMemo, useState } from "react";
import { ArrowRight, CornerUpLeft, FilePenLine, Plus, Send, ShieldCheck, Trash2, TriangleAlert, XCircle } from "lucide-react";
import { ActAs, HolderNote, fieldCls } from "@/components/routing";
import { Button, EmptyState, PageHeader, Panel, Pill, PrecedenceBadge, Tabs, TextInput, cx } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { PRECEDENCE_OBJECTIVE, categoryOf, precedenceAdvisory } from "@/lib/message-types";
import {
  DRAFT_STATUS,
  DRAFT_TYPES,
  OFFICES,
  STEP_STATUS,
  currentStep,
  isEditable,
  personName,
  releaseGate,
  renderMessage,
  selectWorkflow,
  strandedSteps,
} from "@/lib/routing";
import { useRouting } from "@/lib/routing-store";
import { useStore } from "@/lib/store";
import type { Classification, Draft, MessageType, Precedence, RoutingEventType } from "@/lib/types";

type Filter = "all" | "mine" | "waiting" | "released";

const PRECEDENCES: Precedence[] = ["ROUTINE", "PRIORITY", "IMMEDIATE", "FLASH"];
const CLASSIFICATIONS: Classification[] = ["UNCLASSIFIED", "CUI"];

const EVENT_LABEL: Record<RoutingEventType, string> = {
  created: "Created",
  submitted: "Submitted",
  advanced: "Endorsed",
  returned: "Returned",
  revised: "Revised",
  released: "Released",
  withdrawn: "Withdrawn",
};

const splitList = (v: string) => v.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);

export default function DraftingPage() {
  const { drafts, actorId, createDraft } = useRouting();
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<string | null>(drafts[0]?.id ?? null);

  const waitingOnMe = (d: Draft) => d.status === "in_routing" && currentStep(d)?.personId === actorId;
  const counts = {
    mine: drafts.filter((d) => d.drafterId === actorId && d.status !== "released" && d.status !== "withdrawn").length,
    waiting: drafts.filter(waitingOnMe).length,
  };
  const rows = drafts.filter((d) =>
    filter === "all" ? true : filter === "mine" ? d.drafterId === actorId : filter === "waiting" ? waitingOnMe(d) : d.status === "released",
  );
  const draft = drafts.find((d) => d.id === selected) ?? null;

  return (
    <>
      <PageHeader
        icon={FilePenLine}
        title="Drafting & Release"
        subtitle="Draft outgoing COMSUBLANT traffic, route it through the chain the command defined, and release it."
        actions={
          <>
            <ActAs />
            <Button variant="primary" icon={Plus} onClick={() => setSelected(createDraft())}>New Draft</Button>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
        <Panel title={`Drafts (${rows.length})`} bodyClassName="p-0">
          <div className="px-3 pt-2">
            <Tabs
              tabs={[
                { id: "all", label: "All" },
                { id: "waiting", label: `Waiting on me (${counts.waiting})` },
                { id: "mine", label: `My drafts (${counts.mine})` },
                { id: "released", label: "Released" },
              ]}
              active={filter}
              onChange={setFilter}
            />
          </div>
          {rows.length ? (
            <ul className="max-h-[640px] divide-y divide-line/70 overflow-y-auto">
              {rows.map((d) => {
                const step = currentStep(d);
                return (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(d.id)}
                      className={cx("block w-full px-4 py-3 text-left", d.id === selected ? "bg-navy-100/70" : "hover:bg-navy-50")}
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Pill className={DRAFT_STATUS[d.status].className}>{DRAFT_STATUS[d.status].label}</Pill>
                        <PrecedenceBadge p={d.precedence} />
                        {waitingOnMe(d) && <Pill className="bg-navy-700 text-white">Your action</Pill>}
                      </div>
                      <div className="mt-1 text-sm font-semibold text-ink">{d.subject || "Untitled draft"}</div>
                      <div className="text-xs text-muted">
                        {d.type} · {d.localSequence ?? `drafted by ${personName(d.drafterId)}`}
                        {step && ` · with ${personName(step.personId)}`}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState>Nothing here.</EmptyState>
          )}
        </Panel>

        {draft ? <Workspace key={draft.id} draft={draft} /> : <Panel><EmptyState>Select a draft, or start a new one.</EmptyState></Panel>}
      </div>
    </>
  );
}

function Workspace({ draft: d }: { draft: Draft }) {
  const r = useRouting();
  const { offline } = useStore();
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");

  const canEdit = isEditable(d) && d.drafterId === r.actorId;
  const edit = (patch: Partial<Draft>) => r.updateDraft(d.id, patch);
  const step = currentStep(d);
  const preview = useMemo(() => (isEditable(d) ? selectWorkflow(r.workflows, d.type, d.originator, d.office) : null), [d, r.workflows]);
  const stranded = preview ? strandedSteps(preview.steps) : [];
  const gate = releaseGate(r.authorities, r.actorId, d);
  const holdsStep = step?.personId === r.actorId;
  const text = d.renderedText ?? renderMessage(d, r.settings);
  const events = r.events.filter((e) => e.draftId === d.id).slice().reverse();

  const run = (res: { ok: true } | { ok: false; reason: string }) => {
    setError(res.ok ? "" : res.reason);
    if (res.ok) setComment("");
  };

  return (
    <div className="grid gap-4 2xl:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <Panel
          title={d.subject || "Untitled draft"}
          action={<Pill className={DRAFT_STATUS[d.status].className}>{DRAFT_STATUS[d.status].label}</Pill>}
        >
          <p className="mb-3 text-sm text-muted">
            {DRAFT_STATUS[d.status].hint}
            {isEditable(d) && d.drafterId !== r.actorId && ` Only ${personName(d.drafterId)} can edit it.`}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput label="Subject" className="sm:col-span-2" value={d.subject} disabled={!canEdit} onChange={(e) => edit({ subject: e.target.value })} placeholder="What this message is about" />
            <label className="block text-sm">
              <span className="mb-1 block font-semibold">Message type</span>
              <select className={fieldCls} value={d.type} disabled={!canEdit} onChange={(e) => edit({ type: e.target.value as MessageType })}>
                {DRAFT_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
            <TextInput label="Originator" value={d.originator} disabled />
            <label className="block text-sm">
              <span className="mb-1 block font-semibold">Drafting office</span>
              <select className={fieldCls} value={d.office} disabled={!canEdit} onChange={(e) => edit({ office: e.target.value })}>
                {OFFICES.map((o) => <option key={o.code} value={o.code}>{o.code} · {o.name}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-semibold">Precedence</span>
              <select className={fieldCls} value={d.precedence} disabled={!canEdit} onChange={(e) => edit({ precedence: e.target.value as Precedence })}>
                {PRECEDENCES.map((p) => <option key={p}>{p}</option>)}
              </select>
              <span className="mt-1 block text-xs text-muted">
                {categoryOf(d.type)} · objective {PRECEDENCE_OBJECTIVE[d.precedence].label.toLowerCase()}
              </span>
              {precedenceAdvisory(d.type, d.precedence) && <span className="mt-1 block text-xs font-semibold text-amber-800">{precedenceAdvisory(d.type, d.precedence)}</span>}
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-semibold">Classification</span>
              <select className={fieldCls} value={d.classification} disabled={!canEdit} onChange={(e) => edit({ classification: e.target.value as Classification })}>
                {CLASSIFICATIONS.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <ListInput label="Action addressees (TO)" value={d.to} disabled={!canEdit} onChange={(to) => edit({ to })} placeholder="ALSUBLANT, COMSUBRON SIX" />
            <ListInput label="Info addressees" value={d.info} disabled={!canEdit} onChange={(info) => edit({ info })} placeholder="COMSUBFOR NORFOLK VA" />
          </div>

          <fieldset className="mt-4">
            <legend className="mb-1 text-sm font-semibold">Paragraphs</legend>
            <div className="space-y-2">
              {d.paragraphs.map((p, i) => (
                <div key={i} className="flex gap-2">
                  <span className="mt-2 w-6 shrink-0 text-right font-mono text-sm text-muted">{i + 1}.</span>
                  <textarea
                    rows={2}
                    className={fieldCls}
                    value={p}
                    disabled={!canEdit}
                    aria-label={`Paragraph ${i + 1}`}
                    onChange={(e) => edit({ paragraphs: d.paragraphs.map((x, j) => (j === i ? e.target.value : x)) })}
                  />
                  {canEdit && d.paragraphs.length > 1 && (
                    <button type="button" className="mt-1 self-start rounded p-1.5 text-red-600 hover:bg-red-50" aria-label={`Remove paragraph ${i + 1}`} onClick={() => edit({ paragraphs: d.paragraphs.filter((_, j) => j !== i) })}>
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {canEdit && <Button size="sm" icon={Plus} className="mt-2" onClick={() => edit({ paragraphs: [...d.paragraphs, ""] })}>Add paragraph</Button>}
          </fieldset>
        </Panel>

        <Panel title="Message as it transmits">
          <pre className="max-w-[88ch] overflow-x-auto whitespace-pre-wrap rounded-md bg-slate-50 p-3 font-mono text-[13px] leading-relaxed text-ink">{text}</pre>
          <p className="mt-2 text-xs text-muted">
            {d.status === "released"
              ? `Frozen at release ${d.releasedAt ? fmtDateTime(d.releasedAt) : ""}. Changes must go out as a corrected copy or an update.`
              : "The DTG, serial and local sequence are assigned at release, in release order. Never on a draft."}
          </p>
        </Panel>
      </div>

      <div className="space-y-4">
        <Panel title="Routing">
          {isEditable(d) && (
            <div className="space-y-3">
              {preview ? (
                <div className="rounded-md border border-line bg-navy-50 px-3 py-2.5 text-sm">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted">Route to be applied</div>
                  <div className="font-semibold">{preview.name}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted">
                    {preview.steps.map((s, i) => (
                      <span key={i} className="inline-flex items-center gap-1">
                        {i > 0 && <ArrowRight className="size-3" aria-hidden />}
                        {s.title}
                        {s.action === "release" && " (release)"}
                      </span>
                    ))}
                  </div>
                  {stranded.length > 0 && (
                    <p className="mt-2 rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-800">
                      {stranded[0].title} is held by {personName(stranded[0].personId)}, who is detached from the command. An administrator must re-hold that step before this can be submitted.
                    </p>
                  )}
                </div>
              ) : (
                <p className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> No routing workflow matches this message type, originator and office. An administrator must define one first.
                </p>
              )}
              {d.status === "returned" && (
                <p className="rounded-md border border-orange-300 bg-orange-50 px-3 py-2 text-sm text-orange-900">
                  Returned: {d.route.find((s) => s.status === "returned")?.comment}
                </p>
              )}
              <Button variant="primary" icon={Send} className="w-full" disabled={!preview || d.drafterId !== r.actorId} onClick={() => run(r.submitDraft(d.id))}>
                {d.status === "returned" ? "Resubmit for routing" : "Submit for routing"}
              </Button>
            </div>
          )}

          {d.status === "in_routing" && step && (
            <div className="space-y-3">
              <div className="rounded-md border border-line bg-navy-50 px-3 py-2.5 text-sm">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted">Waiting on</div>
                <div className="font-semibold">{step.title}</div>
                <div className="text-xs"><HolderNote personId={step.personId} /></div>
              </div>
              {!holdsStep ? (
                <div className="space-y-2 text-sm text-muted">
                  <p>The text is frozen while in routing. Only {personName(step.personId)} can act on this step.</p>
                  <Button size="sm" onClick={() => r.setActorId(step.personId)}>Act as {personName(step.personId)}</Button>
                </div>
              ) : step.action === "release" ? (
                <div className="space-y-2">
                  <Button variant="primary" icon={ShieldCheck} className="w-full" disabled={!gate.ok} onClick={() => run(r.releaseDraft(d.id))}>Release message</Button>
                  <p className="text-xs text-muted">
                    {gate.ok ? `Releasing as ${gate.authority?.designation}.` : gate.reason}
                    {offline && " The circuit is down: the release is held by the ANCHOR server and transmitted when it returns."}
                  </p>
                  <textarea rows={2} className={fieldCls} placeholder="Comment (needed to return it)" value={comment} onChange={(e) => setComment(e.target.value)} aria-label="Routing comment" />
                  <Button icon={CornerUpLeft} className="w-full" onClick={() => run(r.returnDraft(d.id, comment))}>Return for correction</Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <textarea rows={2} className={fieldCls} placeholder="Comment (optional to endorse, needed to return)" value={comment} onChange={(e) => setComment(e.target.value)} aria-label="Routing comment" />
                  <div className="flex flex-wrap gap-2">
                    <Button variant="primary" icon={Send} onClick={() => run(r.advanceDraft(d.id, comment))}>Endorse and advance</Button>
                    <Button icon={CornerUpLeft} onClick={() => run(r.returnDraft(d.id, comment))}>Return for correction</Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {d.status === "released" && (
            <p className="text-sm text-muted">
              Released {d.localSequence} · {d.dtg} by {personName(d.releasedBy)} as {d.releaseDesignation}.
            </p>
          )}
          {d.status === "withdrawn" && <p className="text-sm text-muted">Withdrawn before release and kept for the record.</p>}

          {error && <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

          {d.drafterId === r.actorId && d.status !== "released" && d.status !== "withdrawn" && (
            <Button variant="ghost" size="sm" icon={XCircle} className="mt-3" onClick={() => run(r.withdrawDraft(d.id))}>Withdraw draft</Button>
          )}
        </Panel>

        {d.route.length > 0 && (
          <Panel title="Route">
            <ol className="space-y-3">
              {d.route.map((s) => (
                <li key={s.order} className="flex gap-3">
                  <span className={cx("flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold", s.status === "current" ? "bg-navy-600 text-white" : s.status === "pending" ? "bg-slate-200 text-slate-600" : "bg-green-600 text-white")}>{s.order}</span>
                  <div className="min-w-0 text-sm">
                    <div className="font-semibold">{s.title}{s.action === "release" && " · release"}</div>
                    <div className="text-xs text-muted">{personName(s.personId)}</div>
                    <div className={cx("text-xs", STEP_STATUS[s.status].className)}>
                      {STEP_STATUS[s.status].label}
                      {s.actedAt && ` · ${fmtDateTime(s.actedAt)}`}
                    </div>
                    {s.comment && <div className="mt-0.5 text-xs italic text-ink">“{s.comment}”</div>}
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
        )}

        <Panel title="Route log">
          <ul className="space-y-2.5">
            {events.map((e) => (
              <li key={e.id} className="text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold">{EVENT_LABEL[e.type]}{e.stepTitle && ` · ${e.stepTitle}`}</span>
                  <span className="whitespace-nowrap text-xs text-muted">{fmtDateTime(e.at)}</span>
                </div>
                <div className="text-xs text-muted">{personName(e.actorId)}</div>
                <div className="text-xs">{e.comment}</div>
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-line pt-2 text-xs text-muted">The route log is append-only. Every advance, return and release is also written to the audit chain.</p>
        </Panel>
      </div>
    </div>
  );
}

/** Comma-separated list input that keeps its own text so typing a comma doesn't fight the parser. */
function ListInput({ label, value, onChange, disabled, placeholder }: { label: string; value: string[]; onChange: (v: string[]) => void; disabled?: boolean; placeholder?: string }) {
  const [text, setText] = useState(value.join(", "));
  return (
    <TextInput
      label={label}
      value={text}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        onChange(splitList(text));
        setText(splitList(text).join(", "));
      }}
    />
  );
}
