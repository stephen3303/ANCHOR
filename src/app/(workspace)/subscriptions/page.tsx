"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Filter, Info, Lock, Pencil, Plus, Radio, Search, Star, FileText, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { MESSAGE_CATEGORIES, MESSAGE_TYPE_INFO, MESSAGE_TYPES, countUnder, keyOf, keyPath, matchesKeys, messageKey, splitKey, subtagsOf } from "@/lib/message-types";
import { MessageTypePicker } from "@/components/message-type-picker";
import type { Frequency, Message, Subscription } from "@/lib/types";
import { Button, Check, Panel, Pill, Select, Tabs, TextInput, Toggle, cx, td, th, theadRow } from "@/components/ui";

// Subscriptions are keyed by MSGID field 2 (the type) and, for topic types,
// field 3 (the subtag). A type alone catches every subtag under it.
const RECOMMENDED: { name: string; description: string; types: string[] }[] = [
  { name: "Submarine Safety", description: "All safety traffic, from stand-downs to hearing conservation.", types: ["SAFETY"] },
  { name: "Motorcycle Safety", description: "Rider training, PPE and mishap prevention.", types: ["SAFETY/MOTORCYCLE"] },
  { name: "Watch Team Qualifications", description: "Watch team qualification standards and changes.", types: ["TRAINING/WATCH-QUALS"] },
  { name: "Records Management", description: "Official records retention and handling.", types: ["POLICY/RECORDS"] },
  { name: "Port Visit Planning", description: "Port visit coordination, logistics requests and port services.", types: ["SUBMARINE/PORT-VISITS", "LOGREQ", "LOGISTICS/PORT-SERVICES"] },
  { name: "Equipment Casualties", description: "CASREPs and casualty corrections across the force.", types: ["CASREP", "MAINTENANCE/CASUALTIES"] },
];

/** "SAFETY (all)" for a whole type with subtags, "SAFETY/ELECTRICAL" otherwise, with the name. */
const keyLabel = (key: string) => {
  const [type, sub] = splitKey(key);
  const all = !sub && MESSAGE_TYPE_INFO[type as keyof typeof MESSAGE_TYPE_INFO]?.subtags?.length;
  return `${key}${all ? " (all)" : ""}`;
};
const keysText = (keys: string[]) => (keys.length ? keys.map(keyLabel).join(", ") : "Any type");

type TabId = "mine" | "recommended" | "categories" | "shared";

function statusPill(s: Subscription) {
  if (s.status === "Pending Approval") return <Pill className="bg-amber-100 text-amber-900">Pending Approval</Pill>;
  if (s.status === "Active") return <Pill className="bg-green-100 text-green-800">Active</Pill>;
  if (s.status === "Denied") return <Pill className="bg-red-100 text-red-800">Denied</Pill>;
  return <Pill className="bg-slate-200 text-slate-700">Paused</Pill>;
}

function matches(s: Subscription, messages: Message[]) {
  return messages.filter(
    (m) =>
      matchesKeys(keyOf(m), s.criteria.messageTypes) &&
      (!s.criteria.precedence || s.criteria.precedence.includes(m.precedence)) &&
      (!s.criteria.originators?.length || s.criteria.originators.includes(m.source)) &&
      (!s.criteria.keywords?.length || s.criteria.keywords.some((k) => (m.subject + " " + keyPath(keyOf(m))).toLowerCase().includes(k.toLowerCase()))),
  );
}

export default function SubscriptionsPage() {
  const { subscriptions, toggleSubscription, requestSubscription, messages } = useStore();
  const [tab, setTab] = useState<TabId>("mine");
  const [cat, setCat] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState("sub-deploy-readiness");
  const [form, setForm] = useState<null | Partial<Subscription>>(null);

  const rows = useMemo(
    () =>
      subscriptions.filter(
        (s) => (!cat || s.criteria.messageTypes.some((k) => splitKey(k)[0] === cat)) && (!q || (s.name + s.description).toLowerCase().includes(q.toLowerCase())),
      ),
    [subscriptions, cat, q],
  );
  const current = subscriptions.find((s) => s.id === selected) ?? subscriptions[0];
  const recent = matches(current, messages).slice(0, 5);
  const messageCount = (key: string) => countUnder(key, messages);
  const subsFor = (type: string) => subscriptions.filter((s) => s.criteria.messageTypes.some((k) => splitKey(k)[0] === type)).length;
  const subscribeTo = (keys: string[], name: string) =>
    setForm({ name, description: `Messages with MSGID type ${keys.map(keyLabel).join(", ")}.`, frequency: "Daily Digest", channels: { inApp: true, email: true, teams: false }, criteria: { messageTypes: keys } });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Radio className="mt-1 size-9 text-navy-900" aria-hidden />
          <div>
            <h1 className="text-2xl font-bold sm:text-[28px]">Message Subscriptions</h1>
            <p className="text-[15px] text-muted">Subscribe by message type, the MSGID field 2 value, or narrow a topic type to its field 3 subtags.</p>
          </div>
        </div>
        <Button variant="primary" icon={Plus} onClick={() => setForm({ frequency: "Daily Digest", channels: { inApp: true, email: true, teams: false }, criteria: { messageTypes: [] } })}>
          Request Subscription
        </Button>
      </div>

      <div className="mb-4 flex items-start gap-2 rounded-md border border-navy-100 bg-navy-50 px-3 py-2 text-sm text-navy-900">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        New subscriptions are routed to your unit Subscription Approver. Subscriptions marked with a lock are assigned by command, role or precedence rule and can&rsquo;t be turned off.
      </div>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "mine", label: `My Subscriptions (${subscriptions.length})` },
          { id: "recommended", label: `Recommended (${RECOMMENDED.length})` },
          { id: "categories", label: "Browse Message Types" },
          { id: "shared", label: "Shared with Me (2)" },
        ]}
      />

      {tab === "recommended" && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {RECOMMENDED.map((r) => (
            <Panel key={r.name}>
              <div className="font-semibold">{r.name}</div>
              <div className="text-xs text-muted">{keysText(r.types)}</div>
              <p className="my-2 text-sm">{r.description}</p>
              <Button size="sm" variant="primary" onClick={() => setForm({ name: r.name, description: r.description, frequency: "Daily Digest", channels: { inApp: true, email: true, teams: false }, criteria: { messageTypes: r.types } })}>
                Request
              </Button>
            </Panel>
          ))}
        </div>
      )}

      {tab === "categories" && (
        <div className="space-y-5">
          {MESSAGE_CATEGORIES.map((category) => (
            <section key={category}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{category}</h2>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {MESSAGE_TYPES.filter((t) => MESSAGE_TYPE_INFO[t].category === category).map((t) => {
                  const info = MESSAGE_TYPE_INFO[t];
                  const subs = subtagsOf(t);
                  return (
                    <Panel key={t}>
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold"><span className="font-mono text-sm">{t}</span>{info.name !== t && ` · ${info.name}`}</div>
                          <div className="text-xs text-muted">{messageCount(t)} messages{subs.length ? ` · ${subs.length} subtags` : ""} · template: {info.template}</div>
                        </div>
                        <Button size="sm" onClick={() => subscribeTo([t], info.name)}>{subs.length ? "Subscribe to all" : "Subscribe"}</Button>
                      </div>
                      {subs.length ? (
                        <div className="flex flex-wrap gap-1.5">
                          {subs.map((st) => {
                            const key = messageKey(t, st.code);
                            return (
                              <button
                                key={key}
                                type="button"
                                onClick={() => subscribeTo([key], st.name)}
                                title={`Request a subscription to ${key}`}
                                className="rounded border border-line bg-white px-2 py-1 text-xs hover:border-navy-600 hover:bg-navy-50"
                              >
                                {st.name} <span className="text-muted">({messageCount(key)})</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : <p className="text-xs text-muted">{info.description}</p>}
                    </Panel>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {tab === "shared" && (
        <Panel>
          <ul className="space-y-2 text-sm">
            <li><strong>Deployment Readiness</strong> shared by LCDR Morgan (N6): &ldquo;Recommend for all division officers.&rdquo;</li>
            <li><strong>Cybersecurity Controls</strong> shared by ITC Ramirez: &ldquo;Covers the new ISSM actions.&rdquo;</li>
          </ul>
        </Panel>
      )}

      {tab === "mine" && (
        <>
          <div className="mb-4 grid gap-4 lg:grid-cols-[250px_1fr]">
            <Panel title="Message Types" bodyClassName="p-2">
              <ul>
                <li>
                  <button type="button" onClick={() => setCat(null)} className={cx("w-full rounded px-3 py-2 text-left text-[15px]", !cat ? "bg-navy-100 font-semibold" : "hover:bg-navy-50")}>
                    All types
                  </button>
                </li>
                {MESSAGE_TYPES.filter((t) => subsFor(t)).map((t) => (
                  <li key={t}>
                    <button type="button" onClick={() => setCat(t)} className={cx("w-full rounded px-3 py-2 text-left text-[15px]", cat === t ? "bg-navy-100 font-semibold" : "hover:bg-navy-50")}>
                      {MESSAGE_TYPE_INFO[t].name} ({subsFor(t)})
                    </button>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel bodyClassName="p-0">
              <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
                <label className="relative min-w-[200px] flex-1">
                  <span className="sr-only">Search subscriptions</span>
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search subscriptions or keywords..." className="w-full rounded-md border border-line py-2 pl-9 pr-3 text-sm focus:outline-2 focus:outline-navy-600" />
                </label>
                <Button variant="primary" icon={Filter} size="sm">Filter</Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px]">
                  <thead>
                    <tr className={theadRow}>
                      <th className={th}>Subscription Name</th>
                      <th className={th}>Message Types</th>
                      <th className={th}>Description</th>
                      <th className={th}>Other Criteria</th>
                      <th className={th}>Frequency</th>
                      <th className={th}>Status</th>
                      <th className={th}>On</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((s) => (
                      <tr key={s.id} onClick={() => setSelected(s.id)} className={cx("cursor-pointer border-b border-line/70 last:border-0", current.id === s.id ? "bg-navy-100/70" : "hover:bg-navy-50")}>
                        <td className={cx(td, "font-semibold")}>
                          <span className="flex items-center gap-1.5">
                            {s.mandatory && <Lock className="size-3.5 text-muted" aria-label="Mandatory" />}
                            {s.name}
                          </span>
                        </td>
                        <td className={td}>{keysText(s.criteria.messageTypes)}</td>
                        <td className={td}>{s.description}</td>
                        <td className={td}>{[...(s.criteria.precedence ?? []), ...(s.criteria.originators ?? []).map((o) => `From ${o}`)].join(", ") || "None"}</td>
                        <td className={td}>{s.frequency}</td>
                        <td className={td}>{statusPill(s)}</td>
                        <td className={td} onClick={(e) => e.stopPropagation()}>
                          <Toggle
                            label={`${s.name} on or off`}
                            checked={s.status === "Active"}
                            disabled={s.mandatory || s.status === "Pending Approval"}
                            onChange={() => toggleSubscription(s.id)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_440px]">
            <Panel title="Subscription Details" action={<Button size="sm" icon={Pencil} disabled={current.mandatory} onClick={() => setForm(current)}>Request Change</Button>}>
              <div className="mb-3 flex items-center gap-3">
                <span className="text-lg font-bold">{current.name}</span>
                {statusPill(current)}
                {current.mandatory && <Pill className="bg-navy-100 text-navy-800"><Lock className="size-3" /> Mandatory</Pill>}
              </div>
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                <Field k="Message Types" v={keysText(current.criteria.messageTypes)} />
                <Field k="Description" v={current.description} />
                <Field k="Other Criteria" v={[...(current.criteria.precedence ?? []), ...(current.criteria.originators ?? []).map((o) => `From ${o}`), ...(current.criteria.keywords ?? []).map((k) => `"${k}"`)].join(", ") || "None"} />
                <Field k="Frequency" v={current.frequency} />
                <Field k="Requested By" v={current.requestedBy} />
                <Field k="Approved By" v={current.approver ?? "Awaiting approval"} />
                <Field k="Date Subscribed" v={current.subscribedOn} />
                <Field k="Last Updated" v={current.lastUpdated} />
                <Field k="Delivery" v={[current.channels.inApp && "In-app", current.channels.email && "Email (NIPR)", current.channels.teams && "Teams"].filter(Boolean).join(", ")} />
              </dl>
              {current.justification && <p className="mt-3 text-sm"><span className="text-muted">Justification:</span> {current.justification}</p>}
            </Panel>
            <Panel title={`Recent Messages (${recent.length})`} action={<Link href="/messages" className="text-sm text-link">View All</Link>}>
              <ul className="space-y-2">
                {recent.map((m) => (
                  <li key={m.id} className="flex items-start gap-2 text-sm">
                    {m.importance === "High" ? <Star className="size-4 fill-gold text-gold" /> : <FileText className="size-4 text-muted" />}
                    <div className="min-w-0 flex-1">
                      <Link href={`/messages/${m.id}`} className="font-medium text-link hover:underline">{m.subject}</Link>
                      <div className="text-xs text-muted">{m.reference}</div>
                    </div>
                    <span className="whitespace-nowrap text-xs text-muted">{m.dtg}</span>
                  </li>
                ))}
                {!recent.length && <li className="text-sm text-muted">No matching messages yet.</li>}
              </ul>
            </Panel>
          </div>
        </>
      )}

      {form && (
        <RequestDialog
          initial={form}
          onClose={() => setForm(null)}
          onSubmit={(s) => {
            requestSubscription(s);
            setForm(null);
            setTab("mine");
          }}
        />
      )}
    </>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="font-semibold">{k}</dt>
      <dd className="text-ink">{v}</dd>
    </div>
  );
}

type Req = Parameters<ReturnType<typeof useStore>["requestSubscription"]>[0];

function RequestDialog({ initial, onClose, onSubmit }: { initial: Partial<Subscription>; onClose: () => void; onSubmit: (s: Req) => void }) {
  const [name, setName] = useState(initial.name ?? "");
  const [description, setDescription] = useState(initial.description ?? "");
  const [types, setTypes] = useState<string[]>(initial.criteria?.messageTypes ?? []);
  const [keywords, setKeywords] = useState((initial.criteria?.keywords ?? []).join(", "));
  const [frequency, setFrequency] = useState<Frequency>(initial.frequency ?? "Daily Digest");
  const [channels, setChannels] = useState(initial.channels ?? { inApp: true, email: true, teams: false });
  const [justification, setJustification] = useState(initial.justification ?? "");
  const valid = name.trim() && justification.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="req-title">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="req-title" className="text-lg font-bold">Request a Subscription</h2>
          <button type="button" onClick={onClose} aria-label="Close"><X className="size-5" /></button>
        </div>
        <div className="space-y-3">
          <TextInput label="Subscription name" value={name} onChange={(e) => setName(e.target.value)} />
          <TextInput label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
          <fieldset>
            <legend className="mb-1 text-sm font-semibold">Message types</legend>
            <p className="mb-1 text-xs text-muted">The MSGID field 2 type. Check a type for everything in it, or open it and pick field 3 subtags. None checked means any type.</p>
            <MessageTypePicker value={types} onChange={setTypes} className="max-h-64 overflow-y-auto rounded-md border border-line p-2" />
          </fieldset>
          <TextInput label="Keywords (comma separated)" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="readiness, deployment" />
          <Select label="Frequency" value={frequency} onChange={(v) => setFrequency(v as Frequency)} options={["Real-time", "Daily Digest", "Weekly"]} />
          <fieldset>
            <legend className="mb-1 text-sm font-semibold">Deliver to</legend>
            <Check label="In-app notifications" checked={channels.inApp} onChange={(v) => setChannels({ ...channels, inApp: v })} />
            <Check label="Email (NIPR)" checked={channels.email} onChange={(v) => setChannels({ ...channels, email: v })} />
            <Check label="Microsoft Teams" checked={channels.teams} onChange={(v) => setChannels({ ...channels, teams: v })} />
          </fieldset>
          <label className="block text-sm">
            <span className="mb-1 block font-semibold">Justification (required for approval)</span>
            <textarea value={justification} onChange={(e) => setJustification(e.target.value)} rows={2} className="w-full rounded-md border border-line p-2 text-sm focus:outline-2 focus:outline-navy-600" />
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!valid}
            onClick={() =>
              onSubmit({
                name,
                description,
                criteria: { messageTypes: types, keywords: keywords.split(",").map((k) => k.trim()).filter(Boolean) },
                frequency,
                channels,
                justification,
              })
            }
          >
            Submit for Approval
          </Button>
        </div>
      </div>
    </div>
  );
}
