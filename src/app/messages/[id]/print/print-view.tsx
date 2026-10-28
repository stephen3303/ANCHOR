"use client";

import Link from "next/link";
import { useNow } from "@/lib/use-now";
import { ArrowLeft, Printer } from "lucide-react";
import { fmtDateTime } from "@/lib/format";
import { useStore, useUser } from "@/lib/store";
import { Button } from "@/components/ui";

/** Official printable / PDF rendition with integrity information on the page. */
export function PrintView({ id }: { id: string }) {
  const { log, messageById } = useStore();
  const user = useUser();
  const now = useNow();
  const found = messageById(id);
  if (!found) return <p className="text-sm text-muted">No message {id} on file.</p>;
  const m = found;
  const printedAt = now ? fmtDateTime(now) : "";
  const retired = m.lifecycle !== "ACTIVE" && m.lifecycle !== "AMENDED" && m.lifecycle !== "CORRECTED";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-4 flex items-center gap-2">
        <Link href={`/messages/${m.id}`} className="flex items-center gap-1.5 font-medium text-link hover:underline">
          <ArrowLeft className="size-4" /> Back to message
        </Link>
        <Button
          variant="primary"
          icon={Printer}
          className="ml-auto"
          onClick={() => {
            log("Print", `Message (${m.reference})`, "Official rendition printed with integrity block.");
            window.print();
          }}
        >
          Print / Save as PDF
        </Button>
      </div>

      <div className="relative overflow-hidden border border-line bg-white p-8 font-mono text-[13px] leading-6 shadow-sm print:border-0 print:shadow-none">
        {retired && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
            <span className="-rotate-30 text-7xl font-black tracking-widest text-red-600/15">{m.lifecycle}</span>
          </div>
        )}
        <p className="text-center font-bold">{m.classification}</p>
        <p className="mt-4">
          {m.precedence} {m.dtg}
          <br />
          FM {m.originator}
          <br />
          TO {m.to}
          <br />
          INFO {m.info}
          <br />
          BT
          <br />
          {m.classification}
          <br />
          {`MSGID/${m.type}/${m.reference}//`}
          <br />
          {`SUBJ/${m.subject.toUpperCase()}//`}
        </p>
        {m.sections.map((s, i) => (
          <p key={s.heading} className="mt-3">
            {i + 1}. {s.heading.toUpperCase()}.{" "}
            {s.body.length > 1 ? s.body.map((b, j) => `${String.fromCharCode(97 + j)}. ${b}`).join("  ") : s.body[0]}
          </p>
        ))}
        <p className="mt-3">
          BT
          <br />#{m.c2oixId.slice(-4)}
          <br />
          NNNN
        </p>
        <hr className="my-5 border-dashed border-slate-400" />
        <div className="space-y-0.5 font-sans text-xs text-slate-700">
          <p className="font-bold">ANCHOR INTEGRITY VALIDATION</p>
          <p>Status: {m.lifecycle}{m.replacedBy ? ` (see ${m.replacedBy})` : ""}</p>
          <p>Source: C2OIX {m.c2oixId}, stored immutably at ingestion</p>
          <p className="break-all">SHA-256: {m.sha256}</p>
          <p>Verification: hash matches source artifact</p>
          <p suppressHydrationWarning>
            Rendered for {user.name}, {user.unit}, {printedAt}
          </p>
          <p>Printed copies are uncontrolled. Verify the current version in ANCHOR before acting.</p>
          <p className="font-semibold text-amber-700">PROTOTYPE: mock data, not an official record.</p>
        </div>
        <p className="mt-4 text-center font-bold">{m.classification}</p>
      </div>
    </div>
  );
}
