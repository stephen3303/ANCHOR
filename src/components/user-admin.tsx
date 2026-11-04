"use client";

// The Admin page's Users tab: list demo accounts, add one, change billet and
// roles, and deactivate or reactivate. Changes persist in PostgreSQL.
import { useEffect, useState } from "react";
import { Lock, Pencil, Plus, Save, UserCheck, UserPlus, UserX, Users } from "lucide-react";
import { ROLE_CATALOG, SYSTEM_ADMIN_ROLE } from "@/lib/demo-users";
import { useCurrentUser } from "@/lib/current-user";
import { useStore } from "@/lib/store";
import { Button, Check, EmptyState, Panel, Pill, Tag, TextInput, Toggle, cx, tableWrap, td, th, theadRow, tbodyRow } from "./ui";

interface ManagedUser {
  id: string;
  login: string;
  name: string;
  active: boolean;
  commandName: string;
  rank: string;
  billet: string;
  unit: string;
  roles: string[];
}

async function request<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method, cache: "no-store",
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "The request failed.");
  return data as T;
}

const message = (reason: unknown) => (reason instanceof Error ? reason.message : "The request failed.");

function RoleChecks({ value, onChange, lockAdmin }: { value: string[]; onChange: (roles: string[]) => void; lockAdmin?: boolean }) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-semibold text-ink">Roles</legend>
      <div className="grid gap-x-4 sm:grid-cols-2">
        {ROLE_CATALOG.map((role) => {
          const locked = lockAdmin && role.name === SYSTEM_ADMIN_ROLE;
          return (
            <div key={role.name} title={locked ? "You cannot remove your own System Admin role." : role.detail} className={cx(locked && "pointer-events-none opacity-60")}>
              <Check
                checked={value.includes(role.name)}
                label={<>{role.name} <span className="text-xs text-muted">· {role.detail}</span></>}
                onChange={(on) => onChange(on ? [...value, role.name] : value.filter((r) => r !== role.name))}
              />
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

function AddUserForm({ onCreated, onCancel }: { onCreated: (user: ManagedUser) => void; onCancel: () => void }) {
  const [form, setForm] = useState({ login: "", rank: "", surname: "", billet: "", unit: "", email: "", roles: ["Message Viewer", "Subscription Requester"] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const submit = async () => {
    setBusy(true); setError("");
    try { onCreated((await request<{ user: ManagedUser }>("/api/admin/users", "POST", form)).user); }
    catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  };
  return (
    <form className="space-y-3 rounded-md border border-line bg-navy-50/50 p-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <h3 className="font-bold text-ink">New user</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <TextInput label="Rank or rate" value={form.rank} onChange={(e) => set({ rank: e.target.value })} placeholder="LT" required />
        <TextInput label="Last name" value={form.surname} onChange={(e) => set({ surname: e.target.value })} placeholder="Jones" required />
        <TextInput label="Login" value={form.login} onChange={(e) => set({ login: e.target.value })} placeholder="TJones" required />
        <TextInput label="Billet" value={form.billet} onChange={(e) => set({ billet: e.target.value })} placeholder="Assistant Operations Officer (N3A)" required />
        <TextInput label="Unit" value={form.unit} onChange={(e) => set({ unit: e.target.value })} placeholder="COMSUBLANT N3" required />
        <TextInput label="Email (optional)" type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} placeholder="jones.t@example.mil" />
      </div>
      <RoleChecks value={form.roles} onChange={(roles) => set({ roles })} />
      {error && <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-md border border-navy-700 bg-navy-700 px-3.5 py-2 text-sm font-semibold text-white hover:bg-navy-800 disabled:opacity-50">
          <UserPlus className="size-[18px]" aria-hidden /> {busy ? "Adding…" : "Add user"}
        </button>
        <Button onClick={onCancel} disabled={busy}>Cancel</Button>
      </div>
    </form>
  );
}

function EditUserRow({ user, self, onSaved, onCancel }: { user: ManagedUser; self: boolean; onSaved: (user: ManagedUser) => void; onCancel: () => void }) {
  const [billet, setBillet] = useState(user.billet);
  const [unit, setUnit] = useState(user.unit);
  const [roles, setRoles] = useState(user.roles);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    setBusy(true); setError("");
    try { onSaved((await request<{ user: ManagedUser }>(`/api/admin/users/${user.id}`, "PATCH", { billet, unit, roles })).user); }
    catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  };
  return (
    <tr className="border-b border-line/70 bg-navy-50/50 last:border-0">
      <td className={td} colSpan={5}>
        <div className="space-y-3 py-1">
          <div className="font-semibold">Editing {user.name} <span className="font-normal text-muted">({user.login})</span></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput label="Billet" value={billet} onChange={(e) => setBillet(e.target.value)} />
            <TextInput label="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
          </div>
          <RoleChecks value={roles} onChange={setRoles} lockAdmin={self} />
          {error && <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" variant="primary" icon={Save} disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save changes"}</Button>
            <Button size="sm" disabled={busy} onClick={onCancel}>Cancel</Button>
          </div>
        </div>
      </td>
    </tr>
  );
}

export function UserAdminPanel() {
  const me = useCurrentUser();
  const { notify } = useStore();
  const isAdmin = me.roles.some((r) => r.name === SYSTEM_ADMIN_ROLE && r.granted);
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(true);

  useEffect(() => {
    if (!isAdmin) return;
    let live = true;
    request<{ users: ManagedUser[] }>("/api/admin/users")
      .then((data) => { if (live) { setUsers(data.users); setError(""); } })
      .catch((reason) => { if (live) setError(message(reason)); });
    return () => { live = false; };
  }, [isAdmin]);

  const replace = (user: ManagedUser) => setUsers((list) => list?.map((u) => (u.id === user.id ? user : u)) ?? [user]);
  const setActive = async (user: ManagedUser, active: boolean) => {
    setBusyId(user.id); setError("");
    try {
      replace((await request<{ user: ManagedUser }>(`/api/admin/users/${user.id}`, "PATCH", { active })).user);
      notify(`${active ? "Reactivated" : "Deactivated"} ${user.name}`);
    } catch (reason) { setError(message(reason)); }
    finally { setBusyId(null); }
  };

  if (!isAdmin) {
    return (
      <Panel title="Users" icon={Users}>
        <p className="flex items-center gap-2 text-sm text-muted">
          <Lock className="size-4" aria-hidden /> Managing users requires the System Admin role. Ask your System Admin, or sign in as an account that holds it.
        </p>
      </Panel>
    );
  }

  const visible = (users ?? []).filter((u) => showInactive || u.active);
  const activeCount = (users ?? []).filter((u) => u.active).length;
  return (
    <Panel
      title={users ? `Users (${activeCount} active of ${users.length})` : "Users"}
      icon={Users}
      action={<Button size="sm" variant="primary" icon={Plus} disabled={adding} onClick={() => { setAdding(true); setEditing(null); }}>Add user</Button>}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">Accounts available at demo sign-in. Deactivated users cannot sign in and are signed out immediately.</p>
        <span className="flex items-center gap-2 text-sm"><Toggle checked={showInactive} onChange={setShowInactive} label="Show deactivated users" /> Show deactivated</span>
      </div>
      {adding && (
        <div className="mb-4">
          <AddUserForm
            onCancel={() => setAdding(false)}
            onCreated={(user) => { setUsers((list) => [...(list ?? []), user]); setAdding(false); notify(`Added ${user.name}`); }}
          />
        </div>
      )}
      {error && <p role="alert" className="mb-3 text-sm font-semibold text-red-700">{error}</p>}
      {users === null ? (
        !error && <p role="status" className="text-sm text-muted">Loading users…</p>
      ) : visible.length ? (
        <div className={tableWrap}>
          <table className="w-full min-w-[820px]">
            <thead>
              <tr className={theadRow}>
                <th className={th}>Name</th>
                <th className={th}>Billet</th>
                <th className={th}>Roles</th>
                <th className={th}>Status</th>
                <th className={th}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((u) => u.id === editing ? (
                <EditUserRow
                  key={u.id}
                  user={u}
                  self={u.id === me.id}
                  onCancel={() => setEditing(null)}
                  onSaved={(user) => { replace(user); setEditing(null); notify(`Updated ${user.name}`); }}
                />
              ) : (
                <tr key={u.id} className={cx(tbodyRow, !u.active && "opacity-60")}>
                  <td className={td}>
                    <div className="font-semibold">{u.name}{u.id === me.id && <span className="font-normal text-muted"> (you)</span>}</div>
                    <div className="text-xs text-muted">{u.login} · {u.commandName}</div>
                  </td>
                  <td className={td}>
                    <div>{u.billet || "—"}</div>
                    <div className="text-xs text-muted">{u.unit}</div>
                  </td>
                  <td className={td}>
                    <div className="flex max-w-md flex-wrap gap-1">
                      {u.roles.length ? u.roles.map((r) => <Tag key={r}>{r}</Tag>) : <span className="text-muted">None</span>}
                    </div>
                  </td>
                  <td className={td}>
                    {u.active ? <Pill className="bg-green-100 text-green-800">Active</Pill> : <Pill className="bg-zinc-200 text-zinc-700">Deactivated</Pill>}
                  </td>
                  <td className={td}>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" icon={Pencil} disabled={!!editing || busyId === u.id} onClick={() => { setEditing(u.id); setAdding(false); }}>Edit</Button>
                      {u.active ? (
                        <Button size="sm" icon={UserX} disabled={u.id === me.id || busyId === u.id} title={u.id === me.id ? "You cannot deactivate your own account." : undefined} onClick={() => void setActive(u, false)}>Deactivate</Button>
                      ) : (
                        <Button size="sm" icon={UserCheck} disabled={busyId === u.id} onClick={() => void setActive(u, true)}>Reactivate</Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState>No users to show.</EmptyState>
      )}
    </Panel>
  );
}
