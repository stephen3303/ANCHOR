// First-run seed: renders the fictional demo traffic as raw naval text and runs
// it through the same ingestion path live traffic uses, so the demo data gets
// real hashes, real parsing and real lifecycle links.
import type { DatabaseSync } from "node:sqlite";
import { renderNavalMessage, type Directive } from "../lib/naval.ts";
import { APPROVAL_QUEUE, AUDIT_EVENTS, INITIAL_USER_STATE, MESSAGES, SUBSCRIPTIONS, TURNOVER_CHECKLIST, WATCH_NOTES } from "../lib/data.ts";
import type { Message } from "../lib/types";
import { appendAudit, ingestRaw, type Enrichment } from "./repo.ts";
import { tx } from "./db.ts";
import { USERS } from "../lib/users.ts";

export const SEED_UNIT = USERS[0].unit;

function directiveFor(m: Message): { kind: Directive; target: string } | undefined {
  if (!m.relatesTo) return undefined;
  if (m.lifecycle === "AMENDED") return { kind: "AMENDS", target: m.relatesTo };
  const t = MESSAGES.find((x) => x.reference === m.relatesTo);
  if (t?.lifecycle === "SUPERSEDED") return { kind: m.lifecycle === "CORRECTED" ? "CORRECTS" : "SUPERSEDES", target: m.relatesTo };
  if (t?.lifecycle === "CANCELLED") return { kind: "CANCELS", target: m.relatesTo };
  return undefined;
}

/** Raw C2OIX text for a demo message. */
export function rawFor(m: Message): string {
  const directive = directiveFor(m);
  return renderNavalMessage({
    ...m,
    directive,
    references: !directive && m.relatesTo ? [m.relatesTo] : [],
    ackDue: m.ackRequired ? m.ackDue : undefined,
    expires: m.lifecycle === "EXPIRED" ? new Date(new Date(m.received).getTime() + 86_400_000).toISOString() : undefined,
  });
}

const loginFor = (name: string) => USERS.find((u) => u.name === name)?.login ?? name.replace(/\s+/g, "");

export function seedIfEmpty(db: DatabaseSync): boolean {
  if ((db.prepare("SELECT COUNT(*) AS n FROM artifacts").get() as { n: number }).n > 0) return false;

  // Historic audit trail first, oldest first, so the chain starts there.
  for (const e of [...AUDIT_EVENTS].reverse())
    appendAudit(db, { login: e.user, ip: e.sourceIp, device: e.device, location: e.location }, e.action, e.resource, e.details, {
      result: e.result,
      timestamp: e.timestamp,
    });

  const oldestFirst = [...MESSAGES].sort((a, b) => a.received.localeCompare(b.received));
  for (const m of oldestFirst) {
    const enrichment: Enrichment = {
      communities: m.communities,
      importance: m.importance,
      source: m.source,
      attachments: m.attachments,
      distribution: m.distribution,
      retention: m.retention.replace(" (expired)", ""),
      related: m.related,
      sizeKb: m.sizeKb,
      aiSummary: m.aiSummary,
      actionItem: m.actionItem,
      ackRequired: m.ackRequired,
    };
    ingestRaw(db, rawFor(m), { id: m.id, c2oixId: m.c2oixId, enrichment, audit: false });
  }
  appendAudit(db, { login: "System", device: "ANCHOR-INGEST", location: "C2OIX gateway" }, "Ingest", `C2OIX feed (${MESSAGES.length} messages)`, "Initial load. Source artifacts stored immutably; SHA-256 recorded for each.");

  tx(db, () => {
    const st = db.prepare("INSERT INTO user_state (login, message_id, read, starred, acknowledged_at) VALUES (?, ?, ?, ?, ?)");
    for (const [id, s] of Object.entries(INITIAL_USER_STATE)) st.run(USERS[0].login, id, s.read, s.starred ? 1 : 0, s.acknowledgedAt ?? null);

    const sub = db.prepare("INSERT INTO subscriptions (id, owner, status, data) VALUES (?, ?, ?, ?)");
    for (const s of SUBSCRIPTIONS) sub.run(s.id, USERS[0].login, s.status, JSON.stringify(s));
    for (const s of APPROVAL_QUEUE) sub.run(s.id, loginFor(s.requester), s.status, JSON.stringify({ ...s, requestedBy: s.requester, approver: undefined }));

    db.prepare("INSERT INTO watch (unit, notes, checklist) VALUES (?, ?, ?)").run(
      SEED_UNIT,
      JSON.stringify(WATCH_NOTES),
      JSON.stringify(Object.fromEntries(TURNOVER_CHECKLIST.map((c, i) => [c, i < TURNOVER_CHECKLIST.length - 1]))),
    );
  });
  return true;
}
