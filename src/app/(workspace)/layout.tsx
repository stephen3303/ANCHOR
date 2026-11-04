import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell";
import { UserProvider } from "@/lib/current-user";
import { StoreProvider } from "@/lib/store";
import { currentSessionUser } from "@/lib/server/session";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<p role="status" className="p-6">Loading demo session…</p>}>
      <SessionWorkspace>{children}</SessionWorkspace>
    </Suspense>
  );
}

async function SessionWorkspace({ children }: { children: ReactNode }) {
  // Request-time session data must stream inside Suspense, not be cached or
  // fetched in an effect that replaces the page segment with a loading screen.
  const user = await currentSessionUser();
  if (!user) redirect("/login");
  return (
    <UserProvider initialUser={user}>
      <StoreProvider>
        <AppShell>{children}</AppShell>
      </StoreProvider>
    </UserProvider>
  );
}
