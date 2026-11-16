"use client";

// The References input of a draft: one REF set per reference, lettered A, B, C,
// per NTP 3(J) para 711. A reference is picked from the messages held on this
// server (the server fills its type, sender and DTG when saving) or typed in
// for a conference, document, letter, telephone call or message it doesn't hold.
import { useId, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import { templateInputClass } from "@/components/template-preview";
import { keyOf } from "@/lib/message-types";
import { COMMUNICATION_CODES, DIRECTIVES, MAX_REFERENCES, draftReferenceIssues, normDtg, parseReferenceValue, type DraftReference, type Directive, type Notation } from "@/lib/references";
import { useStore } from "@/lib/store";
import type { Message } from "@/lib/types";

const KIND_LABELS: Record<string, string> = { CON: "Conference", DOC: "Document", LTR: "Letter", MSG: "Message (not held here)", TEL: "Telephone call" };
const DIRECTIVE_LABELS: Record<Directive, string> = { SUPERSEDES: "This message supersedes it", CANCELS: "This message cancels it", CORRECTS: "This message corrects it", AMENDS: "This message amends it" };

/** A reference to a held message, filled the way the server will fill it. */
export function referenceFromMessage(m: Message, letter = "A"): DraftReference {
  return {
    letter, kind: keyOf(m).toUpperCase(), originator: m.originator.trim().toUpperCase(), dtg: normDtg(m.dtg),
    ...(m.reference ? { serial: m.reference.toUpperCase() } : {}), notations: [], amplification: m.subject.toUpperCase(), messageId: m.id,
  };
}

/** Read a References value without throwing: a broken value starts empty. */
export function readReferences(value: unknown): DraftReference[] {
  try { return parseReferenceValue(value); } catch { return []; }
}

const relettered = (refs: DraftReference[]) => refs.map((r, i) => ({ ...r, letter: String.fromCharCode(65 + i) }));

export function ReferencesEditor({ id, value, onChange }: { id: string; value: unknown; onChange: (value: string) => void }) {
  const { messages } = useStore();
  const uid = useId();
  // Rows are kept as typed (a trailing space survives while typing); the value
  // is only read once, when the form opens.
  const [refs, setRefs] = useState(() => readReferences(value));
  const [query, setQuery] = useState("");
  const commit = (next: DraftReference[]) => {
    const lettered = relettered(next);
    setRefs(lettered);
    onChange(lettered.length ? JSON.stringify(lettered) : "");
  };
  const update = (index: number, patch: Partial<DraftReference>) => commit(refs.map((r, i) => i === index ? { ...r, ...patch } : r));
  const move = (index: number, by: number) => {
    const next = [...refs];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    commit(next);
  };
  const full = refs.length >= MAX_REFERENCES;

  const held = messages.filter((m) => m.kind !== "draft" && m.dtg);
  const q = query.trim().toUpperCase();
  const matches = q ? held.filter((m) => !refs.some((r) => r.messageId === m.id) && [m.subject, m.reference, m.originator, m.dtg, keyOf(m)].some((text) => text?.toUpperCase().includes(q))).slice(0, 8) : [];
  const issues = draftReferenceIssues(refs);

  return (
    <div id={id} className="space-y-3 rounded-md border border-line p-3">
      {refs.length === 0 && <p className="text-sm text-muted">No references. The message will have no REF line.</p>}
      <ol className="space-y-3">
        {refs.map((r, index) => {
          const target = r.messageId ? messages.find((m) => m.id === r.messageId) : undefined;
          const rowId = `${uid}-ref-${index}`;
          return (
            <li key={index} className="space-y-2 rounded-md border border-line bg-slate-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">REF {r.letter}{r.messageId ? " · on this server" : ""}</p>
                <div className="flex gap-1">
                  <Button size="sm" icon={ArrowUp} disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move REF ${r.letter} up`}>Up</Button>
                  <Button size="sm" icon={ArrowDown} disabled={index === refs.length - 1} onClick={() => move(index, 1)} aria-label={`Move REF ${r.letter} down`}>Down</Button>
                  <Button size="sm" icon={Trash2} onClick={() => commit(refs.filter((_, i) => i !== index))} aria-label={`Remove REF ${r.letter}`}>Remove</Button>
                </div>
              </div>
              {r.messageId ? (
                <p className="text-sm">
                  <span className="font-medium">{target?.subject ?? "Message no longer listed"}</span>
                  <span className="block font-mono text-xs text-muted">{[r.kind, r.originator, r.dtg, r.serial].filter(Boolean).join(" / ")}</span>
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="space-y-1 text-xs font-semibold">What it is
                    <select className={templateInputClass} value={(COMMUNICATION_CODES as readonly string[]).includes(r.kind) ? r.kind : "MTF"} onChange={(e) => update(index, { kind: e.target.value === "MTF" ? "" : e.target.value })}>
                      {COMMUNICATION_CODES.map((code) => <option key={code} value={code}>{code}: {KIND_LABELS[code]}</option>)}
                      <option value="MTF">Formatted message, by its type</option>
                    </select>
                  </label>
                  {!(COMMUNICATION_CODES as readonly string[]).includes(r.kind) && (
                    <label className="space-y-1 text-xs font-semibold">Message type (MSGID field 2)
                      <input className={templateInputClass} value={r.kind} maxLength={200} placeholder="GENADMIN, CASREP, SAFETY:ELECTRICAL" onChange={(e) => update(index, { kind: e.target.value.toUpperCase() })} />
                    </label>
                  )}
                  <label className="space-y-1 text-xs font-semibold">Originator
                    <input className={templateInputClass} value={r.originator} maxLength={200} placeholder="COMSUBLANT N3" onChange={(e) => update(index, { originator: e.target.value.toUpperCase() })} />
                  </label>
                  <label className="space-y-1 text-xs font-semibold">Date-time group or date
                    <input className={templateInputClass} value={r.dtg} maxLength={40} placeholder="021430ZOCT26 or 01OCT26" onChange={(e) => update(index, { dtg: normDtg(e.target.value) })} />
                  </label>
                  <label className="space-y-1 text-xs font-semibold">Serial (optional)
                    <input className={templateInputClass} value={r.serial ?? ""} maxLength={200} onChange={(e) => update(index, { serial: e.target.value.toUpperCase() || undefined })} />
                  </label>
                </div>
              )}
              <label className="block space-y-1 text-xs font-semibold" htmlFor={`${rowId}-ampn`}>{refs.length > 1 ? "NARR text for this reference" : "AMPN text"}</label>
              <input id={`${rowId}-ampn`} className={templateInputClass} value={r.amplification ?? ""} maxLength={2000} placeholder="Subject or title of the reference" onChange={(e) => update(index, { amplification: e.target.value || undefined })} />
              <div className="flex flex-wrap items-center gap-4 text-sm">
                {(["NOTAL", "PASEP"] as Notation[]).map((n) => (
                  <label key={n} className="flex items-center gap-1" title={n === "NOTAL" ? "Not all addressees hold this reference" : "Passed separately"}>
                    <input type="checkbox" className="accent-navy-700" checked={r.notations.includes(n)} onChange={(e) => update(index, { notations: e.target.checked ? [...r.notations, n] : r.notations.filter((x) => x !== n) })} />{n}
                  </label>
                ))}
                <label className="flex items-center gap-2">
                  <span className="sr-only">Change to REF {r.letter}</span>
                  <select className="rounded-md border border-line bg-white px-2 py-1 text-sm" value={r.directive ?? ""} onChange={(e) => {
                    const directive = (e.target.value || undefined) as Directive | undefined;
                    // A message supersedes, cancels, corrects or amends one reference at most.
                    commit(refs.map((x, i) => i === index ? { ...x, directive } : directive ? { ...x, directive: undefined } : x));
                  }}>
                    <option value="">No change to this reference</option>
                    {DIRECTIVES.map((d) => <option key={d} value={d}>{DIRECTIVE_LABELS[d]}</option>)}
                  </select>
                </label>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="space-y-2">
        <label className="block text-xs font-semibold" htmlFor={`${uid}-search`}>Add a message held on this server</label>
        <input id={`${uid}-search`} className={templateInputClass} value={query} disabled={full} placeholder="Search by subject, serial, sender, DTG or type…" onChange={(e) => setQuery(e.target.value)} />
        {q && (
          <ul className="max-h-56 space-y-1 overflow-y-auto">
            {matches.map((m) => (
              <li key={m.id}>
                <button type="button" className="w-full rounded px-2 py-1 text-left text-sm hover:bg-navy-50" onClick={() => { commit([...refs, referenceFromMessage(m)]); setQuery(""); }}>
                  <span className="font-medium">{m.subject}</span>
                  <span className="block font-mono text-xs text-muted">{keyOf(m)} / {m.originator} / {normDtg(m.dtg)} / {m.reference}</span>
                </button>
              </li>
            ))}
            {!matches.length && <li className="text-sm text-muted">No held message matches.</li>}
          </ul>
        )}
        <Button size="sm" icon={Plus} disabled={full} onClick={() => commit([...refs, { letter: "", kind: "DOC", originator: "", dtg: "", notations: [] }])}>Add a document, letter, call or other reference</Button>
        {full && <p className="text-xs text-muted">A message can list at most {MAX_REFERENCES} references (A to Z).</p>}
      </div>
      {issues.length > 0 && <ul className="list-disc space-y-1 pl-5 text-xs text-amber-800">{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
    </div>
  );
}
