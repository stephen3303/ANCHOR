import { Suspense } from "react";
import { notFound } from "next/navigation";
import { MESSAGES, messageById } from "@/lib/data";
import { PrintView } from "./print-view";

export function generateStaticParams() {
  return MESSAGES.map((m) => ({ id: m.id }));
}

async function Rendition({ params }: { params: PageProps<"/messages/[id]/print">["params"] }) {
  const { id } = await params;
  if (!messageById(id)) notFound();
  return <PrintView id={id} />;
}

export default function Page({ params }: PageProps<"/messages/[id]/print">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading rendition…</p>}>
      <Rendition params={params} />
    </Suspense>
  );
}
