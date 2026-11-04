# Server message store on PostgreSQL

Replaces the SQLite server from `claude/project-thread-591m7m`. Main already has
the simulators, topology, the hash-chained audit log, the Raw Text tab and a
PostgreSQL database, so this ports only what main lacks: a server-side message
store fed by C2OIX ingestion, with acknowledgements tracked per command.

## Plan

1. **Parser** (`src/lib/naval.ts`). A pure parser for the raw record-message
   text main already shows on the Raw Text tab: prosign and DTG, FM/TO/INFO,
   classification, SUBJ, MSGID serial, REF, NARR lifecycle directive, ACK due,
   RMKS paragraphs, trailer. No Node or browser APIs, so tests and the seed use it.
2. **Schema** (`database/migrations/004-message-store.sql`).
   - `message_artifacts`: raw text, SHA-256 and size recorded at ingestion.
     Append-only (triggers refuse UPDATE and DELETE).
   - `messages`: one row per serial, pointing at its artifact. Lifecycle and
     `replaced_by` change when later traffic supersedes, cancels or amends it.
     The display record (sections, communities, AI summary) is JSONB.
   - `message_acknowledgements`: append-only, one row per acknowledgement by a
     **command**. Local rows record which user acted; received rows are other
     commands acknowledging traffic this command sent. A command may
     acknowledge more than once (for example after an amendment).
   - `message_user_state`: per-user read state only. Acknowledgement
     is not per user.
3. **Ingest** (`src/lib/server/messages.ts`). Parse, hash, store the artifact,
   create the message, then apply any NARR directive to the message it names.
   Duplicate serials and unparseable traffic are refused with a reason.
4. **Seed** (`scripts/seed-messages.ts`, `npm run db:seed:messages`). Runs every
   demo message's raw text through the parser, checks the parse agrees with the
   demo record, and loads the messages and the demo acknowledgement receipts.
   Idempotent.
5. **API**
   - `GET /api/messages`: messages, the signed-in user's read/star state, and
     acknowledgements keyed by message.
   - `PATCH /api/messages/[id]/state`: read state.
   - `POST /api/messages/[id]/ack`: acknowledge for the user's command.
   - `GET /api/messages/[id]/artifact`: the stored raw text with a recomputed hash.
   - `POST /api/ingest`: raw C2OIX text, System Admin only.
   - `GET /api/integrity`: recompute every artifact hash against the stored one.
6. **Client**. The store holds the message list and acknowledgement receipts,
   starting from the bundled demo data and replacing it with the server's once
   `/api/messages` answers. Pages read messages from the store instead of
   importing the static list. If the message tables are not migrated yet, the
   app keeps working on the bundled data and says so.

Out of scope (follow-ups): server-side audit log, EMCON sync replay, search API
(the search page already searches every loaded message), the demo script and
PowerSpec prompt from the old branch.

## Acceptance criteria

- Raw text for every demo message parses, and the parse matches the demo record's
  serial, DTG, precedence, classification and originator.
- After `db:migrate` and `db:seed:messages`, `/api/messages` returns the demo set
  with real SHA-256 values that the integrity check recomputes successfully.
- Acknowledging received traffic as one user shows it acknowledged for every user
  of the same command, and survives a reload.
- Acknowledgements received from other commands drive the sent-traffic report.
- Ingesting a message that supersedes another marks the target SUPERSEDED with
  `replaced_by` set; a duplicate serial or malformed text is refused with a reason.
- Artifacts and acknowledgements cannot be updated or deleted in the database.
- Ingest needs System Admin; every write needs a session and a same-origin request.
- The production build passes.

## Test strategy

- Unit (`tsx --test`): parser against all demo messages, directive and ACK lines,
  and malformed input; acknowledgement roll-up from receipts.
- Integration (`scripts/test-message-api.mjs`, same harness as the template API
  test): isolated database, migrations and seeds applied, then the API exercised
  end to end, including the database triggers.
- Build: `docker build --target build`.
