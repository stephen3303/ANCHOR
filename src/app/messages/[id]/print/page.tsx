import { Suspense } from "react";
import { PrintView } from "./print-view";

async function Rendition({ params }: { params: PageProps<"/messages/[id]/print">["params"] }) {
  const { id } = await params;
  return <PrintView id={id} />;
}

export default function Page({ params }: PageProps<"/messages/[id]/print">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading rendition…</p>}>
      <Rendition params={params} />
    </Suspense>
  );
}
