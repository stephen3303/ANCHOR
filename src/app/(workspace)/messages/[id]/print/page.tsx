import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { readMessage } from "@/lib/server/messages";
import { currentSessionUser } from "@/lib/server/session";
import { PrintView } from "./print-view";

async function Rendition({ params }: { params: PageProps<"/messages/[id]/print">["params"] }) {
  const { id } = await params;
  const user = await currentSessionUser();
  if (!user) redirect("/login");
  const message = await readMessage(id, user);
  if (!message) notFound();
  return <PrintView message={message} />;
}

export default function Page({ params }: PageProps<"/messages/[id]/print">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading rendition…</p>}>
      <Rendition params={params} />
    </Suspense>
  );
}
