"use client";

// Shared building blocks. Every page composes these so panels, buttons,
// badges and tables look the same everywhere.
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { Classification, Importance, Lifecycle, Precedence, ReadState } from "@/lib/types";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

/* ---------- layout ---------- */

export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <Icon className="mt-1 size-9 shrink-0 text-navy-900" strokeWidth={1.75} aria-hidden />
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[28px]">{title}</h1>
          {subtitle && <p className="text-[15px] text-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({
  title,
  icon: Icon,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cx("rounded-lg border border-line bg-white shadow-sm", className)}>
      {title && (
        <header className="flex items-center justify-between gap-2 border-b border-line/70 px-4 py-3">
          <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink">
            {Icon && <Icon className="size-5 text-navy-800" aria-hidden />}
            {title}
          </h2>
          {action}
        </header>
      )}
      <div className={cx("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

/* ---------- buttons ---------- */

type Variant = "primary" | "secondary" | "ghost" | "danger" | "warning";
const variants: Record<Variant, string> = {
  primary: "bg-navy-700 text-white hover:bg-navy-800 border border-navy-700",
  secondary: "bg-white text-ink border border-line hover:bg-navy-50",
  ghost: "text-link hover:bg-navy-50 border border-transparent",
  danger: "bg-red-600 text-white hover:bg-red-700 border border-red-600",
  warning: "bg-gold text-navy-950 hover:brightness-95 border border-gold",
};

type BtnProps = {
  variant?: Variant;
  size?: "sm" | "md";
  icon?: LucideIcon;
  href?: string;
  className?: string;
  children?: ReactNode;
} & Omit<ComponentProps<"button">, "className" | "children">;

export function Button({ variant = "secondary", size = "md", icon: Icon, href, className, children, ...rest }: BtnProps) {
  const cls = cx(
    "inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-600",
    size === "sm" ? "px-2.5 py-1.5 text-[13px]" : "px-3.5 py-2 text-sm",
    variants[variant],
    className,
  );
  const inner = (
    <>
      {Icon && <Icon className={size === "sm" ? "size-4" : "size-[18px]"} aria-hidden />}
      {children}
    </>
  );
  if (href)
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  return (
    <button type="button" className={cls} {...rest}>
      {inner}
    </button>
  );
}

export function TextLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={cx("font-medium text-link hover:underline", className)}>
      {children}
    </Link>
  );
}

/* ---------- badges ---------- */

export function Pill({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide whitespace-nowrap", className)}>
      {children}
    </span>
  );
}

const classTone: Record<Classification, string> = {
  UNCLASSIFIED: "bg-green-100 text-green-800",
  CUI: "bg-purple-100 text-purple-800",
  CONFIDENTIAL: "bg-blue-100 text-blue-800",
  SECRET: "bg-red-100 text-red-800",
};
export const ClassBadge = ({ c }: { c: Classification }) => <Pill className={classTone[c]}>{c}</Pill>;

const precTone: Record<Precedence, string> = {
  FLASH: "bg-red-700 text-white",
  IMMEDIATE: "bg-orange-500 text-white",
  PRIORITY: "bg-amber-100 text-amber-900",
  ROUTINE: "bg-slate-100 text-slate-700",
};
export const PrecedenceBadge = ({ p }: { p: Precedence }) => <Pill className={precTone[p]}>{p}</Pill>;

const lifeTone: Record<Lifecycle, string> = {
  ACTIVE: "",
  AMENDED: "bg-sky-100 text-sky-800 ring-1 ring-sky-300",
  CORRECTED: "bg-indigo-100 text-indigo-800 ring-1 ring-indigo-300",
  CANCELLED: "bg-red-100 text-red-800 ring-1 ring-red-300 line-through decoration-red-400",
  SUPERSEDED: "bg-zinc-200 text-zinc-700 ring-1 ring-zinc-300",
  EXPIRED: "bg-stone-200 text-stone-600 ring-1 ring-stone-300",
};
/** Lifecycle status. ACTIVE renders nothing so only exceptions stand out. */
export const LifecycleBadge = ({ l }: { l: Lifecycle }) =>
  l === "ACTIVE" ? null : <Pill className={lifeTone[l]}>{l}</Pill>;

const impTone: Record<Importance, string> = {
  High: "bg-red-50 text-red-700 ring-1 ring-red-200",
  Medium: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
  Low: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
};
const impLabel: Record<Importance, string> = { High: "HIGH", Medium: "MED", Low: "LOW" };
export const ImportanceBadge = ({ i }: { i: Importance }) => <Pill className={impTone[i]}>{impLabel[i]}</Pill>;

const dotTone = { red: "bg-red-600", blue: "bg-blue-600", green: "bg-green-600", amber: "bg-amber-500", gray: "bg-slate-400" };
export type DotTone = keyof typeof dotTone;
export function StatusDot({ tone, children }: { tone: DotTone; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className={cx("size-2.5 rounded-full", dotTone[tone])} aria-hidden />
      {children}
    </span>
  );
}

export function ReadStatus({ r }: { r: ReadState }) {
  if (r === "new") return <StatusDot tone="red"><span className="font-semibold text-red-700">New</span></StatusDot>;
  if (r === "unread") return <StatusDot tone="blue"><span className="font-semibold text-blue-700">Unread</span></StatusDot>;
  return <StatusDot tone="green">Read</StatusDot>;
}

export function Tag({ children }: { children: ReactNode }) {
  return <span className="inline-block rounded bg-navy-100 px-2 py-0.5 text-xs font-medium text-navy-800">{children}</span>;
}

/* ---------- inputs ---------- */

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange?: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={cx(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-600 disabled:cursor-not-allowed disabled:opacity-60",
        checked ? "bg-navy-600" : "bg-slate-300",
      )}
    >
      <span className={cx("inline-block size-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-5" : "translate-x-0.5")} />
    </button>
  );
}

export function Check({ checked, onChange, label, count }: { checked: boolean; onChange?: (v: boolean) => void; label: ReactNode; count?: number }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 py-0.5 text-sm text-ink">
      <input type="checkbox" checked={checked} onChange={(e) => onChange?.(e.target.checked)} className="size-4 accent-navy-600" />
      <span>
        {label}
        {count !== undefined && <span className="text-muted"> ({count})</span>}
      </span>
    </label>
  );
}

export function Select({ value, onChange, options, label, className }: { value: string; onChange?: (v: string) => void; options: string[]; label?: string; className?: string }) {
  return (
    <label className={cx("block text-sm", className)}>
      {label && <span className="mb-1 block font-semibold text-ink">{label}</span>}
      <select
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        className="w-full rounded-md border border-line bg-white px-2.5 py-2 text-sm text-ink focus:outline-2 focus:outline-navy-600"
      >
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

export function TextInput({ label, className, ...rest }: { label?: string; className?: string } & ComponentProps<"input">) {
  return (
    <label className={cx("block text-sm", className)}>
      {label && <span className="mb-1 block font-semibold text-ink">{label}</span>}
      <input {...rest} className="w-full rounded-md border border-line bg-white px-2.5 py-2 text-sm text-ink placeholder:text-slate-400 focus:outline-2 focus:outline-navy-600" />
    </label>
  );
}

/* ---------- tabs ---------- */

export function Tabs<T extends string>({ tabs, active, onChange }: { tabs: { id: T; label: string }[]; active: T; onChange: (t: T) => void }) {
  return (
    <div role="tablist" className="no-print mb-4 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          type="button"
          aria-selected={active === t.id}
          onClick={() => onChange(t.id)}
          className={cx(
            "-mb-px whitespace-nowrap border-b-[3px] px-4 py-2.5 text-[15px] transition-colors",
            active === t.id ? "border-navy-600 font-semibold text-navy-700" : "border-transparent text-ink hover:text-navy-700",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- stats & charts ---------- */

export function StatCard({
  icon: Icon,
  value,
  label,
  note,
  tone = "navy",
}: {
  icon: LucideIcon;
  value: ReactNode;
  label: string;
  note?: ReactNode;
  tone?: "navy" | "red" | "amber" | "green";
}) {
  const tones = { navy: "text-navy-700", red: "text-red-600", amber: "text-amber-500", green: "text-green-600" };
  return (
    <div className="flex items-center gap-4 rounded-lg border border-line bg-white p-4 shadow-sm">
      <Icon className={cx("size-11 shrink-0", tones[tone])} strokeWidth={1.75} aria-hidden />
      <div className="min-w-0">
        <div className="text-[26px] font-bold leading-none text-ink">{value}</div>
        <div className="mt-1 text-[15px] text-ink">{label}</div>
        {note && <div className="mt-1 text-xs text-muted">{note}</div>}
      </div>
    </div>
  );
}

export function Delta({ dir, children, good }: { dir: "up" | "down"; children: ReactNode; good?: boolean }) {
  return (
    <span className={cx("font-medium", good ? "text-green-700" : "text-red-600")}>
      {dir === "up" ? "↑" : "↓"} {children}
    </span>
  );
}

export function Donut({ segments, center, sub }: { segments: { value: number; color: string }[]; center: ReactNode; sub?: string }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const r = 40;
  const c = 2 * Math.PI * r;
  const arcs = segments.map((s, i) => {
    const len = (s.value / total) * c;
    const offset = segments.slice(0, i).reduce((a, p) => a + (p.value / total) * c, 0);
    return { ...s, len, offset };
  });
  return (
    <div className="relative size-36 shrink-0">
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
        {arcs.map((a, i) => (
          <circle key={i} cx="50" cy="50" r={r} fill="none" stroke={a.color} strokeWidth="16" strokeDasharray={`${a.len} ${c - a.len}`} strokeDashoffset={-a.offset} />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-xl font-bold leading-none">{center}</span>
        {sub && <span className="text-xs text-muted">{sub}</span>}
      </div>
    </div>
  );
}

export function Bar({ value, max, color = "bg-navy-600" }: { value: number; max: number; color?: string }) {
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
      <div className={cx("h-full rounded-full", color)} style={{ width: `${Math.max(3, (value / max) * 100)}%` }} />
    </div>
  );
}

/* ---------- tables ---------- */

export const th = "px-3 py-2 text-left text-[13px] font-semibold text-ink whitespace-nowrap";
export const td = "px-3 py-2 text-[13px] text-ink align-middle";
export const tableWrap = "overflow-x-auto rounded-md border border-line";
export const theadRow = "bg-navy-50 border-b border-line";
export const tbodyRow = "border-b border-line/70 last:border-0 hover:bg-navy-50/60";

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-muted">{children}</p>;
}
