// Everything ANCHOR does to its store. Each function takes the database so
// tests can run it against ":memory:".
import type { DatabaseSync } from "node:sqlite";
import { tx } from "./db.ts";
import { eventHash, GENESIS, sha256, verifyChain, type ChainCheck } from "./chain.ts";
import {
  idFor,
  NavalParseError,
  ownLifecycle,
  parseNavalMessage,
  targetLifecycle,
  type ParsedMessage,
} from "../lib/naval.ts";
import type {
  ActionItem,
  AuditEvent,
  Classification,
  Community,
  Importance,
  Lifecycle,
  Message,
  MessageUserState,
  Subscription,
} from "../lib/types";

/** ANCHOR's own metadata about a message. Never part of the official text. */
export interface Enrichment {
  communities: Community[];
  importance: Importance;
  source: string;
  attachments: Message["attachments"];
  distribution: string[];
  retention: string;
  related: string[];
  sizeKb?: number;
  aiSummary?: string;
  actionItem?: Message["actionItem"];
  /** Set by the ingest rules; an explicit ACK/ line in the text always wins. */
  ackRequired?: boolean;
}

export interface Actor {
  login: string;
  ip?: string;
  device?: string;
  location?: string;
}

const SYSTEM: Actor = { login: "System", device: "ANCHOR-INGEST", location: "C2OIX gateway" };

// ---------------------------------------------------------------- audit log

export function appendAudit(
  db: DatabaseSync,
  actor: Actor,
  action: string,
  resource: string,
  details: string,
  opts: { result?: AuditEvent["result"]; classification?: Classification; timestamp?: string } = {},
): AuditEvent {
  return tx(db, () => appendAuditRow(db, actor, action, resource, details, opts));
}

function appendAuditRow(
  db: DatabaseSync,
  actor: Actor,
  action: string,
  resource: string,
  details: string,
  opts: { result?: AuditEvent["result"]; classification?: Classification; timestamp?: string },
): AuditEvent {
  const last = db.prepare("SELECT hash FROM audit ORDER BY seq DESC LIMIT 1").get() as { hash: string } | undefined;
  const prev = last?.hash ?? GENESIS;
  const e = {
    id: `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: opts.timestamp ?? new Date().toISOString(),
    user: actor.login,
    action,
    resource,
    classification: opts.classification ?? "UNCLASSIFIED",
    result: opts.result ?? "Success",
    sourceIp: actor.ip ?? "10.15.32.18",
    device: actor.device ?? "ANCHOR-WEB",
    location: actor.location ?? "Pilot Unit (SSN)",
    details,
  };
  const hash = eventHash(prev, e);
  db.prepare(
    `INSERT INTO audit (id, timestamp, user, action, resource, classification, result, source_ip, device, location, details, prev_hash, hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(e.id, e.timestamp, e.user, e.action, e.resource, e.classification, e.result, e.sourceIp, e.device, e.location, e.details, prev, hash);
  return { ...e, classification: e.classification as Classification, hash };
}

interface AuditRow {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  resource: string;
  classification: string;
  result: string;
  source_ip: string;
  device: string;
  location: string;
  details: string;
  prev_hash: string;
  hash: string;
}

const auditFromRow = (r: AuditRow) => ({
  id: r.id,
  timestamp: r.timestamp,
  user: r.user,
  action: r.action,
  resource: r.resource,
  classification: r.classification as Classification,
  result: r.result as AuditEvent["result"],
  sourceIp: r.source_ip,
  device: r.device,
  location: r.location,
  details: r.details,
  prevHash: r.prev_hash,
  hash: r.hash,
});

/** Newest first, for display. */
export function listAudit(db: DatabaseSync, limit = 500): AuditEvent[] {
  return (db.prepare("SELECT * FROM audit ORDER BY seq DESC LIMIT ?").all(limit) as unknown as AuditRow[]).map(auditFromRow);
}

/** Totals across the whole log, not just the page of events sent to the screen. */
export function auditStats(db: DatabaseSync): { events: number; users: number } {
  const r = db.prepare("SELECT COUNT(*) AS events, COUNT(DISTINCT user) AS users FROM audit").get() as { events: number; users: number };
  return { events: r.events, users: r.users };
}

export function verifyAudit(db: DatabaseSync): ChainCheck {
  return verifyChain((db.prepare("SELECT * FROM audit ORDER BY seq ASC").all() as unknown as AuditRow[]).map(auditFromRow));
}

// ---------------------------------------------------------------- ingestion

const KEYWORDS: [RegExp, Community][] = [
  [/submarine|comsub|subron|ssn\b|undersea/i, "Submarine Warfare"],
  [/cyber|network|isso?m|patch/i, "Cybersecurity"],
  [/readiness|deploy/i, "Readiness"],
  [/personnel|assignment|detailer|leave|sailor/i, "Personnel"],
  [/training|course|qualif/i, "Training & Education"],
  [/maintenance|availability|repair/i, "Maintenance"],
  [/safety|mishap|stand-down/i, "Safety"],
  [/policy|instruction|records/i, "Policy"],
];

/** Rules ANCHOR applies to traffic it has no other metadata for. */
export function deriveEnrichment(p: ParsedMessage, existingIds: Set<string>): Enrichment {
  const text = `${p.subject} ${p.originator} ${p.sections.map((s) => s.body.join(" ")).join(" ")}`;
  const communities = KEYWORDS.filter(([re]) => re.test(text)).map(([, c]) => c);
  return {
    communities: communities.length ? communities : ["Policy"],
    importance: p.precedence === "FLASH" || p.precedence === "IMMEDIATE" ? "High" : p.precedence === "PRIORITY" ? "Medium" : "Low",
    source: p.originator.split(/\s+/)[0].toUpperCase(),
    attachments: [],
    distribution: ["COMSUBLANT N6", "Pilot Unit (SSN) Wardroom", "Comms Division"],
    retention: "Permanent",
    related: p.references.map(idFor).filter((id) => existingIds.has(id)),
  };
}

export interface IngestResult {
  message: Message;
  duplicate: boolean;
  /** Messages whose lifecycle this one changed, e.g. the one it supersedes */
  changed: string[];
}

export class IngestError extends Error {}

/**
 * Ingest one raw message: hash it, store the artifact unchanged, index it, and
 * apply its lifecycle directive (SUPERSEDES / CANCELS / CORRECTS / AMENDS) to
 * the message it names. Re-ingesting identical bytes is a no-op.
 */
export function ingestRaw(
  db: DatabaseSync,
  raw: string,
  opts: { id?: string; c2oixId?: string; enrichment?: Enrichment; actor?: Actor; audit?: boolean } = {},
): IngestResult {
  // Hash and store exactly what arrived; only the parser normalises line endings.
  const text = raw;
  const hash = sha256(text);
  const actor = opts.actor ?? SYSTEM;

  const dup = db.prepare("SELECT m.id FROM artifacts a JOIN messages m ON m.c2oix_id = a.c2oix_id WHERE a.sha256 = ?").get(hash) as
    | { id: string }
    | undefined;
  if (dup) return { message: getMessage(db, dup.id)!, duplicate: true, changed: [] };

  let p: ParsedMessage;
  try {
    p = parseNavalMessage(text);
  } catch (e) {
    if (e instanceof NavalParseError) {
      if (opts.audit !== false) appendAudit(db, actor, "Ingest", "C2OIX message", `Rejected: ${e.message}`, { result: "Failed" });
      throw new IngestError(e.message);
    }
    throw e;
  }

  if (p.directive?.target === p.reference) throw new IngestError(`${p.reference} names itself in its ${p.directive.kind} line.`);

  const clash = db.prepare("SELECT m.id, a.raw FROM messages m JOIN artifacts a ON a.c2oix_id = m.c2oix_id WHERE m.reference = ?").get(p.reference) as
    | { id: string; raw: string }
    | undefined;
  // The same message retransmitted with other line endings is still the same message.
  if (clash && sameText(clash.raw, text)) return { message: getMessage(db, clash.id)!, duplicate: true, changed: [] };
  if (clash)
    throw new IngestError(
      `${p.reference} is already on file with different text. A change to an official message arrives as a new message that CORRECTS or AMENDS it.`,
    );

  const id = opts.id ?? idFor(p.reference);
  const existing = new Set((db.prepare("SELECT id FROM messages").all() as { id: string }[]).map((r) => r.id));
  if (existing.has(id)) throw new IngestError(`Message id ${id} is already in use.`);
  const enrichment = opts.enrichment ?? deriveEnrichment(p, existing);

  const changed: string[] = [];
  tx(db, () => {
    const c2oixId = opts.c2oixId ?? nextC2oixId(db, p.received);
    db.prepare("INSERT INTO artifacts (c2oix_id, sha256, raw, size_bytes, ingested_at) VALUES (?, ?, ?, ?, ?)").run(
      c2oixId, hash, text, Buffer.byteLength(text, "utf8"), new Date().toISOString(),
    );
    db.prepare("INSERT INTO messages (id, reference, c2oix_id, received, lifecycle, replaced_by, enrichment) VALUES (?, ?, ?, ?, ?, NULL, ?)").run(
      id, p.reference, c2oixId, p.received, ownLifecycle(p), JSON.stringify(enrichment),
    );
    db.prepare("INSERT INTO messages_fts (id, reference, subject, originator, body) VALUES (?, ?, ?, ?, ?)").run(
      id, p.reference, p.subject, p.originator, p.sections.map((s) => `${s.heading} ${s.body.join(" ")}`).join("\n"),
    );

    // This message changes an earlier one.
    if (p.directive) {
      const to = targetLifecycle(p.directive.kind);
      if (to) {
        const r = db.prepare("UPDATE messages SET lifecycle = ?, replaced_by = ? WHERE reference = ?").run(to, p.reference, p.directive.target);
        if (r.changes) changed.push(p.directive.target);
      }
    }
    // An earlier-arriving message already named this one (traffic can arrive out of order).
    for (const later of pendingDirectivesFor(db, p.reference)) {
      db.prepare("UPDATE messages SET lifecycle = ?, replaced_by = ? WHERE id = ?").run(later.lifecycle, later.reference, id);
      changed.push(p.reference);
    }

    if (opts.audit !== false)
      appendAudit(db, actor, "Ingest", `Message (${p.reference})`, `Source artifact stored immutably. SHA-256 ${hash}.${changed.length ? ` Marked ${changed.join(", ")} ${changedVerb(p)}.` : ""}`, {
        classification: p.classification,
      });
  });

  return { message: getMessage(db, id)!, duplicate: false, changed };
}

const sameText = (a: string, b: string) => a.replace(/\r\n?/g, "\n").trimEnd() === b.replace(/\r\n?/g, "\n").trimEnd();

const changedVerb = (p: ParsedMessage) => (p.directive?.kind === "CANCELS" ? "cancelled" : "superseded");

function pendingDirectivesFor(db: DatabaseSync, reference: string): { reference: string; lifecycle: Lifecycle }[] {
  const out: { reference: string; lifecycle: Lifecycle }[] = [];
  // Oldest first, so when several messages name this one the latest applies last.
  const rows = db.prepare("SELECT a.raw FROM messages m JOIN artifacts a ON a.c2oix_id = m.c2oix_id ORDER BY m.received, m.rowid").all() as { raw: string }[];
  for (const r of rows) {
    const p = parseCached(r.raw);
    if (p.directive?.target !== reference) continue;
    const to = targetLifecycle(p.directive.kind);
    if (to) out.push({ reference: p.reference, lifecycle: to });
  }
  return out;
}

function nextC2oixId(db: DatabaseSync, received: string): string {
  const yy = received.slice(2, 4);
  const rows = db.prepare("SELECT c2oix_id FROM artifacts").all() as { c2oix_id: string }[];
  const max = rows.reduce((n, r) => Math.max(n, Number(r.c2oix_id.split("-").pop()) || 0), 48000);
  return `C2OIX-${yy}-${String(max + 37).padStart(6, "0")}`;
}

// ---------------------------------------------------------------- reading

const parsed = new Map<string, ParsedMessage>();
function parseCached(raw: string): ParsedMessage {
  let p = parsed.get(raw);
  if (!p) {
    p = parseNavalMessage(raw);
    parsed.set(raw, p);
  }
  return p;
}

interface MessageRow {
  id: string;
  reference: string;
  c2oix_id: string;
  lifecycle: Lifecycle;
  replaced_by: string | null;
  enrichment: string;
  raw: string;
  sha256: string;
  size_bytes: number;
}

const MESSAGE_SQL = `SELECT m.id, m.reference, m.c2oix_id, m.lifecycle, m.replaced_by, m.enrichment, a.raw, a.sha256, a.size_bytes
  FROM messages m JOIN artifacts a ON a.c2oix_id = m.c2oix_id`;

function toMessage(r: MessageRow, now: Date): Message {
  const p = parseCached(r.raw);
  const e = JSON.parse(r.enrichment) as Enrichment;
  // Mandatory alert rules (Admin screen): FLASH/IMMEDIATE within 2h, safety traffic within 24h.
  const urgent = p.precedence === "FLASH" || p.precedence === "IMMEDIATE";
  const ackRequired = !!p.ackDue || (e.ackRequired ?? (urgent || p.type === "SAFETY MSG"));
  const ackDue =
    p.ackDue ?? (ackRequired ? new Date(new Date(p.received).getTime() + (urgent ? 2 : 24) * 3_600_000).toISOString() : undefined);
  const expired = r.lifecycle === "ACTIVE" && p.expires && new Date(p.expires) < now;
  return {
    id: r.id,
    dtg: p.dtg,
    received: p.received,
    subject: p.subject,
    reference: p.reference,
    type: p.type,
    originator: p.originator,
    source: e.source,
    to: p.to,
    info: p.info,
    precedence: p.precedence,
    classification: p.classification,
    importance: e.importance,
    lifecycle: expired ? "EXPIRED" : r.lifecycle,
    relatesTo: p.directive?.target ?? p.references[0],
    replacedBy: r.replaced_by ?? undefined,
    communities: e.communities,
    attachments: e.attachments,
    sections: p.sections,
    ackRequired,
    ackDue,
    actionItem: e.actionItem,
    c2oixId: r.c2oix_id,
    sha256: r.sha256,
    sizeKb: e.sizeKb ?? Math.max(1, Math.ceil(r.size_bytes / 1024)),
    retention: expired ? "Permanent (expired)" : e.retention,
    distribution: e.distribution,
    related: e.related,
    aiSummary: e.aiSummary,
  };
}

/** Newest first. */
export function listMessages(db: DatabaseSync, now = new Date()): Message[] {
  return (db.prepare(`${MESSAGE_SQL} ORDER BY m.received DESC`).all() as unknown as MessageRow[]).map((r) => toMessage(r, now));
}

export function getMessage(db: DatabaseSync, id: string, now = new Date()): Message | undefined {
  const r = db.prepare(`${MESSAGE_SQL} WHERE m.id = ?`).get(id) as unknown as MessageRow | undefined;
  return r && toMessage(r, now);
}

export function getArtifact(db: DatabaseSync, id: string) {
  return db.prepare("SELECT a.c2oix_id AS c2oixId, a.sha256, a.raw, a.size_bytes AS sizeBytes, a.ingested_at AS ingestedAt FROM messages m JOIN artifacts a ON a.c2oix_id = m.c2oix_id WHERE m.id = ?").get(id) as
    | { c2oixId: string; sha256: string; raw: string; sizeBytes: number; ingestedAt: string }
    | undefined;
}

export interface IntegrityCheck {
  id: string;
  reference: string;
  ok: boolean;
  recorded: string;
  computed: string;
}

/** Recompute each artifact's SHA-256 and compare with the value recorded at ingestion. */
export function verifyMessages(db: DatabaseSync, id?: string): IntegrityCheck[] {
  const rows = db
    .prepare(`SELECT m.id, m.reference, a.sha256, a.raw FROM messages m JOIN artifacts a ON a.c2oix_id = m.c2oix_id${id ? " WHERE m.id = ?" : ""}`)
    .all(...(id ? [id] : [])) as { id: string; reference: string; sha256: string; raw: string }[];
  return rows.map((r) => {
    const computed = sha256(r.raw);
    return { id: r.id, reference: r.reference, ok: computed === r.sha256, recorded: r.sha256, computed };
  });
}

/** Full-text search. Returns message ids, best match first. */
export function searchMessages(db: DatabaseSync, q: string): string[] {
  // Quote each word so FTS syntax in user input can't break the query.
  const terms = q.match(/[\p{L}\p{N}][\p{L}\p{N}./-]*/gu) ?? [];
  if (!terms.length) return [];
  const match = terms.map((t) => `"${t.replace(/"/g, "")}"*`).join(" OR ");
  return (db.prepare("SELECT id FROM messages_fts WHERE messages_fts MATCH ? ORDER BY bm25(messages_fts, 0, 4, 3, 1, 1)").all(match) as { id: string }[]).map((r) => r.id);
}

// ---------------------------------------------------------------- per-user state

export function userState(db: DatabaseSync, login: string): Record<string, MessageUserState> {
  const rows = db.prepare("SELECT message_id, read, starred, acknowledged_at FROM user_state WHERE login = ?").all(login) as {
    message_id: string;
    read: MessageUserState["read"];
    starred: number;
    acknowledged_at: string | null;
  }[];
  const out: Record<string, MessageUserState> = {};
  for (const m of db.prepare("SELECT id FROM messages").all() as { id: string }[]) out[m.id] = { read: "new", starred: false };
  for (const r of rows) out[r.message_id] = { read: r.read, starred: !!r.starred, acknowledgedAt: r.acknowledged_at ?? undefined };
  return out;
}

function upsertState(db: DatabaseSync, login: string, id: string, patch: Partial<{ read: string; starred: number; acknowledged_at: string }>) {
  if (!db.prepare("SELECT 1 FROM messages WHERE id = ?").get(id)) throw new IngestError(`No message ${id}.`);
  db.prepare("INSERT OR IGNORE INTO user_state (login, message_id) VALUES (?, ?)").run(login, id);
  for (const [k, v] of Object.entries(patch)) db.prepare(`UPDATE user_state SET ${k} = ? WHERE login = ? AND message_id = ?`).run(v, login, id);
}

export function setRead(db: DatabaseSync, login: string, id: string, read: MessageUserState["read"]) {
  upsertState(db, login, id, { read });
}

export function markAllRead(db: DatabaseSync, login: string) {
  tx(db, () => {
    for (const m of db.prepare("SELECT id FROM messages").all() as { id: string }[]) upsertState(db, login, m.id, { read: "read" });
  });
}

export function setStar(db: DatabaseSync, login: string, id: string, starred: boolean) {
  upsertState(db, login, id, { starred: starred ? 1 : 0 });
}

/** Acknowledge receipt. The first acknowledgement stands; later ones don't move the time. */
export function acknowledge(db: DatabaseSync, actor: Actor, id: string, at: string, offline = false): string {
  const m = getMessage(db, id);
  if (!m) throw new IngestError(`No message ${id}.`);
  if (!m.ackRequired) throw new IngestError(`${m.reference} does not require acknowledgement.`);
  const prior = db.prepare("SELECT acknowledged_at FROM user_state WHERE login = ? AND message_id = ?").get(actor.login, id) as
    | { acknowledged_at: string | null }
    | undefined;
  if (prior?.acknowledged_at) return prior.acknowledged_at;
  tx(db, () => {
    upsertState(db, actor.login, id, { acknowledged_at: at, read: "read" });
    appendAudit(db, actor, "Acknowledge", `Message (${m.reference})`, offline ? `Acknowledged offline at ${at}; replicated on sync.` : "Receipt acknowledged.");
  });
  return at;
}

/** Who has acknowledged each message, for the accountability report. */
export function acknowledgements(db: DatabaseSync): { login: string; messageId: string; at: string }[] {
  return (db.prepare("SELECT login, message_id, acknowledged_at FROM user_state WHERE acknowledged_at IS NOT NULL").all() as {
    login: string;
    message_id: string;
    acknowledged_at: string;
  }[]).map((r) => ({ login: r.login, messageId: r.message_id, at: r.acknowledged_at }));
}

// ---------------------------------------------------------------- subscriptions

export type ApprovalRequest = Subscription & { requester: string; requestedOn: string };

const subs = (db: DatabaseSync, where: string, ...args: string[]) =>
  (db.prepare(`SELECT data FROM subscriptions WHERE ${where} ORDER BY rowid`).all(...args) as { data: string }[]).map(
    (r) => JSON.parse(r.data) as ApprovalRequest,
  );

export const listSubscriptions = (db: DatabaseSync, login: string): Subscription[] => subs(db, "owner = ?", login);

/** Requests waiting on an approver. Nobody approves their own. */
export const listApprovals = (db: DatabaseSync, login: string): ApprovalRequest[] =>
  subs(db, "status = 'Pending Approval' AND owner != ?", login);

function saveSub(db: DatabaseSync, owner: string, s: Subscription) {
  db.prepare("INSERT INTO subscriptions (id, owner, status, data) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status, data = excluded.data").run(
    s.id, owner, s.status, JSON.stringify(s),
  );
}

const today = () => {
  const d = new Date();
  return `${String(d.getUTCDate()).padStart(2, "0")} ${["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

export function requestSubscription(
  db: DatabaseSync,
  actor: Actor & { name: string },
  s: Omit<Subscription, "id" | "status" | "subscribedOn" | "lastUpdated" | "requestedBy" | "mandatory">,
): Subscription {
  if (!s.name?.trim()) throw new IngestError("A subscription needs a name.");
  const sub: ApprovalRequest = {
    name: s.name,
    category: s.category,
    description: s.description,
    criteria: s.criteria,
    frequency: s.frequency,
    channels: s.channels,
    justification: s.justification,
    id: `sub-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    status: "Pending Approval",
    mandatory: false,
    subscribedOn: "—",
    lastUpdated: today(),
    requestedBy: actor.name,
    requester: actor.name,
    requestedOn: today(),
  };
  tx(db, () => {
    saveSub(db, actor.login, sub);
    appendAudit(db, actor, "Request Subscription", s.name, "Routed to unit Subscription Approver.");
  });
  return sub;
}

/** Set a subscription Active or Paused. Absolute, so replaying it twice changes nothing. */
export function setSubscription(db: DatabaseSync, actor: Actor, id: string, status: "Active" | "Paused"): Subscription {
  const row = db.prepare("SELECT owner, data FROM subscriptions WHERE id = ?").get(id) as { owner: string; data: string } | undefined;
  if (!row || row.owner !== actor.login) throw new IngestError("That subscription isn't yours.");
  const s = JSON.parse(row.data) as Subscription;
  if (s.mandatory) throw new IngestError(`${s.name} is assigned by command and can't be paused.`);
  if (s.status !== "Active" && s.status !== "Paused") throw new IngestError(`${s.name} is ${s.status.toLowerCase()} and can't be paused or resumed.`);
  if (s.status === status) return s;
  const next: Subscription = { ...s, status, lastUpdated: today() };
  tx(db, () => {
    saveSub(db, actor.login, next);
    appendAudit(db, actor, "Update Subscription", s.name, `Subscription ${status.toLowerCase()}.`);
  });
  return next;
}

export function toggleSubscription(db: DatabaseSync, actor: Actor, id: string): Subscription {
  const row = db.prepare("SELECT owner, data FROM subscriptions WHERE id = ?").get(id) as { owner: string; data: string } | undefined;
  if (!row || row.owner !== actor.login) throw new IngestError("That subscription isn't yours.");
  const s = JSON.parse(row.data) as Subscription;
  if (s.mandatory) throw new IngestError(`${s.name} is assigned by command and can't be paused.`);
  if (s.status !== "Active" && s.status !== "Paused") throw new IngestError(`${s.name} is ${s.status.toLowerCase()} and can't be toggled.`);
  const next: Subscription = { ...s, status: s.status === "Active" ? "Paused" : "Active", lastUpdated: today() };
  tx(db, () => {
    saveSub(db, actor.login, next);
    appendAudit(db, actor, "Update Subscription", s.name, `Subscription ${next.status.toLowerCase()}.`);
  });
  return next;
}

export function decideApproval(db: DatabaseSync, actor: Actor & { name: string }, id: string, approve: boolean): Subscription {
  const row = db.prepare("SELECT owner, data FROM subscriptions WHERE id = ?").get(id) as { owner: string; data: string } | undefined;
  if (!row) throw new IngestError("No such request.");
  if (row.owner === actor.login) throw new IngestError("You can't approve your own request.");
  const s = JSON.parse(row.data) as ApprovalRequest;
  if (s.status !== "Pending Approval") throw new IngestError(`That request was already ${s.status.toLowerCase()}.`);
  const next: ApprovalRequest = {
    ...s,
    status: approve ? "Active" : "Denied",
    approver: actor.name,
    subscribedOn: approve ? today() : s.subscribedOn,
    lastUpdated: today(),
  };
  tx(db, () => {
    saveSub(db, row.owner, next);
    appendAudit(db, actor, approve ? "Approve Subscription" : "Deny Subscription", `${s.name} for ${s.requester ?? s.requestedBy}`, approve ? "Subscription active." : "Request denied.");
  });
  return next;
}

// ---------------------------------------------------------------- watch turnover

export function getWatch(db: DatabaseSync, unit: string): { notes: string[]; checklist: Record<string, boolean> } {
  const r = db.prepare("SELECT notes, checklist FROM watch WHERE unit = ?").get(unit) as { notes: string; checklist: string } | undefined;
  return r ? { notes: JSON.parse(r.notes), checklist: JSON.parse(r.checklist) } : { notes: [], checklist: {} };
}

export function saveWatch(db: DatabaseSync, actor: Actor, unit: string, w: { notes?: string[]; checklist?: Record<string, boolean> }) {
  const cur = getWatch(db, unit);
  const next = { notes: w.notes ?? cur.notes, checklist: w.checklist ?? cur.checklist };
  tx(db, () => {
    db.prepare("INSERT INTO watch (unit, notes, checklist) VALUES (?, ?, ?) ON CONFLICT(unit) DO UPDATE SET notes = excluded.notes, checklist = excluded.checklist").run(
      unit, JSON.stringify(next.notes), JSON.stringify(next.checklist),
    );
    if (w.notes) appendAudit(db, actor, "Update Watch Notes", "Watch Turnover", "Watch notes saved.");
    if (w.checklist) appendAudit(db, actor, "Update Watch Checklist", "Watch Turnover", "Turnover checklist saved.");
  });
  return next;
}

export type { ActionItem };

// ---------------------------------------------------------------- EMCON sync bookkeeping

export interface SyncResult {
  qid: string;
  ok: boolean;
  error?: string;
  /** True when this item was applied by an earlier sync and skipped now */
  replay?: boolean;
  /** Not applied, but not refused either: the client keeps it and sends it again later */
  keep?: boolean;
}

export function priorSync(db: DatabaseSync, login: string, qid: string): SyncResult | undefined {
  const r = db.prepare("SELECT ok, error FROM sync_applied WHERE login = ? AND qid = ?").get(login, qid) as { ok: number; error: string | null } | undefined;
  return r ? { qid, ok: !!r.ok, ...(r.error ? { error: r.error } : {}), replay: true } : undefined;
}

export function recordSync(db: DatabaseSync, login: string, r: SyncResult) {
  db.prepare("INSERT OR IGNORE INTO sync_applied (login, qid, applied_at, ok, error) VALUES (?, ?, ?, ?, ?)").run(
    login, r.qid, new Date().toISOString(), r.ok ? 1 : 0, r.error ?? null,
  );
}

/** When the message's source text was stored; no acknowledgement can predate it. */
export function ingestedAt(db: DatabaseSync, id: string): string | undefined {
  const r = db.prepare("SELECT a.ingested_at FROM messages m JOIN artifacts a ON a.c2oix_id = m.c2oix_id WHERE m.id = ?").get(id) as
    | { ingested_at: string }
    | undefined;
  return r?.ingested_at;
}
