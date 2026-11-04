"use client";

// Drafts, routing chains and release authority. In memory, like the rest of the
// prototype; every transition is written to the route log and the audit chain.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useStore } from "./store";
import {
  INITIAL_AUTHORITIES,
  INITIAL_COMMAND_SETTINGS,
  INITIAL_DRAFTS,
  INITIAL_ROUTING_EVENTS,
  INITIAL_WORKFLOWS,
  OWN_ORIGINATOR,
  SELF_PERSON_ID,
  buildRoute,
  currentStep,
  dtgOf,
  isEditable,
  nextAssignment,
  personName,
  releaseGate,
  renderMessage,
  selectWorkflow,
  strandedSteps,
} from "./routing";
import type { CommandSettings, Draft, ReleaseAuthority, RoutingEvent, RoutingEventType, RoutingWorkflow } from "./types";

type Result = { ok: true } | { ok: false; reason: string };

interface RoutingStore {
  /** Who the prototype is acting as. Each step is held by a different person on the roster. */
  actorId: string;
  setActorId: (id: string) => void;

  drafts: Draft[];
  workflows: RoutingWorkflow[];
  authorities: ReleaseAuthority[];
  settings: CommandSettings;
  events: RoutingEvent[];

  createDraft: () => string;
  updateDraft: (id: string, patch: Partial<Draft>) => void;
  submitDraft: (id: string) => Result;
  advanceDraft: (id: string, comment: string) => Result;
  returnDraft: (id: string, comment: string) => Result;
  releaseDraft: (id: string) => Result;
  withdrawDraft: (id: string) => Result;

  saveWorkflow: (w: RoutingWorkflow) => void;
  toggleWorkflow: (id: string) => void;
  addAuthority: (a: Omit<ReleaseAuthority, "id">) => void;
  removeAuthority: (id: string) => void;
  saveSettings: (s: CommandSettings) => void;
}

const Ctx = createContext<RoutingStore | null>(null);

let seq = 0;
const nextId = (p: string) => `${p}-${Date.now().toString(36)}-${seq++}`;
const nowIso = () => new Date().toISOString();
const fail = (reason: string): Result => ({ ok: false, reason });

export function RoutingProvider({ children }: { children: ReactNode }) {
  const { log, notify } = useStore();
  const [actorId, setActorId] = useState(SELF_PERSON_ID);
  const [settings, setSettings] = useState(INITIAL_COMMAND_SETTINGS);
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    INITIAL_DRAFTS.map((d) => (d.status === "released" ? { ...d, renderedText: renderMessage(d, INITIAL_COMMAND_SETTINGS) } : d)),
  );
  const [workflows, setWorkflows] = useState(INITIAL_WORKFLOWS);
  const [authorities, setAuthorities] = useState(INITIAL_AUTHORITIES);
  const [events, setEvents] = useState(INITIAL_ROUTING_EVENTS);

  const record = useCallback(
    (draftId: string, type: RoutingEventType, comment: string, stepTitle?: string) =>
      setEvents((all) => [...all, { id: nextId("re"), draftId, type, at: nowIso(), actorId, stepTitle, comment }]),
    [actorId],
  );

  const put = useCallback((id: string, patch: Partial<Draft>) => {
    setDrafts((all) => all.map((d) => (d.id === id ? { ...d, ...patch, updated: nowIso() } : d)));
  }, []);

  const store = useMemo<RoutingStore>(() => {
    const find = (id: string) => drafts.find((d) => d.id === id);
    const holderCheck = (d: Draft) => {
      const step = currentStep(d);
      if (d.status !== "in_routing" || !step) return { step: null, reason: "This draft is not waiting on a routing step." };
      if (step.personId !== actorId) return { step: null, reason: `This step is held by ${personName(step.personId)}. Act as them to take it.` };
      return { step, reason: "" };
    };

    return {
      actorId,
      setActorId: (id) => {
        setActorId(id);
        notify(`Acting as ${personName(id)}`);
      },
      drafts,
      workflows,
      authorities,
      settings,
      events,

      createDraft: () => {
        const id = nextId("dr");
        const at = nowIso();
        setDrafts((all) => [
          {
            id,
            subject: "",
            type: "COMSUBLANT MSG",
            originator: OWN_ORIGINATOR,
            precedence: "ROUTINE",
            classification: "UNCLASSIFIED",
            to: [],
            info: [],
            paragraphs: [""],
            drafterId: actorId,
            status: "drafting",
            route: [],
            created: at,
            updated: at,
          },
          ...all,
        ]);
        setEvents((all) => [...all, { id: nextId("re"), draftId: id, type: "created", at, actorId, comment: "Draft opened." }]);
        return id;
      },

      updateDraft: (id, patch) => {
        const d = find(id);
        if (d && isEditable(d) && d.drafterId === actorId) put(id, patch);
      },

      submitDraft: (id) => {
        const d = find(id);
        if (!d || !isEditable(d)) return fail("Only a draft that is being drafted or was returned can be submitted.");
        if (d.drafterId !== actorId) return fail(`Only the drafter, ${personName(d.drafterId)}, can submit this draft.`);
        if (!d.subject.trim()) return fail("Give the draft a subject before submitting it.");
        if (!d.to.length) return fail("Name at least one action addressee.");
        const wf = selectWorkflow(workflows, d.type, d.originator);
        if (!wf) return fail("No routing workflow matches this message type and originator.");
        const stranded = strandedSteps(wf.steps);
        if (stranded.length) return fail(`${stranded[0].title} is held by someone detached from the command. An administrator must re-hold it first.`);
        put(id, { status: "in_routing", workflowId: wf.id, route: buildRoute(wf) });
        if (d.status === "returned") record(id, "revised", "Corrected after return.");
        record(id, "submitted", `Submitted on ${wf.name}.`);
        log("Submit Draft", d.subject, `Entered routing on ${wf.name}.`);
        notify(`Submitted for routing on ${wf.name}`);
        return { ok: true };
      },

      advanceDraft: (id, comment) => {
        const d = find(id);
        if (!d) return fail("Draft not found.");
        const { step, reason } = holderCheck(d);
        if (!step) return fail(reason);
        if (step.action === "release") return fail("This is the release step. Release the message instead.");
        const at = nowIso();
        const route = d.route.map((s) =>
          s.order === step.order
            ? { ...s, status: "endorsed" as const, actedAt: at, comment }
            : s.order === step.order + 1
              ? { ...s, status: "current" as const }
              : s,
        );
        put(id, { route });
        record(id, "advanced", comment || "Endorsed.", step.title);
        log("Endorse Draft", d.subject, `${step.title} endorsed by ${personName(actorId)}.`);
        notify(`Endorsed and passed to ${personName(route.find((s) => s.status === "current")?.personId)}`);
        return { ok: true };
      },

      returnDraft: (id, comment) => {
        const d = find(id);
        if (!d) return fail("Draft not found.");
        const { step, reason } = holderCheck(d);
        if (!step) return fail(reason);
        if (!comment.trim()) return fail("Say what needs correcting.");
        const route = d.route.map((s) => (s.order === step.order ? { ...s, status: "returned" as const, actedAt: nowIso(), comment } : s));
        put(id, { status: "returned", route });
        record(id, "returned", comment, step.title);
        log("Return Draft", d.subject, `Returned to ${personName(d.drafterId)} at ${step.title}: ${comment}`);
        notify(`Returned to ${personName(d.drafterId)} for correction`);
        return { ok: true };
      },

      releaseDraft: (id) => {
        const d = find(id);
        if (!d) return fail("Draft not found.");
        const { step, reason } = holderCheck(d);
        if (!step) return fail(reason);
        if (step.action !== "release") return fail("This step is a review. Endorse it to move it on.");
        const gate = releaseGate(authorities, actorId, d);
        if (!gate.ok) return fail(gate.reason);
        const now = new Date();
        const at = now.toISOString();
        const assignment = nextAssignment(settings);
        const dtg = dtgOf(now);
        const designation = gate.authority?.designation ?? "release authority";
        const released: Draft = {
          ...d,
          status: "released",
          route: d.route.map((s) => (s.order === step.order ? { ...s, status: "released", actedAt: at } : s)),
          dtg,
          msn: assignment.msn,
          localSequence: assignment.localSequence,
          releasedAt: at,
          releasedBy: actorId,
          releaseDesignation: designation,
        };
        released.renderedText = renderMessage(released, settings);
        setSettings((s) => ({ ...s, nextSequence: assignment.nextSequence }));
        put(id, released);
        record(id, "released", `Released as ${designation} · ${assignment.localSequence} · ${dtg}. The transmitted text is frozen.`, step.title);
        log("Release Message", `${d.type} ${assignment.localSequence}`, `${d.subject} released by ${personName(actorId)} as ${designation}. Held for transmit by the ANCHOR server.`);
        notify(`Released ${assignment.localSequence} · ${dtg}`);
        return { ok: true };
      },

      withdrawDraft: (id) => {
        const d = find(id);
        if (!d) return fail("Draft not found.");
        if (d.drafterId !== actorId) return fail(`Only the drafter, ${personName(d.drafterId)}, can withdraw this draft.`);
        if (d.status === "released" || d.status === "withdrawn") return fail("A released or withdrawn draft cannot be withdrawn.");
        put(id, { status: "withdrawn", route: d.route.map((s) => (s.status === "current" ? { ...s, status: "pending" } : s)) });
        record(id, "withdrawn", "Withdrawn before release and kept for the record.");
        log("Withdraw Draft", d.subject || "Untitled draft");
        notify("Draft withdrawn");
        return { ok: true };
      },

      saveWorkflow: (w) => {
        const exists = workflows.some((x) => x.id === w.id);
        setWorkflows((all) => (exists ? all.map((x) => (x.id === w.id ? w : x)) : [...all, w]));
        log(exists ? "Update Routing Workflow" : "Create Routing Workflow", w.name, `${w.steps.length} steps: ${w.steps.map((s) => s.title).join(" → ")}.`);
        notify("Routing workflow saved. New submissions match it immediately.");
      },
      toggleWorkflow: (id) => {
        const w = workflows.find((x) => x.id === id);
        if (!w) return;
        setWorkflows((all) => all.map((x) => (x.id === id ? { ...x, active: !x.active } : x)));
        log("Update Routing Workflow", w.name, w.active ? "Deactivated." : "Activated.");
      },
      addAuthority: (a) => {
        setAuthorities((all) => [...all, { ...a, id: nextId("ra") }]);
        log("Designate Release Authority", personName(a.personId), `${a.designation} · ${a.scope.length ? a.scope.join(", ") : "all message types"}.`);
        notify(`${personName(a.personId)} may now release messages`);
      },
      removeAuthority: (id) => {
        const a = authorities.find((x) => x.id === id);
        setAuthorities((all) => all.filter((x) => x.id !== id));
        if (a) log("Remove Release Authority", personName(a.personId), `${a.designation} designation removed.`);
      },
      saveSettings: (s) => {
        setSettings(s);
        log("Update Command Settings", "Transmission settings", `Text case ${s.textCase}; next sequence ${s.sequencePrefix}${s.nextSequence}.`);
        notify("Command settings saved. The next release follows them.");
      },
    };
  }, [actorId, drafts, workflows, authorities, settings, events, log, notify, put, record]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useRouting() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useRouting must be used inside RoutingProvider");
  return s;
}
