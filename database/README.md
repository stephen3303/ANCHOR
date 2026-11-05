# Database schema

## First-time setup (once per new database)

From the repository root, with Node 22+, npm, and Docker Desktop/the Docker daemon
running, copy `.env.example` to `.env` if it does not already exist. Then run:

```sh
npm ci
docker compose up -d --wait postgres
npm run db:migrate
npm run db:seed:commands
npm run db:seed:users
npm run db:seed:routing
npm run db:seed:messages
```

The bundled **`database/seeds/PLADS.txt`** supplies all command names; there is
no dependency on a local Downloads folder. Migrations create the tables; the
seed commands import the directory and initial demo user. These are distinct
operations. See the [root README](../README.md#run-it) to launch the app.

## Routine database startup (every restart, if not already running)

Start Docker Desktop/the Docker daemon first, then run:

```sh
docker compose up -d --wait postgres
```

**That is the only database command needed after an ordinary reboot/stop.**
Do not rerun migrations or seeds for routine startup. Existing records live in
PostgreSQL's `/var/lib/postgresql/data`, backed by the existing `postgres_data`
named Docker volume—not in the plaintext seed folder. Data survives computer and
container restarts and `docker compose down`. The restart policy may start the
container automatically when Docker starts; `up` is safe to run regardless.

Use `docker compose stop` to stop containers without losing data.
**`docker compose down -v` deletes the database volume.** Only use it for a
purposeful reset, then repeat migration/seeding from first-time setup.

## Schema/data updates (only when changed)

- New SQL migration files: start the database and run `npm run db:migrate`.
- Updated `database/seeds/PLADS.txt`: run `npm run db:seed:commands`. Existing IDs
  are retained and missing names are added; this does not delete removed names.
- Missing initial user: run `npm run db:seed:users`. Existing accounts are preserved.
- Default routing: after seeding users, run `npm run db:seed:routing`. This maps
  the demo workflows to actual user UUIDs; existing workflows and counters are preserved.
- Standard Message: migration 006 publishes the bundled template automatically,
  bootstrapping only its LTaylor creator if missing. Existing accounts, matching
  templates, versions and archived state are preserved. The optional
  `npm run db:seed:templates` is idempotent; it does not upgrade published versions.

### Upgrading from the original message-creation branch

Run migrations, then the user/routing/message seeds above. Migration 003a moves
that branch's conflicting table to `legacy_message_creation_records`; it does
not delete it or edit the old migration ledger. Migration 005 copies its saved
drafts and approval history into the new outgoing tables, preserving IDs,
version pins, inputs, snapshots, references and routing configuration. Incoming
main-schema databases are not renamed. Old published records with exact stored
text are imported into the artifact store; demo records lacking raw text stay
in the archive and are supplied by `db:seed:messages` instead. Do not reset the
volume or delete old ledger entries.

The migration runner uses the container's configured credentials, serializes
concurrent runs with a transaction-scoped advisory lock, and applies all pending
SQL in a transaction. `schema_migrations` records filenames and SHA-256 checksums.
Applied files normally must not be edited; add a new numbered migration instead.
One explicitly supported exception is the requested 006 Standard Message seed
amendment (Body textbox to textarea). The runner accepts only the exact original
and revised SHA-256 pair, records both in `schema_migration_amendments`, and
updates the ledger in the same transaction as migration 008. Unknown checksum
changes still abort the transaction. Migration 008 appends a new published
version for existing Standard Message templates that need the fix; it never
updates existing published definitions or retargets message drafts.

`database/init/001-commands.sql` bootstraps the original directory on an empty
Docker volume. The migration runner also records/applies it safely on existing
volumes, before applying files under `database/migrations/`. Run the migration
command after initial startup and after pulling new migrations; Compose does not
automatically migrate an existing database.

## Tables

| Table | Purpose |
| --- | --- |
| `commands` | Existing PLADS directory: UUID and unique name; imported records preserved. |
| `users` | Demo account identity, active flag, full profile JSON, and command foreign key. |
| `user_sessions` | Hashed random session tokens, user foreign key, and eight-hour expiration. |
| `reference_sources` | Allowlisted provider identities, immutable versioned parameter contracts, mutable availability/sync metadata. |
| `message_templates` | Stable template key, display metadata, active flag and creator. |
| `message_template_versions` | Editable unpublished definitions; immutable after publication. |
| `message_drafts` | Partial or generated message drafts pinned to a published template version. |
| `message_draft_references` | Ordered selections and resolved snapshots for the current draft. |
| `outgoing_messages` | Private draft identity, creator/command, idempotency key, expected revision, route snapshot and release metadata. |
| `outgoing_message_events` | Append-only approval history with authenticated actor and approved snapshot hash. |
| `command_routing` | Persisted per-command workflows, designations, settings and serialized release counter. |
| `messages` / `message_artifacts` | Main's published message records and immutable text artifacts; drafts are absent until release. |
| `schema_migrations` | Applied migration ledger. |
| `schema_migration_amendments` | Audited, exact-hash amendments to applied seed files; currently only the 006 Body textarea correction. |

All domain tables have generated UUID keys. Timestamps use `timestamptz`.
New `created_by` values are server-resolved user UUIDs stored as text, not a caller's
submitted identity. Legacy creator strings are retained (no foreign key is added
to historical author columns). Publishing requires the feature opt-in and a
valid demo session. These are passwordless hackathon accounts, not real identity
verification; there is no tenant model, production authorization, or row-level
security. Replace the account picker with real authentication and enforce
ownership/command access before deployment. Never expose database credentials
to the browser.

Run `npm run db:seed:users` after migration 003. It imports `CURRENT_USER` as
`LTaylor` and explicitly links it to `COMSUBLANT NORFOLK VA`. Repeated seeds do
not reset account edits. Accounts can be added through SQL for the hackathon.
Session cookies are random tokens, not raw user IDs. Only their SHA-256 hashes
are stored; login rotates the browser's previous session, logout revokes it,
and expired or inactive-user sessions are rejected. No global default sender
or silent default user is used when a cookie is missing.

## Template editing and publication

1. Insert `message_templates`, then an unpublished `message_template_versions`
   row with a positive version number unique to the template.
2. Save input validation in `input_schema`, controls/labels/reference bindings in
   `ui_schema`, and subject/header/section templates in `output_definition`.
   `formatting_profile` and `renderer_version` identify rendering behavior.
3. Reference bindings identify a source key and contract version, with declarative
   constant/field parameter bindings. Keep external URLs and credentials out of JSON.
4. Before setting `published_at`, the application must validate the JSON Schema,
   field/control compatibility, reference contracts, parameter bindings,
   dependencies and output variable references. The current API constructs schemas
   from a validated allowlisted field definition, with no arbitrary bindings,
   conditions, or executable template expressions. Database checks enforce JSON
   object shapes, not full JSON Schema semantics or executable-template safety.
5. Publication freezes the entire version at the database level, including
   deletion. To revise it, create a new version. Archive the parent template by
   setting `active = false` rather than modifying published history.

Both template versions and message drafts automatically increment `revision` on
updates. For optimistic concurrency, update with `WHERE id = $id AND revision =
$expected_revision`; treat zero affected rows as a conflict. Allocate new version
numbers transactionally and handle the unique constraint on competing saves.

## Choice output overrides

Choice fields can store optional `optionOutputs` in `ui_schema.fields`: an object
mapping a displayed option label to its rendered plaintext. Boolean checkboxes
use `YES` and `NO` keys. Empty overrides are omitted during validation, so absent
values retain label output. `input_schema` continues to describe selected labels
or booleans, not the replacement text. Replacements are applied once during
rendering, including each selected checkbox-group item; they are not executable
template source. Unsupported control/label mappings are rejected by the API.
These additions require no database migration. Number controls are no longer
accepted for new templates; the library preview renders legacy ones as text.

## Autogenerated field bindings

`ui_schema.fields` can contain `control: "autogenerated"` and a versioned
`generator: { key, version }`. New timestamp/date outputs use version 2 for
military Zulu presentation; legacy version 1 ISO UTC/Z bindings remain supported.
Sender command and DTG outputs use version 1 (the stored key remains `sending-command`). The allowlisted keys are `sending-command`,
`current-timestamp`, `current-date`, and `current-dtg`. No new columns or migration
are needed. Published bindings are immutable along with the rest of the version.
`input_schema` describes user input only: autogenerated fields are absent from
its properties and required list. A generation service must resolve them separately
from trusted context; never require users to submit or permit them to override
these values. All generated fields must resolve before authoritative rendering.

The existing stateless preview API exercises the server resolver but stores
nothing. It resolves the sender command from the valid session user's
`users.command_id` joined to `commands`, not a global setting or submitted field.
Draft creation applies the same lookup using the authenticated session's command.
Capture one clock instant per
generation, and save resolved automatic values, generator versions and resolution
time in the draft's `render_metadata` alongside its rendered document/text.
`POST /api/messages` validates template inputs and saves them atomically with
reference snapshots. `GET /api/messages?view=drafts` is scoped to the creator,
assigned reviewers, or the command's admins; ordinary `GET /api/messages` remains
main's published feed with read-state and acknowledgement data. Draft transition
requests use `PATCH /api/messages/:id` with an expected revision. The drafter
can edit any unpublished message, including one under review or withdrawn.
Content or chain edits reset status to drafting and clear all approvals atomically;
resubmission starts fresh approval on the saved chain. `action: "route"` accepts
1–20 distinct active command accounts as `{title, personId, action}` steps, ending
with exactly one designated release authority; `steps: null` restores a copy of
the command default. Clients cannot supply step status, approval timestamps or
actors. These customizations do not modify command configuration.
New approval-history entries include an append-only `route_snapshot`.
Migration 007 adds `route_custom` and database publication locks: released
outgoing rows, local published message records, saved inputs and reference
snapshots cannot be updated or deleted. Truncation is also blocked. Incoming
C2OIX lifecycle handling and separate read/acknowledgement state are unchanged. Only the current signed-in holder can approve or release, and
release also checks their current role and command designation.

Release publishes the exact approved body to main's artifact store in the same
transaction as the status/event/counter update. Local artifacts use `ANCHOR-…`
identifiers and real text hashes, not fabricated external receipts. No live
C2OIX transmission is implemented by this workflow. Command configuration changes
are admin-only and revision-checked; in-flight route snapshots are not rewritten.
Do not resolve outputs when publishing templates or on every draft read.

## Editing published templates

`PATCH /api/message-templates/:id` accepts `{expectedVersionId, definition}`.
The feature flag, signed-in creator or same-command System Admin, same origin,
definition validation and command-directory availability are checked on the
server. A parent-row lock serializes publishers; stale version IDs return 409.
The next version number accounts for unpublished versions as well. Publication
inserts a new immutable definition and updates parent display metadata in one
transaction. Existing message version pins and rendered snapshots are untouched.
The library returns a request-specific `canEdit` flag and must not be cached.

## Saving messages

A draft must reference a published version. Incomplete inputs can be saved with
null generated output; this supports saving work in progress without implying
that it is valid or ready to send. Generated structured document and text must
both be present or both be null.

The current API requires valid, complete template inputs before saving rendered
output; the nullable schema also supports future incomplete-draft saving.
The save service executes one transaction to:

- Authenticate/authorize and check the expected draft revision.
- Validate input values and resolve selected IDs under the appropriate parameters.
- Resolve autogenerated bindings from trusted command context and one server clock;
  do not accept resolved automatic values from the client.
- Apply the 69-character line policy after substitution: word wrap at whitespace
  where possible, hard break unbroken text at character 69 otherwise (Unicode code
  points, without splitting surrogate pairs). Preserve original input values.
- Update inputs, generated subject/metadata, canonical wrapped document, final
  text, and actual formatting/renderer metadata together. Formatting profile
  version 2 records line length 69, word/hard wrapping and LF newlines. Previously
  published template profiles are not rewritten; every new save records the
  actual policy in `render_metadata.formatting`.
- Reject submission/release of legacy overlong snapshots until the owner resaves
  and obtains fresh approvals. Do not silently rewrap approved or published text.
- Replace `message_draft_references` with the corresponding resolved selections.

When saving incomplete/changed inputs without rendering, clear both generated
outputs, render metadata and obsolete reference snapshots in that transaction.
The database cannot determine whether two rendered outputs faithfully represent
their input values; the application owns that invariant.

For command selections, `command_id` is a real foreign key. For future non-command
providers, `external_record_id` holds their stable identifier. Exactly one must
be present. A selection also stores source identity, order, resolved business
parameters, source revision and an immutable-in-practice snapshot of the values
used for rendering. Source/record eligibility and matching a field to its declared
source must be validated by the service. Snapshots are not automatically refreshed
when directory records change, nor are these rows a full draft revision history.

The built-in `recipient-commands` contract points to `local-commands` and accepts
no template business parameters yet. New parameter contracts require a new source
version; ordinary source health metadata can be updated in place. The existing
PLADS data supplies names only, not verified routing addresses or permissions.
No send/release behavior should infer those from a command name.

## Checks

```sh
npm run db:migrate
# Safe to run repeatedly; schema tests roll back all changes.
docker compose exec -T postgres sh -c 'psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < database/tests/message-templates.sql
```

Tests cover publication immutability, revision increments, reference contract
immutability, JSON/choice checks, uniqueness, foreign keys, snapshot preservation,
and reference cleanup on draft deletion. No template fixtures are seeded into
the persistent database; the only initial reference source is the PLADS directory.
