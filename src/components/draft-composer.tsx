"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Panel } from "@/components/ui";
import { TemplateForm, templateInputClass } from "@/components/template-preview";
import { referenceFromMessage } from "@/components/references-editor";
import type { TemplateDefinition, TemplateSummary, TemplateValues } from "@/lib/message-templates";
import { MessageInputError, PRECEDENCES, validateMessageInputs } from "@/lib/message-inputs";
import { DRAFT_KEYS, keyOption, messageKey, splitKey } from "@/lib/message-types";
import type { Precedence } from "@/lib/types";
import type { ApiDraft } from "@/lib/routing-api";
import { useRouting } from "@/lib/routing-store";
import { useStore } from "@/lib/store";

type PublishedTemplate = TemplateDefinition & { id: string; versionId: string; version: number };
export function DraftComposer({ draft, onSaved, initialTemplateId = "", initialReferenceId = "" }: { draft?: ApiDraft; onSaved: (id: string) => void; /** Start from this template, as the Templates page's Draft button does. */ initialTemplateId?: string; /** Cite this held message as REF A, as a message's References tab does. */ initialReferenceId?: string }) {
  const routing = useRouting();
  const { notify, log, offline, messageById } = useStore();
  const cited = initialReferenceId ? messageById(initialReferenceId) : undefined;
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [selected, setSelected] = useState(draft ? "" : initialTemplateId);
  const [definition, setDefinition] = useState<PublishedTemplate | null>(draft ? { ...draft.definition, id: draft.templateVersionId, versionId: draft.templateVersionId, version: draft.templateVersion } : null);
  const [subject, setSubject] = useState(draft?.subject ?? "");
  const [precedence, setPrecedence] = useState<Precedence>(draft?.precedence ?? "ROUTINE");
  const [messageType, setMessageType] = useState(draft ? messageKey(draft.type, draft.subtag) : "GENADMIN");
  const [listLoading, setListLoading] = useState(!draft);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const submission = useRef<{ body: string; id: string } | null>(null);
  useEffect(() => {
    if (draft) return;
    const controller = new AbortController();
    fetch("/api/message-templates", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load templates.");
      if (!controller.signal.aborted) { setTemplates(data.templates); setError(""); }
    }).catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not load templates."); })
      .finally(() => { if (!controller.signal.aborted) setListLoading(false); });
    return () => controller.abort();
  }, [retry, draft]);
  useEffect(() => {
    if (!selected || draft) return;
    const controller = new AbortController();
    fetch(`/api/message-templates/${selected}`, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load the template.");
      if (!controller.signal.aborted) { setDefinition(data.template); setSubject(data.template.name.replace(/[\r\n]/g, " ")); }
    }).catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not load the template."); });
    return () => controller.abort();
  }, [selected, retry, draft]);

  // A template's Type field writes MSGID field 2 (TYPE or TYPE:SUBTAG), and the rendered line decides the type.
  const typeField = definition?.fields.find((field) => field.name === "Type" || field.name === "Msg Type");
  const typeFromTemplate = !!typeField;
  const referenceField = definition?.fields.find((field) => field.control === "reference-list");
  const startValues = draft?.inputValues ?? (cited && referenceField ? { [referenceField.name]: JSON.stringify([referenceFromMessage(cited)]) } : undefined);
  const save = async (raw: TemplateValues) => {
    if (!definition || busy) return;
    setError(""); setFieldErrors({});
    if (offline) { setError("Saving requires the API. Offline draft queuing is not implemented."); return; }
    if (!subject.trim() || subject.trim().length > 200 || /[\r\n\0]/.test(subject)) { setFieldErrors({ _subject: "Enter a subject of 1–200 characters without line breaks." }); return; }
    setBusy(true);
    try {
      const values = validateMessageInputs(definition.fields, raw);
      if (draft) {
        const result = await routing.editDraft(draft, { subject: subject.trim(), precedence, messageType, values });
        if (!result.ok) { setFieldErrors(result.fields ?? {}); throw new Error(result.reason); }
        onSaved(draft.id); return;
      }
      const payload = { templateVersionId: definition.versionId, subject: subject.trim(), precedence, messageType, values };
      const body = JSON.stringify(payload);
      if (submission.current?.body !== body) submission.current = { body, id: crypto.randomUUID() };
      const response = await fetch("/api/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, requestId: submission.current.id }) });
      const data = await response.json();
      if (!response.ok) { setFieldErrors(data.fields ?? {}); throw new Error(data.error || "Could not save. Inputs have been preserved."); }
      log("Create draft", data.message.reference, `Created using ${definition.name} version ${definition.version}. Not released or transmitted.`);
      notify("Draft saved to Drafting & Release");
      await routing.refresh();
      onSaved(data.message.id);
    } catch (reason) {
      if (reason instanceof MessageInputError) setFieldErrors(reason.fields);
      setError(reason instanceof Error ? reason.message : "Could not save. Inputs have been preserved.");
    } finally { setBusy(false); }
  };

  return <div className="space-y-4">
    {draft && <p role="status" className="rounded bg-amber-50 p-3 text-sm text-amber-900">Saving edits stops any review and clears all approvals. Resubmit the updated message for fresh approval before publishing.</p>}
    <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">UNCLASSIFIED prototype only. Saving does not release or transmit. Drafts stay out of Messages until the full chain releases them.</p>
    {error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error} {!definition && <Button size="sm" disabled={busy} onClick={() => { setListLoading(true); setRetry((value) => value + 1); }}>Retry loading</Button>}</p>}
    {!draft && cited && <p role="status" className="rounded-md border border-line bg-navy-50 p-3 text-sm">Citing <span className="font-semibold">{cited.reference}: {cited.subject}</span> as REF A.{definition && !referenceField ? " This template has no References field, so it can't carry the reference. Choose another template." : ""}</p>}
    {!draft && <Panel title="1. Choose a template">
      {listLoading ? <p role="status">Loading published templates…</p> : templates.length ? <label className="block space-y-1 text-sm font-semibold">Message template<select className={templateInputClass} value={selected} disabled={busy} onChange={(event) => { setSelected(event.target.value); setDefinition(null); setError(""); setFieldErrors({}); submission.current = null; }}>
        <option value="">Select a template…</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name} — Version {template.version}</option>)}
      </select></label> : error ? null : <div className="space-y-2"><p>No published templates yet.</p><Button href="/templates" variant="primary">Create a template</Button></div>}
    </Panel>}
    {selected && !definition && !error && <p role="status">Loading template fields…</p>}
    {definition && <Panel title={`${draft ? "Edit pinned template:" : "2. Fill in"} ${definition.name} (version ${definition.version})`}>
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <label className="block space-y-1 text-sm font-semibold">Message subject<input className={templateInputClass} maxLength={200} value={subject} disabled={busy} onChange={(event) => setSubject(event.target.value)} />{fieldErrors._subject && <span role="alert" className="text-red-700">{fieldErrors._subject}</span>}</label>
        {typeFromTemplate
          ? <p className="space-y-1 text-sm"><span className="block font-semibold">Message type</span>{typeField?.fixedValue ? <span className="block font-mono">{typeField.fixedValue}</span> : null}<span className="text-muted">Set by the template&apos;s Type field, which writes MSGID field 2.</span></p>
          : <label className="block space-y-1 text-sm font-semibold">Message type<select className={templateInputClass} value={messageType} disabled={busy} onChange={(event) => setMessageType(event.target.value)}>{DRAFT_KEYS.map((key) => <option key={key} value={key}>{splitKey(key)[1] ? "\u00a0\u00a0" : ""}{keyOption(key)}</option>)}</select></label>}
        <label className="block space-y-1 text-sm font-semibold">Precedence<select aria-describedby="draft-precedence-help" className={templateInputClass} value={precedence} disabled={busy} onChange={(event) => setPrecedence(event.target.value as Precedence)}>{PRECEDENCES.map((value) => <option key={value}>{value}</option>)}</select><span id="draft-precedence-help" className="block text-xs font-normal text-muted">Also fills the precedence prosign in the heading.</span></label>
      </div>
      <TemplateForm key={definition.versionId} definition={definition} precedence={precedence} initialValues={startValues} initialCommands={draft?.commandSelections} onSubmit={save} disabled={busy || routing.busy} fieldErrors={fieldErrors} submitLabel={draft ? "Save corrections" : "Save draft"} />
    </Panel>}
  </div>;
}
