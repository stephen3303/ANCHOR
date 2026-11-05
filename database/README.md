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
npm run db:seed:templates
npm run db:seed:messages
```

The bundled **`database/seeds/PLADS.txt`** supplies all command names; there is
no dependency on a local Downloads folder. Migrations create the tables; the
seed commands import the directory, demo users, the bundled Standard Message
template, and 16 fictional messages from `src/lib/data.ts`. These are distinct
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
- Standard Message template: after migrations and user seeding, run `npm run db:seed:templates`.
  This publishes the bundled `database/seeds/standard-message.json` definition on
  a fresh database. Reruns preserve existing templates (including a UI-created
  Standard Message), published versions, pending revisions and archived state.
  Changes to the bundled snapshot do not update existing published templates;
  create a new version deliberately instead. See [seed details](seeds/README.md).
  Test the seed against a disposable database with `npm run test:templates:seed`.
- Messages API upgrade: run migrations (including 004), then `npm run db:seed:messages`
  once. Original mock IDs/documents are preserved; reruns never overwrite records
  or remove user-created drafts.

The migration runner uses the container's configured credentials, serializes
concurrent runs with a transaction-scoped advisory lock, and applies all pending
SQL in a transaction. `schema_migrations` records filenames and SHA-256 checksums.
Applied files must not be edited; add a new numbered migration instead.

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
| `messages` | Seeded message documents and private draft feed records, with creator/request idempotency keys. |
| `message_drafts` | Partial or generated message drafts pinned to a published template version. |
| `message_draft_references` | Ordered selections and resolved snapshots for the current draft. |
| `schema_migrations` | Applied migration ledger. |

Domain tables have generated UUID keys except `messages.id`, which is text to
preserve original mock slugs and accommodate UUIDs for new drafts. Each new feed
record links one-to-one to its draft; its ID is that draft UUID as text.
Timestamps use `timestamptz`.
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
The messages API applies the same lookup at creation (production command
permissions are still future work). It captures one clock instant per generation
and saves resolved automatic values, generator versions, sender context, and
resolution time in `render_metadata` alongside the rendered document/text.
Do not resolve outputs when publishing templates or on every draft read.

## Saving messages

`POST /api/messages` accepts a request UUID, exact published template-version
UUID, subject, precedence, and input values. It requires a valid session. In one
transaction the service:

- Locks the user's idempotency key and returns an existing matching result, or
  rejects reuse with different inputs (409).
- Loads an active published version and validates inputs from its stored field
  definition. Unknown and autogenerated input keys are rejected.
- Resolves original option labels/output overrides, directory IDs/names, and
  automatic fields using one server clock and session sender context.
- Inserts `message_drafts` with user input IDs, canonical unwrapped document,
  final text, and render metadata.
- Inserts ordered `message_draft_references` name/ID snapshots for command fields.
- Inserts the linked `messages` feed document and commits everything atomically.

`GET /api/messages` and `GET /api/messages/:id` return shared seeded received
records plus only the caller's own drafts. Other users' draft IDs return 404.
No editing/deletion/release endpoints or offline draft queue exist yet. The
schema permits partial drafts with null generated output, but this first creation
API requires all mandatory inputs and always saves a complete rendered snapshot.
Generated document/text must both be present or both null. A future edit endpoint
must use revision checks, replace snapshots transactionally, and clear stale
outputs when saving incomplete inputs.

The feed's `record` JSONB preserves the existing `Message` UI shape, all seed
metadata and IDs. New records include `kind: "draft"`, `draftId`, `templateName`
and `renderedText`; they are read/printed separately from official source traffic.
Seeded received records have no creator/draft/request key. New drafts are owned,
untransmitted, UNCLASSIFIED records, not official C2OIX ingestions. No ingestion
IDs or verified source hashes are invented. Record and draft snapshots are
written in the same transaction; direct SQL edits must preserve that invariant.

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
