"use client";

import { useState } from "react";
import { TURNOVER_CHECKLIST } from "@/lib/data";
import { useStore } from "@/lib/store";
import { fmtDateTime } from "@/lib/format";
import { Panel, Check, Button } from "@/components/ui";
import type { WatchIssue } from "@/lib/watch-workspace";

const field = "mt-1 block w-full rounded-md border border-line bg-white px-3 py-2 text-sm";
type Draft = Omit<WatchIssue, "by" | "at">;
const empty = (): Draft => ({ id: "", issue: "", status: "Open", actionsTaken: "", awaiting: "", nextStep: "", owner: "", upcoming: "", escalation: "", contacts: "", review: true, sourceId: "" });

export function WatchIssues({ openSource }: { openSource: (id: string) => void }) {
  const { messages, watchNotes, watchNotesUpdated, setWatchNotes, watchIssues, saveWatchIssue, checklist, toggleChecklist } = useStore();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [narrative, setNarrative] = useState<string | null>(null);
  const incomplete = TURNOVER_CHECKLIST.filter((c) => !checklist[c]);
  const fields: { key: keyof Pick<Draft, "actionsTaken" | "awaiting" | "nextStep" | "owner" | "upcoming" | "escalation" | "contacts">; label: string }[] = [
    { key: "actionsTaken", label: "Actions taken" }, { key: "awaiting", label: "Response awaited" },
    { key: "nextStep", label: "Next step" }, { key: "owner", label: "Responsible owner" },
    { key: "upcoming", label: "Upcoming event / report" }, { key: "escalation", label: "Escalation guidance" }, { key: "contacts", label: "Relevant contacts" },
  ];
  return <div className="grid items-start gap-4 lg:grid-cols-2">
    <Panel title="Outgoing-watch notes" action={<Button size="sm" onClick={() => setDraft(empty())}>Add issue</Button>}>
      <p className="mb-3 text-xs text-muted">Watch-reported context · not official message text · saved in memory until reload.</p>
      {watchIssues.map((issue) => <article key={issue.id} className="mb-3 rounded-md border border-line p-3 text-sm">
        <div className="flex flex-wrap justify-between gap-2"><strong>{issue.issue}</strong><span>{issue.status}{issue.review ? " · Incoming review" : ""}</span></div>
        <p className="mt-1">Next: {issue.nextStep || "Not recorded"} · {issue.owner || "Unassigned"}</p>
        {issue.awaiting && <p>Awaiting: {issue.awaiting}</p>}
        <details className="mt-2 text-xs"><summary className="cursor-pointer text-link">Note details</summary>
          <dl className="mt-2 space-y-1">{fields.map(({ key, label }) => <div key={key}><dt className="inline font-semibold">{label}: </dt><dd className="inline whitespace-pre-wrap">{issue[key] || "Not provided"}</dd></div>)}</dl>
          <p className="mt-2 text-muted">Updated by {issue.by} · {fmtDateTime(issue.at)} (actual UTC)</p>
        </details>
        <div className="mt-2 flex gap-3"><button className="text-xs text-link underline" onClick={() => setDraft(issue)}>Edit issue</button>{issue.sourceId && <button className="text-xs text-link underline" onClick={() => openSource(issue.sourceId)}>Source message</button>}</div>
      </article>)}
      {!watchIssues.length && <p className="mb-3 text-sm text-muted">No structured issues recorded. Confirm unresolved issues with the outgoing watch.</p>}
      {draft && <form className="mb-4 space-y-3 rounded-md border border-line bg-slate-50 p-3" onSubmit={(e) => { e.preventDefault(); saveWatchIssue({ ...draft, issue: draft.issue.trim(), id: draft.id || crypto.randomUUID() }); setDraft(null); }}>
        <label className="block text-sm font-semibold">Outstanding issue<input required maxLength={250} className={field} value={draft.issue} onChange={(e) => setDraft({ ...draft, issue: e.target.value })} /></label>
        <label className="block text-sm">Issue status<select className={field} value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as Draft["status"] })}>{["Open", "Monitoring", "Resolved"].map((s) => <option key={s}>{s}</option>)}</select></label>
        <div className="grid gap-3 sm:grid-cols-2">{fields.map(({ key, label }) => <label key={key} className="text-sm">{label}<textarea rows={2} maxLength={2000} className={field} value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} /></label>)}</div>
        <label className="block text-sm">Supporting message (optional)<select className={field} value={draft.sourceId} onChange={(e) => setDraft({ ...draft, sourceId: e.target.value })}><option value="">No linked message</option>{messages.map((m) => <option key={m.id} value={m.id}>{m.reference}</option>)}</select></label>
        <Check label="Requires incoming-watch review" checked={draft.review} onChange={(review) => setDraft({ ...draft, review })} />
        <div className="flex gap-2"><Button variant="primary" type="submit" disabled={!draft.issue.trim()}>Save issue</Button><Button onClick={() => setDraft(null)}>Cancel</Button></div>
      </form>}
      <div className="flex justify-between gap-2"><h3 className="text-sm font-semibold">Narrative handoff</h3><button className="text-xs text-link underline" onClick={() => setNarrative(watchNotes.join("\n"))}>Edit notes</button></div>
      {narrative !== null ? <form onSubmit={(e) => { e.preventDefault(); setWatchNotes(narrative.split("\n").map((s) => s.trim()).filter(Boolean)); setNarrative(null); }}><textarea aria-label="Narrative handoff notes" rows={5} maxLength={10000} className={field} value={narrative} onChange={(e) => setNarrative(e.target.value)} /><div className="mt-2 flex gap-2"><Button type="submit" size="sm">Save notes</Button><Button size="sm" onClick={() => setNarrative(null)}>Cancel</Button></div></form> : <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{watchNotes.map((note, i) => <li key={i}>{note}</li>)}</ul>}
      <p className="mt-2 text-xs text-muted">{watchNotesUpdated ? `Last edited by ${watchNotesUpdated.by} · ${fmtDateTime(watchNotesUpdated.at)} (actual UTC)` : "Legacy narrative author/time is not recorded. Structured notes track editor and actual update time."}</p>
    </Panel>
    <Panel title="Turnover checklist" action={<span className="text-xs">{TURNOVER_CHECKLIST.length - incomplete.length}/{TURNOVER_CHECKLIST.length} complete</span>}>
      <h3 className="mb-2 text-sm font-semibold">{incomplete.length ? "Still to do" : "All checklist items checked"}</h3>
      {incomplete.map((item) => <Check key={item} checked={false} label={item} onChange={() => toggleChecklist(item)} />)}
      <details className="mt-3"><summary className="cursor-pointer text-sm text-link">All checklist items</summary><div className="mt-2">{TURNOVER_CHECKLIST.map((item) => <Check key={item} checked={!!checklist[item]} label={item} onChange={() => toggleChecklist(item)} />)}</div></details>
      <p className="mt-3 text-xs text-muted">Outgoing / incoming identities, last turnover time, and formal acceptance are not recorded by this prototype. Checked items do not constitute turnover acceptance.</p>
    </Panel>
  </div>;
}
