# Database schema

Run `docker compose up -d --wait postgres`, then `npm run db:migrate`.
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
| `message_drafts` | Partial or generated message drafts pinned to a published template version. |
| `message_draft_references` | Ordered selections and resolved snapshots for the current draft. |
| `schema_migrations` | Applied migration ledger. |

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
Future draft creation must apply the same lookup plus real command authorization.
Capture one clock instant per
generation, and save resolved automatic values, generator versions and resolution
time in the draft's `render_metadata` alongside its rendered document/text.
Do not resolve outputs when publishing templates or on every draft read.

## Saving messages

A draft must reference a published version. Incomplete inputs can be saved with
null generated output; this supports saving work in progress without implying
that it is valid or ready to send. Generated structured document and text must
both be present or both be null.

The future save service must execute one transaction to:

- Authenticate/authorize and check the expected draft revision.
- Validate input values and resolve selected IDs under the appropriate parameters.
- Resolve autogenerated bindings from trusted command context and one server clock;
  do not accept resolved automatic values from the client.
- Update inputs, generated subject/metadata, canonical unwrapped document, final
  text, and renderer/postprocessor version metadata together.
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
