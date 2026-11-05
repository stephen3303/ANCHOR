"use client";

// Picks subscription keys: message types (MSGID field 2) and their subtags
// (field 3). Checking a type selects all of it, including subtags added later;
// checking subtags selects only those.
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { MESSAGE_CATEGORIES, MESSAGE_TYPE_INFO, MESSAGE_TYPES, messageKey, splitKey, subtagsOf, type MessageType } from "@/lib/message-types";
import { cx } from "./ui";

export function MessageTypePicker({
  value,
  onChange,
  counts,
  types = MESSAGE_TYPES,
  className,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  /** Optional count shown beside each type and subtag key. */
  counts?: (key: string) => number;
  /** Types to offer; defaults to the whole catalog. */
  types?: readonly MessageType[];
  className?: string;
}) {
  const typeOf = (key: string) => splitKey(key)[0];
  const [open, setOpen] = useState<Set<string>>(() => new Set(value.filter((v) => v.includes("/")).map(typeOf)));
  const toggleOpen = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const setType = (type: string, on: boolean) => {
    const rest = value.filter((v) => typeOf(v) !== type);
    onChange(on ? [...rest, type] : rest);
  };
  const setSub = (type: MessageType, key: string, on: boolean) => {
    const rest = value.filter((v) => v !== key && v !== type);
    if (value.includes(type)) {
      // Unchecking one subtag of a whole type keeps its siblings.
      onChange([...rest, ...subtagsOf(type).map((s) => messageKey(type, s.code)).filter((k) => k !== key)]);
    } else onChange(on ? [...rest, key] : rest);
  };
  const count = (key: string) => (counts ? <span className="text-muted"> ({counts(key)})</span> : null);

  return (
    <div className={cx("space-y-3 text-sm", className)}>
      {MESSAGE_CATEGORIES.map((category) => {
        const list = types.filter((t) => MESSAGE_TYPE_INFO[t].category === category);
        if (!list.length) return null;
        return (
          <div key={category}>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{category}</p>
            <ul className="space-y-0.5">
              {list.map((t) => {
                const info = MESSAGE_TYPE_INFO[t];
                const subs = subtagsOf(t);
                const whole = value.includes(t);
                const some = !whole && value.some((v) => typeOf(v) === t);
                const expanded = open.has(t);
                return (
                  <li key={t}>
                    <div className="flex items-center gap-1">
                      {subs.length ? (
                        <button type="button" onClick={() => toggleOpen(t)} aria-expanded={expanded} aria-label={`${expanded ? "Hide" : "Show"} ${info.name} subtags`} className="rounded p-0.5 text-muted hover:bg-navy-50">
                          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                        </button>
                      ) : <span className="w-5" aria-hidden />}
                      <label className="flex flex-1 cursor-pointer items-center gap-2 py-0.5" title={info.description}>
                        <input
                          type="checkbox"
                          className="size-4 accent-navy-600"
                          checked={whole}
                          ref={(el) => { if (el) el.indeterminate = some; }}
                          onChange={(e) => setType(t, e.target.checked)}
                        />
                        <span className={cx(whole || some ? "font-semibold" : "")}>
                          <span className="font-mono text-xs">{t}</span> {info.name !== t && info.name}{count(t)}
                        </span>
                      </label>
                    </div>
                    {expanded && subs.length > 0 && (
                      <ul className="ml-7 border-l border-line pl-3">
                        {subs.map((s) => {
                          const key = messageKey(t, s.code);
                          return (
                            <li key={key}>
                              <label className="flex cursor-pointer items-center gap-2 py-0.5">
                                <input type="checkbox" className="size-4 accent-navy-600" checked={whole || value.includes(key)} onChange={(e) => setSub(t, key, e.target.checked)} />
                                <span><span className="font-mono text-xs">{s.code}</span> {s.name}{count(key)}</span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
