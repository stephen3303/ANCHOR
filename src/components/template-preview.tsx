"use client";

import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui";
import { fmtDateTime, ZULU_DATETIME_PATTERN } from "@/lib/format";
import { GENERATED_OUTPUTS, type GeneratedInputResult } from "@/lib/generated-inputs";
import { commandMatchParts, COMMAND_SEARCH_PAGE_SIZE } from "@/lib/command-search";
import { renderGeneratedMessage, type TemplateDefinition, type TemplateValues } from "@/lib/message-templates";

export const templateInputClass = "w-full rounded-md border border-line bg-white px-3 py-2 text-sm focus:outline-2 focus:outline-navy-600";
interface CommandOption { id: string; name: string }

function CommandPicker({ multiple, onChange, initial = [] }: { multiple: boolean; onChange: (commands: CommandOption[]) => void; initial?: CommandOption[] }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState("0");
  const [results, setResults] = useState<{ query: string; page: string; commands: CommandOption[]; nextCursor: string | null } | null>(null);
  const [selected, setSelected] = useState<CommandOption[]>(initial);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/reference-data/commands?${new URLSearchParams({ q: query, cursor: page })}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load commands.");
        setResults({ query, page, ...data });
        setError("");
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not load commands.");
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, page]);
  const update = (command: CommandOption) => {
    const next = selected.some((item) => item.id === command.id)
      ? selected.filter((item) => item.id !== command.id)
      : multiple ? [...selected, command] : [command];
    setSelected(next);
    onChange(next);
  };
  const current = results?.query === query && results.page === page;
  return (
    <div className="space-y-2 rounded-md border border-line p-3">
      <div className="flex flex-wrap gap-2">
        {selected.map((command) => <button type="button" key={command.id} onClick={() => update(command)} aria-label={`Remove ${command.name}`} className="rounded bg-navy-100 px-2 py-1 text-xs text-navy-900">{command.name} ×</button>)}
      </div>
      <input aria-label="Search commands" value={query} onChange={(event) => { setQuery(event.target.value); setPage("0"); setError(""); }} placeholder="Search PLADS commands…" className={templateInputClass} />
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : !current ? <p role="status" className="text-sm text-muted">Loading commands…</p> : (
        <>
          <div className="max-h-44 space-y-1 overflow-y-auto">
            {results.commands.map((command) => <label key={command.id} className="flex cursor-pointer items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1 accent-navy-700" checked={selected.some((item) => item.id === command.id)} onChange={() => update(command)} />
              <span>{commandMatchParts(command.name, query).map((part, index) => part.match ? <mark key={index} className="rounded-sm bg-yellow-200 text-inherit">{part.text}</mark> : part.text)}</span>
            </label>)}
            {!results.commands.length && <p className="text-sm text-muted">No commands match this search.</p>}
          </div>
          <div className="flex gap-2">
            {page !== "0" && <Button size="sm" onClick={() => setPage(String(Math.max(0, Number(page) - COMMAND_SEARCH_PAGE_SIZE)))}>Previous results</Button>}
            {results.nextCursor && <Button size="sm" onClick={() => setPage(results.nextCursor!)}>Next results</Button>}
          </div>
        </>
      )}
    </div>
  );
}

export function TemplatePreview({ definition }: { definition: TemplateDefinition }) {
  return <TemplateForm definition={definition} />;
}

export function TemplateForm({ definition, onSubmit, disabled = false, fieldErrors = {}, initialValues = {}, initialCommands = {}, submitLabel = "Save draft" }: {
  definition: TemplateDefinition;
  onSubmit?: (values: TemplateValues) => Promise<void>;
  disabled?: boolean;
  fieldErrors?: Record<string, string>;
  initialValues?: TemplateValues;
  initialCommands?: Record<string, CommandOption[]>;
  submitLabel?: string;
}) {
  const instanceId = useId();
  const [values, setValues] = useState<TemplateValues>(() => ({ ...Object.fromEntries(definition.fields.filter((field) => field.control === "checkbox").map((field) => [field.name, false])), ...initialValues }));
  const [commandNames, setCommandNames] = useState<Record<string, string>>(() => Object.fromEntries(Object.values(initialCommands).flat().map((command) => [command.id, command.name])));
  const [refresh, setRefresh] = useState(0);
  const [generation, setGeneration] = useState<{ definition: TemplateDefinition; refresh: number; result?: GeneratedInputResult; error?: string } | null>(null);
  const hasGenerated = definition.fields.some((field) => field.control === "autogenerated");
  useEffect(() => {
    if (!hasGenerated) return;
    const controller = new AbortController();
    fetch("/api/message-templates/preview-generated", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(definition), signal: controller.signal,
    }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not resolve autogenerated values.");
      if (!controller.signal.aborted) setGeneration({ definition, refresh, result: data });
    }).catch((reason) => {
      if (!controller.signal.aborted) setGeneration({ definition, refresh, error: reason instanceof Error ? reason.message : "Could not resolve autogenerated values." });
    });
    return () => controller.abort();
  }, [definition, hasGenerated, refresh]);
  const currentGeneration = generation?.definition === definition && generation.refresh === refresh ? generation : null;
  const generated = currentGeneration?.result;
  const resolving = hasGenerated && !currentGeneration;
  const resolvedValues = { ...values, ...generated?.values };
  definition.fields.filter((field) => field.control.startsWith("command-")).forEach((field) => {
    if (!Object.hasOwn(values, field.name)) return;
    const selection = values[field.name];
    resolvedValues[field.name] = Array.isArray(selection) ? selection.map((id) => commandNames[id] ?? id) : typeof selection === "string" ? commandNames[selection] ?? selection : "";
  });
  const set = (name: string, value: string | string[] | boolean) => setValues((current) => ({ ...current, [name]: value }));
  let previewText = "";
  let previewError = "";
  try { previewText = renderGeneratedMessage(definition.text, resolvedValues, definition.fields, 1000000); }
  catch (reason) { previewError = reason instanceof Error ? reason.message : "Could not render the preview."; }
  return (
    <div className="space-y-4">
    <fieldset disabled={disabled} className="grid min-w-0 gap-5 lg:grid-cols-2">
      <legend className="sr-only">Template inputs</legend>
      <div className="space-y-4">
        <p className="text-sm text-muted">{onSubmit ? "Fill in the template fields. The server validates inputs and regenerates the final text when saving." : "Try the generated form. Sample values are not saved. Unfilled variables remain visible in the output."}</p>
        {hasGenerated && <div className="space-y-2 rounded-md border border-line bg-slate-50 p-3 text-sm">
          <p>Autogenerated values are read-only server previews, not values frozen into this template. Timestamps are captured once per preview and do not tick.</p>
          {currentGeneration?.error && <p role="alert" className="text-red-700">{currentGeneration.error}</p>}
          {generated && <p className="text-xs text-muted">Resolved at {fmtDateTime(generated.resolvedAt)}</p>}
          <Button size="sm" disabled={resolving} onClick={() => setRefresh((value) => value + 1)}>{resolving ? "Resolving…" : "Refresh autogenerated values"}</Button>
        </div>}
        {definition.fields.map((field, index) => {
          const id = `${instanceId}-field-${index}`;
          const value = Object.hasOwn(resolvedValues, field.name) ? resolvedValues[field.name] : undefined;
          const fieldError = Object.hasOwn(fieldErrors, field.name) ? fieldErrors[field.name] : undefined;
          const textValue = typeof value === "string" ? value : "";
          const selected = Array.isArray(value) ? value : [];
          const invalidZulu = field.control === "datetime-local" && !!textValue && !new RegExp(ZULU_DATETIME_PATTERN).test(textValue);
          let control;
          if (field.fixedValue !== undefined) {
            control = <div><output id={id} aria-label={field.name} className="block rounded-md border border-line bg-slate-50 px-3 py-2 text-sm">{field.fixedValue}</output><p className="text-xs text-muted">Fixed by the template author · pub/sub identifier</p></div>;
          } else if (field.control === "autogenerated") {
            const error = (generated && Object.hasOwn(generated.errors, field.name) ? generated.errors[field.name] : undefined) || currentGeneration?.error;
            control = <div className="space-y-1">
              <p className="text-xs text-muted">Autogenerated · {GENERATED_OUTPUTS.find((output) => output.key === field.generator?.key)?.label ?? "Unsupported output"}</p>
              <output id={id} aria-label={field.name} className="block rounded-md border border-line bg-slate-50 px-3 py-2 text-sm">{resolving ? "Resolving automatically…" : error ? "Unavailable" : textValue}</output>
              {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            </div>;
          } else if (field.control.startsWith("command-")) {
            control = <CommandPicker multiple={field.control === "command-multiple"} initial={initialCommands[field.name]} onChange={(commands) => {
              set(field.name, field.control === "command-multiple" ? commands.map((command) => command.id) : commands[0]?.id ?? "");
              setCommandNames((current) => ({ ...current, ...Object.fromEntries(commands.map((command) => [command.id, command.name])) }));
            }} />;
          } else if (field.control === "checkbox-group" || field.control === "radio") {
            control = <div className="space-y-1">{field.options.map((option) => <label key={option} className="flex items-center gap-2 text-sm">
              <input type={field.control === "radio" ? "radio" : "checkbox"} name={id} checked={field.control === "radio" ? value === option : selected.includes(option)} onChange={() => set(field.name, field.control === "radio" ? option : selected.includes(option) ? selected.filter((item) => item !== option) : [...selected, option])} className="accent-navy-700" />{option}
            </label>)}</div>;
          } else if (field.control === "checkbox") {
            control = <label className="flex items-center gap-2 text-sm"><input id={id} type="checkbox" checked={value === true} onChange={(event) => set(field.name, event.target.checked)} className="accent-navy-700" />{value === true ? "YES" : "NO"} (check for YES)</label>;
          } else if (field.control === "select") {
            control = <select id={id} aria-label={field.name} className={templateInputClass} value={textValue} onChange={(event) => set(field.name, event.target.value)}><option value="">Select an option…</option>{field.options.map((option) => <option key={option}>{option}</option>)}</select>;
          } else if (field.control === "textarea") {
            control = <textarea id={id} aria-label={field.name} maxLength={5000} className={templateInputClass} value={textValue} rows={3} onChange={(event) => set(field.name, event.target.value)} />;
          } else {
            control = <input id={id} aria-label={field.name} maxLength={5000} className={templateInputClass} aria-invalid={invalidZulu || undefined} type={["datetime-local", "number"].includes(field.control) ? "text" : field.control} placeholder={field.control === "datetime-local" ? "24 OCT 2026 1830Z" : undefined} pattern={field.control === "datetime-local" ? ZULU_DATETIME_PATTERN : undefined} title={field.control === "datetime-local" ? "DD MMM YYYY HHMMZ — 24-hour Zulu time" : undefined} value={textValue} onChange={(event) => set(field.name, event.target.value)} />;
          }
          return <fieldset key={field.name} aria-describedby={`${id}-help`} className="space-y-1"><legend className="text-sm font-semibold">{field.name}{field.required && field.control !== "autogenerated" ? " *" : ""}</legend><div id={`${id}-help`} className="sr-only">{field.required ? "Required in a message draft" : "Optional in a message draft"}</div>{control}{fieldError && <p role="alert" className="text-sm text-red-700">{fieldError}</p>}{field.control === "datetime-local" && <p className={`text-xs ${invalidZulu ? "text-red-700" : "text-muted"}`} role={invalidZulu ? "alert" : undefined}>Use DD MMM YYYY HHMMZ, for example 24 OCT 2026 1830Z. Time is always Zulu (UTC), never browser-local.</p>}</fieldset>;
        })}
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">Generated plaintext preview</h3>
        <p className="mb-2 text-xs text-muted">Lines wrap at 69 characters; longer unbroken text continues on the next line.</p>
        <pre className="max-h-[640px] overflow-auto whitespace-pre-wrap break-words rounded-md border border-line bg-slate-50 p-4 font-mono text-sm">{previewText}</pre>
        {previewError && <p role="alert" className="text-sm text-red-700">{previewError}</p>}
      </div>
    </fieldset>
    {onSubmit && <Button variant="primary" disabled={disabled || resolving || !!previewError || !!currentGeneration?.error || !!Object.keys(generated?.errors ?? {}).length} onClick={() => void onSubmit(values)}>{disabled ? "Saving…" : submitLabel}</Button>}
    </div>
  );
}
