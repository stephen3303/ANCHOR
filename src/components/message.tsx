"use client";

import Link from "next/link";
import { createContext, useContext, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileCode2,
  FileSpreadsheet,
  FileText,
  FileType2,
  Send,
  Sparkles,
} from "lucide-react";
import { messageById, messageByRef, resolveAckStatus, sentByOwnCommand } from "@/lib/data";
import { fmtDateTime, hoursUntil, shortHash } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { Attachment, Message } from "@/lib/types";
import { Button, ClassBadge, LifecycleBadge, Panel, PrecedenceBadge, Tabs, cx, tableWrap, tbodyRow } from "./ui";
import { MessageCellsRow, MessageHeaderRow, messageColumns, type MessageCells } from "./message-columns";

/** When provided, message links open in the existing reader instead of navigating. */
export const MessageReaderNavigation = createContext<((id: string) => void) | null>(null);

function MessageLink({ id, className, children }: { id: string; className?: string; children: ReactNode }) {
  const open = useContext(MessageReaderNavigation);
  return (
    <Link href={`/messages/${id}`} className={className} onNavigate={(e) => {
      if (open) { e.preventDefault(); open(id); }
    }}>
      {children}
    </Link>
  );
}

export function RefLink({ to: r }: { to: string }) {
  const m = messageByRef(r);
  if (!m) return <span>{r}</span>;
  return (
    <MessageLink id={m.id} className="font-semibold text-link hover:underline">
      {r}
    </MessageLink>
  );
}

/** Banner for amended, corrected, cancelled, superseded and expired traffic. */
export function LifecycleNotice({ m }: { m: Message }) {
  if (m.lifecycle === "ACTIVE") {
    if (!m.relatesTo) return null;
    return (
      <div className="mb-3 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
        This message supersedes or cancels <RefLink to={m.relatesTo} />.
      </div>
    );
  }
  const text: Record<Exclude<Message["lifecycle"], "ACTIVE">, { tone: string; body: React.ReactNode }> = {
    SUPERSEDED: { tone: "border-zinc-300 bg-zinc-100 text-zinc-800", body: <>This message has been <strong>superseded</strong> by {m.replacedBy && <RefLink to={m.replacedBy} />}. Do not act on it; use the current version.</> },
    CANCELLED: { tone: "border-red-300 bg-red-50 text-red-900", body: <>This message has been <strong>cancelled</strong>{m.replacedBy && <> by <RefLink to={m.replacedBy} /></>}. It is retained as a record only.</> },
    EXPIRED: { tone: "border-stone-300 bg-stone-100 text-stone-800", body: <>This message has <strong>expired</strong>. It is retained as a record only.</> },
    AMENDED: { tone: "border-sky-300 bg-sky-50 text-sky-900", body: <>This message <strong>amends</strong> {m.relatesTo && <RefLink to={m.relatesTo} />}. Read both together.</> },
    CORRECTED: { tone: "border-indigo-300 bg-indigo-50 text-indigo-900", body: <>This is a <strong>corrected copy</strong> of {m.relatesTo && <RefLink to={m.relatesTo} />}. It replaces the original.</> },
  };
  const t = text[m.lifecycle];
  return (
    <div className={cx("mb-3 flex items-start gap-2 rounded-md border px-3 py-2 text-sm", t.tone)}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{t.body}</span>
    </div>
  );
}

export function AckPanel({ m, compact }: { m: Message; compact?: boolean }) {
  const { userState, acknowledge } = useStore();
  if (!m.ackRequired) return null;
  if (sentByOwnCommand(m)) {
    const { commands } = resolveAckStatus(m);
    const acked = commands.filter((c) => c.receipts.length > 0).length;
    return (
      <div className={cx("flex flex-wrap items-center gap-3 rounded-md border border-line bg-navy-50 px-3 py-2 text-sm", compact && "py-1.5")}>
        <Send className="size-4" aria-hidden />
        <span>
          <strong>Sent by your command</strong> · {acked} of {commands.length} addressee commands acknowledged
        </span>
        <Link href="/reports" className="ml-auto font-semibold text-link hover:underline">View in Reports</Link>
      </div>
    );
  }
  const at = userState[m.id]?.acknowledgedAt;
  if (at)
    return (
      <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">
        <CheckCircle2 className="size-4" aria-hidden /> Acknowledged {fmtDateTime(at)}
      </div>
    );
  const h = m.ackDue ? hoursUntil(m.ackDue) : null;
  return (
    <div className={cx("flex flex-wrap items-center gap-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900", compact && "py-1.5")}>
      <AlertTriangle className="size-4" aria-hidden />
      <span>
        <strong>Acknowledgement required</strong>
        {m.ackDue && <> by {fmtDateTime(m.ackDue)}{h !== null && h <= 24 && <> · escalates to your Department Head in {Math.max(h, 0)}h</>}</>}
      </span>
      <Button variant="danger" size="sm" className="ml-auto" onClick={() => acknowledge(m.id)}>
        Acknowledge receipt
      </Button>
    </div>
  );
}

/** AI summaries are kept visually and semantically apart from the official text. */
export function AiSummary({ text, from = "the official message below" }: { text: string; from?: string }) {
  return (
    <aside aria-label="AI-generated summary" className="mb-4 rounded-md border-2 border-dashed border-violet-300 bg-violet-50 p-3 text-sm">
      <div className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-violet-800">
        <Sparkles className="size-4" aria-hidden /> AI-assisted summary · Not authoritative
      </div>
      <p className="text-violet-950">{text}</p>
      <p className="mt-1 text-xs text-violet-700">Generated from {from}. Always act on the official text.</p>
    </aside>
  );
}

const attIcon = { pdf: FileType2, docx: FileText, xlsx: FileSpreadsheet };
const attTone = { pdf: "text-red-600", docx: "text-blue-600", xlsx: "text-green-600" };
export function Attachments({ items }: { items: Attachment[] }) {
  const { log } = useStore();
  if (!items.length) return null;
  return (
    <Panel title={`Attachments (${items.length})`} action={<button type="button" className="flex items-center gap-1 text-sm text-link" onClick={() => log("Download", "All attachments")}><Download className="size-4" /> Download All</button>}>
      <ul className="space-y-2">
        {items.map((a) => {
          const Icon = attIcon[a.kind];
          return (
            <li key={a.name} className="flex items-center gap-3 rounded-md border border-line p-2">
              <Icon className={cx("size-8", attTone[a.kind])} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-link">{a.name}</div>
                <div className="text-xs text-muted">{a.size}</div>
              </div>
              <button type="button" aria-label={`Open ${a.name}`} onClick={() => log("Download", a.name)} className="rounded border border-line p-1.5 text-link hover:bg-navy-50">
                <ExternalLink className="size-4" />
              </button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/** The official rendition: source and integrity block, then numbered paragraphs. */
export function OfficialText({ m }: { m: Message }) {
  return (
    <article className="rounded-md border border-line bg-white">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line bg-navy-50 px-4 py-2 text-xs text-muted">
        <span className="flex items-center gap-1 font-semibold text-green-800">
          <BadgeCheck className="size-4" aria-hidden /> Official source record
        </span>
        <span>C2OIX {m.c2oixId}</span>
        <span>DTG {m.dtg}</span>
        <span className="font-mono">SHA-256 {shortHash(m.sha256)} (verified)</span>
      </div>
      <div className="space-y-4 p-4 text-[15px] leading-relaxed">
        <div className="font-mono text-xs leading-5 text-muted">
          FM {m.originator}
          <br />
          TO {m.to}
          <br />
          INFO {m.info}
          <br />
          {`SUBJ/${m.subject.toUpperCase()}//`}
        </div>
        {m.sections.map((s, i) => (
          <section key={s.heading}>
            <h3 className="text-base font-bold">
              {i + 1}. {s.heading}
            </h3>
            {s.body.length > 1 ? (
              <ol className="ml-6 list-decimal">
                {s.body.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ol>
            ) : (
              <p className="ml-5">{s.body[0]}</p>
            )}
          </section>
        ))}
      </div>
    </article>
  );
}

/** The text exactly as received: no reflow, no casing changes, no parsing. */
export function RawText({ m }: { m: Message }) {
  const { notify } = useStore();
  const copy = () => {
    navigator.clipboard?.writeText(m.rawText);
    notify("Copied raw message text");
  };
  return (
    <article className="rounded-md border border-line bg-white">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line bg-navy-50 px-4 py-2 text-xs text-muted">
        <span className="flex items-center gap-1 font-semibold text-ink">
          <FileCode2 className="size-4" aria-hidden /> Raw text as received
        </span>
        <span>C2OIX {m.c2oixId}</span>
        <span>Unformatted, exactly as ingested</span>
        <Button size="sm" icon={Copy} className="ml-auto" onClick={copy}>Copy</Button>
      </div>
      <pre className="overflow-x-auto whitespace-pre p-4 font-mono text-[13px] leading-5 text-ink" aria-label="Raw message text">{m.rawText}</pre>
    </article>
  );
}

type Tab = "message" | "raw" | "metadata" | "related" | "references" | "distribution" | "integrity";

export function MessageTabs({ m }: { m: Message }) {
  const [tab, setTab] = useState<Tab>("message");
  const related = m.related.map(messageById).filter(Boolean) as Message[];
  const refs = [m.relatesTo, m.replacedBy].filter(Boolean) as string[];
  return (
    <>
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "message", label: "Message" },
          { id: "raw", label: "Raw Text" },
          { id: "metadata", label: "Metadata" },
          { id: "related", label: `Related Messages (${related.length})` },
          { id: "references", label: `References (${refs.length})` },
          { id: "distribution", label: `Distribution (${m.distribution.length})` },
          { id: "integrity", label: "Integrity" },
        ]}
      />
      {tab === "message" && (
        <>
          {m.aiSummary && <AiSummary text={m.aiSummary} />}
          <OfficialText m={m} />
        </>
      )}
      {tab === "raw" && <RawText m={m} />}
      {tab === "metadata" && <MetadataTable m={m} />}
      {tab === "related" && <MessageList items={related} />}
      {tab === "references" && (refs.length ? <MessageList items={refs.map(messageByRef).filter(Boolean) as Message[]} /> : <p className="text-sm text-muted">No references.</p>)}
      {tab === "distribution" && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {m.distribution.map((d) => (
            <li key={d} className="rounded-md border border-line bg-white px-3 py-2 text-sm">{d}</li>
          ))}
        </ul>
      )}
      {tab === "integrity" && <IntegrityTable m={m} />}
    </>
  );
}

export function MetadataTable({ m }: { m: Message }) {
  const { userState } = useStore();
  const rows: [string, React.ReactNode][] = [
    ["Classification", <ClassBadge key="c" c={m.classification} />],
    ["Precedence", <PrecedenceBadge key="p" p={m.precedence} />],
    ["Status", m.lifecycle === "ACTIVE" ? "Active" : <LifecycleBadge key="l" l={m.lifecycle} />],
    ["Message Type", m.type],
    ["Reference", m.reference],
    ["Date-Time Group", m.dtg],
    ["From", m.originator],
    ["To", m.to],
    ["Information", m.info],
    ["Acknowledgement", !m.ackRequired ? "Not required" : sentByOwnCommand(m) ? "Required of addressees" : userState[m.id]?.acknowledgedAt ? "Acknowledged" : "Required"],
    ["Retention", m.retention],
    ["Size", `${(m.sizeKb / 1024).toFixed(1)} MB`],
  ];
  return (
    <dl className="grid grid-cols-[minmax(0,9rem)_1fr] gap-x-4 gap-y-1.5 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function IntegrityTable({ m }: { m: Message }) {
  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-green-900">
        <CheckCircle2 className="size-4" /> Stored copy matches the source artifact recorded at C2OIX ingestion.
      </div>
      <dl className="grid grid-cols-[minmax(0,10rem)_1fr] gap-x-4 gap-y-1.5">
        <dt className="text-muted">Source</dt><dd>C2OIX (automated ingestion)</dd>
        <dt className="text-muted">C2OIX ID</dt><dd className="font-mono">{m.c2oixId}</dd>
        <dt className="text-muted">SHA-256</dt><dd className="break-all font-mono text-xs">{m.sha256}</dd>
        <dt className="text-muted">Signature</dt><dd>Originator signature verified where available</dd>
        <dt className="text-muted">Storage</dt><dd>Immutable (write once, read many)</dd>
        <dt className="text-muted">Last verified</dt><dd>24 OCT 2026 1310Z (scheduled integrity check)</dd>
      </dl>
    </div>
  );
}

export function MessageList({ items }: { items: Message[] }) {
  if (!items.length) return <p className="text-sm text-muted">None.</p>;
  return (
    <ul className="divide-y divide-line rounded-md border border-line bg-white">
      {items.map((r) => (
        <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm">
          <FileText className="size-4 text-muted" aria-hidden />
          <MessageLink id={r.id} className="font-medium text-link hover:underline">{r.subject}</MessageLink>
          <span className="text-muted">{r.reference}</span>
          <LifecycleBadge l={r.lifecycle} />
          <span className="ml-auto text-muted">{r.dtg}</span>
        </li>
      ))}
    </ul>
  );
}

/** Compact recent-message table used on several dashboards. Columns follow the shared message column order. */
export function MiniMessageTable({ items, cols = ["subject", "reference", "dtg"] }: { items: Message[]; cols?: ("subject" | "reference" | "dtg" | "classification" | "precedence")[] }) {
  const cells: MessageCells<Message> = {
    subject: (m) => <Link href={`/messages/${m.id}`} className="text-link hover:underline">{m.subject}</Link>,
    reference: (m) => m.reference,
    dtg: (m) => m.dtg,
    precedence: (m) => <PrecedenceBadge p={m.precedence} />,
    classification: (m) => <ClassBadge c={m.classification} />,
  };
  const columns = messageColumns<Message>({
    ...Object.fromEntries(cols.map((c) => [c, cells[c]])),
  });
  return (
    <div className={tableWrap}>
      <table className="w-full">
        <thead>
          <MessageHeaderRow cols={columns} />
        </thead>
        <tbody>
          {items.map((m) => (
            <tr key={m.id} className={tbodyRow}>
              <MessageCellsRow cols={columns} row={m} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

