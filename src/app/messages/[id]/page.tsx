import { Suspense } from "react";
import { notFound } from "next/navigation";
import { MESSAGES, messageById } from "@/lib/data";
import { MessageDetail } from "./detail";

export function generateStaticParams() {
  return MESSAGES.map((m) => ({ id: m.id }));
}

async function Detail({ params }: { params: PageProps<"/messages/[id]">["params"] }) {
  const { id } = await params;
  if (!messageById(id)) notFound();
  return <MessageDetail id={id} />;
}

export default function Page({ params }: PageProps<"/messages/[id]">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading message…</p>}>
      <Detail params={params} />
    </Suspense>
  );
}
