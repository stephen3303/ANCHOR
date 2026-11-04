"use client";

// Shared pieces for the drafting desk and the routing admin screen.
import { UserRound } from "lucide-react";
import { ROSTER, ROSTER_STATE, personById } from "@/lib/routing";
import { useRouting } from "@/lib/routing-store";
import type { Person } from "@/lib/types";
import { cx } from "./ui";

export const fieldCls =
  "w-full rounded-md border border-line bg-white px-2.5 py-2 text-sm text-ink placeholder:text-slate-400 focus:outline-2 focus:outline-navy-600 disabled:bg-slate-50 disabled:text-muted";

export const label = (p: Person) => `${p.rank} ${p.name} · ${p.position}`;

/** Picks a person from the roster. Shows leave and detached status so a step isn't quietly held by someone who's gone. */
export function PersonSelect({
  value,
  onChange,
  label: text,
  className,
  placeholder = "Select from the roster",
}: {
  value: string;
  onChange: (id: string) => void;
  label?: string;
  className?: string;
  placeholder?: string;
}) {
  return (
    <label className={cx("block text-sm", className)}>
      {text && <span className="mb-1 block font-semibold text-ink">{text}</span>}
      <select value={value} onChange={(e) => onChange(e.target.value)} className={fieldCls}>
        {!value && <option value="">{placeholder}</option>}
        {ROSTER.map((p) => (
          <option key={p.id} value={p.id}>
            {label(p)}
            {p.status !== "present" ? ` (${ROSTER_STATE[p.status].label.toLowerCase()})` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Roster state of whoever holds a step or designation, as it stands now. */
export function HolderNote({ personId }: { personId: string }) {
  const p = personById(personId);
  if (!p) return <span className="text-red-700">Not on the roster. Pick their successor.</span>;
  if (p.status === "detached") return <span className="font-semibold text-red-700">{p.rank} {p.name} is detached from the command. Name their relief.</span>;
  if (p.status === "leave") return <span className="font-semibold text-amber-700">{p.rank} {p.name} is on leave. A covering watchstander acts.</span>;
  return <span>Held by {p.rank} {p.name} · {p.position}</span>;
}

/** Prototype control: one browser plays every person in the chain. */
export function ActAs() {
  const { actorId, setActorId } = useRouting();
  return (
    <label className="flex items-center gap-2 rounded-md border border-dashed border-amber-400 bg-amber-50 px-2.5 py-1.5 text-sm">
      <UserRound className="size-4 text-amber-700" aria-hidden />
      <span className="font-semibold text-amber-900">Acting as</span>
      <select value={actorId} onChange={(e) => setActorId(e.target.value)} className="rounded border border-amber-300 bg-white px-1.5 py-1 text-sm">
        {ROSTER.map((p) => (
          <option key={p.id} value={p.id}>
            {p.rank} {p.name} ({p.code})
          </option>
        ))}
      </select>
    </label>
  );
}
