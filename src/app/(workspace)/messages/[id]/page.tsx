import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { readMessage } from "@/lib/server/messages";
import { currentSessionUser } from "@/lib/server/session";
import { MessageDetail } from "./detail";

async function Detail({ params }: { params: PageProps<"/messages/[id]">["params"] }) {
  const { id } = await params;
  const user = await currentSessionUser();
  if (!user) redirect("/login");
  const message = await readMessage(id, user);
  if (!message) notFound();
  return <MessageDetail message={message} />;
}

export default function Page({ params }: PageProps<"/messages/[id]">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading message…</p>}>
      <Detail params={params} />
    </Suspense>
  );
}
