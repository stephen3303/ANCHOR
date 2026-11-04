"use client";

// Picks topics and subtopics from the topic tree. Checking a topic selects all
// of it, including subtopics added later; checking subtopics selects only those.
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { TOPICS, parentOf } from "@/lib/topics";
import { cx } from "./ui";

export function TopicPicker({
  value,
  onChange,
  counts,
  className,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  /** Optional count shown beside each topic and subtopic id. */
  counts?: (id: string) => number;
  className?: string;
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(value.filter((v) => v.includes(".")).map(parentOf)));
  const toggleOpen = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const setTopic = (id: string, on: boolean) =>
    onChange(on ? [...value.filter((v) => parentOf(v) !== id), id] : value.filter((v) => parentOf(v) !== id));
  const setSub = (topic: string, sub: string, on: boolean) => {
    const rest = value.filter((v) => v !== sub && v !== topic);
    if (value.includes(topic)) {
      // Unchecking one subtopic of a whole topic keeps its siblings.
      const siblings = TOPICS.find((t) => t.id === topic)!.subtopics.map((s) => s.id).filter((s) => s !== sub);
      onChange([...rest, ...siblings]);
    } else onChange(on ? [...rest, sub] : rest);
  };
  const count = (id: string) => (counts ? <span className="text-muted"> ({counts(id)})</span> : null);

  return (
    <ul className={cx("space-y-0.5 text-sm", className)}>
      {TOPICS.map((t) => {
        const whole = value.includes(t.id);
        const some = !whole && value.some((v) => parentOf(v) === t.id);
        const expanded = open.has(t.id);
        return (
          <li key={t.id}>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => toggleOpen(t.id)} aria-expanded={expanded} aria-label={`${expanded ? "Hide" : "Show"} ${t.name} subtopics`} className="rounded p-0.5 text-muted hover:bg-navy-50">
                {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              </button>
              <label className="flex flex-1 cursor-pointer items-center gap-2 py-0.5">
                <input
                  type="checkbox"
                  className="size-4 accent-navy-600"
                  checked={whole}
                  ref={(el) => { if (el) el.indeterminate = some; }}
                  onChange={(e) => setTopic(t.id, e.target.checked)}
                />
                <span className={cx(whole || some ? "font-semibold" : "")}>{t.name}{count(t.id)}</span>
              </label>
            </div>
            {expanded && (
              <ul className="ml-7 border-l border-line pl-3">
                {t.subtopics.map((s) => (
                  <li key={s.id}>
                    <label className="flex cursor-pointer items-center gap-2 py-0.5">
                      <input type="checkbox" className="size-4 accent-navy-600" checked={whole || value.includes(s.id)} onChange={(e) => setSub(t.id, s.id, e.target.checked)} />
                      <span>{s.name}{count(s.id)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
