"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { AppUser, UserChoice } from "./users";

interface UserContext { user: AppUser; signOut: () => Promise<void> }
const Context = createContext<UserContext | null>(null);
const inputClass = "w-full rounded-md border border-line bg-white px-3 py-2 text-sm";

async function sessionRequest(method = "GET", userId?: string): Promise<AppUser | null> {
  const response = await fetch("/api/session", { method, cache: "no-store", ...(userId ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId }) } : {}) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not load the demo session.");
  return data.user;
}

export function DemoSignIn({ onSignIn }: { onSignIn: (user: AppUser) => void }) {
  const [users, setUsers] = useState<UserChoice[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/users", { signal: controller.signal, cache: "no-store" }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load accounts.");
      if (!controller.signal.aborted) { setUsers(data.users); setSelected(data.users[0]?.id ?? ""); setError(""); }
    }).catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not load accounts."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [retry]);
  const signIn = async () => {
    setBusy(true); setError("");
    try {
      const user = await sessionRequest("POST", selected);
      if (!user) throw new Error("The session could not be established.");
      onSignIn(user);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Sign-in failed."); }
    finally { setBusy(false); }
  };
  return <div data-testid="sign-in-pane" className="flex min-h-0 flex-1 overflow-y-auto overscroll-contain bg-navy-50 p-5">
    <section className="m-auto w-full max-w-lg shrink-0 space-y-4 rounded-lg border border-line bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-bold">ANCHOR — Demo sign in</h1>
      <p className="text-sm text-muted">Select an account for this browser. This passwordless hackathon login does not verify identity. Do not use operational or classified data.</p>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {loading ? <p role="status">Loading accounts…</p> : users.length ? <label className="block space-y-1 text-sm font-semibold">Account<select className={inputClass} value={selected} onChange={(event) => setSelected(event.target.value)}>{users.map((user) => <option key={user.id} value={user.id}>{user.name} ({user.login}) — {user.commandName}</option>)}</select></label> : <p className="text-sm text-muted">No accounts available. Enable demo login, run migrations, and run npm run db:seed:users.</p>}
      <div className="flex gap-2">
        <button type="button" disabled={!selected || busy || loading} onClick={() => void signIn()} className="rounded-md bg-navy-700 px-4 py-2 font-semibold text-white disabled:opacity-50">{busy ? "Signing in…" : "Continue"}</button>
        <button type="button" disabled={busy || loading} onClick={() => { setLoading(true); setRetry((value) => value + 1); }} className="rounded-md border border-line px-4 py-2">Reload accounts</button>
      </div>
    </section>
  </div>;
}

export function UserProvider({ initialUser, children }: { initialUser: AppUser; children: ReactNode }) {
  const requestVersion = useRef(0);
  const [user, setUser] = useState(initialUser);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const refresh = () => {
      const version = ++requestVersion.current;
      return sessionRequest().then((account) => {
        if (!live || version !== requestVersion.current) return;
        if (!account) { window.location.replace("/login"); return; }
        // A new browser account must not reuse a cached workspace or previews
        // from the old session. Recheck the server layout on a full navigation.
        if (account.id !== initialUser.id) { window.location.reload(); return; }
        setUser(account); setError("");
      }).catch((reason) => { if (live && version === requestVersion.current) setError(reason instanceof Error ? reason.message : "Session unavailable."); });
    };
    // The first render already has the server-validated session. Revalidate
    // on focus, without conditionally removing Next's children route segment.
    window.addEventListener("focus", refresh);
    return () => { live = false; window.removeEventListener("focus", refresh); };
  }, [initialUser.id]);
  const signOut = async () => {
    ++requestVersion.current;
    try { await sessionRequest("DELETE"); window.location.replace("/login"); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not sign out."); }
  };
  // Always render the route slot. Sign-in lives on /login; session transitions
  // navigate there rather than dropping the workspace's children from rendering.
  return <Context.Provider key={user.id} value={{ user, signOut }}>{error && <p role="alert" className="no-print max-h-[25dvh] shrink-0 overflow-y-auto overscroll-contain bg-red-50 p-2 text-red-800">{error}</p>}{children}</Context.Provider>;
}
export function useCurrentUser(): AppUser {
  const value = useContext(Context);
  if (!value) throw new Error("useCurrentUser must be used within a signed-in UserProvider.");
  return value.user;
}
export function useUserSession(): UserContext {
  const value = useContext(Context);
  if (!value) throw new Error("useUserSession must be used within a signed-in UserProvider.");
  return value;
}
