# ANCHOR

**Authoritative Naval Communications Hub for Official Records**, a clickable front-end prototype.

ANCHOR is a proposed Commander, Submarine Force capability that ingests official message traffic from C2OIX into an immutable, CAC/PKI-protected repository and gives users one interface to read, search, subscribe to, acknowledge and audit it. It complements C2OIX, NC2 and Designated Release Authority processes rather than replacing them.

> **Prototype only.** Frontend messages, people, units, addresses and metrics are fictional mock data. The separate PostgreSQL command directory can be imported from PLADS. Nothing here is an official message record.

## Run it

### Docker

Copy `.env.example` to `.env` if you do not already have one. Keep the database
connection URL and port consistent. Database setup commands require Node 22 and npm.

```powershell
npm install
docker compose up -d --wait postgres
npm run db:migrate
npm run db:seed:users
docker compose up --build
```

Then open http://localhost:3000. Stop with `Ctrl+C`, or `docker compose down`.

### Node (for development)

Use Node 22 or newer (the database integration test tooling uses Node 22 APIs).
Copy `.env.example` to `.env` if needed, then:

```powershell
npm install
docker compose up -d --wait postgres
npm run db:migrate
npm run db:seed:users
npm run dev
```

## PostgreSQL command directory

Start just the database (Docker must be running):

```sh
docker compose up -d --wait postgres
npm run db:migrate
npm run db:seed:commands
# Or specify a different PLADS source file:
npm run db:seed:commands -- /path/to/PLADS.txt
```

The import defaults to `~/Downloads/PLADS.txt`. It skips the three-line PLADS
header and blank lines, trims names, and imports every remaining unique name
into `commands`. Each row has a generated UUID primary key (`id`) and a unique
text `name`. Imports are transactional and safe to rerun: existing IDs and
names are preserved, and records absent from a later file are not deleted.
The source file is not copied into the repository.

Local connection defaults:

- Host: `127.0.0.1`, port: `5432`
- Database/user: `anchor`
- Password: `anchor-local-dev` (**local development only**)
- URL: `postgresql://anchor:anchor-local-dev@127.0.0.1:5432/anchor`

Override `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, or `POSTGRES_PORT`
in a local `.env` file if needed. On this workstation, `.env` sets
`POSTGRES_PORT=5433` because another PostgreSQL instance already uses 5432;
use `127.0.0.1:5433` in the connection URL here. The database port is bound to loopback only.
Inside the Compose network the hostname is `postgres`, not `localhost`.
Changing database credentials after initial creation requires changing them in
PostgreSQL too; environment variables only initialize a new data volume.

Inspect the directory:

```sh
docker compose exec postgres psql -U anchor -d anchor -c 'SELECT id, name FROM commands ORDER BY name LIMIT 10;'
```

Data persists in the `postgres_data` Docker volume across container restarts and
`docker compose down`. **`docker compose down -v` deletes that data.** Schema
files in `database/init/` run only when PostgreSQL initializes an empty volume.
Run `npm run db:migrate` to apply versioned migrations to new or existing databases
without resetting data. Applied migrations are checksum-tracked and must not be edited.

Existing message screens still use their original mock messages. The template
builder searches the command directory through the reference-data API.

## Hackathon users and sessions

With `ENABLE_DEMO_LOGIN=true` in `.env`, the app presents a passwordless account
picker. Run `npm run db:seed:users` after migrations, then continue as **LT Taylor**.
The seed imports the full `CURRENT_USER` profile from `src/lib/data.ts` as the only
initial account, login `LTaylor`. It explicitly maps that profile to the PLADS
command **COMSUBLANT NORFOLK VA**, reusing its ID (or creating that one directory
entry on a fresh database). Repeated seeds preserve account IDs and later edits.

Sessions use random HttpOnly, SameSite=Strict cookies and expire after eight
hours; only SHA-256 token hashes are stored in `user_sessions`. Refreshing the
page preserves the account. Use the header menu's **Sign out / switch account**
to select another account. Switching accounts remounts mock frontend state and
previews. User-specific profile, header, audit actor and printed-user information
come from the session rather than frontend `CURRENT_USER` imports.

To add another demo account, insert an active row in `users` with its own unique
`login`, `name`, `command_id`, and optional profile JSON, then reload the account
picker. For example (run manually only if another account is wanted):

```sql
INSERT INTO users (login, name, command_id, profile)
SELECT 'DemoTwo', 'Demo User Two', id, '{"rank":"LT","unit":"Demo Unit"}'::jsonb
FROM commands WHERE name = 'COMSUBLANT ALT PAC';
```

**This is account impersonation for a hackathon, not proof of identity.** Anyone
with access can select an active account. Keep it local; disable demo login before
any real deployment and replace it with actual authentication and authorization.
Set `SESSION_COOKIE_SECURE=true` when serving through HTTPS; keep it false for
plain HTTP localhost. Deactivating a user invalidates their sessions immediately;
sign-out revokes the current token and switching via the API rotates it.
Directory/template GET endpoints are still public prototype data, not protected
by the client-side sign-in screen.

## Message templates and drafts

Open **Message Templates** in the sidebar (`/templates`) to:

1. Name a template and paste plaintext containing `{{ Named Variables }}`.
2. Configure one input per unique variable: textbox, multiline text, dropdown,
   radio buttons, boolean checkbox, checkbox group, single/multiple command
   picker, date, Zulu date/time, or autogenerated value. Use textboxes for numbers. Static choices
   use one option per line; autogenerated fields use a predefined output dropdown.
   Multiple-command pickers also offer a **Command separator** setting: semicolon
   (`; `), space, or newline. It is saved per field and used in plaintext previews,
   preserving selection order. Existing templates default to semicolon separation.
3. Test the generated form and plaintext preview, then publish the definition.

Publishing validates the entire definition server-side and atomically saves a
new template plus immutable version 1. The published library survives reloads
and supports read-only form previews. Repeated placeholders share one input;
variable names are case-sensitive. Only named substitution is supported—no
executable helpers, conditions, HTML rendering, or automatic word wrapping.
Preview values are not saved. Creating messages from these templates is a later step.

### Choice output overrides

Dropdowns, radio buttons, checkbox groups, and boolean checkboxes support optional
**Generated output overrides**. Users still select the displayed labels, but the
plaintext output uses an override when provided. For example, a displayed choice
`Ready` can generate `READY FOR TASKING`; without an override it generates `Ready`.
Checkboxes use displayed states `YES` (checked) and `NO` (unchecked), each with its
own optional override. An unchecked checkbox previews its `NO` output immediately.

Blank/whitespace-only override boxes mean "use the displayed label". Nonblank
text preserves whitespace and newlines, and is inserted as plaintext once—never
as template syntax. Checkbox groups map each selected option individually before
joining with the existing semicolon separator. The API stores the optional
`optionOutputs` object alongside the field, keyed by option label (or `YES`/`NO`
for checkboxes). Input schemas still validate original labels or booleans, not
replacement text. Unknown labels, invalid values and overrides on unrelated
controls are rejected. No database migration is required.

Number is no longer an authorable input type; numeric content uses text. Existing
published numeric fields can still be viewed as text without rewriting history.

### Autogenerated fields

Choose **Autogenerated** as the input type, then select an output:

| Output | Resolved value |
| --- | --- |
| Sender command | Directory command name of the signed-in session user |
| Current timestamp (Zulu) | `24 OCT 2026 1830Z` |
| Current date (Zulu) | `24 OCT 2026` |
| Current date-time group (Zulu) | `241830Z OCT 26` |

For example, `FROM {{ Originator }}` can bind `Originator` to **Sender command**.
These fields have no editable message-form input. The preview resolves them on
the server, shows them read-only, and offers a refresh button. One server clock
instant is shared by all time outputs and repeated placeholders in a generation;
preview timestamps do not tick continuously.

**Sender command** resolves through the current session's user and that user's
`command_id` foreign key on every generation. There is no global sending-command
setting and no client-supplied user/command override. Missing, expired, revoked,
or inactive-user sessions receive HTTP 401. The user table's foreign key prevents
deleting a command that is still assigned to an account.

Only the generator key and version are saved with the template—not a command
name or a timestamp. Bindings use `generator: { key, version }`, with keys
`sending-command`, `current-timestamp`, `current-date`, or `current-dtg`.
The displayed name **Sender command** retains the stored `sending-command` key
for compatibility with existing templates.
New timestamp/date bindings use version 2 for military presentation; sending
command and DTG use version 1. Published version-1 ISO date/timestamp bindings
remain supported without rewriting immutable templates. ISO timestamps are
already 24-hour UTC with a `Z` suffix, never local or AM/PM.
The shared clock and new manual datetime definitions use explicit Zulu time:
`DD MMM YYYY HHMMZ`. Date/time inputs use text rather than browser-local time
pickers, so they do not depend on OS 12-hour display settings. Machine timestamps
and storage retain unambiguous ISO UTC/Z; display metadata uses military format.
Autogenerated fields must have `required: true` and empty `options`. They are
excluded from the user-input JSON Schema, whose `additionalProperties: false`
rejects supplied autogenerated values. The preview API ignores client-provided
clock, command context, and resolved values.

No database migration is needed: generator bindings live in versioned JSONB
field definitions. The server resolver is reusable for future draft creation;
that endpoint must resolve again using authorized command context and persist
resolved values/time with the draft's rendered snapshot. Preview output must
never be trusted as the authoritative creation-time value.

**Local prototype only:** publishing requires `ENABLE_TEMPLATE_AUTHORING=true`
and a valid demo session. New writes record the session user's UUID as creator,
not `local-prototype` or a submitted username. Existing creator strings are kept
for historical records. Set the flag to `false` to disable publishing. Before
deployment, replace passwordless demo sessions with real authentication and
role/command authorization. Compose binds the app and database to loopback.
Do not expose the demo server or enter operational/classified information.

For local Node, set `DATABASE_URL` (or standard `PGHOST`, `PGPORT`, `PGDATABASE`,
`PGUSER`, `PGPASSWORD` variables). Compose supplies internal PostgreSQL connection
settings separately. Never use `NEXT_PUBLIC_` for database credentials; `.env`
files are excluded from Git and Docker build context.

REST endpoints:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/users` | List active demo accounts (requires demo login to be enabled) |
| `GET /api/session` | Current session profile, or null when signed out |
| `POST /api/session` | Passwordless demo sign-in using `{ userId }` |
| `DELETE /api/session` | Revoke the current session and clear its cookie |
| `GET /api/message-templates` | List up to 100 active published templates |
| `POST /api/message-templates` | Validate and publish `{ name, description, text, fields }` |
| `POST /api/message-templates/preview-generated` | Resolve automatic fields for a validated definition; no persistence |
| `GET /api/message-templates/:id` | Read the latest published template definition |
| `GET /api/reference-data/commands?q=...&cursor=...` | Search command names, 25 results per page |

Each field supplies `name`, `control`, `required`, and `options` (an empty array
for non-static controls), plus `generator` for autogenerated fields only.
Multiple-command fields optionally supply `separator: "semicolon" | "space" | "newline"`;
other controls reject that setting. The API constructs its own JSON Schema, UI definition,
output definition and source bindings; client-supplied schemas are never trusted.
It rejects malformed placeholders, missing/duplicate variables, unsupported
controls, invalid options, and oversized bodies. Command pickers bind to the
allowlisted `recipient-commands` version 1 source, not arbitrary URLs.

Checks:

```sh
npm run test:templates
npm run build
npm run test:templates:api
```

The API integration suite creates a temporary database and local production server,
then removes them. It does not add templates to the working database.

See [`database/README.md`](database/README.md) for schema details, transaction rules,
remaining application-level validation, and rollback-only schema tests.

## Screens

| Route | Screen |
|---|---|
| `/` | Home: mandatory acknowledgements, status changes, latest traffic |
| `/messages` | Messages inbox with filters and preview pane |
| `/templates` | Plaintext template builder, field configuration, preview and publishing |
| `/messages/[id]` | Message detail: official text, AI summary (separate), metadata, integrity, attachments |
| `/messages/[id]/print` | Official print / PDF rendition with integrity block |
| `/search` | Basic, advanced, natural-language and saved searches |
| `/subscriptions` | Subscriptions; new ones are requested and need approval |
| `/briefings` | Tailored Briefing Builder with live preview |
| `/briefings/generated` | Generated briefing |
| `/watch-turnover` | Watch Turnover with notes and checklist |
| `/drafting` | Drafting & Release: draft outgoing traffic, route it through the chain, release it ("Acting as" plays each person) |
| `/admin/routing` | Routing workflows, release authority and command transmission settings |
| `/simulators` | Server Simulators: the external C2OIX server and the local ANCHOR server |
| `/topology` | Network Topology: two servers, three workstations; break and restore any link |
| `/offline` | Offline / EMCON mode with sync queue (toggle "Simulate EMCON") |
| `/reports` | Acknowledgement accountability and traffic measures |
| `/audit` | Audit & Integrity: append-only, hash-chained log with a recompute check |
| `/admin` | Subscription approval queue, mandatory alert rules, access groups |
| `/profile` | Profile & Settings |

## How the requirements show up

The UI follows the mockups. Where they differ from the ANCHOR requirements package, the requirements win:

- **COMSUBLANT first.** Mock traffic and the user are submarine force, not surface.
- **Precedence** (FLASH, IMMEDIATE, PRIORITY, ROUTINE) on every message. FLASH and IMMEDIATE drive mandatory alerts.
- **Lifecycle status** labels for AMENDED, CORRECTED, SUPERSEDED, CANCELLED and EXPIRED, with links to the replacing message and a banner on the message itself.
- **Mandatory acknowledgement** with due time and escalation, a site-wide alert strip, and a roll-up in Reports.
- **Approved subscriptions only.** Users request; the unit Subscription Approver approves in Admin. Command- and precedence-assigned subscriptions are locked on.
- **Integrity.** Each message shows its C2OIX ID and SHA-256 from ingestion, and the print rendition carries the same block.
- **AI summaries** are dashed, purple, labeled "Not authoritative", and never mixed into the official text.
- **Disconnected / EMCON.** Actions taken offline are queued and replicate on sync, with bandwidth-aware priority.
- **Audit.** Every action in the prototype is written to the audit log. Each event is chained to the one before it by SHA-256, and Audit & Integrity recomputes the chain and names the first break.
- **No Reply / Forward.** The mockups show them, but releasing traffic stays with Designated Release Authorities, so the prototype offers Share Link instead.
- **Routing and release.** Outgoing traffic follows an admin-defined chain matched by message type and originator. Steps are held by people on the roster; only a designated release authority can release, and the DTG and serial are assigned at release.
- **Circuit = EMCON.** Breaking the C2OIX circuit on Network Topology or Server Simulators is the same switch as offline mode. Releases are held at the ANCHOR server and C2OIX defers inbound traffic until it returns.

## Stack

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, lucide-react icons. Legacy frontend state is in memory (`src/lib/store.tsx`) and resets on reload. Mock data lives in `src/lib/data.ts`. PostgreSQL 17 persists commands and message templates; TypeScript REST endpoints use `pg` on the Node server.
