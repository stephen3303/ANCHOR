// ANCHOR's store: one SQLite file (node:sqlite, built into Node 22).
//
// Source artifacts (the raw C2OIX text) and the audit log are append-only:
// triggers refuse UPDATE and DELETE on them, so the official record can only
// grow. Everything the UI shows as official text is parsed from the artifact.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS artifacts (
  c2oix_id    TEXT PRIMARY KEY,
  sha256      TEXT NOT NULL,
  raw         TEXT NOT NULL,
  size_bytes  INTEGER NOT NULL,
  ingested_at TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS artifacts_no_update BEFORE UPDATE ON artifacts
  BEGIN SELECT RAISE(ABORT, 'source artifacts are immutable'); END;
CREATE TRIGGER IF NOT EXISTS artifacts_no_delete BEFORE DELETE ON artifacts
  BEGIN SELECT RAISE(ABORT, 'source artifacts are immutable'); END;

CREATE TABLE IF NOT EXISTS messages (
  id          TEXT PRIMARY KEY,
  reference   TEXT NOT NULL UNIQUE,
  c2oix_id    TEXT NOT NULL REFERENCES artifacts(c2oix_id),
  received    TEXT NOT NULL,
  lifecycle   TEXT NOT NULL,
  replaced_by TEXT,
  enrichment  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_received ON messages(received DESC);

CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  id UNINDEXED, reference, subject, originator, body
);

CREATE TABLE IF NOT EXISTS user_state (
  login           TEXT NOT NULL,
  message_id      TEXT NOT NULL,
  read            TEXT NOT NULL DEFAULT 'new',
  starred         INTEGER NOT NULL DEFAULT 0,
  acknowledged_at TEXT,
  PRIMARY KEY (login, message_id)
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id      TEXT PRIMARY KEY,
  owner   TEXT NOT NULL,
  status  TEXT NOT NULL,
  data    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit (
  seq            INTEGER PRIMARY KEY AUTOINCREMENT,
  id             TEXT NOT NULL UNIQUE,
  timestamp      TEXT NOT NULL,
  user           TEXT NOT NULL,
  action         TEXT NOT NULL,
  resource       TEXT NOT NULL,
  classification TEXT NOT NULL,
  result         TEXT NOT NULL,
  source_ip      TEXT NOT NULL,
  device         TEXT NOT NULL,
  location       TEXT NOT NULL,
  details        TEXT NOT NULL,
  prev_hash      TEXT NOT NULL,
  hash           TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit
  BEGIN SELECT RAISE(ABORT, 'audit log is append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit
  BEGIN SELECT RAISE(ABORT, 'audit log is append-only'); END;

CREATE TABLE IF NOT EXISTS watch (
  unit      TEXT PRIMARY KEY,
  notes     TEXT NOT NULL,
  checklist TEXT NOT NULL
);

-- EMCON queue items already applied, so a retried sync can't apply one twice.
CREATE TABLE IF NOT EXISTS sync_applied (
  login      TEXT NOT NULL,
  qid        TEXT NOT NULL,
  applied_at TEXT NOT NULL,
  ok         INTEGER NOT NULL,
  error      TEXT,
  PRIMARY KEY (login, qid)
);

-- Network topology demonstration: the C2OIX server's queue, the links between
-- the nodes, and which workstation each message has reached. Simulation only;
-- nothing here is official record, so it can be reset.
CREATE TABLE IF NOT EXISTS sim_message (
  seq         INTEGER PRIMARY KEY,
  reference   TEXT NOT NULL,
  subject     TEXT NOT NULL,
  precedence  TEXT NOT NULL,
  status      TEXT NOT NULL,          -- queued | waiting | ingested
  released_at TEXT,
  ingested_at TEXT
);
CREATE TABLE IF NOT EXISTS sim_link (
  key        TEXT PRIMARY KEY,        -- circuit | ws1 | ws2 | ws3
  up         INTEGER NOT NULL,
  changed_at TEXT NOT NULL,
  changed_by TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sim_delivery (
  seq          INTEGER NOT NULL REFERENCES sim_message(seq) ON DELETE CASCADE,
  station      TEXT NOT NULL,
  delivered_at TEXT NOT NULL,
  PRIMARY KEY (seq, station)
);
`;

export function dbPath(): string {
  return process.env.ANCHOR_DB ?? path.join(process.cwd(), "data", "anchor.db");
}

/** Open (and create) a database at the given path. ":memory:" works for tests. */
export function openDb(file: string): DatabaseSync {
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  db.exec(SCHEMA);
  return db;
}

const depth = new WeakMap<DatabaseSync, number>();

/** Run fn in a transaction; roll back if it throws. Nested calls use savepoints. */
export function tx<T>(db: DatabaseSync, fn: () => T): T {
  const d = depth.get(db) ?? 0;
  const sp = `sp${d}`;
  db.exec(d ? `SAVEPOINT ${sp}` : "BEGIN IMMEDIATE");
  depth.set(db, d + 1);
  try {
    const out = fn();
    db.exec(d ? `RELEASE ${sp}` : "COMMIT");
    return out;
  } catch (e) {
    db.exec(d ? `ROLLBACK TO ${sp}; RELEASE ${sp}` : "ROLLBACK");
    throw e;
  } finally {
    depth.set(db, d);
  }
}
