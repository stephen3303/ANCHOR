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
`;

export function dbPath(): string {
  return process.env.ANCHOR_DB ?? path.join(process.cwd(), "data", "anchor.db");
}

/** Open (and create) a database at the given path. ":memory:" works for tests. */
export function openDb(file: string): DatabaseSync {
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  return db;
}

/** Run fn in a transaction; roll back if it throws. */
export function tx<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
