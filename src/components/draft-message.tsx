"use client";

import { Printer } from "lucide-react";
import { Button, Panel, PrecedenceBadge } from "./ui";
import type { Message } from "@/lib/types";
import { fmtDateTime } from "@/lib/format";

export function DraftMessage({ message, onBack, print = false }: { message: Message; onBack?: () => void; print?: boolean }) {
  const released = message.kind === "released";
  const printLabel = released ? "Print released message" : "Print draft";
  return <div className="space-y-4">
    <div className="no-print flex flex-wrap gap-2">
      {onBack ? <Button onClick={onBack}>Back to Messages</Button> : <Button href="/messages">Back to Messages</Button>}
      {!released && <Button href="/drafting">Open Drafting & Release</Button>}
      {print ? <Button icon={Printer} onClick={() => window.print()}>{printLabel}</Button> : <Button icon={Printer} href={`/messages/${message.id}/print`}>{printLabel}</Button>}
    </div>
    <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">{released ? "Released in ANCHOR — External transmission not performed. This is not an official external source record." : "Draft — Not transmitted or released. This is not an official source record."}</p>
    <h1 className="text-2xl font-bold">{message.subject}</h1>
    <dl className="grid gap-2 text-sm sm:grid-cols-2">
      <div><dt className="font-semibold">Sender command</dt><dd>{message.originator}</dd></div>
      <div><dt className="font-semibold">{released ? "Released (Zulu)" : "Created (Zulu)"}</dt><dd>{released ? message.dtg : fmtDateTime(message.received)}</dd></div>
      <div><dt className="font-semibold">Template</dt><dd>{message.templateName}</dd></div>
      <div><dt className="font-semibold">Precedence</dt><dd><PrecedenceBadge p={message.precedence} /></dd></div>
    </dl>
    {released && <p className="text-sm font-semibold">{message.reference}</p>}
    <Panel title={released ? "Approved message text" : "Saved draft text"}><pre className="whitespace-pre-wrap break-words font-mono text-sm">{message.renderedText}</pre></Panel>
  </div>;
}
