"use client";

import { UserRound } from "lucide-react";
import { useCurrentUser, useUserSession } from "@/lib/current-user";
import { useRouting } from "@/lib/routing-store";
import type { Person } from "@/lib/types";
import { cx } from "./ui";

export const fieldCls = "w-full rounded-md border border-line bg-white px-2.5 py-2 text-sm text-ink placeholder:text-slate-400 focus:outline-2 focus:outline-navy-600 disabled:bg-slate-50 disabled:text-muted";
export const label = (person: Person) => `${person.name} · ${person.position}`;

export function PersonSelect({ value, onChange, label: text, className, placeholder = "Select a command account" }: {
  value: string; onChange: (id: string) => void; label?: string; className?: string; placeholder?: string;
}) {
  const { people } = useRouting();
  return <label className={cx("block text-sm", className)}>
    {text && <span className="mb-1 block font-semibold text-ink">{text}</span>}
    <select value={value} onChange={(event) => onChange(event.target.value)} className={fieldCls}>
      {!value && <option value="">{placeholder}</option>}
      {people.map((person) => <option key={person.id} value={person.id}>{label(person)}{person.status !== "present" ? " (inactive)" : ""}</option>)}
    </select>
  </label>;
}
export function HolderNote({ personId }: { personId: string }) {
  const { personById } = useRouting();
  const person = personById(personId);
  if (!person) return <span className="text-red-700">Account is not in this command.</span>;
  if (person.status !== "present") return <span className="text-red-700">{person.name} is inactive. An active account must hold the step.</span>;
  return <span>Held by {person.name} · {person.position}</span>;
}

/** Sign in as another real demo account instead of spoofing a routing actor. */
export function ActAs() {
  const user = useCurrentUser();
  const { signOut } = useUserSession();
  return <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
    <UserRound className="size-4 text-amber-700" aria-hidden />
    <span className="font-semibold text-amber-900">Signed in: {user.name}</span>
    <button type="button" onClick={() => void signOut()} className="text-link underline">Switch account</button>
  </div>;
}
